import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const distDir = join(root, 'dist');
const port = Number(process.env.PORT ?? 8087);
const OPEN_SKY_CACHE_TTL_MS = 15_000;
const OPEN_SKY_STALE_TTL_MS = 5 * 60_000;
const openSkyCache = new Map();

const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function numericParam(parameters, key, fallback) {
  const value = Number(parameters.get(key));
  return Number.isFinite(value) ? value : fallback;
}

function fallbackPointFromBbox(parameters) {
  const south = numericParam(parameters, 'lamin', -30);
  const west = numericParam(parameters, 'lomin', -30);
  const north = numericParam(parameters, 'lamax', 60);
  const east = numericParam(parameters, 'lomax', 60);
  const lat = (south + north) / 2;
  const lon = (west + east) / 2;
  const latKm = Math.abs(north - south) * 111;
  const lonKm = Math.abs(east - west) * 111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const radiusNm = Math.min(250, Math.max(25, Math.ceil(Math.hypot(latKm, lonKm) / 2 / 1.852)));

  return { lat, lon, radiusNm };
}

function normalizeAirplanesLive(data) {
  const now = Math.floor(Date.now() / 1000);
  const states = (data.ac ?? []).flatMap((aircraft) => {
    if (typeof aircraft.lat !== 'number' || typeof aircraft.lon !== 'number' || !aircraft.hex) {
      return [];
    }

    const baroAltitudeFt = typeof aircraft.alt_baro === 'number' ? aircraft.alt_baro : null;
    const geoAltitudeFt = typeof aircraft.alt_geom === 'number' ? aircraft.alt_geom : baroAltitudeFt;
    const onGround = aircraft.alt_baro === 'ground';
    const speedMetersPerSecond = typeof aircraft.gs === 'number' ? aircraft.gs * 0.514444 : null;
    const verticalRateMetersPerSecond =
      typeof aircraft.baro_rate === 'number' ? aircraft.baro_rate * 0.00508 : null;
    const lastContact = now - Math.max(0, Number(aircraft.seen ?? aircraft.seen_pos ?? 0));

    return [
      [
        aircraft.hex,
        aircraft.flight ?? aircraft.r ?? aircraft.hex.toUpperCase(),
        aircraft.ownOp ?? aircraft.r ?? aircraft.desc ?? 'ADS-B',
        lastContact,
        lastContact,
        aircraft.lon,
        aircraft.lat,
        baroAltitudeFt === null ? null : baroAltitudeFt * 0.3048,
        onGround,
        speedMetersPerSecond,
        typeof aircraft.track === 'number' ? aircraft.track : null,
        verticalRateMetersPerSecond,
        null,
        geoAltitudeFt === null ? null : geoAltitudeFt * 0.3048,
        aircraft.squawk ?? null,
        false,
        0,
        null,
      ],
    ];
  });

  return {
    time: now,
    states,
  };
}

async function fetchAirplanesLiveFallback(parameters) {
  const { lat, lon, radiusNm } = fallbackPointFromBbox(parameters);
  const upstream = await fetch(
    `https://api.airplanes.live/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radiusNm}`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!upstream.ok) {
    throw new Error('Airplanes.live unavailable');
  }

  const data = await upstream.json();
  return JSON.stringify(normalizeAirplanesLive(data));
}

async function proxyOpenSky(request, response) {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  const parameters = new URLSearchParams();

  ['lamin', 'lomin', 'lamax', 'lomax'].forEach((key) => {
    const value = url.searchParams.get(key);

    if (value !== null) {
      parameters.set(key, value);
    }
  });
  const cacheKey = parameters.toString();
  const cached = openSkyCache.get(cacheKey);

  if (cached && Date.now() - cached.updatedAt < OPEN_SKY_CACHE_TTL_MS) {
    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': cached.contentType,
      'X-Forseti-Cache': 'fresh',
    });
    response.end(cached.text);
    return;
  }

  try {
    const upstream = await fetch(`https://opensky-network.org/api/states/all?${parameters.toString()}`, {
      headers: {
        Accept: 'application/json',
      },
    });
    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') ?? 'application/json; charset=utf-8';

    if (upstream.ok) {
      openSkyCache.set(cacheKey, {
        contentType,
        text,
        updatedAt: Date.now(),
      });
    } else if (cached && Date.now() - cached.updatedAt < OPEN_SKY_STALE_TTL_MS) {
      response.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': cached.contentType,
        'X-Forseti-Cache': 'stale',
      });
      response.end(cached.text);
      return;
    }

    if (!upstream.ok) {
      try {
        const fallbackText = await fetchAirplanesLiveFallback(parameters);
        openSkyCache.set(cacheKey, {
          contentType: 'application/json; charset=utf-8',
          text: fallbackText,
          updatedAt: Date.now(),
        });
        response.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json; charset=utf-8',
          'X-Forseti-Source': 'airplanes.live',
        });
        response.end(fallbackText);
        return;
      } catch {
        // Keep the original OpenSky error if the fallback is unavailable too.
      }
    }

    response.writeHead(upstream.status, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': contentType,
    });
    response.end(text);
  } catch {
    if (cached && Date.now() - cached.updatedAt < OPEN_SKY_STALE_TTL_MS) {
      response.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': cached.contentType,
        'X-Forseti-Cache': 'stale',
      });
      response.end(cached.text);
      return;
    }

    sendJson(response, 502, { error: 'OpenSky unavailable' });
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');

  let filePath = join(distDir, safePath === '/' ? 'index.html' : safePath);

  if (!filePath.startsWith(distDir) || !existsSync(filePath)) {
    filePath = join(distDir, 'index.html');
  }

  try {
    let fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      filePath = join(distDir, 'index.html');
      fileStat = await stat(filePath);
    }

    response.writeHead(200, {
      'Content-Length': fileStat.size,
      'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

createServer((request, response) => {
  if (request.url?.startsWith('/api/opensky')) {
    void proxyOpenSky(request, response);
    return;
  }

  void serveStatic(request, response);
}).listen(port, '127.0.0.1', () => {
  console.log(`HantaVirus Map running at http://127.0.0.1:${port}/`);
});
