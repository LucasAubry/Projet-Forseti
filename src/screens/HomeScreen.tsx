import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

type LatLng = {
  lat: number;
  lon: number;
};

type WorldPoint = {
  x: number;
  y: number;
};

type Tile = {
  key: string;
  url: string;
  left: number;
  top: number;
  size: number;
  x: number;
  y: number;
  z: number;
};

type SearchResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  importance?: number;
};

type SelectionBox = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type Bbox = [number, number, number, number];

type SentinelSource = {
  label: string;
  shortLabel: string;
  collection: string;
  lookbackDays: number;
  limit: number;
  availabilityLimit: number;
  cloudCoverMax?: number;
  availabilityCloudCoverMax?: number;
  assetKeys: string[];
  emptyMessage: string;
};

type SentinelScene = {
  id: string;
  bbox: Bbox;
  date: string;
  datetime: string;
  cloudCover: number;
  visualHref: string;
};

type EarthSearchAsset = {
  href?: string;
};

type EarthSearchItem = {
  id: string;
  bbox?: Bbox;
  properties: {
    datetime?: string;
    'eo:cloud_cover'?: number;
  };
  assets?: Record<string, EarthSearchAsset | undefined>;
};

type WebMouseLikeEvent = {
  button?: number;
  clientX?: number;
  clientY?: number;
  currentTarget?: {
    getBoundingClientRect?: () => {
      left: number;
      top: number;
    };
  };
  nativeEvent?: {
    button?: number;
    clientX?: number;
    clientY?: number;
  };
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

type WebDragSession = {
  clientX: number;
  clientY: number;
  localX: number;
  localY: number;
  mapPoint: WorldPoint;
  moved: boolean;
};

type TleRecord = {
  name: string;
  line1: string;
  line2: string;
  epoch: Date;
  inclination: number;
  raan: number;
  eccentricity: number;
  argumentOfPerigee: number;
  meanAnomaly: number;
  meanMotion: number;
};

type SentinelOrbiter = {
  key: string;
  label: string;
  noradId: string;
  fallbackTle?: [string, string, string];
};

type SatelliteLivePosition = {
  key: string;
  label: string;
  lat: number;
  lon: number;
  altitudeKm: number;
  speedKms: number;
};

type SentinelTile = {
  scene: SentinelScene;
  tile: Tile;
};

type ScreenRect = {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type AlertConfig = {
  active: boolean;
  bbox: Bbox;
  email: string;
  lastSceneDatetime: string;
};

type ComparisonMetric = {
  key: string;
  label: string;
  previous: number;
  current: number;
  unit: string;
  color: string;
};

type ComparisonPoint = {
  date: string;
  imageCount: number;
  averageCloudCover: number;
  bestCloudCover: number;
  worstCloudCover: number;
};

type OpenMeteoResponse = {
  timezone?: string;
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    rain?: number;
    snowfall?: number;
    weather_code?: number;
    cloud_cover?: number;
    pressure_msl?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    wind_gusts_10m?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    relative_humidity_2m?: number[];
    precipitation_probability?: number[];
    precipitation?: number[];
    cloud_cover?: number[];
    wind_speed_10m?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
};

type WeatherHour = {
  time: string;
  temperature: number;
  precipitationProbability: number;
  precipitation: number;
  humidity: number;
  cloudCover: number;
  windSpeed: number;
};

type WeatherDay = {
  date: string;
  weatherCode: number;
  minTemperature: number;
  maxTemperature: number;
  precipitation: number;
  precipitationProbability: number;
  windMax: number;
  sunrise: string;
  sunset: string;
};

type WeatherSnapshot = {
  location: LatLng;
  timezone: string;
  current: {
    time: string;
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    precipitation: number;
    rain: number;
    snowfall: number;
    weatherCode: number;
    cloudCover: number;
    pressure: number;
    windSpeed: number;
    windDirection: number;
    windGusts: number;
  };
  hourly: WeatherHour[];
  daily: WeatherDay[];
};

type OpenSkyResponse = {
  time?: number;
  states?: Array<
    [
      string,
      string | null,
      string | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
      boolean,
      number | null,
      number | null,
      number | null,
      unknown,
      number | null,
      string | null,
      boolean,
      number | null,
      number | null,
    ]
  >;
};

type LiveAircraft = {
  id: string;
  callsign: string;
  originCountry: string;
  lat: number;
  lon: number;
  altitudeM: number | null;
  speedKmh: number;
  heading: number | null;
  verticalRate: number | null;
  onGround: boolean;
  lastContact: number | null;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 18;
const MAX_TILE_SOURCE_ZOOM = 16;
const INITIAL_ZOOM = 3.1;
const ZOOM_STEP = 0.25;
const WORLD_BBOX: Bbox = [-180, -85.05112878, 180, 85.05112878];
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const EARTH_SEARCH_URL = 'https://earth-search.aws.element84.com/v1/search';
const TITILER_COG_URL = 'https://titiler.xyz/cog/tiles/WebMercatorQuad';
const SENTINEL_CLOUDLESS_TILE_URL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g';
const BASE_TILE_URL = 'https://basemaps.cartocdn.com/rastertiles/voyager';
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_SKY_PROXY_URL = '/api/opensky';
const SENTINEL_SOURCE: SentinelSource = {
  label: 'Sentinel-2',
  shortLabel: 'S2',
  collection: 'sentinel-2-l2a',
  lookbackDays: 180,
  limit: 160,
  availabilityLimit: 80,
  cloudCoverMax: 45,
  availabilityCloudCoverMax: 70,
  assetKeys: ['visual'],
  emptyMessage: 'Aucune scene Sentinel-2 recente trouvee.',
};
const SENTINEL_ORBITERS: SentinelOrbiter[] = [
  {
    key: 's2a',
    label: 'S2A',
    noradId: '40697',
    fallbackTle: [
      'SENTINEL-2A',
      '1 40697U 15028A   26106.95598483  .00000027  00000-0  27003-4 0  9993',
      '2 40697  98.5636 182.6863 0001349  90.6860 269.4477 14.30820556564979',
    ],
  },
  {
    key: 's2b',
    label: 'S2B',
    noradId: '42063',
    fallbackTle: [
      'SENTINEL-2B',
      '1 42063U 17013A   26109.95572248 -.00000006  00000-0  14262-4 0  9993',
      '2 42063  98.5657 185.5566 0001258  94.6066 265.5260 14.30821611476314',
    ],
  },
  {
    key: 's2c',
    label: 'S2C',
    noradId: '60989',
  },
];
const CLICK_DRAG_THRESHOLD = 6;
const EARTH_RADIUS_KM = 6378.137;
const EARTH_MU_KM3_S2 = 398600.4418;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const CALENDAR_WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function wrap(value: number, max: number) {
  return ((value % max) + max) % max;
}

function worldSize(zoom: number) {
  return TILE_SIZE * 2 ** zoom;
}

function latLngToPoint({ lat, lon }: LatLng, zoom: number): WorldPoint {
  const size = worldSize(zoom);
  const safeLat = clamp(lat, -85.05112878, 85.05112878);
  const sinLat = Math.sin((safeLat * Math.PI) / 180);

  return {
    x: ((lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size,
  };
}

function pointToLatLng(point: WorldPoint, zoom: number): LatLng {
  const size = worldSize(zoom);
  const x = wrap(point.x, size);
  const y = clamp(point.y, 0, size);
  const lon = (x / size) * 360 - 180;
  const mercator = Math.PI * (1 - (2 * y) / size);
  const lat = (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;

  return { lat, lon };
}

function formatCoordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}

function shortPlaceName(displayName: string) {
  return displayName.split(',').slice(0, 2).join(',').trim();
}

function formatBboxLabel([west, south, east, north]: Bbox) {
  return `${formatCoordinate((south + north) / 2, 'N', 'S')} / ${formatCoordinate((west + east) / 2, 'E', 'W')}`;
}

function bboxCenter([west, south, east, north]: Bbox): LatLng {
  return {
    lat: (south + north) / 2,
    lon: (west + east) / 2,
  };
}

function openMailDraft(email: string, subject: string, body: string) {
  const destination = email.trim();
  const url = `mailto:${encodeURIComponent(destination)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    body,
  )}`;

  void Linking.openURL(url);
}

function normalizeSelectionBox(box: SelectionBox) {
  const left = Math.min(box.startX, box.currentX);
  const top = Math.min(box.startY, box.currentY);
  const width = Math.abs(box.currentX - box.startX);
  const height = Math.abs(box.currentY - box.startY);

  return { left, top, width, height };
}

function responderLocation(event: GestureResponderEvent) {
  return {
    x: event.nativeEvent.locationX,
    y: event.nativeEvent.locationY,
  };
}

function formatDateLabel(datetime: string) {
  const date = new Date(datetime);

  if (Number.isNaN(date.getTime())) {
    return datetime.slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function lookbackRange(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  return `${start.toISOString()}/${end.toISOString()}`;
}

function monthKeyFromDate(date: Date) {
  return date.toISOString().slice(0, 7);
}

function monthKeyFromDateLabel(dateLabel: string) {
  return dateLabel.slice(0, 7);
}

function shiftMonth(monthKey: string, amount: number) {
  const date = new Date(`${monthKey}-01T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return monthKeyFromDate(date);
}

function monthLabel(monthKey: string) {
  return new Date(`${monthKey}-01T12:00:00.000Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

function calendarDaysForMonth(monthKey: string) {
  const firstDay = new Date(`${monthKey}-01T12:00:00.000Z`);
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const cursor = new Date(firstDay);
  cursor.setUTCDate(firstDay.getUTCDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(cursor);
    day.setUTCDate(cursor.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);

    return {
      date,
      dayNumber: day.getUTCDate(),
      inMonth: date.startsWith(monthKey),
    };
  });
}

function bboxFromLocations(a: LatLng, b: LatLng): Bbox {
  const west = Math.min(a.lon, b.lon);
  const east = Math.max(a.lon, b.lon);
  const south = Math.min(a.lat, b.lat);
  const north = Math.max(a.lat, b.lat);

  return [west, south, east, north];
}

function bboxAreaKm2([west, south, east, north]: Bbox) {
  const averageLat = ((south + north) / 2) * (Math.PI / 180);
  const widthKm = Math.abs(east - west) * 111.32 * Math.max(Math.cos(averageLat), 0.2);
  const heightKm = Math.abs(north - south) * 110.57;

  return widthKm * heightKm;
}

function bboxesIntersect(a: Bbox, b: Bbox) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function bboxContainsLocation([west, south, east, north]: Bbox, location: LatLng) {
  return location.lon >= west && location.lon <= east && location.lat >= south && location.lat <= north;
}

function sceneAssetHref(item: EarthSearchItem) {
  for (const key of SENTINEL_SOURCE.assetKeys) {
    const href = item.assets?.[key]?.href;

    if (href) {
      return href;
    }
  }

  return '';
}

function earthSearchBody(
  bbox: Bbox,
  cloudCoverMax = SENTINEL_SOURCE.cloudCoverMax,
  limit = SENTINEL_SOURCE.limit,
) {
  const body: {
    bbox: Bbox;
    collections: string[];
    datetime: string;
    limit: number;
    query?: {
      'eo:cloud_cover'?: {
        lt: number;
      };
    };
  } = {
    bbox,
    collections: [SENTINEL_SOURCE.collection],
    datetime: lookbackRange(SENTINEL_SOURCE.lookbackDays),
    limit,
  };

  if (typeof cloudCoverMax === 'number') {
    body.query = {
      'eo:cloud_cover': {
        lt: cloudCoverMax,
      },
    };
  }

  return body;
}

function sceneFromEarthSearchItem(item: EarthSearchItem, fallbackBbox: Bbox): SentinelScene | null {
  const datetime = item.properties.datetime;
  const visualHref = sceneAssetHref(item);

  if (!datetime || !visualHref) {
    return null;
  }

  return {
    id: item.id,
    bbox: item.bbox ?? fallbackBbox,
    date: formatDateLabel(datetime),
    datetime,
    cloudCover: item.properties['eo:cloud_cover'] ?? 0,
    visualHref,
  };
}

function comparisonPointFromScenes(date: string, scenes: SentinelScene[]): ComparisonPoint {
  const cloudValues = scenes.map((scene) => scene.cloudCover);
  const averageCloudCover =
    cloudValues.reduce((totalClouds, cloudCover) => totalClouds + cloudCover, 0) / Math.max(cloudValues.length, 1);

  return {
    date,
    imageCount: scenes.length,
    averageCloudCover: Math.round(clamp(averageCloudCover, 0, 100)),
    bestCloudCover: Math.round(clamp(Math.min(...cloudValues), 0, 100)),
    worstCloudCover: Math.round(clamp(Math.max(...cloudValues), 0, 100)),
  };
}

function comparisonMetricsFromPoints(points: ComparisonPoint[]): ComparisonMetric[] {
  const previous = points[Math.max(points.length - 2, 0)];
  const current = points[points.length - 1] ?? previous;

  if (!previous || !current) {
    return [];
  }

  return [
    {
      key: 'imageCount',
      label: 'Images S2',
      previous: previous.imageCount,
      current: current.imageCount,
      unit: '',
      color: '#5ecbff',
    },
    {
      key: 'averageCloudCover',
      label: 'Nuages moy.',
      previous: previous.averageCloudCover,
      current: current.averageCloudCover,
      unit: '%',
      color: '#b7c3d4',
    },
    {
      key: 'bestCloudCover',
      label: 'Meilleure image',
      previous: previous.bestCloudCover,
      current: current.bestCloudCover,
      unit: '%',
      color: '#33d69f',
    },
    {
      key: 'worstCloudCover',
      label: 'Nuages max',
      previous: previous.worstCloudCover,
      current: current.worstCloudCover,
      unit: '%',
      color: '#f7c948',
    },
  ];
}

function weatherCodeLabel(code: number) {
  if (code === 0) {
    return 'Ciel clair';
  }

  if ([1, 2, 3].includes(code)) {
    return 'Nuages variables';
  }

  if ([45, 48].includes(code)) {
    return 'Brouillard';
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return 'Bruine';
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return 'Pluie';
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return 'Neige';
  }

  if ([95, 96, 99].includes(code)) {
    return 'Orage';
  }

  return 'Meteo variable';
}

function formatHourLabel(time: string) {
  const date = new Date(time);

  if (Number.isNaN(date.getTime())) {
    return time.slice(11, 16);
  }

  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function temperatureColor(value: number) {
  if (value <= 0) {
    return '#80d9ff';
  }

  if (value < 12) {
    return '#5ecbff';
  }

  if (value < 24) {
    return '#33d69f';
  }

  if (value < 32) {
    return '#f7c948';
  }

  return '#f9735b';
}

function weatherForecastUrl(location: LatLng) {
  const parameters = new URLSearchParams({
    latitude: location.lat.toFixed(5),
    longitude: location.lon.toFixed(5),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly:
      'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,cloud_cover,wind_speed_10m',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '7',
  });

  return `${OPEN_METEO_FORECAST_URL}?${parameters.toString()}`;
}

function weatherSnapshotFromResponse(data: OpenMeteoResponse, location: LatLng): WeatherSnapshot {
  const current = data.current ?? {};
  const hourly = data.hourly ?? {};
  const daily = data.daily ?? {};

  return {
    location,
    timezone: data.timezone ?? 'auto',
    current: {
      time: current.time ?? '',
      temperature: current.temperature_2m ?? 0,
      apparentTemperature: current.apparent_temperature ?? 0,
      humidity: current.relative_humidity_2m ?? 0,
      precipitation: current.precipitation ?? 0,
      rain: current.rain ?? 0,
      snowfall: current.snowfall ?? 0,
      weatherCode: current.weather_code ?? 0,
      cloudCover: current.cloud_cover ?? 0,
      pressure: current.pressure_msl ?? 0,
      windSpeed: current.wind_speed_10m ?? 0,
      windDirection: current.wind_direction_10m ?? 0,
      windGusts: current.wind_gusts_10m ?? 0,
    },
    hourly: (hourly.time ?? []).slice(0, 24).map((time, index) => ({
      time,
      temperature: hourly.temperature_2m?.[index] ?? 0,
      precipitationProbability: hourly.precipitation_probability?.[index] ?? 0,
      precipitation: hourly.precipitation?.[index] ?? 0,
      humidity: hourly.relative_humidity_2m?.[index] ?? 0,
      cloudCover: hourly.cloud_cover?.[index] ?? 0,
      windSpeed: hourly.wind_speed_10m?.[index] ?? 0,
    })),
    daily: (daily.time ?? []).map((date, index) => ({
      date,
      weatherCode: daily.weather_code?.[index] ?? 0,
      minTemperature: daily.temperature_2m_min?.[index] ?? 0,
      maxTemperature: daily.temperature_2m_max?.[index] ?? 0,
      precipitation: daily.precipitation_sum?.[index] ?? 0,
      precipitationProbability: daily.precipitation_probability_max?.[index] ?? 0,
      windMax: daily.wind_speed_10m_max?.[index] ?? 0,
      sunrise: daily.sunrise?.[index] ?? '',
      sunset: daily.sunset?.[index] ?? '',
    })),
  };
}

function openSkyUrl([west, south, east, north]: Bbox) {
  const parameters = new URLSearchParams({
    lamin: south.toFixed(4),
    lomin: west.toFixed(4),
    lamax: north.toFixed(4),
    lomax: east.toFixed(4),
  });

  return `${OPEN_SKY_PROXY_URL}?${parameters.toString()}`;
}

function aircraftFromOpenSkyResponse(data: OpenSkyResponse): LiveAircraft[] {
  return (data.states ?? []).flatMap((state) => {
    const [id, callsign, originCountry, , lastContact, lon, lat, baroAltitude, onGround, velocity, heading, verticalRate, , geoAltitude] =
      state;

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return [];
    }

    return [
      {
        id,
        callsign: callsign?.trim() || id.toUpperCase(),
        originCountry: originCountry ?? 'Inconnu',
        lat,
        lon,
        altitudeM: typeof geoAltitude === 'number' ? geoAltitude : typeof baroAltitude === 'number' ? baroAltitude : null,
        speedKmh: typeof velocity === 'number' ? Math.round(velocity * 3.6) : 0,
        heading: typeof heading === 'number' ? heading : null,
        verticalRate: typeof verticalRate === 'number' ? verticalRate : null,
        onGround,
        lastContact,
      },
    ];
  });
}

function formatLiveTimestamp(timestamp: number | null) {
  if (!timestamp) {
    return 'inconnu';
  }

  return new Date(timestamp * 1000).toLocaleString('fr-FR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function tileBbox(tile: Tile): Bbox {
  const northwest = pointToLatLng({ x: tile.x * TILE_SIZE, y: tile.y * TILE_SIZE }, tile.z);
  const southeast = pointToLatLng({ x: (tile.x + 1) * TILE_SIZE, y: (tile.y + 1) * TILE_SIZE }, tile.z);

  return bboxFromLocations(northwest, southeast);
}

function sentinelTileUrl(scene: SentinelScene, tile: Tile) {
  return `${TITILER_COG_URL}/${tile.z}/${tile.x}/${tile.y}.jpg?url=${encodeURIComponent(
    scene.visualHref,
  )}&resampling=bilinear`;
}

function sentinelCloudlessTileUrl(tile: Tile) {
  return `${SENTINEL_CLOUDLESS_TILE_URL}/${tile.z}/${tile.y}/${tile.x}.jpg`;
}

function sentinelTleUrl(noradId: string) {
  return `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=TLE`;
}

function positiveModulo(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo;
}

function parseTleEpoch(line1: string) {
  const epochYear = Number(line1.slice(18, 20));
  const epochDay = Number(line1.slice(20, 32));
  const year = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;

  return new Date(Date.UTC(year, 0, 1) + (epochDay - 1) * 24 * 60 * 60 * 1000);
}

function parseTle(name: string, line1: string, line2: string): TleRecord | null {
  const parts = line2.trim().split(/\s+/);

  if (parts.length < 8) {
    return null;
  }

  const epoch = parseTleEpoch(line1);
  const inclination = Number(parts[2]) * DEG_TO_RAD;
  const raan = Number(parts[3]) * DEG_TO_RAD;
  const eccentricity = Number(`0.${parts[4]}`);
  const argumentOfPerigee = Number(parts[5]) * DEG_TO_RAD;
  const meanAnomaly = Number(parts[6]) * DEG_TO_RAD;
  const meanMotion = Number(parts[7]) * (2 * Math.PI) / 86400;

  if (
    Number.isNaN(epoch.getTime()) ||
    [inclination, raan, eccentricity, argumentOfPerigee, meanAnomaly, meanMotion].some(Number.isNaN)
  ) {
    return null;
  }

  return {
    name,
    line1,
    line2,
    epoch,
    inclination,
    raan,
    eccentricity,
    argumentOfPerigee,
    meanAnomaly,
    meanMotion,
  };
}

function julianDate(date: Date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function greenwichSiderealTime(date: Date) {
  const daysSinceJ2000 = julianDate(date) - 2451545.0;
  const degrees = 280.46061837 + 360.98564736629 * daysSinceJ2000;

  return positiveModulo(degrees, 360) * DEG_TO_RAD;
}

function solveEccentricAnomaly(meanAnomaly: number, eccentricity: number) {
  let eccentricAnomaly = meanAnomaly;

  for (let iteration = 0; iteration < 8; iteration += 1) {
    eccentricAnomaly -=
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
  }

  return eccentricAnomaly;
}

function satellitePositionFromTle(
  satellite: SentinelOrbiter,
  tle: TleRecord,
  timestamp = new Date(),
): SatelliteLivePosition {
  const elapsedSeconds = (timestamp.getTime() - tle.epoch.getTime()) / 1000;
  const meanAnomaly = positiveModulo(tle.meanAnomaly + tle.meanMotion * elapsedSeconds, 2 * Math.PI);
  const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, tle.eccentricity);
  const semiMajorAxis = (EARTH_MU_KM3_S2 / tle.meanMotion ** 2) ** (1 / 3);
  const orbitalX = semiMajorAxis * (Math.cos(eccentricAnomaly) - tle.eccentricity);
  const orbitalY =
    semiMajorAxis * Math.sqrt(1 - tle.eccentricity ** 2) * Math.sin(eccentricAnomaly);
  const radiusKm = Math.sqrt(orbitalX ** 2 + orbitalY ** 2);
  const cosRaan = Math.cos(tle.raan);
  const sinRaan = Math.sin(tle.raan);
  const cosInclination = Math.cos(tle.inclination);
  const sinInclination = Math.sin(tle.inclination);
  const cosArgument = Math.cos(tle.argumentOfPerigee);
  const sinArgument = Math.sin(tle.argumentOfPerigee);
  const xArgument = orbitalX * cosArgument - orbitalY * sinArgument;
  const yArgument = orbitalX * sinArgument + orbitalY * cosArgument;
  const eciX = xArgument * cosRaan - yArgument * cosInclination * sinRaan;
  const eciY = xArgument * sinRaan + yArgument * cosInclination * cosRaan;
  const eciZ = yArgument * sinInclination;
  const sidereal = greenwichSiderealTime(timestamp);
  const cosSidereal = Math.cos(sidereal);
  const sinSidereal = Math.sin(sidereal);
  const ecefX = eciX * cosSidereal + eciY * sinSidereal;
  const ecefY = -eciX * sinSidereal + eciY * cosSidereal;
  const ecefZ = eciZ;
  const lon = positiveModulo(Math.atan2(ecefY, ecefX) * RAD_TO_DEG + 180, 360) - 180;
  const lat = Math.atan2(ecefZ, Math.sqrt(ecefX ** 2 + ecefY ** 2)) * RAD_TO_DEG;
  const speedKms = Math.sqrt(EARTH_MU_KM3_S2 * (2 / radiusKm - 1 / semiMajorAxis));

  return {
    key: satellite.key,
    label: satellite.label,
    lat,
    lon,
    altitudeKm: radiusKm - EARTH_RADIUS_KM,
    speedKms,
  };
}

function webMousePosition(event: WebMouseLikeEvent) {
  const nativeEvent = event.nativeEvent ?? event;
  const clientX = nativeEvent.clientX ?? 0;
  const clientY = nativeEvent.clientY ?? 0;
  const rect = event.currentTarget?.getBoundingClientRect?.();

  return {
    clientX,
    clientY,
    localX: rect ? clientX - rect.left : 0,
    localY: rect ? clientY - rect.top : 0,
  };
}

export function HomeScreen() {
  const { height, width } = useWindowDimensions();
  const isCompact = width < 860;
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [center, setCenter] = useState<LatLng>({ lat: 24, lon: 5 });
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [selectedPlace, setSelectedPlace] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [selectedBbox, setSelectedBbox] = useState<Bbox | null>(WORLD_BBOX);
  const [sentinelScenes, setSentinelScenes] = useState<SentinelScene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState('');
  const [selectedScene, setSelectedScene] = useState<SentinelScene | null>(null);
  const [isLoadingSentinel, setIsLoadingSentinel] = useState(false);
  const [isLoadingSentinelTiles, setIsLoadingSentinelTiles] = useState(false);
  const [sentinelTilesLoaded, setSentinelTilesLoaded] = useState(0);
  const [sentinelError, setSentinelError] = useState('');
  const [showAvailability, setShowAvailability] = useState(false);
  const [isFlatMapMode, setIsFlatMapMode] = useState(true);
  const [availabilityScenes, setAvailabilityScenes] = useState<SentinelScene[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(monthKeyFromDate(new Date()));
  const [isCalendarCollapsed, setIsCalendarCollapsed] = useState(true);
  const [isSentinelPanelDocked, setIsSentinelPanelDocked] = useState(true);
  const [isOrbitCollapsed, setIsOrbitCollapsed] = useState(true);
  const [isOpsPanelCollapsed, setIsOpsPanelCollapsed] = useState(true);
  const [alertEmail, setAlertEmail] = useState('');
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
  const [alertStatus, setAlertStatus] = useState('Vue actuelle prete');
  const [isCheckingAlert, setIsCheckingAlert] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showWeather, setShowWeather] = useState(true);
  const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshot | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [isPreparingReport, setIsPreparingReport] = useState(false);
  const [showLiveTraffic, setShowLiveTraffic] = useState(false);
  const [liveAircraft, setLiveAircraft] = useState<LiveAircraft[]>([]);
  const [selectedAircraftId, setSelectedAircraftId] = useState('');
  const [selectedAircraftSnapshot, setSelectedAircraftSnapshot] = useState<LiveAircraft | null>(null);
  const [followedAircraftId, setFollowedAircraftId] = useState('');
  const [isLoadingLiveTraffic, setIsLoadingLiveTraffic] = useState(false);
  const [liveTrafficError, setLiveTrafficError] = useState('');
  const [liveTrafficUpdatedAt, setLiveTrafficUpdatedAt] = useState<number | null>(null);
  const [tleRecords, setTleRecords] = useState<Record<string, TleRecord>>({});
  const [satellitePositions, setSatellitePositions] = useState<SatelliteLivePosition[]>([]);
  const [isLoadingOrbit, setIsLoadingOrbit] = useState(true);
  const dragStart = useRef<WorldPoint>({ x: 0, y: 0 });
  const webDragStart = useRef<WebDragSession | null>(null);
  const mapHoverRef = useRef(false);
  const selectionStart = useRef<WorldPoint | null>(null);
  const selectionDraft = useRef<SelectionBox | null>(null);
  const searchCache = useRef<Record<string, SearchResult[]>>({});
  const sentinelRequestId = useRef(0);
  const availabilityRequestId = useRef(0);
  const weatherRequestId = useRef(0);
  const liveTrafficRequestId = useRef(0);
  const lastSentinelLoadKey = useRef('');
  const cameraAnimationRef = useRef<number | null>(null);

  useEffect(() => {
    setViewport((currentViewport) => {
      if (currentViewport.width > 64 && currentViewport.height > 64) {
        return currentViewport;
      }

      return {
        width: Math.max(width - 36, 320),
        height: Math.max(height - 150, 420),
      };
    });
  }, [height, width]);

  const tileZoom = clamp(Math.ceil(zoom), MIN_ZOOM, MAX_TILE_SOURCE_ZOOM);
  const tileScale = 2 ** (zoom - tileZoom);
  const centerPoint = useMemo(() => latLngToPoint(center, tileZoom), [center, tileZoom]);
  const isSentinelViewportActive = Boolean(selectedBbox);

  const visibleTiles = useMemo(() => {
    const tiles: Tile[] = [];
    const tileCount = 2 ** tileZoom;
    const tileSize = TILE_SIZE * tileScale;
    const halfWidth = viewport.width / (2 * tileScale);
    const halfHeight = viewport.height / (2 * tileScale);
    const startX = Math.floor((centerPoint.x - halfWidth) / TILE_SIZE) - 1;
    const endX = Math.floor((centerPoint.x + halfWidth) / TILE_SIZE) + 1;
    const startY = Math.floor((centerPoint.y - halfHeight) / TILE_SIZE) - 1;
    const endY = Math.floor((centerPoint.y + halfHeight) / TILE_SIZE) + 1;

    for (let x = startX; x <= endX; x += 1) {
      for (let y = startY; y <= endY; y += 1) {
        if (y < 0 || y >= tileCount) {
          continue;
        }

        const wrappedX = wrap(x, tileCount);
        const tile = {
          key: `${tileZoom}-${x}-${y}`,
          url: `${BASE_TILE_URL}/${tileZoom}/${wrappedX}/${y}.png`,
          left: (x * TILE_SIZE - centerPoint.x) * tileScale + viewport.width / 2,
          top: (y * TILE_SIZE - centerPoint.y) * tileScale + viewport.height / 2,
          size: tileSize,
          x: wrappedX,
          y,
          z: tileZoom,
        };

        tiles.push({
          ...tile,
          url: isSentinelViewportActive ? sentinelCloudlessTileUrl(tile) : tile.url,
        });
      }
    }

    return tiles;
  }, [centerPoint, isSentinelViewportActive, tileScale, tileZoom, viewport]);

  const selectedTitle = selectedPlace ? shortPlaceName(selectedPlace.display_name) : 'Carte Monde';
  const activeScene = sentinelScenes.find((scene) => scene.id === activeSceneId) ?? null;
  const sentinelTiles = useMemo<SentinelTile[]>(() => {
    const activeDate = activeScene?.date ?? sentinelScenes[0]?.date ?? '';
    const scenesForActiveDate = activeDate
      ? sentinelScenes.filter((scene) => scene.date === activeDate)
      : sentinelScenes;

    if (scenesForActiveDate.length === 0) {
      return [];
    }

    return visibleTiles.reduce<SentinelTile[]>((tiles, tile) => {
      const bbox = tileBbox(tile);
      const preferredScene = activeScene && bboxesIntersect(activeScene.bbox, bbox) ? activeScene : null;
      const matchingScene =
        preferredScene ??
        scenesForActiveDate.find((scene) => bboxesIntersect(scene.bbox, bbox)) ??
        sentinelScenes.find((scene) => bboxesIntersect(scene.bbox, bbox));

      if (matchingScene) {
        tiles.push({ scene: matchingScene, tile });
      }

      return tiles;
    }, []);
  }, [activeScene, sentinelScenes, visibleTiles]);

  const projectBboxToScreenRect = (bbox: Bbox, key: string): ScreenRect | null => {
    const [west, south, east, north] = bbox;
    const northwest = latLngToPoint({ lat: north, lon: west }, tileZoom);
    const southeast = latLngToPoint({ lat: south, lon: east }, tileZoom);
    const left = (northwest.x - centerPoint.x) * tileScale + viewport.width / 2;
    const top = (northwest.y - centerPoint.y) * tileScale + viewport.height / 2;
    const right = (southeast.x - centerPoint.x) * tileScale + viewport.width / 2;
    const bottom = (southeast.y - centerPoint.y) * tileScale + viewport.height / 2;
    const clippedLeft = clamp(Math.min(left, right), -viewport.width, viewport.width * 2);
    const clippedTop = clamp(Math.min(top, bottom), -viewport.height, viewport.height * 2);
    const clippedRight = clamp(Math.max(left, right), -viewport.width, viewport.width * 2);
    const clippedBottom = clamp(Math.max(top, bottom), -viewport.height, viewport.height * 2);
    const rectWidth = clippedRight - clippedLeft;
    const rectHeight = clippedBottom - clippedTop;

    if (rectWidth < 3 || rectHeight < 3) {
      return null;
    }

    return {
      key,
      left: clippedLeft,
      top: clippedTop,
      width: rectWidth,
      height: rectHeight,
    };
  };

  const projectLocationToScreenPoint = (location: LatLng) => {
    const point = latLngToPoint(location, tileZoom);

    return {
      left: (point.x - centerPoint.x) * tileScale + viewport.width / 2,
      top: (point.y - centerPoint.y) * tileScale + viewport.height / 2,
    };
  };

  const availabilityRects = useMemo(
    () =>
      availabilityScenes
        .map((scene) => projectBboxToScreenRect(scene.bbox, scene.id))
        .filter((rect): rect is ScreenRect => Boolean(rect)),
    [availabilityScenes, centerPoint, tileScale, tileZoom, viewport],
  );
  const scenesByDate = useMemo(() => {
    const groupedScenes = new Map<string, SentinelScene[]>();

    sentinelScenes.forEach((scene) => {
      const scenes = groupedScenes.get(scene.date) ?? [];
      scenes.push(scene);
      groupedScenes.set(scene.date, scenes);
    });

    groupedScenes.forEach((scenes) => {
      scenes.sort((a, b) => a.cloudCover - b.cloudCover);
    });

    return groupedScenes;
  }, [sentinelScenes]);
  const availableDates = useMemo(
    () => Array.from(scenesByDate.keys()).sort((a, b) => b.localeCompare(a)),
    [scenesByDate],
  );
  const comparisonTimeline = useMemo<ComparisonPoint[]>(
    () =>
      Array.from(scenesByDate.entries())
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
        .slice(-8)
        .map(([date, scenes]) => comparisonPointFromScenes(date, scenes)),
    [scenesByDate],
  );
  const comparisonMetrics = useMemo(() => comparisonMetricsFromPoints(comparisonTimeline), [comparisonTimeline]);
  const availableMonths = useMemo(
    () => Array.from(new Set(availableDates.map(monthKeyFromDateLabel))).sort(),
    [availableDates],
  );
  const activeDate = activeScene?.date ?? availableDates[0] ?? '';
  const calendarDays = useMemo(() => calendarDaysForMonth(calendarMonth), [calendarMonth]);
  const canGoToPreviousMonth = availableMonths.some((month) => month < calendarMonth);
  const canGoToNextMonth = availableMonths.some((month) => month > calendarMonth);
  const satelliteScreenPositions = useMemo(
    () =>
      satellitePositions
        .map((position) => {
          const screenPoint = projectLocationToScreenPoint({ lat: position.lat, lon: position.lon });
          return { ...position, ...screenPoint };
        })
        .filter(
          (position) =>
            position.left > -48 &&
            position.left < viewport.width + 48 &&
            position.top > -48 &&
            position.top < viewport.height + 48,
        ),
    [satellitePositions, centerPoint, tileScale, tileZoom, viewport],
  );
  const aircraftScreenPositions = useMemo(
    () =>
      liveAircraft
        .map((aircraft) => {
          const screenPoint = projectLocationToScreenPoint({ lat: aircraft.lat, lon: aircraft.lon });
          return { ...aircraft, ...screenPoint };
        })
        .filter(
          (aircraft) =>
            aircraft.left > -64 &&
            aircraft.left < viewport.width + 64 &&
            aircraft.top > -64 &&
            aircraft.top < viewport.height + 64,
        ),
    [liveAircraft, centerPoint, tileScale, tileZoom, viewport],
  );
  const selectedAircraft =
    (selectedAircraftId ? liveAircraft.find((aircraft) => aircraft.id === selectedAircraftId) : null) ??
    selectedAircraftSnapshot;
  const displayedImageCount = sentinelTiles.length;
  const imageryLoadKey =
    displayedImageCount > 0
      ? sentinelTiles.map(({ scene, tile }) => `${scene.id}:${tile.key}`).join('|')
      : '';
  const imageryProgress =
    displayedImageCount > 0 ? Math.min(100, Math.round((sentinelTilesLoaded / displayedImageCount) * 100)) : 0;
  const loadingProgress = isLoadingSentinel ? 24 : isLoadingSentinelTiles ? imageryProgress : 100;
  const visibleSceneDates = Array.from(new Set(sentinelScenes.map((scene) => scene.date)));
  const weatherHours = weatherSnapshot?.hourly ?? [];
  const weatherTemperatureValues = weatherHours.map((hour) => hour.temperature);
  const weatherTemperatureMin = weatherTemperatureValues.length > 0 ? Math.min(...weatherTemperatureValues) : 0;
  const weatherTemperatureMax = weatherTemperatureValues.length > 0 ? Math.max(...weatherTemperatureValues) : 1;
  const weatherTemperatureRange = Math.max(weatherTemperatureMax - weatherTemperatureMin, 1);
  const weatherMaxRain = Math.max(1, ...weatherHours.map((hour) => hour.precipitation));
  const weatherMaxWind = Math.max(1, ...weatherHours.map((hour) => hour.windSpeed));
  const weatherChartHours = weatherHours.filter((_, index) => index % 2 === 0).slice(0, 12);
  const weatherInfoCards = weatherSnapshot
    ? [
        {
          label: 'Ressenti',
          value: `${Math.round(weatherSnapshot.current.apparentTemperature)}°C`,
        },
        {
          label: 'Humidite',
          value: `${Math.round(weatherSnapshot.current.humidity)}%`,
        },
        {
          label: 'Nuages',
          value: `${Math.round(weatherSnapshot.current.cloudCover)}%`,
        },
        {
          label: 'Vent',
          value: `${Math.round(weatherSnapshot.current.windSpeed)} km/h`,
        },
        {
          label: 'Rafales',
          value: `${Math.round(weatherSnapshot.current.windGusts)} km/h`,
        },
        {
          label: 'Pression',
          value: `${Math.round(weatherSnapshot.current.pressure)} hPa`,
        },
        {
          label: 'Pluie',
          value: `${weatherSnapshot.current.precipitation.toFixed(1)} mm`,
        },
        {
          label: 'Neige',
          value: `${weatherSnapshot.current.snowfall.toFixed(1)} cm`,
        },
      ]
    : [];

  useEffect(() => {
    if (displayedImageCount === 0) {
      setIsLoadingSentinelTiles(false);
      setSentinelTilesLoaded(0);
      return;
    }

    setSentinelTilesLoaded(0);
    setIsLoadingSentinelTiles(true);

    const fallbackTimer = setTimeout(() => {
      setIsLoadingSentinelTiles(false);
    }, 8000);

    return () => clearTimeout(fallbackTimer);
  }, [imageryLoadKey, displayedImageCount]);

  const cancelCameraAnimation = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && cameraAnimationRef.current !== null) {
      window.clearInterval(cameraAnimationRef.current);
      cameraAnimationRef.current = null;
    }
  };

  const focusLocation = (location: LatLng, nextZoom = Math.max(zoom, 5)) => {
    cancelCameraAnimation();
    setCenter(location);
    setZoom(clamp(nextZoom, MIN_ZOOM, MAX_ZOOM));
  };

  const animateCameraTo = (location: LatLng, nextZoom = Math.max(zoom, 13.5)) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      focusLocation(location, nextZoom);
      return;
    }

    cancelCameraAnimation();

    const startCenter = center;
    const startZoom = zoom;
    const startTime = Date.now();
    const durationMs = 850;
    const lonDelta = ((location.lon - startCenter.lon + 540) % 360) - 180;
    const easeOut = (value: number) => 1 - (1 - value) ** 3;

    const step = () => {
      const progress = clamp((Date.now() - startTime) / durationMs, 0, 1);
      const easedProgress = easeOut(progress);

      setCenter({
        lat: startCenter.lat + (location.lat - startCenter.lat) * easedProgress,
        lon: startCenter.lon + lonDelta * easedProgress,
      });
      setZoom(clamp(startZoom + (nextZoom - startZoom) * easedProgress, MIN_ZOOM, MAX_ZOOM));

      if (progress >= 1 && cameraAnimationRef.current !== null) {
        window.clearInterval(cameraAnimationRef.current);
        cameraAnimationRef.current = null;
      }
    };

    cameraAnimationRef.current = window.setInterval(step, 16);
    step();
  };

  useEffect(
    () => () => {
      cancelCameraAnimation();
    },
    [],
  );

  const focusBbox = ([west, south, east, north]: Bbox) => {
    const northwest = latLngToPoint({ lat: north, lon: west }, 0);
    const southeast = latLngToPoint({ lat: south, lon: east }, 0);
    const bboxWidth = Math.max(Math.abs(southeast.x - northwest.x), 0.0001);
    const bboxHeight = Math.max(Math.abs(southeast.y - northwest.y), 0.0001);
    const availableWidth = Math.max(viewport.width - 180, 1);
    const availableHeight = Math.max(viewport.height - 190, 1);
    const fitZoom = Math.min(Math.log2(availableWidth / bboxWidth), Math.log2(availableHeight / bboxHeight));
    const nextZoom = Math.round(clamp(fitZoom, MIN_ZOOM, MAX_ZOOM) / ZOOM_STEP) * ZOOM_STEP;

    setCenter({
      lat: (south + north) / 2,
      lon: (west + east) / 2,
    });
    setZoom(clamp(nextZoom, MIN_ZOOM, MAX_ZOOM));
  };

  const focusResult = (result: SearchResult) => {
    setSelectedPlace(result);
    focusLocation({ lat: Number(result.lat), lon: Number(result.lon) }, Math.max(zoom, 10.25));
  };

  const clearSentinelLayer = () => {
    sentinelRequestId.current += 1;
    lastSentinelLoadKey.current = '';
    setSelectedBbox(null);
    setSentinelScenes([]);
    setActiveSceneId('');
    setSelectedScene(null);
    setIsLoadingSentinel(false);
    setIsLoadingSentinelTiles(false);
    setSentinelTilesLoaded(0);
    setSentinelError('');
  };

  const registerSentinelTileDone = () => {
    if (displayedImageCount === 0) {
      return;
    }

    setSentinelTilesLoaded((currentCount) => {
      const nextCount = Math.min(currentCount + 1, displayedImageCount);

      if (nextCount >= displayedImageCount) {
        setIsLoadingSentinelTiles(false);
      }

      return nextCount;
    });
  };

  const loadSentinelScenes = async (bbox: Bbox, clearExisting = sentinelScenes.length === 0) => {
    const loadKey = bbox.map((value) => value.toFixed(3)).join(',');

    if (!clearExisting && lastSentinelLoadKey.current === loadKey && sentinelScenes.length > 0) {
      setIsLoadingSentinel(false);
      return;
    }

    const requestId = sentinelRequestId.current + 1;
    sentinelRequestId.current = requestId;
    setIsLoadingSentinel(true);
    setSentinelError('');

    if (clearExisting) {
      setSentinelScenes([]);
      setActiveSceneId('');
      setSelectedScene(null);
      setIsLoadingSentinelTiles(false);
      setSentinelTilesLoaded(0);
    }

    try {
      const response = await fetch(EARTH_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(earthSearchBody(bbox)),
      });

      if (!response.ok) {
        throw new Error('Sentinel search failed');
      }

      const data = (await response.json()) as { features?: EarthSearchItem[] };
      const scenes = (data.features ?? [])
        .map((item) => sceneFromEarthSearchItem(item, bbox))
        .filter((scene): scene is SentinelScene => Boolean(scene))
        .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

      if (requestId !== sentinelRequestId.current) {
        return;
      }

      if (scenes.length === 0) {
        setSentinelError(SENTINEL_SOURCE.emptyMessage);
        return;
      }

      lastSentinelLoadKey.current = loadKey;
      setSentinelScenes(scenes);
      setCalendarMonth(monthKeyFromDateLabel(scenes[0].date));
      setActiveSceneId((currentSceneId) =>
        scenes.some((scene) => scene.id === currentSceneId) ? currentSceneId : scenes[0].id,
      );
    } catch {
      if (requestId === sentinelRequestId.current) {
        setSentinelError(`Impossible de charger ${SENTINEL_SOURCE.label} pour cette zone.`);
      }
    } finally {
      if (requestId === sentinelRequestId.current) {
        setIsLoadingSentinel(false);
      }
    }
  };

  const loadAvailabilityZones = async (bbox: Bbox) => {
    const requestId = availabilityRequestId.current + 1;
    availabilityRequestId.current = requestId;

    setIsLoadingAvailability(true);
    setAvailabilityError('');

    try {
      const response = await fetch(EARTH_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          earthSearchBody(
            bbox,
            SENTINEL_SOURCE.availabilityCloudCoverMax,
            SENTINEL_SOURCE.availabilityLimit,
          ),
        ),
      });

      if (!response.ok) {
        throw new Error('Sentinel availability failed');
      }

      const data = (await response.json()) as { features?: EarthSearchItem[] };
      const scenes = (data.features ?? [])
        .map((item) => sceneFromEarthSearchItem(item, bbox))
        .filter((scene): scene is SentinelScene => Boolean(scene))
        .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

      if (requestId !== availabilityRequestId.current) {
        return;
      }

      setAvailabilityScenes(scenes);
      setAvailabilityError(scenes.length === 0 ? `Aucune zone ${SENTINEL_SOURCE.label} recente ici.` : '');
    } catch {
      if (requestId === availabilityRequestId.current) {
        setAvailabilityScenes([]);
        setAvailabilityError(`Impossible de verifier les zones ${SENTINEL_SOURCE.label} pour cette vue.`);
      }
    } finally {
      if (requestId === availabilityRequestId.current) {
        setIsLoadingAvailability(false);
      }
    }
  };

  const toggleAvailabilityLayer = () => {
    setShowAvailability((currentValue) => {
      const nextValue = !currentValue;

      if (!nextValue) {
        availabilityRequestId.current += 1;
        setAvailabilityScenes([]);
        setAvailabilityError('');
        setIsLoadingAvailability(false);
      }

      return nextValue;
    });
  };

  const handleMapLayout = (event: LayoutChangeEvent) => {
    if (event.nativeEvent.layout.width < 64 || event.nativeEvent.layout.height < 64) {
      return;
    }

    setViewport({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  };

  const changeZoom = (amount: number) => {
    setZoom((currentZoom) => {
      const nextZoom = Math.round((currentZoom + amount) / ZOOM_STEP) * ZOOM_STEP;
      return clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    });
  };

  const changeZoomRef = useRef(changeZoom);

  useEffect(() => {
    changeZoomRef.current = changeZoom;
  }, [changeZoom]);

  const screenToLocation = (x: number, y: number) => {
    const point = {
      x: centerPoint.x + (x - viewport.width / 2) / tileScale,
      y: centerPoint.y + (y - viewport.height / 2) / tileScale,
    };

    return pointToLatLng(point, tileZoom);
  };

  const currentViewportBbox = useMemo(
    () => bboxFromLocations(screenToLocation(0, 0), screenToLocation(viewport.width, viewport.height)),
    [centerPoint, tileScale, tileZoom, viewport],
  );
  const currentViewportBboxKey = currentViewportBbox.map((value) => value.toFixed(3)).join(',');
  const selectedBboxKey = selectedBbox ? selectedBbox.map((value) => value.toFixed(3)).join(',') : '';
  const activeAnalysisBbox = selectedBbox ?? currentViewportBbox;
  const activeAnalysisAreaKm2 = bboxAreaKm2(activeAnalysisBbox);

  const toggleSentinelViewport = () => {
    if (isSentinelViewportActive) {
      clearSentinelLayer();
      return;
    }

    setSelectedBbox(currentViewportBbox);
    setIsSentinelPanelDocked(true);
    setSentinelError('');
    setIsLoadingSentinel(true);
  };

  const selectAircraft = (aircraft: LiveAircraft) => {
    setSelectedAircraftId(aircraft.id);
    setSelectedAircraftSnapshot(aircraft);
    setSelectedScene(null);
  };

  const selectAircraftAtPoint = (x: number, y: number) => {
    if (!showLiveTraffic || aircraftScreenPositions.length === 0) {
      return false;
    }

    const aircraft = aircraftScreenPositions
      .map((candidate) => ({
        aircraft: candidate,
        distance: Math.hypot(candidate.left - x, candidate.top - y),
      }))
      .filter((candidate) => candidate.distance <= 42)
      .sort((a, b) => a.distance - b.distance)[0]?.aircraft;

    if (!aircraft) {
      return false;
    }

    selectAircraft(aircraft);
    return true;
  };

  const pickSceneAtPoint = (x: number, y: number) => {
    if (selectAircraftAtPoint(x, y)) {
      return;
    }

    const location = screenToLocation(x, y);
    const loadedScenesAtPoint = sentinelScenes.filter((scene) => bboxContainsLocation(scene.bbox, location));
    const availabilityScenesAtPoint = showAvailability
      ? availabilityScenes.filter((scene) => bboxContainsLocation(scene.bbox, location))
      : [];
    const activeSceneAtPoint =
      activeScene && loadedScenesAtPoint.some((scene) => scene.id === activeScene.id) ? activeScene : null;

    setSelectedAircraftId('');
    setSelectedAircraftSnapshot(null);
    setFollowedAircraftId('');
    setSelectedScene(activeSceneAtPoint ?? loadedScenesAtPoint[0] ?? availabilityScenesAtPoint[0] ?? null);
  };

  const followAircraft = (aircraft: LiveAircraft) => {
    setSelectedAircraftId(aircraft.id);
    setSelectedAircraftSnapshot(aircraft);
    setFollowedAircraftId(aircraft.id);
    animateCameraTo({ lat: aircraft.lat, lon: aircraft.lon }, Math.max(zoom, 13.5));
  };

  const selectSceneDate = (date: string) => {
    const scene = scenesByDate.get(date)?.[0];

    if (!scene) {
      return;
    }

    setActiveSceneId(scene.id);
    setSelectedScene(scene);
    setCalendarMonth(monthKeyFromDateLabel(date));
  };

  const fetchWeatherForBbox = async (bbox: Bbox) => {
    const location = bboxCenter(bbox);
    const response = await fetch(weatherForecastUrl(location));

    if (!response.ok) {
      throw new Error('Weather forecast failed');
    }

    const data = (await response.json()) as OpenMeteoResponse;
    return weatherSnapshotFromResponse(data, location);
  };

  const loadWeatherForBbox = async (bbox: Bbox) => {
    const requestId = weatherRequestId.current + 1;
    weatherRequestId.current = requestId;

    setIsLoadingWeather(true);
    setWeatherError('');

    try {
      const snapshot = await fetchWeatherForBbox(bbox);

      if (requestId === weatherRequestId.current) {
        setWeatherSnapshot(snapshot);
      }
    } catch {
      if (requestId === weatherRequestId.current) {
        setWeatherSnapshot(null);
        setWeatherError('Meteo indisponible pour cette zone.');
      }
    } finally {
      if (requestId === weatherRequestId.current) {
        setIsLoadingWeather(false);
      }
    }
  };

  const loadLiveTrafficForBbox = async (bbox: Bbox) => {
    const requestId = liveTrafficRequestId.current + 1;
    liveTrafficRequestId.current = requestId;

    setIsLoadingLiveTraffic(true);
    setLiveTrafficError('');

    try {
      const response = await fetch(openSkyUrl(bbox));

      if (!response.ok) {
        throw new Error('OpenSky failed');
      }

      const data = (await response.json()) as OpenSkyResponse;

      if (requestId !== liveTrafficRequestId.current) {
        return;
      }

      setLiveAircraft(aircraftFromOpenSkyResponse(data));
      setLiveTrafficUpdatedAt(data.time ? data.time * 1000 : Date.now());
    } catch {
      if (requestId === liveTrafficRequestId.current) {
        setLiveAircraft([]);
        setLiveTrafficError('Avions indisponibles pour cette zone.');
      }
    } finally {
      if (requestId === liveTrafficRequestId.current) {
        setIsLoadingLiveTraffic(false);
      }
    }
  };

  const latestSceneForBbox = async (bbox: Bbox) => {
    const response = await fetch(EARTH_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(earthSearchBody(bbox, SENTINEL_SOURCE.availabilityCloudCoverMax, 1)),
    });

    if (!response.ok) {
      throw new Error('Alert search failed');
    }

    const data = (await response.json()) as { features?: EarthSearchItem[] };
    const latestScene = (data.features ?? [])
      .map((item) => sceneFromEarthSearchItem(item, bbox))
      .filter((scene): scene is SentinelScene => Boolean(scene))
      .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())[0];

    return latestScene ?? null;
  };

  const activateMailAlert = () => {
    const email = alertEmail.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAlertStatus('Mail invalide');
      return;
    }

    const baselineDatetime = sentinelScenes[0]?.datetime ?? activeScene?.datetime ?? new Date().toISOString();
    setAlertConfig({
      active: true,
      bbox: activeAnalysisBbox,
      email,
      lastSceneDatetime: baselineDatetime,
    });
    setAlertStatus(`Alerte active depuis ${formatDateLabel(baselineDatetime)}`);
  };

  const checkMailAlert = async (silent = false) => {
    const config = alertConfig;

    if (!config) {
      if (!silent) {
        setAlertStatus('Active une alerte');
      }
      return;
    }

    setIsCheckingAlert(true);

    try {
      const latestScene = await latestSceneForBbox(config.bbox);

      if (!latestScene) {
        setAlertStatus('Aucune nouvelle image trouvee');
        return;
      }

      const latestTime = new Date(latestScene.datetime).getTime();
      const knownTime = new Date(config.lastSceneDatetime).getTime();

      if (latestTime <= knownTime) {
        setAlertStatus(`Rien de nouveau depuis ${formatDateLabel(config.lastSceneDatetime)}`);
        return;
      }

      setAlertConfig({ ...config, lastSceneDatetime: latestScene.datetime });
      setAlertStatus(`Nouvelle image ${latestScene.date}`);
      openMailDraft(
        config.email,
        `Projet Forseti - nouvelle image ${SENTINEL_SOURCE.label}`,
        `Nouvelle image ${SENTINEL_SOURCE.label} detectee le ${latestScene.date}.\n\nZone: ${formatBboxLabel(
          config.bbox,
        )}\nNuages: ${Math.round(latestScene.cloudCover)}%\nImage: ${latestScene.visualHref}`,
      );
    } catch {
      if (!silent) {
        setAlertStatus('Verification impossible');
      }
    } finally {
      setIsCheckingAlert(false);
    }
  };

  const buildReportText = (reportWeatherSnapshot = weatherSnapshot) => {
    const zoneLabel = formatBboxLabel(activeAnalysisBbox);
    const metrics = comparisonMetrics
      .map((metric) => {
        const delta = metric.current - metric.previous;
        return `${metric.label}: ${metric.current}${metric.unit} (${delta >= 0 ? '+' : ''}${delta}${metric.unit})`;
      })
      .join('\n');
    const weather = reportWeatherSnapshot
      ? `\nMeteo actuelle:\nTemperature: ${Math.round(
          reportWeatherSnapshot.current.temperature,
        )}°C\nRessenti: ${Math.round(reportWeatherSnapshot.current.apparentTemperature)}°C\nEtat: ${weatherCodeLabel(
          reportWeatherSnapshot.current.weatherCode,
        )}\nHumidite: ${Math.round(reportWeatherSnapshot.current.humidity)}%\nNuages: ${Math.round(
          reportWeatherSnapshot.current.cloudCover,
        )}%\nVent: ${Math.round(reportWeatherSnapshot.current.windSpeed)} km/h\nPluie: ${reportWeatherSnapshot.current.precipitation.toFixed(
          1,
        )} mm`
      : '\nMeteo actuelle: non chargee';

    return `Projet Forseti - rapport Sentinel-2\nZone: ${zoneLabel}\nDate active: ${
      activeDate || 'aucune'
    }\nSource Sentinel-2: dates, nombre d'images et nuages viennent des metadonnees Earth Search.\nSource meteo: Open-Meteo.\n${weather}\n\nComparatif reel Sentinel-2:\n${
      metrics || 'Pas assez de dates pour comparer.'
    }`;
  };

  const mailReport = async () => {
    const email = alertEmail.trim();

    if (!email) {
      setAlertStatus('Entre un mail');
      return;
    }

    setIsPreparingReport(true);
    setAlertStatus('Recherche des donnees reelles...');

    try {
      const reportWeatherSnapshot = await fetchWeatherForBbox(activeAnalysisBbox);

      if (reportWeatherSnapshot) {
        setWeatherSnapshot(reportWeatherSnapshot);
      }

      openMailDraft(email, 'Projet Forseti - rapport de zone', buildReportText(reportWeatherSnapshot));
      setAlertStatus('Mail pret avec les donnees reelles.');
    } catch {
      openMailDraft(email, 'Projet Forseti - rapport de zone', buildReportText());
      setAlertStatus('Mail pret, meteo non disponible.');
    } finally {
      setIsPreparingReport(false);
    }
  };

  const openReportPdf = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      setAlertStatus('PDF disponible sur PC');
      return;
    }

    const reportWindow = window.open('', '_blank', 'width=920,height=720');

    if (!reportWindow) {
      setAlertStatus('Popup PDF bloquee');
      return;
    }

    const rows = comparisonMetrics
      .map((metric) => {
        const delta = metric.current - metric.previous;
        return `<tr><td>${metric.label}</td><td>${metric.previous}${metric.unit}</td><td>${metric.current}${
          metric.unit
        }</td><td>${delta >= 0 ? '+' : ''}${delta}${metric.unit}</td></tr>`;
      })
      .join('');
    const bars = comparisonMetrics
      .map(
        (metric) =>
          `<div class="metric"><span>${metric.label}</span><div><b style="width:${clamp(
            metric.current,
            0,
            100,
          )}%;background:${metric.color}"></b></div><strong>${metric.current}${metric.unit}</strong></div>`,
      )
      .join('');
    const weatherRows = weatherSnapshot
      ? `
        <tr><td>Temperature</td><td>${Math.round(weatherSnapshot.current.temperature)}°C</td></tr>
        <tr><td>Ressenti</td><td>${Math.round(weatherSnapshot.current.apparentTemperature)}°C</td></tr>
        <tr><td>Etat</td><td>${weatherCodeLabel(weatherSnapshot.current.weatherCode)}</td></tr>
        <tr><td>Humidite</td><td>${Math.round(weatherSnapshot.current.humidity)}%</td></tr>
        <tr><td>Nuages</td><td>${Math.round(weatherSnapshot.current.cloudCover)}%</td></tr>
        <tr><td>Vent</td><td>${Math.round(weatherSnapshot.current.windSpeed)} km/h</td></tr>
        <tr><td>Precipitations</td><td>${weatherSnapshot.current.precipitation.toFixed(1)} mm</td></tr>`
      : '<tr><td colspan="2">Meteo non chargee</td></tr>';

    reportWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>Projet Forseti - rapport</title>
          <style>
            body { background:#05070a; color:#edf5ff; font-family:Arial,sans-serif; padding:32px; }
            h1 { margin:0 0 6px; } p { color:#9babbf; }
            table { border-collapse:collapse; margin-top:24px; width:100%; }
            td, th { border:1px solid #273141; padding:10px; text-align:left; }
            th { background:#101720; }
            .metric { align-items:center; display:grid; gap:12px; grid-template-columns:140px 1fr 80px; margin:14px 0; }
            .metric div { background:#151d28; height:12px; overflow:hidden; }
            .metric b { display:block; height:100%; }
            @media print { body { background:#fff; color:#111827; } p { color:#4b5563; } }
          </style>
        </head>
        <body>
          <h1>Projet Forseti</h1>
          <p>Rapport Sentinel-2 - ${formatBboxLabel(activeAnalysisBbox)}</p>
          <p>Date active: ${activeDate || 'aucune'} · images chargees: ${sentinelScenes.length}</p>
          ${bars}
          <table>
            <thead><tr><th>Meteo</th><th>Valeur</th></tr></thead>
            <tbody>${weatherRows}</tbody>
          </table>
          <table>
            <thead><tr><th>Element</th><th>Ancien</th><th>Nouveau</th><th>Evolution</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4">Pas assez de dates pour comparer.</td></tr>'}</tbody>
          </table>
        </body>
      </html>`);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  useEffect(() => {
    if (!showAvailability) {
      return;
    }

    const availabilityTimer = setTimeout(() => {
      void loadAvailabilityZones(currentViewportBbox);
    }, 520);

    return () => clearTimeout(availabilityTimer);
  }, [currentViewportBboxKey, showAvailability]);

  useEffect(() => {
    const weatherTimer = setTimeout(() => {
      void loadWeatherForBbox(activeAnalysisBbox);
    }, 650);

    return () => clearTimeout(weatherTimer);
  }, [currentViewportBboxKey, selectedBboxKey]);

  useEffect(() => {
    if (!showLiveTraffic) {
      liveTrafficRequestId.current += 1;
      setLiveAircraft([]);
      setSelectedAircraftId('');
      setSelectedAircraftSnapshot(null);
      setFollowedAircraftId('');
      setLiveTrafficError('');
      setIsLoadingLiveTraffic(false);
      return;
    }

    void loadLiveTrafficForBbox(activeAnalysisBbox);
    const liveTimer = setInterval(() => {
      void loadLiveTrafficForBbox(activeAnalysisBbox);
    }, 15000);

    return () => clearInterval(liveTimer);
  }, [showLiveTraffic, currentViewportBboxKey, selectedBboxKey]);

  useEffect(() => {
    if (!followedAircraftId) {
      return;
    }

    const aircraft = liveAircraft.find((candidate) => candidate.id === followedAircraftId);

    if (!aircraft) {
      return;
    }

    setSelectedAircraftSnapshot(aircraft);
    animateCameraTo({ lat: aircraft.lat, lon: aircraft.lon }, Math.max(zoom, 13.5));
  }, [followedAircraftId, liveAircraft]);

  useEffect(() => {
    let isCancelled = false;

    const loadTleRecords = async () => {
      const entries = await Promise.all(
        SENTINEL_ORBITERS.map(async (satellite) => {
          try {
            const response = await fetch(sentinelTleUrl(satellite.noradId));

            if (!response.ok) {
              throw new Error('TLE unavailable');
            }

            const lines = (await response.text())
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean);
            const record = parseTle(lines[0] ?? satellite.label, lines[1] ?? '', lines[2] ?? '');

            return record ? ([satellite.key, record] as const) : null;
          } catch {
            if (!satellite.fallbackTle) {
              return null;
            }

            const [name, line1, line2] = satellite.fallbackTle;
            const record = parseTle(name, line1, line2);
            return record ? ([satellite.key, record] as const) : null;
          }
        }),
      );

      if (isCancelled) {
        return;
      }

      setTleRecords(Object.fromEntries(entries.filter((entry): entry is [string, TleRecord] => Boolean(entry))));
      setIsLoadingOrbit(false);
    };

    void loadTleRecords();
    const tleRefreshTimer = setInterval(loadTleRecords, 6 * 60 * 60 * 1000);

    return () => {
      isCancelled = true;
      clearInterval(tleRefreshTimer);
    };
  }, []);

  useEffect(() => {
    const updatePositions = () => {
      const nextPositions = SENTINEL_ORBITERS.flatMap((satellite) => {
        const tle = tleRecords[satellite.key];
        return tle ? [satellitePositionFromTle(satellite, tle)] : [];
      });

      setSatellitePositions(nextPositions);
    };

    updatePositions();
    const positionTimer = setInterval(updatePositions, 2000);

    return () => clearInterval(positionTimer);
  }, [tleRecords]);

  useEffect(() => {
    if (!alertConfig?.active) {
      return;
    }

    const alertTimer = setInterval(() => {
      void checkMailAlert(true);
    }, 5 * 60 * 1000);

    return () => clearInterval(alertTimer);
  }, [alertConfig]);

  useEffect(() => {
    if (!selectedBbox) {
      return;
    }

    if (viewport.width < 64 || viewport.height < 64) {
      return;
    }

    setSelectedBbox(currentViewportBbox);

    const viewportReloadTimer = setTimeout(() => {
      void loadSentinelScenes(currentViewportBbox, false);
    }, 520);

    return () => clearTimeout(viewportReloadTimer);
  }, [currentViewportBboxKey, Boolean(selectedBbox)]);

  const zoomToSelection = (box: SelectionBox) => {
    const normalizedBox = normalizeSelectionBox(box);

    if (normalizedBox.width < 18 || normalizedBox.height < 18) {
      return;
    }

    const centerLocation = screenToLocation(
      normalizedBox.left + normalizedBox.width / 2,
      normalizedBox.top + normalizedBox.height / 2,
    );
    const northwest = screenToLocation(normalizedBox.left, normalizedBox.top);
    const southeast = screenToLocation(
      normalizedBox.left + normalizedBox.width,
      normalizedBox.top + normalizedBox.height,
    );
    const bbox = bboxFromLocations(northwest, southeast);
    const availableWidth = Math.max(viewport.width - 72, 1);
    const availableHeight = Math.max(viewport.height - 108, 1);
    const zoomFactor = Math.min(availableWidth / normalizedBox.width, availableHeight / normalizedBox.height);
    const nextZoom = clamp(zoom + Math.log2(zoomFactor), MIN_ZOOM, MAX_ZOOM);

    setCenter(centerLocation);
    setZoom(Math.round(nextZoom / ZOOM_STEP) * ZOOM_STEP);
    setSelectedBbox(bbox);
    setIsLoadingSentinel(true);
  };

  const searchPlaces = async () => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const cacheKey = trimmedQuery.toLowerCase();
    setIsSearching(true);

    try {
      const cachedResults = searchCache.current[cacheKey];
      const results =
        cachedResults ??
        (await fetch(
          `${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(trimmedQuery)}&format=jsonv2&limit=5&addressdetails=1&accept-language=fr`,
        ).then((response) => {
          if (!response.ok) {
            throw new Error('Search failed');
          }

          return response.json() as Promise<SearchResult[]>;
        }));

      searchCache.current[cacheKey] = results;

      if (results[0]) {
        focusResult(results[0]);
      } else {
        setSelectedPlace(null);
      }
    } catch {
      setSelectedPlace(null);
    } finally {
      setIsSearching(false);
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          selectionMode || Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (event) => {
          cancelCameraAnimation();
          setFollowedAircraftId('');
          setIsDraggingMap(true);

          if (selectionMode) {
            const location = responderLocation(event);
            const nextBox = {
              startX: location.x,
              startY: location.y,
              currentX: location.x,
              currentY: location.y,
            };

            selectionStart.current = location;
            selectionDraft.current = nextBox;
            setSelectionBox(nextBox);
            return;
          }

          dragStart.current = latLngToPoint(center, tileZoom);
        },
        onPanResponderMove: (_, gestureState) => {
          if (selectionMode && selectionStart.current) {
            const nextBox = {
              startX: selectionStart.current.x,
              startY: selectionStart.current.y,
              currentX: selectionStart.current.x + gestureState.dx,
              currentY: selectionStart.current.y + gestureState.dy,
            };

            selectionDraft.current = nextBox;
            setSelectionBox(nextBox);
            return;
          }

          const size = worldSize(tileZoom);
          const nextPoint = {
            x: dragStart.current.x - gestureState.dx / tileScale,
            y: dragStart.current.y - gestureState.dy / tileScale,
          };

          setCenter(
            pointToLatLng(
              {
                x: wrap(nextPoint.x, size),
                y: clamp(nextPoint.y, 0, size),
              },
              tileZoom,
            ),
          );
        },
        onPanResponderRelease: (event, gestureState) => {
          setIsDraggingMap(false);

          if (!selectionMode) {
            if (
              Math.abs(gestureState.dx) <= CLICK_DRAG_THRESHOLD &&
              Math.abs(gestureState.dy) <= CLICK_DRAG_THRESHOLD
            ) {
              const location = responderLocation(event);
              pickSceneAtPoint(location.x, location.y);
            }

            return;
          }

          if (selectionDraft.current) {
            zoomToSelection(selectionDraft.current);
          }

          selectionStart.current = null;
          selectionDraft.current = null;
          setSelectionBox(null);
          setSelectionMode(false);
        },
        onPanResponderTerminate: () => {
          setIsDraggingMap(false);
          selectionStart.current = null;
          selectionDraft.current = null;
          setSelectionBox(null);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [
      activeScene,
      aircraftScreenPositions,
      availabilityScenes,
      center,
      selectionMode,
      sentinelScenes,
      showAvailability,
      showLiveTraffic,
      tileScale,
      tileZoom,
      zoom,
    ],
  );

  const webWheelProps =
    Platform.OS === 'web'
      ? {
          onWheel: (event: { preventDefault?: () => void; stopPropagation?: () => void }) => {
            event.preventDefault?.();
            event.stopPropagation?.();
          },
        }
      : {};

  const webMapHoverProps =
    Platform.OS === 'web'
      ? ({
          onMouseEnter: () => {
            mapHoverRef.current = true;
          },
          onMouseLeave: () => {
            mapHoverRef.current = false;
          },
        } as never)
      : {};

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (!mapHoverRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      changeZoomRef.current(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
    };

    window.addEventListener('wheel', handleWheel, { capture: true, passive: false });

    return () => window.removeEventListener('wheel', handleWheel, true);
  }, []);

  const webMouseDragProps =
    Platform.OS === 'web'
      ? ({
          onDragStart: (event: WebMouseLikeEvent) => {
            event.preventDefault?.();
          },
          onMouseDown: (event: WebMouseLikeEvent) => {
            const nativeEvent = event.nativeEvent ?? event;

            if ((nativeEvent.button ?? 0) !== 0) {
              return;
            }

            event.preventDefault?.();
            event.stopPropagation?.();
            cancelCameraAnimation();
            setFollowedAircraftId('');
            setIsDraggingMap(true);

            const position = webMousePosition(event);

            if (selectionMode) {
              const nextBox = {
                startX: position.localX,
                startY: position.localY,
                currentX: position.localX,
                currentY: position.localY,
              };

              selectionStart.current = { x: position.localX, y: position.localY };
              selectionDraft.current = nextBox;
              setSelectionBox(nextBox);

              const handleSelectionMove = (moveEvent: MouseEvent) => {
                const currentX = position.localX + moveEvent.clientX - position.clientX;
                const currentY = position.localY + moveEvent.clientY - position.clientY;
                const draft = {
                  startX: position.localX,
                  startY: position.localY,
                  currentX,
                  currentY,
                };

                selectionDraft.current = draft;
                setSelectionBox(draft);
              };

              const handleSelectionEnd = () => {
                window.removeEventListener('mousemove', handleSelectionMove);
                window.removeEventListener('mouseup', handleSelectionEnd);
                setIsDraggingMap(false);

                if (selectionDraft.current) {
                  zoomToSelection(selectionDraft.current);
                }

                selectionStart.current = null;
                selectionDraft.current = null;
                setSelectionBox(null);
                setSelectionMode(false);
              };

              window.addEventListener('mousemove', handleSelectionMove);
              window.addEventListener('mouseup', handleSelectionEnd, { once: true });
              return;
            }

            webDragStart.current = {
              clientX: position.clientX,
              clientY: position.clientY,
              localX: position.localX,
              localY: position.localY,
              mapPoint: latLngToPoint(center, tileZoom),
              moved: false,
            };

            const handleMapMove = (moveEvent: MouseEvent) => {
              if (!webDragStart.current) {
                return;
              }

              moveEvent.preventDefault();
              const deltaX = moveEvent.clientX - webDragStart.current.clientX;
              const deltaY = moveEvent.clientY - webDragStart.current.clientY;
              const hasMoved = Math.abs(deltaX) > CLICK_DRAG_THRESHOLD || Math.abs(deltaY) > CLICK_DRAG_THRESHOLD;

              if (!hasMoved) {
                return;
              }

              webDragStart.current.moved = true;
              const size = worldSize(tileZoom);
              const nextPoint = {
                x: webDragStart.current.mapPoint.x - deltaX / tileScale,
                y: webDragStart.current.mapPoint.y - deltaY / tileScale,
              };

              setCenter(
                pointToLatLng(
                  {
                    x: wrap(nextPoint.x, size),
                    y: clamp(nextPoint.y, 0, size),
                  },
                  tileZoom,
                ),
              );
            };

            const handleMapEnd = (upEvent: MouseEvent) => {
              const dragSession = webDragStart.current;
              window.removeEventListener('mousemove', handleMapMove);
              window.removeEventListener('mouseup', handleMapEnd);

              if (dragSession && !dragSession.moved) {
                pickSceneAtPoint(
                  dragSession.localX + upEvent.clientX - dragSession.clientX,
                  dragSession.localY + upEvent.clientY - dragSession.clientY,
                );
              }

              webDragStart.current = null;
              setIsDraggingMap(false);
            };

            window.addEventListener('mousemove', handleMapMove);
            window.addEventListener('mouseup', handleMapEnd, { once: true });
          },
        } as never)
      : {};

  const selectionRect = selectionBox ? normalizeSelectionBox(selectionBox) : null;
  const focusSentinelWindow = () => {
    const targetBbox = activeScene?.bbox ?? selectedBbox;

    if (targetBbox) {
      focusBbox(targetBbox);
    }
  };
  const sentinelPanelFocusProps =
    Platform.OS === 'web'
      ? ({
          onDoubleClick: focusSentinelWindow,
        } as never)
      : {};
  const overlayHoverProps =
    Platform.OS === 'web'
      ? ({
          onMouseEnter: () => {
            mapHoverRef.current = false;
          },
          onMouseLeave: () => {
            mapHoverRef.current = true;
          },
        } as never)
      : {};
  const mapInteractionStyle =
    Platform.OS === 'web'
      ? ({
          cursor: selectionMode ? 'crosshair' : isDraggingMap ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserDrag: 'none',
          WebkitUserSelect: 'none',
        } as never)
      : undefined;
  const mapInputHandlers = Platform.OS === 'web' ? webMouseDragProps : panResponder.panHandlers;

  return (
    <View style={styles.container}>
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <View style={styles.brandBlock}>
          <View style={styles.logoMark}>
            <Text style={styles.logoLetter}>F</Text>
            <View style={styles.logoSlash} />
          </View>
          <View style={styles.brandTextBlock}>
            <Text style={styles.eyebrow}>PROJET</Text>
            <Text style={styles.title}>Forseti</Text>
          </View>
        </View>

        <View style={[styles.searchShell, isCompact && styles.searchShellCompact]}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={searchPlaces}
            placeholder="Rechercher une ville, pays, adresse..."
            placeholderTextColor="#647083"
            returnKeyType="search"
            style={styles.searchInput}
          />
          <Pressable onPress={searchPlaces} style={styles.searchButton}>
            <Text style={styles.searchButtonText}>{isSearching ? '...' : 'GO'}</Text>
          </Pressable>
        </View>

        <View style={styles.headerStats}>
          <View style={styles.liveDot} />
          <Text style={styles.headerStatText}>OSM</Text>
          <Text style={styles.headerStatMuted}>API live</Text>
        </View>
      </View>

      <View style={[styles.workspace, isCompact && styles.workspaceCompact]}>
        <View style={styles.mapPanel} onLayout={handleMapLayout}>
          <View style={styles.mapChromeTop}>
            <View style={styles.mapTitleBlock}>
              <Text style={styles.mapLabel}>WORLD / {SENTINEL_SOURCE.label.toUpperCase()}</Text>
              <Text style={styles.mapTitle} numberOfLines={1}>{selectedTitle}</Text>
            </View>
            <View style={styles.sentinelBadge}>
              <Text style={styles.sentinelBadgeText}>{SENTINEL_SOURCE.shortLabel}</Text>
            </View>
            <Text style={styles.zoomReadout}>Z{zoom.toFixed(1)}</Text>
          </View>

          <View style={styles.zoomControls}>
            <Pressable onPress={() => changeZoom(0.5)} style={styles.zoomButton}>
              <Text style={styles.zoomButtonText}>+</Text>
            </Pressable>
            <Pressable onPress={() => changeZoom(-0.5)} style={styles.zoomButton}>
              <Text style={styles.zoomButtonText}>-</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Charger Sentinel-2 sur la vue visible"
              onPress={toggleSentinelViewport}
              style={[styles.sentinelLayerButton, isSentinelViewportActive && styles.sentinelLayerButtonActive]}
            >
              <Text
                style={[
                  styles.sentinelLayerButtonText,
                  isSentinelViewportActive && styles.sentinelLayerButtonTextActive,
                ]}
              >
                S2
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Afficher la carte en vue 2D"
              onPress={() => setIsFlatMapMode(true)}
              style={[styles.map2DButton, isFlatMapMode && styles.map2DButtonActive]}
            >
              <Text style={[styles.map2DButtonText, isFlatMapMode && styles.map2DButtonTextActive]}>2D</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Afficher les zones Sentinel chargeables"
              onPress={toggleAvailabilityLayer}
              style={[styles.availabilityButton, showAvailability && styles.availabilityButtonActive]}
            >
              <Text style={[styles.availabilityButtonText, showAvailability && styles.availabilityButtonTextActive]}>
                Z
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Afficher les transports live reels"
              onPress={() => setShowLiveTraffic((currentValue) => !currentValue)}
              style={[styles.liveTrafficButton, showLiveTraffic && styles.liveTrafficButtonActive]}
            >
              <Text style={[styles.liveTrafficButtonText, showLiveTraffic && styles.liveTrafficButtonTextActive]}>
                LIVE
              </Text>
            </Pressable>
            <Pressable onPress={() => focusLocation({ lat: 24, lon: 5 }, INITIAL_ZOOM)} style={styles.recenterButton}>
              <Text style={styles.recenterText}>◎</Text>
            </Pressable>
          </View>

          <View style={[styles.mapViewport, mapInteractionStyle]} {...webMapHoverProps} {...webWheelProps} {...mapInputHandlers}>
            <View style={styles.tileLayer}>
              {visibleTiles.map((tile) => (
                <View
                  key={tile.key}
                  pointerEvents="none"
                  style={[styles.mapTile, { height: tile.size, left: tile.left, top: tile.top, width: tile.size }]}
                >
                  <Image resizeMode="stretch" source={{ uri: tile.url }} style={styles.mapTileImage} />
                </View>
              ))}

              {sentinelTiles.length > 0
                ? sentinelTiles.map(({ scene, tile }) => (
                    <View
                      key={`${scene.id}-${tile.key}`}
                      pointerEvents="none"
                      style={[
                        styles.mapTile,
                        styles.sentinelTile,
                        styles.sentinelTileBoundary,
                        { height: tile.size, left: tile.left, top: tile.top, width: tile.size },
                      ]}
                    >
                      <Image
                        onLoadEnd={registerSentinelTileDone}
                        resizeMode="stretch"
                        source={{ uri: sentinelTileUrl(scene, tile) }}
                        style={styles.mapTileImage}
                      />
                    </View>
                  ))
                : null}

              {showAvailability ? (
                <View pointerEvents="none" style={styles.availabilityLayer}>
                  <View style={styles.availabilityNoInfoOverlay} />
                  {availabilityRects.map((rect) => (
                    <View
                      key={rect.key}
                      style={[
                        styles.availabilityZone,
                        {
                          height: rect.height,
                          left: rect.left,
                          top: rect.top,
                          width: rect.width,
                        },
                      ]}
                    />
                  ))}
                </View>
              ) : null}

              <View pointerEvents="none" style={styles.scanlineOverlay} />
              <View pointerEvents="none" style={styles.vignetteOverlay} />

              {selectedBbox && (isLoadingSentinel || isLoadingSentinelTiles) ? (
                <View pointerEvents="none" style={styles.loadingMapOverlay}>
                  <View style={styles.loadingMapLine} />
                  <View style={styles.loadingMapGlow} />
                </View>
              ) : null}

              {satelliteScreenPositions.map((satellite) => (
                <View
                  key={satellite.key}
                  pointerEvents="none"
                  style={[styles.satelliteLiveMarker, { left: satellite.left, top: satellite.top }]}
                >
                  <View style={styles.satelliteLiveDiamond} />
                  <Text style={styles.satelliteLiveLabel}>
                    {satellite.label} · {Math.round(satellite.altitudeKm)} km
                  </Text>
                </View>
              ))}

              {showLiveTraffic
                ? aircraftScreenPositions.map((aircraft) => (
                    <Pressable
                      key={aircraft.id}
                      hitSlop={10}
                      onPress={() => selectAircraft(aircraft)}
                      style={[
                        styles.aircraftMarker,
                        (selectedAircraftId === aircraft.id || followedAircraftId === aircraft.id) &&
                          styles.aircraftMarkerSelected,
                        { left: aircraft.left, top: aircraft.top },
                      ]}
                    >
                      <Text
                        style={[
                          styles.aircraftGlyph,
                          (selectedAircraftId === aircraft.id || followedAircraftId === aircraft.id) &&
                            styles.aircraftGlyphSelected,
                          aircraft.heading === null ? undefined : { transform: [{ rotate: `${aircraft.heading}deg` }] },
                        ]}
                      >
                        ▲
                      </Text>
                      <Text style={styles.aircraftLabel}>
                        {aircraft.callsign} · {aircraft.speedKmh} km/h
                      </Text>
                    </Pressable>
                  ))
                : null}

              {selectionRect ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.selectionBox,
                    {
                      height: selectionRect.height,
                      left: selectionRect.left,
                      top: selectionRect.top,
                      width: selectionRect.width,
                    },
                  ]}
                />
              ) : null}
            </View>
          </View>

          <View style={styles.mapChromeBottom}>
            <Text style={styles.coordinateText}>
              {formatCoordinate(center.lat, 'N', 'S')} / {formatCoordinate(center.lon, 'E', 'W')}
            </Text>
            <Text style={styles.selectedImageText} numberOfLines={1}>
              {selectedScene
                ? `${SENTINEL_SOURCE.label} / image du ${selectedScene.date}${
                    selectedScene.cloudCover > 0 ? ` / nuages ${Math.round(selectedScene.cloudCover)}%` : ''
                  }`
                : `Clique une image ${SENTINEL_SOURCE.shortLabel} pour voir sa date`}
            </Text>
            <Pressable onPress={() => Linking.openURL('https://carto.com/attributions')}>
              <Text style={styles.attributionText}>© OpenStreetMap · © CARTO</Text>
            </Pressable>
          </View>

          {showAvailability ? (
            <View style={styles.availabilityPanel}>
              <View style={styles.availabilityPanelHeader}>
                <Text style={styles.availabilityTitle}>Zones {SENTINEL_SOURCE.shortLabel}</Text>
                <Text style={styles.availabilityMeta}>
                  {isLoadingAvailability
                    ? 'verification...'
                    : availabilityError || `${availabilityRects.length} zone(s) chargeable(s)`}
                </Text>
              </View>
              {isLoadingAvailability ? (
                <View style={styles.availabilityProgressShell}>
                  <View style={styles.availabilityProgressFill} />
                </View>
              ) : null}
              <View style={styles.availabilityLegend}>
                <View style={styles.availabilityLegendRow}>
                  <View style={styles.availabilitySwatchAvailable} />
                  <Text style={styles.availabilityLegendText}>chargeable</Text>
                </View>
                <View style={styles.availabilityLegendRow}>
                  <View style={styles.availabilitySwatchNoInfo} />
                  <Text style={styles.availabilityLegendText}>aucune info</Text>
                </View>
              </View>
            </View>
          ) : null}

          <View
            style={[
              styles.orbitPanel,
              showAvailability && styles.orbitPanelStacked,
              showLiveTraffic && styles.orbitPanelStackedWithLive,
              isOrbitCollapsed && styles.orbitPanelCollapsed,
            ]}
          >
            <View style={styles.orbitPanelHeader}>
              <View style={styles.orbitLiveDot} />
              <Text style={styles.orbitTitle}>Sentinel-2 live</Text>
              <Pressable onPress={() => setIsOrbitCollapsed((currentValue) => !currentValue)} style={styles.panelFoldButton}>
                <Text style={styles.panelFoldText}>{isOrbitCollapsed ? '+' : '-'}</Text>
              </Pressable>
            </View>
            {isOrbitCollapsed ? null : (
              <Text style={styles.orbitMeta}>
                {isLoadingOrbit
                  ? 'orbites en cours...'
                  : satellitePositions.length > 0
                    ? satellitePositions
                        .map((satellite) => `${satellite.label} ${satellite.lat.toFixed(1)} / ${satellite.lon.toFixed(1)}`)
                        .join(' · ')
                    : 'position indisponible'}
              </Text>
            )}
          </View>

          {showLiveTraffic ? (
            <View style={styles.liveTrafficPanel}>
              <View style={styles.liveTrafficHeader}>
                <View style={styles.liveTrafficDot} />
                <Text style={styles.liveTrafficTitle}>Transports live</Text>
                <Text style={styles.liveTrafficMeta}>
                  {isLoadingLiveTraffic
                    ? 'refresh...'
                    : liveTrafficUpdatedAt
                      ? new Date(liveTrafficUpdatedAt).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : 'en attente'}
                </Text>
              </View>
              <View style={styles.liveTrafficGrid}>
                <View style={styles.liveTrafficCardActive}>
                  <Text style={styles.liveTrafficCardLabel}>Avions</Text>
                  <Text style={styles.liveTrafficCardValue}>{liveAircraft.length}</Text>
                  <Text style={styles.liveTrafficCardSource}>OpenSky · {aircraftScreenPositions.length} vus</Text>
                </View>
                <View style={styles.liveTrafficCard}>
                  <Text style={styles.liveTrafficCardLabel}>Bateaux</Text>
                  <Text style={styles.liveTrafficCardUnavailable}>AIS non connecte</Text>
                </View>
                <View style={styles.liveTrafficCard}>
                  <Text style={styles.liveTrafficCardLabel}>Trains</Text>
                  <Text style={styles.liveTrafficCardUnavailable}>GTFS local requis</Text>
                </View>
                <View style={styles.liveTrafficCard}>
                  <Text style={styles.liveTrafficCardLabel}>Metro</Text>
                  <Text style={styles.liveTrafficCardUnavailable}>GTFS local requis</Text>
                </View>
              </View>
              <Text style={styles.liveTrafficNote} numberOfLines={2}>
                {liveTrafficError ||
                  'Seuls les points venant de flux reels sont affiches. Aucun bateau/train/metro invente.'}
              </Text>
            </View>
          ) : null}

          {selectedAircraft ? (
            <View style={styles.objectPanel} {...overlayHoverProps}>
              <View style={styles.objectPanelHeader}>
                <View style={styles.liveTrafficDot} />
                <Text style={styles.objectPanelKicker}>Objet live reel</Text>
                <Pressable
                  onPress={() => {
                    cancelCameraAnimation();
                    setSelectedAircraftId('');
                    setSelectedAircraftSnapshot(null);
                    setFollowedAircraftId('');
                  }}
                  style={styles.objectPanelClose}
                >
                  <Text style={styles.objectPanelCloseText}>X</Text>
                </Pressable>
              </View>
              <Text style={styles.objectPanelTitle} numberOfLines={1}>
                {selectedAircraft.callsign}
              </Text>
              <Text style={styles.objectPanelSubtitle} numberOfLines={1}>
                Avion · OpenSky · {selectedAircraft.originCountry}
              </Text>
              <View style={styles.objectInfoGrid}>
                <View style={styles.objectInfoCell}>
                  <Text style={styles.objectInfoLabel}>ICAO</Text>
                  <Text style={styles.objectInfoValue}>{selectedAircraft.id.toUpperCase()}</Text>
                </View>
                <View style={styles.objectInfoCell}>
                  <Text style={styles.objectInfoLabel}>Position</Text>
                  <Text style={styles.objectInfoValue}>
                    {selectedAircraft.lat.toFixed(4)} / {selectedAircraft.lon.toFixed(4)}
                  </Text>
                </View>
                <View style={styles.objectInfoCell}>
                  <Text style={styles.objectInfoLabel}>Altitude</Text>
                  <Text style={styles.objectInfoValue}>
                    {selectedAircraft.altitudeM === null ? 'sol' : `${Math.round(selectedAircraft.altitudeM)} m`}
                  </Text>
                </View>
                <View style={styles.objectInfoCell}>
                  <Text style={styles.objectInfoLabel}>Vitesse</Text>
                  <Text style={styles.objectInfoValue}>{selectedAircraft.speedKmh} km/h</Text>
                </View>
                <View style={styles.objectInfoCell}>
                  <Text style={styles.objectInfoLabel}>Cap</Text>
                  <Text style={styles.objectInfoValue}>
                    {selectedAircraft.heading === null ? 'inconnu' : `${Math.round(selectedAircraft.heading)}°`}
                  </Text>
                </View>
                <View style={styles.objectInfoCell}>
                  <Text style={styles.objectInfoLabel}>Vertical</Text>
                  <Text style={styles.objectInfoValue}>
                    {selectedAircraft.verticalRate === null
                      ? 'inconnu'
                      : `${selectedAircraft.verticalRate.toFixed(1)} m/s`}
                  </Text>
                </View>
              </View>
              <Text style={styles.objectPanelTimestamp}>
                Dernier signal: {formatLiveTimestamp(selectedAircraft.lastContact)}
              </Text>
              <Pressable onPress={() => followAircraft(selectedAircraft)} style={styles.objectFollowButton}>
                <Text style={styles.objectFollowButtonText}>
                  {followedAircraftId === selectedAircraft.id ? 'CAMERA SUIVI ACTIF' : 'CAMERA DEDANS'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View
            style={[styles.opsPanel, isOpsPanelCollapsed ? styles.opsPanelCollapsed : styles.opsPanelExpanded]}
            {...overlayHoverProps}
          >
            <View style={styles.opsPanelHeader}>
              <View style={styles.alertDot} />
              <Text style={styles.opsTitle}>{isOpsPanelCollapsed ? 'MAIL' : 'Alertes / rapport'}</Text>
              <Pressable
                onPress={() => setIsOpsPanelCollapsed((currentValue) => !currentValue)}
                style={styles.panelFoldButton}
              >
                <Text style={styles.panelFoldText}>{isOpsPanelCollapsed ? '+' : '-'}</Text>
              </Pressable>
            </View>

            {isOpsPanelCollapsed ? null : (
              <ScrollView style={styles.opsPanelBody} contentContainerStyle={styles.opsPanelBodyContent}>
                <TextInput
                  value={alertEmail}
                  onChangeText={setAlertEmail}
                  placeholder="mail@exemple.com"
                  placeholderTextColor="#647083"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.alertInput}
                />
                <View style={styles.opsActionGrid}>
                  <Pressable
                    onPress={activateMailAlert}
                    style={styles.opsButton}
                  >
                    <Text style={styles.opsButtonText}>ALERTE</Text>
                  </Pressable>
                  <Pressable
                    disabled={!alertConfig || isCheckingAlert}
                    onPress={() => void checkMailAlert(false)}
                    style={[styles.opsButton, (!alertConfig || isCheckingAlert) && styles.opsButtonDisabled]}
                  >
                    <Text style={styles.opsButtonText}>{isCheckingAlert ? '...' : 'CHECK'}</Text>
                  </Pressable>
                  <Pressable
                    disabled={comparisonTimeline.length < 2}
                    onPress={() => setShowComparison((currentValue) => !currentValue)}
                    style={[styles.opsButton, comparisonTimeline.length < 2 && styles.opsButtonDisabled]}
                  >
                    <Text style={styles.opsButtonText}>COMPARE</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowWeather((currentValue) => !currentValue)}
                    style={styles.opsButton}
                  >
                    <Text style={styles.opsButtonText}>METEO</Text>
                  </Pressable>
                  <Pressable
                    disabled={comparisonMetrics.length === 0}
                    onPress={openReportPdf}
                    style={[styles.opsButton, comparisonMetrics.length === 0 && styles.opsButtonDisabled]}
                  >
                    <Text style={styles.opsButtonText}>PDF</Text>
                  </Pressable>
                  <Pressable
                    disabled={comparisonMetrics.length === 0 || isPreparingReport}
                    onPress={() => void mailReport()}
                    style={[
                      styles.opsButton,
                      (comparisonMetrics.length === 0 || isPreparingReport) && styles.opsButtonDisabled,
                    ]}
                  >
                    <Text style={styles.opsButtonText}>{isPreparingReport ? '...' : 'MAIL'}</Text>
                  </Pressable>
                </View>
                <Text style={styles.alertStatus} numberOfLines={2}>
                  {alertStatus}
                </Text>

                {showWeather ? (
                  <View style={styles.weatherPanel}>
                    <View style={styles.weatherHeader}>
                      <View>
                        <Text style={styles.weatherTitle}>Meteo zone</Text>
                        <Text style={styles.weatherMeta} numberOfLines={1}>
                          {`${formatBboxLabel(activeAnalysisBbox)} · ${Math.round(activeAnalysisAreaKm2)} km2`}
                        </Text>
                      </View>
                      <Text style={styles.weatherSource}>Open-Meteo</Text>
                    </View>

                    {isLoadingWeather ? (
                      <View style={styles.weatherLoadingShell}>
                        <View style={styles.weatherLoadingFill} />
                      </View>
                    ) : null}

                    {weatherSnapshot ? (
                      <>
                        <View style={styles.weatherNowRow}>
                          <View>
                            <Text style={styles.weatherTemperature}>
                              {Math.round(weatherSnapshot.current.temperature)}°C
                            </Text>
                            <Text style={styles.weatherCondition}>
                              {weatherCodeLabel(weatherSnapshot.current.weatherCode)}
                            </Text>
                          </View>
                          <View style={styles.weatherNowMeta}>
                            <Text style={styles.weatherNowMetaText}>
                              {formatHourLabel(weatherSnapshot.current.time)}
                            </Text>
                            <Text style={styles.weatherNowMetaText}>
                              {weatherSnapshot.location.lat.toFixed(3)} / {weatherSnapshot.location.lon.toFixed(3)}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.weatherChartTitle}>Temperature 24h</Text>
                        <View style={styles.weatherChart}>
                          {weatherChartHours.map((hour) => {
                            const height =
                              12 + ((hour.temperature - weatherTemperatureMin) / weatherTemperatureRange) * 58;

                            return (
                              <View key={hour.time} style={styles.weatherChartColumn}>
                                <Text style={styles.weatherChartValue}>{Math.round(hour.temperature)}°</Text>
                                <View
                                  style={[
                                    styles.weatherTempBar,
                                    {
                                      backgroundColor: temperatureColor(hour.temperature),
                                      height: clamp(height, 12, 70),
                                    },
                                  ]}
                                />
                                <Text style={styles.weatherChartLabel}>{formatHourLabel(hour.time).slice(0, 2)}h</Text>
                              </View>
                            );
                          })}
                        </View>

                        <View style={styles.weatherInfoGrid}>
                          {weatherInfoCards.map((item) => (
                            <View key={item.label} style={styles.weatherInfoCard}>
                              <Text style={styles.weatherInfoLabel}>{item.label}</Text>
                              <Text style={styles.weatherInfoValue}>{item.value}</Text>
                            </View>
                          ))}
                        </View>

                        <View style={styles.weatherDualCharts}>
                          <View style={styles.weatherMiniChart}>
                            <Text style={styles.weatherChartTitle}>Pluie</Text>
                            {weatherChartHours.slice(0, 8).map((hour) => (
                              <View key={`rain-${hour.time}`} style={styles.weatherMiniRow}>
                                <Text style={styles.weatherMiniLabel}>{formatHourLabel(hour.time).slice(0, 2)}h</Text>
                                <View style={styles.weatherMiniTrack}>
                                  <View
                                    style={[
                                      styles.weatherRainBar,
                                      { width: `${clamp((hour.precipitation / weatherMaxRain) * 100, 4, 100)}%` },
                                    ]}
                                  />
                                </View>
                                <Text style={styles.weatherMiniValue}>{hour.precipitation.toFixed(1)}</Text>
                              </View>
                            ))}
                          </View>
                          <View style={styles.weatherMiniChart}>
                            <Text style={styles.weatherChartTitle}>Vent</Text>
                            {weatherChartHours.slice(0, 8).map((hour) => (
                              <View key={`wind-${hour.time}`} style={styles.weatherMiniRow}>
                                <Text style={styles.weatherMiniLabel}>{formatHourLabel(hour.time).slice(0, 2)}h</Text>
                                <View style={styles.weatherMiniTrack}>
                                  <View
                                    style={[
                                      styles.weatherWindBar,
                                      { width: `${clamp((hour.windSpeed / weatherMaxWind) * 100, 4, 100)}%` },
                                    ]}
                                  />
                                </View>
                                <Text style={styles.weatherMiniValue}>{Math.round(hour.windSpeed)}</Text>
                              </View>
                            ))}
                          </View>
                        </View>

                        <Text style={styles.weatherChartTitle}>7 jours</Text>
                        <View style={styles.weatherDailyRow}>
                          {weatherSnapshot.daily.map((day) => (
                            <View key={day.date} style={styles.weatherDailyCard}>
                              <Text style={styles.weatherDailyDate}>{day.date.slice(5)}</Text>
                              <Text style={styles.weatherDailyCode}>{weatherCodeLabel(day.weatherCode)}</Text>
                              <Text style={styles.weatherDailyTemp}>
                                {Math.round(day.minTemperature)} / {Math.round(day.maxTemperature)}°
                              </Text>
                              <Text style={styles.weatherDailyMeta}>
                                {day.precipitation.toFixed(1)} mm · {Math.round(day.windMax)} km/h
                              </Text>
                            </View>
                          ))}
                        </View>
                      </>
                    ) : (
                      <Text style={styles.weatherError}>{weatherError || 'La meteo de la vue actuelle va se charger.'}</Text>
                    )}
                  </View>
                ) : null}

                {showComparison && comparisonMetrics.length > 0 ? (
                  <View style={styles.comparisonPanel}>
                    <Text style={styles.comparisonSource}>Donnees reelles Sentinel-2</Text>
                    {comparisonMetrics.map((metric) => {
                      const delta = metric.current - metric.previous;
                      const currentWidth =
                        metric.key === 'imageCount' ? clamp(metric.current * 12, 0, 100) : clamp(metric.current, 0, 100);
                      const previousWidth =
                        metric.key === 'imageCount'
                          ? clamp(metric.previous * 12, 0, 100)
                          : clamp(metric.previous, 0, 100);

                      return (
                        <View key={metric.key} style={styles.metricRow}>
                          <View style={styles.metricHeader}>
                            <Text style={styles.metricLabel}>{metric.label}</Text>
                            <Text style={[styles.metricDelta, delta >= 0 ? styles.metricDeltaUp : styles.metricDeltaDown]}>
                              {delta >= 0 ? '+' : ''}
                              {delta}
                              {metric.unit}
                            </Text>
                          </View>
                          <View style={styles.metricTrack}>
                            <View style={[styles.metricBarPrevious, { width: `${previousWidth}%` }]} />
                            <View
                              style={[
                                styles.metricBarCurrent,
                                { backgroundColor: metric.color, width: `${currentWidth}%` },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    })}
                    <Text style={styles.timelineTitle}>Nuages moyens par date</Text>
                    <View style={styles.timelineRow}>
                      {comparisonTimeline.map((point) => (
                        <View key={point.date} style={styles.timelineColumn}>
                          <View
                            style={[styles.timelineBar, { height: `${clamp(point.averageCloudCover, 12, 100)}%` }]}
                          />
                          <Text style={styles.timelineLabel}>{point.date.slice(5)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </ScrollView>
            )}
          </View>

          {selectedBbox ? (
            <View
              style={[
                styles.sentinelPanel,
                isSentinelPanelDocked ? styles.sentinelPanelDocked : styles.sentinelPanelExpanded,
              ]}
              {...sentinelPanelFocusProps}
            >
              <View style={styles.sentinelPanelHeader}>
                <View style={styles.liveDot} />
                <Text style={styles.sentinelTitle} numberOfLines={1}>
                  {isSentinelPanelDocked ? SENTINEL_SOURCE.shortLabel : SENTINEL_SOURCE.label}
                </Text>
                {isSentinelPanelDocked ? null : (
                  <Text style={styles.sentinelMeta}>
                    {isLoadingSentinel
                      ? 'chargement des images recentes...'
                      : isLoadingSentinelTiles
                        ? `affichage des images ${loadingProgress}%...`
                      : displayedImageCount > 0
                        ? `mosaïque ${visibleSceneDates.length} date(s) / ${displayedImageCount} image(s)`
                        : sentinelError || 'vue Sentinel-2 active'}
                  </Text>
                )}
                <Pressable
                  onPress={() => setIsSentinelPanelDocked((currentValue) => !currentValue)}
                  style={styles.sentinelDockButton}
                >
                  <Text style={styles.sentinelDockText}>{isSentinelPanelDocked ? '‹' : '›'}</Text>
                </Pressable>
                <Pressable onPress={clearSentinelLayer} style={styles.sentinelCloseButton}>
                  <Text style={styles.sentinelCloseText}>X</Text>
                </Pressable>
              </View>

              {isSentinelPanelDocked ? null : isLoadingSentinel || isLoadingSentinelTiles ? (
                <View style={styles.loadingBarShell}>
                  <View style={[styles.loadingBarFill, { width: `${loadingProgress}%` }]} />
                </View>
              ) : null}

              {!isSentinelPanelDocked && sentinelScenes.length > 0 ? (
                <>
                  <View style={styles.calendarPanel}>
                    <View style={styles.calendarSummaryRow}>
                      <View style={styles.calendarSummaryTextBlock}>
                        <Text style={styles.calendarSummaryTitle}>Calendrier</Text>
                        <Text style={styles.calendarSummaryMeta}>
                          {activeDate ? `date active ${activeDate}` : 'aucune date chargee'}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setIsCalendarCollapsed((currentValue) => !currentValue)}
                        style={styles.panelFoldButton}
                      >
                        <Text style={styles.panelFoldText}>{isCalendarCollapsed ? '+' : '-'}</Text>
                      </Pressable>
                    </View>

                    {isCalendarCollapsed ? null : (
                      <>
                        <View style={styles.calendarHeader}>
                          <Pressable
                            disabled={!canGoToPreviousMonth}
                            onPress={() => setCalendarMonth((month) => shiftMonth(month, -1))}
                            style={[
                              styles.calendarNavButton,
                              !canGoToPreviousMonth && styles.calendarNavButtonDisabled,
                            ]}
                          >
                            <Text
                              style={[
                                styles.calendarNavText,
                                !canGoToPreviousMonth && styles.calendarNavTextDisabled,
                              ]}
                            >
                              ‹
                            </Text>
                          </Pressable>
                          <Text style={styles.calendarTitle}>{monthLabel(calendarMonth)}</Text>
                          <Pressable
                            disabled={!canGoToNextMonth}
                            onPress={() => setCalendarMonth((month) => shiftMonth(month, 1))}
                            style={[
                              styles.calendarNavButton,
                              !canGoToNextMonth && styles.calendarNavButtonDisabled,
                            ]}
                          >
                            <Text
                              style={[styles.calendarNavText, !canGoToNextMonth && styles.calendarNavTextDisabled]}
                            >
                              ›
                            </Text>
                          </Pressable>
                        </View>
                        <View style={styles.calendarWeekRow}>
                          {CALENDAR_WEEKDAYS.map((dayLabel, index) => (
                            <Text key={`${dayLabel}-${index}`} style={styles.calendarWeekday}>
                              {dayLabel}
                            </Text>
                          ))}
                        </View>
                        <View style={styles.calendarGrid}>
                          {calendarDays.map((day) => {
                            const hasImage = scenesByDate.has(day.date);
                            const isActiveDate = activeDate === day.date;

                            return (
                              <Pressable
                                key={day.date}
                                disabled={!hasImage}
                                onPress={() => selectSceneDate(day.date)}
                                style={[
                                  styles.calendarDay,
                                  !day.inMonth && styles.calendarDayOutside,
                                  hasImage && styles.calendarDayAvailable,
                                  isActiveDate && styles.calendarDayActive,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.calendarDayText,
                                    !day.inMonth && styles.calendarDayTextOutside,
                                    hasImage && styles.calendarDayTextAvailable,
                                    isActiveDate && styles.calendarDayTextActive,
                                  ]}
                                >
                                  {day.dayNumber}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </>
                    )}
                  </View>

                  {isCalendarCollapsed ? null : (
                    <View style={styles.dateStrip}>
                      {sentinelScenes.slice(0, 6).map((scene) => {
                        const isActive = scene.id === activeSceneId;

                        return (
                          <Pressable
                            key={scene.id}
                            onPress={() => selectSceneDate(scene.date)}
                            style={[styles.dateButton, isActive && styles.dateButtonActive]}
                          >
                            <Text style={[styles.dateButtonText, isActive && styles.dateButtonTextActive]}>
                              {scene.date}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05070a',
    padding: 18,
    gap: 16,
  },
  header: {
    minHeight: 76,
    alignItems: 'center',
    borderColor: '#19202b',
    borderWidth: 1,
    backgroundColor: '#0a0f16',
    flexDirection: 'row',
    gap: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  headerCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  brandBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minWidth: 170,
  },
  logoMark: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 42,
  },
  logoLetter: {
    color: '#05070a',
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 29,
  },
  logoSlash: {
    backgroundColor: '#05070a',
    height: 2,
    position: 'absolute',
    transform: [{ rotate: '-45deg' }],
    width: 58,
  },
  brandTextBlock: {
    minWidth: 0,
  },
  eyebrow: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  title: {
    color: '#eef4ff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 3,
  },
  searchShell: {
    alignItems: 'center',
    backgroundColor: '#070b11',
    borderColor: '#273141',
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    height: 48,
    maxWidth: 720,
    paddingLeft: 14,
  },
  searchShellCompact: {
    maxWidth: '100%',
    width: '100%',
  },
  searchIcon: {
    color: '#90a4bb',
    fontSize: 22,
    lineHeight: 24,
    marginRight: 10,
  },
  searchInput: {
    color: '#edf5ff',
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  searchButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#17212d',
    borderLeftColor: '#273141',
    borderLeftWidth: 1,
    justifyContent: 'center',
    minWidth: 56,
    paddingHorizontal: 16,
  },
  searchButtonText: {
    color: '#33d69f',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  headerStats: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 128,
  },
  liveDot: {
    backgroundColor: '#33d69f',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  headerStatText: {
    color: '#edf5ff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  headerStatMuted: {
    color: '#7a8798',
    fontSize: 12,
    marginLeft: 4,
  },
  workspace: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
    minHeight: 0,
  },
  workspaceCompact: {
    flexDirection: 'column',
  },
  sidePanel: {
    backgroundColor: '#090d13',
    borderColor: '#19202b',
    borderWidth: 1,
    padding: 14,
    width: 320,
  },
  sidePanelCompact: {
    width: '100%',
  },
  panelLabel: {
    color: '#7f8fa5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  resultList: {
    gap: 8,
  },
  resultRow: {
    alignItems: 'center',
    backgroundColor: '#0d131b',
    borderColor: '#1c2633',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 11,
  },
  resultRowSelected: {
    backgroundColor: '#111b25',
    borderColor: '#33d69f',
  },
  statusPip: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  resultTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  resultName: {
    color: '#edf5ff',
    fontSize: 14,
    fontWeight: '700',
  },
  resultMeta: {
    color: '#77869a',
    fontSize: 12,
    marginTop: 3,
  },
  signalText: {
    color: '#9fb0c5',
    fontSize: 13,
    fontWeight: '800',
  },
  searchError: {
    color: '#f9735b',
    fontSize: 12,
    marginTop: 10,
  },
  divider: {
    backgroundColor: '#1b2430',
    height: 1,
    marginVertical: 16,
  },
  assetPanel: {
    backgroundColor: '#0d131b',
    borderColor: '#1c2633',
    borderWidth: 1,
    padding: 14,
  },
  assetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  assetTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  assetName: {
    color: '#edf5ff',
    fontSize: 17,
    fontWeight: '800',
  },
  assetMeta: {
    color: '#8191a5',
    fontSize: 12,
    marginTop: 4,
  },
  assetBadge: {
    borderColor: '#33d69f',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  assetBadgeText: {
    color: '#33d69f',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  signalBarShell: {
    backgroundColor: '#151d28',
    height: 8,
    marginTop: 18,
    overflow: 'hidden',
  },
  signalBarFill: {
    backgroundColor: '#33d69f',
    height: '100%',
  },
  assetNote: {
    color: '#8d9db1',
    fontSize: 12,
    marginTop: 10,
  },
  mapPanel: {
    backgroundColor: '#9db7c4',
    borderColor: '#1b2430',
    borderWidth: 1,
    flex: 1,
    minHeight: 420,
    overflow: 'hidden',
  },
  mapChromeTop: {
    alignItems: 'center',
    backgroundColor: 'rgba(6, 10, 15, 0.9)',
    borderBottomColor: '#1b2430',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 18,
    paddingVertical: 13,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 5,
  },
  mapTitleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 16,
  },
  mapLabel: {
    color: '#77869a',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  mapTitle: {
    color: '#edf5ff',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 3,
  },
  sentinelBadge: {
    alignItems: 'center',
    backgroundColor: '#101720',
    borderColor: '#5ecbff',
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    marginRight: 14,
    minWidth: 42,
    paddingHorizontal: 8,
  },
  sentinelBadgeText: {
    color: '#80d9ff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  zoomReadout: {
    color: '#33d69f',
    fontSize: 16,
    fontWeight: '900',
  },
  zoomControls: {
    gap: 8,
    position: 'absolute',
    right: 16,
    top: 92,
    zIndex: 6,
  },
  zoomButton: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  zoomButtonText: {
    color: '#edf5ff',
    fontSize: 26,
    fontWeight: '500',
    lineHeight: 30,
  },
  recenterButton: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  recenterText: {
    color: '#f7c948',
    fontSize: 23,
    lineHeight: 26,
  },
  sentinelLayerButton: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sentinelLayerButtonActive: {
    backgroundColor: '#102437',
    borderColor: '#5ecbff',
  },
  sentinelLayerButtonText: {
    color: '#edf5ff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sentinelLayerButtonTextActive: {
    color: '#80d9ff',
  },
  map2DButton: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  map2DButtonActive: {
    backgroundColor: '#102017',
    borderColor: '#33d69f',
  },
  map2DButtonText: {
    color: '#edf5ff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  map2DButtonTextActive: {
    color: '#33d69f',
  },
  selectAreaButton: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  selectAreaButtonActive: {
    backgroundColor: '#1b2a25',
    borderColor: '#33d69f',
  },
  selectAreaText: {
    color: '#edf5ff',
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 24,
  },
  selectAreaTextActive: {
    color: '#33d69f',
  },
  availabilityButton: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  availabilityButtonActive: {
    backgroundColor: '#102437',
    borderColor: '#5ecbff',
  },
  availabilityButtonText: {
    color: '#edf5ff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  availabilityButtonTextActive: {
    color: '#80d9ff',
  },
  liveTrafficButton: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  liveTrafficButtonActive: {
    backgroundColor: '#241c0b',
    borderColor: '#f7c948',
  },
  liveTrafficButtonText: {
    color: '#edf5ff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0,
  },
  liveTrafficButtonTextActive: {
    color: '#f7c948',
  },
  mapViewport: {
    flex: 1,
  },
  tileLayer: {
    backgroundColor: '#9db7c4',
    flex: 1,
    overflow: 'hidden',
  },
  mapTile: {
    overflow: 'hidden',
    position: 'absolute',
  },
  mapTileImage: {
    height: '100%',
    width: '100%',
  },
  sentinelTile: {
    backgroundColor: 'transparent',
    opacity: 0.96,
  },
  sentinelTileBoundary: {
    borderColor: 'rgba(39, 166, 255, 0.85)',
    borderWidth: 1,
  },
  availabilityLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  availabilityNoInfoOverlay: {
    backgroundColor: 'rgba(3, 7, 12, 0.32)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  availabilityZone: {
    backgroundColor: 'rgba(94, 203, 255, 0.28)',
    borderColor: 'rgba(128, 217, 255, 0.92)',
    borderWidth: 1,
    position: 'absolute',
  },
  scanlineOverlay: {
    backgroundColor: 'rgba(5, 8, 10, 0.02)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  vignetteOverlay: {
    borderColor: 'rgba(51, 214, 159, 0.08)',
    borderWidth: 1,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  loadingMapOverlay: {
    bottom: 48,
    left: 0,
    opacity: 0.78,
    position: 'absolute',
    right: 0,
    top: 68,
  },
  loadingMapLine: {
    backgroundColor: 'rgba(94, 203, 255, 0.35)',
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    top: '48%',
  },
  loadingMapGlow: {
    backgroundColor: 'rgba(94, 203, 255, 0.08)',
    bottom: '44%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: '44%',
  },
  satelliteLiveMarker: {
    alignItems: 'center',
    marginLeft: -12,
    marginTop: -12,
    position: 'absolute',
    zIndex: 5,
  },
  satelliteLiveDiamond: {
    backgroundColor: '#ffffff',
    borderColor: '#05070a',
    borderWidth: 2,
    height: 13,
    transform: [{ rotate: '45deg' }],
    width: 13,
  },
  satelliteLiveLabel: {
    backgroundColor: 'rgba(6, 10, 15, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.36)',
    borderWidth: 1,
    color: '#edf5ff',
    fontSize: 10,
    fontWeight: '900',
    marginTop: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  aircraftMarker: {
    alignItems: 'center',
    marginLeft: -12,
    marginTop: -12,
    position: 'absolute',
    zIndex: 6,
  },
  aircraftMarkerSelected: {
    zIndex: 8,
  },
  aircraftGlyph: {
    color: '#f7c948',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 18,
    textShadowColor: '#05070a',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 2,
  },
  aircraftGlyphSelected: {
    color: '#ffffff',
    textShadowColor: '#f7c948',
    textShadowRadius: 7,
  },
  aircraftLabel: {
    backgroundColor: 'rgba(6, 10, 15, 0.88)',
    borderColor: 'rgba(247, 201, 72, 0.55)',
    borderWidth: 1,
    color: '#f8fafc',
    fontSize: 9,
    fontWeight: '900',
    marginTop: 5,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  mapMarker: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 8, 10, 0.78)',
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    marginLeft: -10,
    marginTop: -10,
    position: 'absolute',
    width: 20,
  },
  mapMarkerSelected: {
    backgroundColor: 'rgba(5, 8, 10, 0.92)',
    shadowColor: '#33d69f',
    shadowOpacity: 0.42,
    shadowRadius: 12,
  },
  markerCore: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  markerLabel: {
    backgroundColor: 'rgba(5, 8, 10, 0.86)',
    color: '#edf5ff',
    fontSize: 9,
    fontWeight: '900',
    left: 18,
    lineHeight: 12,
    paddingHorizontal: 5,
    paddingVertical: 2,
    position: 'absolute',
    top: -2,
  },
  selectionBox: {
    backgroundColor: 'rgba(51, 214, 159, 0.16)',
    borderColor: '#33d69f',
    borderWidth: 2,
    position: 'absolute',
    zIndex: 4,
  },
  mapChromeBottom: {
    alignItems: 'center',
    backgroundColor: 'rgba(6, 10, 15, 0.9)',
    borderTopColor: '#1b2430',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 18,
    paddingVertical: 10,
    position: 'absolute',
    right: 0,
    zIndex: 5,
  },
  coordinateText: {
    color: '#9babbf',
    flex: 1,
    fontSize: 12,
  },
  selectedImageText: {
    color: '#dbeafe',
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  attributionText: {
    color: '#33d69f',
    fontSize: 12,
  },
  availabilityPanel: {
    backgroundColor: 'rgba(6, 10, 15, 0.9)',
    borderColor: '#273141',
    borderWidth: 1,
    left: 18,
    maxWidth: 360,
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'absolute',
    top: 92,
    zIndex: 7,
  },
  availabilityPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  availabilityTitle: {
    color: '#edf5ff',
    fontSize: 13,
    fontWeight: '900',
  },
  availabilityMeta: {
    color: '#9babbf',
    flex: 1,
    fontSize: 12,
  },
  availabilityProgressShell: {
    backgroundColor: '#151d28',
    height: 5,
    marginTop: 9,
    overflow: 'hidden',
  },
  availabilityProgressFill: {
    backgroundColor: '#5ecbff',
    height: '100%',
    width: '62%',
  },
  availabilityLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 9,
  },
  availabilityLegendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  availabilitySwatchAvailable: {
    backgroundColor: 'rgba(94, 203, 255, 0.36)',
    borderColor: '#80d9ff',
    borderWidth: 1,
    height: 10,
    width: 18,
  },
  availabilitySwatchNoInfo: {
    backgroundColor: 'rgba(3, 7, 12, 0.42)',
    borderColor: '#4a5868',
    borderWidth: 1,
    height: 10,
    width: 18,
  },
  availabilityLegendText: {
    color: '#9babbf',
    fontSize: 11,
    fontWeight: '700',
  },
  orbitPanel: {
    backgroundColor: 'rgba(6, 10, 15, 0.9)',
    borderColor: '#273141',
    borderWidth: 1,
    left: 18,
    maxWidth: 360,
    paddingHorizontal: 12,
    paddingVertical: 9,
    position: 'absolute',
    top: 92,
    zIndex: 7,
  },
  orbitPanelStacked: {
    top: 188,
  },
  orbitPanelStackedWithLive: {
    top: 278,
  },
  orbitPanelCollapsed: {
    maxWidth: 220,
  },
  orbitPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  orbitLiveDot: {
    backgroundColor: '#ffffff',
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  orbitTitle: {
    color: '#edf5ff',
    fontSize: 12,
    fontWeight: '900',
  },
  orbitMeta: {
    color: '#9babbf',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
  },
  liveTrafficPanel: {
    backgroundColor: 'rgba(6, 10, 15, 0.92)',
    borderColor: '#273141',
    borderWidth: 1,
    left: 18,
    maxWidth: 410,
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'absolute',
    top: 188,
    zIndex: 7,
  },
  liveTrafficHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  liveTrafficDot: {
    backgroundColor: '#f7c948',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  liveTrafficTitle: {
    color: '#edf5ff',
    fontSize: 12,
    fontWeight: '900',
  },
  liveTrafficMeta: {
    color: '#9babbf',
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 'auto',
  },
  liveTrafficGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 9,
  },
  liveTrafficCardActive: {
    backgroundColor: '#171807',
    borderColor: '#f7c948',
    borderWidth: 1,
    minWidth: 82,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  liveTrafficCard: {
    backgroundColor: '#101720',
    borderColor: '#253244',
    borderWidth: 1,
    minWidth: 82,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  liveTrafficCardLabel: {
    color: '#9babbf',
    fontSize: 9,
    fontWeight: '900',
  },
  liveTrafficCardValue: {
    color: '#f7c948',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },
  liveTrafficCardSource: {
    color: '#edf5ff',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 1,
  },
  liveTrafficCardUnavailable: {
    color: '#718197',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 6,
  },
  liveTrafficNote: {
    color: '#9babbf',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 8,
  },
  objectPanel: {
    backgroundColor: 'rgba(6, 10, 15, 0.94)',
    borderColor: '#f7c948',
    borderWidth: 1,
    bottom: 62,
    left: 18,
    maxWidth: 390,
    paddingHorizontal: 12,
    paddingVertical: 11,
    position: 'absolute',
    width: 360,
    zIndex: 8,
  },
  objectPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  objectPanelKicker: {
    color: '#f7c948',
    flex: 1,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  objectPanelClose: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  objectPanelCloseText: {
    color: '#edf5ff',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 16,
  },
  objectPanelTitle: {
    color: '#edf5ff',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },
  objectPanelSubtitle: {
    color: '#9babbf',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },
  objectInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  objectInfoCell: {
    backgroundColor: '#101720',
    borderColor: '#253244',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    width: '48.8%',
  },
  objectInfoLabel: {
    color: '#718197',
    fontSize: 9,
    fontWeight: '900',
  },
  objectInfoValue: {
    color: '#edf5ff',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 4,
  },
  objectPanelTimestamp: {
    color: '#9babbf',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 9,
  },
  objectFollowButton: {
    alignItems: 'center',
    backgroundColor: '#171807',
    borderColor: '#f7c948',
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    marginTop: 10,
  },
  objectFollowButtonText: {
    color: '#f7c948',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  panelFoldButton: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    marginLeft: 'auto',
    width: 24,
  },
  panelFoldText: {
    color: '#edf5ff',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  opsPanel: {
    backgroundColor: 'rgba(6, 10, 15, 0.92)',
    borderColor: '#273141',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'absolute',
    right: 70,
    top: 92,
    zIndex: 7,
  },
  opsPanelExpanded: {
    bottom: 56,
    width: 390,
  },
  opsPanelCollapsed: {
    width: 118,
  },
  opsPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  opsPanelBody: {
    marginTop: 10,
  },
  opsPanelBodyContent: {
    paddingBottom: 4,
  },
  alertDot: {
    backgroundColor: '#f7c948',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  opsTitle: {
    color: '#edf5ff',
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
  },
  alertInput: {
    backgroundColor: '#070b11',
    borderColor: '#273141',
    borderWidth: 1,
    color: '#edf5ff',
    fontSize: 13,
    height: 38,
    paddingHorizontal: 10,
  },
  opsActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  opsButton: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    minWidth: 62,
    paddingHorizontal: 9,
  },
  opsButtonDisabled: {
    opacity: 0.35,
  },
  opsButtonText: {
    color: '#80d9ff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  alertStatus: {
    color: '#9babbf',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
  },
  weatherPanel: {
    backgroundColor: 'rgba(17, 25, 35, 0.72)',
    borderColor: '#253244',
    borderWidth: 1,
    marginTop: 10,
    padding: 9,
  },
  weatherHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  weatherTitle: {
    color: '#edf5ff',
    fontSize: 12,
    fontWeight: '900',
  },
  weatherMeta: {
    color: '#9babbf',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    maxWidth: 250,
  },
  weatherSource: {
    borderColor: '#2b394b',
    borderWidth: 1,
    color: '#80d9ff',
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  weatherLoadingShell: {
    backgroundColor: '#151d28',
    height: 5,
    marginTop: 8,
    overflow: 'hidden',
  },
  weatherLoadingFill: {
    backgroundColor: '#f7c948',
    height: '100%',
    width: '58%',
  },
  weatherNowRow: {
    alignItems: 'center',
    borderBottomColor: '#253244',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
    paddingBottom: 9,
  },
  weatherTemperature: {
    color: '#edf5ff',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  weatherCondition: {
    color: '#33d69f',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },
  weatherNowMeta: {
    alignItems: 'flex-end',
    gap: 3,
  },
  weatherNowMetaText: {
    color: '#9babbf',
    fontSize: 10,
    fontWeight: '800',
  },
  weatherInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 9,
  },
  weatherInfoCard: {
    backgroundColor: '#101720',
    borderColor: '#253244',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 6,
    width: '23.5%',
  },
  weatherInfoLabel: {
    color: '#718197',
    fontSize: 9,
    fontWeight: '900',
  },
  weatherInfoValue: {
    color: '#edf5ff',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 3,
  },
  weatherChartTitle: {
    color: '#edf5ff',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 10,
  },
  weatherChart: {
    alignItems: 'flex-end',
    borderBottomColor: '#253244',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 104,
    marginTop: 6,
    paddingBottom: 14,
  },
  weatherChartColumn: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  weatherChartValue: {
    color: '#9babbf',
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 3,
  },
  weatherTempBar: {
    minHeight: 10,
    width: '100%',
  },
  weatherChartLabel: {
    bottom: -14,
    color: '#718197',
    fontSize: 8,
    fontWeight: '800',
    position: 'absolute',
  },
  weatherDualCharts: {
    flexDirection: 'row',
    gap: 8,
  },
  weatherMiniChart: {
    flex: 1,
  },
  weatherMiniRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 5,
  },
  weatherMiniLabel: {
    color: '#718197',
    fontSize: 8,
    fontWeight: '900',
    width: 18,
  },
  weatherMiniTrack: {
    backgroundColor: '#151d28',
    flex: 1,
    height: 7,
    overflow: 'hidden',
  },
  weatherRainBar: {
    backgroundColor: '#5ecbff',
    height: '100%',
  },
  weatherWindBar: {
    backgroundColor: '#f7c948',
    height: '100%',
  },
  weatherMiniValue: {
    color: '#9babbf',
    fontSize: 8,
    fontWeight: '900',
    textAlign: 'right',
    width: 20,
  },
  weatherDailyRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  weatherDailyCard: {
    backgroundColor: '#101720',
    borderColor: '#253244',
    borderWidth: 1,
    flex: 1,
    minHeight: 78,
    padding: 5,
  },
  weatherDailyDate: {
    color: '#80d9ff',
    fontSize: 9,
    fontWeight: '900',
  },
  weatherDailyCode: {
    color: '#edf5ff',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 4,
  },
  weatherDailyTemp: {
    color: '#33d69f',
    fontSize: 9,
    fontWeight: '900',
    marginTop: 4,
  },
  weatherDailyMeta: {
    color: '#718197',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 3,
  },
  weatherError: {
    color: '#f9735b',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 9,
  },
  comparisonPanel: {
    backgroundColor: 'rgba(17, 25, 35, 0.72)',
    borderColor: '#253244',
    borderWidth: 1,
    gap: 10,
    marginTop: 10,
    padding: 9,
  },
  comparisonSource: {
    color: '#80d9ff',
    fontSize: 10,
    fontWeight: '900',
  },
  metricRow: {
    gap: 5,
  },
  metricHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    color: '#edf5ff',
    fontSize: 11,
    fontWeight: '900',
  },
  metricDelta: {
    fontSize: 11,
    fontWeight: '900',
  },
  metricDeltaUp: {
    color: '#33d69f',
  },
  metricDeltaDown: {
    color: '#f9735b',
  },
  metricTrack: {
    backgroundColor: '#151d28',
    height: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  metricBarPrevious: {
    backgroundColor: 'rgba(155, 171, 191, 0.35)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  metricBarCurrent: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  timelineRow: {
    alignItems: 'flex-end',
    borderTopColor: '#253244',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 74,
    marginTop: 2,
    paddingTop: 10,
  },
  timelineTitle: {
    color: '#9babbf',
    fontSize: 10,
    fontWeight: '900',
  },
  timelineColumn: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    height: '100%',
    justifyContent: 'flex-end',
  },
  timelineBar: {
    backgroundColor: '#5ecbff',
    minHeight: 8,
    width: '100%',
  },
  timelineLabel: {
    color: '#718197',
    fontSize: 9,
    fontWeight: '800',
  },
  sentinelPanel: {
    backgroundColor: 'rgba(6, 10, 15, 0.92)',
    borderColor: '#273141',
    borderWidth: 1,
    bottom: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'absolute',
    zIndex: 7,
  },
  sentinelPanelExpanded: {
    left: 18,
    maxWidth: 560,
    right: 86,
  },
  sentinelPanelDocked: {
    right: 18,
    width: 132,
    paddingHorizontal: 10,
  },
  sentinelPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sentinelTitle: {
    color: '#edf5ff',
    fontSize: 13,
    fontWeight: '900',
  },
  sentinelMeta: {
    color: '#9babbf',
    flex: 1,
    fontSize: 12,
  },
  sentinelDockButton: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  sentinelDockText: {
    color: '#80d9ff',
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 23,
  },
  sentinelCloseButton: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  sentinelCloseText: {
    color: '#edf5ff',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  loadingBarShell: {
    backgroundColor: '#151d28',
    height: 6,
    marginTop: 10,
    overflow: 'hidden',
  },
  loadingBarFill: {
    backgroundColor: '#33d69f',
    height: '100%',
  },
  calendarPanel: {
    backgroundColor: 'rgba(17, 25, 35, 0.72)',
    borderColor: '#253244',
    borderWidth: 1,
    marginTop: 10,
    padding: 9,
  },
  calendarSummaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  calendarSummaryTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  calendarSummaryTitle: {
    color: '#edf5ff',
    fontSize: 12,
    fontWeight: '900',
  },
  calendarSummaryMeta: {
    color: '#9babbf',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  calendarNavButton: {
    alignItems: 'center',
    backgroundColor: '#101720',
    borderColor: '#2b394b',
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 32,
  },
  calendarNavButtonDisabled: {
    opacity: 0.35,
  },
  calendarNavText: {
    color: '#80d9ff',
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 23,
  },
  calendarNavTextDisabled: {
    color: '#5d6b7c',
  },
  calendarTitle: {
    color: '#edf5ff',
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  calendarWeekday: {
    color: '#718197',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
    width: '14.285%',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },
  calendarDay: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: '14.285%',
  },
  calendarDayOutside: {
    opacity: 0.35,
  },
  calendarDayAvailable: {
    backgroundColor: 'rgba(94, 203, 255, 0.16)',
    borderColor: 'rgba(94, 203, 255, 0.55)',
    borderWidth: 1,
  },
  calendarDayActive: {
    backgroundColor: '#33d69f',
    borderColor: '#ffffff',
  },
  calendarDayText: {
    color: '#536173',
    fontSize: 11,
    fontWeight: '800',
  },
  calendarDayTextOutside: {
    color: '#3e4a58',
  },
  calendarDayTextAvailable: {
    color: '#dbeafe',
  },
  calendarDayTextActive: {
    color: '#05100d',
  },
  dateStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  dateButton: {
    backgroundColor: '#111923',
    borderColor: '#2b394b',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  dateButtonActive: {
    backgroundColor: '#1b2a25',
    borderColor: '#33d69f',
  },
  dateButtonText: {
    color: '#9fb0c5',
    fontSize: 11,
    fontWeight: '800',
  },
  dateButtonTextActive: {
    color: '#33d69f',
  },
});
