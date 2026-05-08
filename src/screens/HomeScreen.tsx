import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  Linking,
  PanResponder,
  Platform,
  Pressable,
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

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 18;
const MAX_TILE_SOURCE_ZOOM = 14;
const INITIAL_ZOOM = 3.1;
const ZOOM_STEP = 0.25;
const MAX_SENTINEL_SELECTION_KM2 = 120000;
const MAX_SENTINEL_AVAILABILITY_KM2 = 900000;
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const EARTH_SEARCH_URL = 'https://earth-search.aws.element84.com/v1/search';
const TITILER_COG_URL = 'https://titiler.xyz/cog/tiles/WebMercatorQuad';
const BASE_TILE_URL = 'https://basemaps.cartocdn.com/rastertiles/voyager';
const SENTINEL_SOURCE: SentinelSource = {
  label: 'Sentinel-2',
  shortLabel: 'S2',
  collection: 'sentinel-2-l2a',
  lookbackDays: 180,
  limit: 80,
  availabilityLimit: 48,
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
  const { width } = useWindowDimensions();
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
  const [selectedBbox, setSelectedBbox] = useState<Bbox | null>(null);
  const [sentinelScenes, setSentinelScenes] = useState<SentinelScene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState('');
  const [selectedScene, setSelectedScene] = useState<SentinelScene | null>(null);
  const [isLoadingSentinel, setIsLoadingSentinel] = useState(false);
  const [isLoadingSentinelTiles, setIsLoadingSentinelTiles] = useState(false);
  const [sentinelTilesLoaded, setSentinelTilesLoaded] = useState(0);
  const [sentinelError, setSentinelError] = useState('');
  const [showAvailability, setShowAvailability] = useState(false);
  const [availabilityScenes, setAvailabilityScenes] = useState<SentinelScene[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(monthKeyFromDate(new Date()));
  const [tleRecords, setTleRecords] = useState<Record<string, TleRecord>>({});
  const [satellitePositions, setSatellitePositions] = useState<SatelliteLivePosition[]>([]);
  const [isLoadingOrbit, setIsLoadingOrbit] = useState(true);
  const dragStart = useRef<WorldPoint>({ x: 0, y: 0 });
  const webDragStart = useRef<WebDragSession | null>(null);
  const selectionStart = useRef<WorldPoint | null>(null);
  const selectionDraft = useRef<SelectionBox | null>(null);
  const searchCache = useRef<Record<string, SearchResult[]>>({});
  const sentinelRequestId = useRef(0);
  const availabilityRequestId = useRef(0);
  const lastSentinelLoadKey = useRef('');

  const tileZoom = clamp(Math.ceil(zoom), MIN_ZOOM, MAX_TILE_SOURCE_ZOOM);
  const tileScale = 2 ** (zoom - tileZoom);
  const centerPoint = useMemo(() => latLngToPoint(center, tileZoom), [center, tileZoom]);

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
        tiles.push({
          key: `${tileZoom}-${x}-${y}`,
          url: `${BASE_TILE_URL}/${tileZoom}/${wrappedX}/${y}.png`,
          left: (x * TILE_SIZE - centerPoint.x) * tileScale + viewport.width / 2,
          top: (y * TILE_SIZE - centerPoint.y) * tileScale + viewport.height / 2,
          size: tileSize,
          x: wrappedX,
          y,
          z: tileZoom,
        });
      }
    }

    return tiles;
  }, [centerPoint, tileScale, tileZoom, viewport]);

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
      const matchingScene = preferredScene ?? scenesForActiveDate.find((scene) => bboxesIntersect(scene.bbox, bbox));

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
  const displayedImageCount = sentinelTiles.length;
  const imageryLoadKey =
    displayedImageCount > 0
      ? sentinelTiles.map(({ scene, tile }) => `${scene.id}:${tile.key}`).join('|')
      : '';
  const imageryProgress =
    displayedImageCount > 0 ? Math.min(100, Math.round((sentinelTilesLoaded / displayedImageCount) * 100)) : 0;
  const loadingProgress = isLoadingSentinel ? 24 : isLoadingSentinelTiles ? imageryProgress : 100;
  const visibleSceneDates = Array.from(new Set(sentinelScenes.map((scene) => scene.date)));

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

  const focusLocation = (location: LatLng, nextZoom = Math.max(zoom, 5)) => {
    setCenter(location);
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
    const areaKm2 = bboxAreaKm2(bbox);

    if (areaKm2 > MAX_SENTINEL_AVAILABILITY_KM2) {
      setAvailabilityScenes([]);
      setAvailabilityError(`Vue trop grande. Zoome pour afficher les zones ${SENTINEL_SOURCE.label}.`);
      setIsLoadingAvailability(false);
      return;
    }

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

  const pickSceneAtPoint = (x: number, y: number) => {
    const location = screenToLocation(x, y);
    const loadedScenesAtPoint = sentinelScenes.filter((scene) => bboxContainsLocation(scene.bbox, location));
    const availabilityScenesAtPoint = showAvailability
      ? availabilityScenes.filter((scene) => bboxContainsLocation(scene.bbox, location))
      : [];
    const activeSceneAtPoint =
      activeScene && loadedScenesAtPoint.some((scene) => scene.id === activeScene.id) ? activeScene : null;

    setSelectedScene(activeSceneAtPoint ?? loadedScenesAtPoint[0] ?? availabilityScenesAtPoint[0] ?? null);
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
    if (!selectedBbox || selectionMode) {
      return;
    }

    const areaKm2 = bboxAreaKm2(currentViewportBbox);

    if (areaKm2 > MAX_SENTINEL_SELECTION_KM2) {
      setSentinelScenes([]);
      setActiveSceneId('');
      setIsLoadingSentinel(false);
      setIsLoadingSentinelTiles(false);
      setSentinelTilesLoaded(0);
      setSelectedScene(null);
      setSentinelError('Zone visible trop grande. Zoome ou selectionne une zone plus petite.');
      return;
    }

    setSelectedBbox(currentViewportBbox);

    const viewportReloadTimer = setTimeout(() => {
      void loadSentinelScenes(currentViewportBbox, false);
    }, 520);

    return () => clearTimeout(viewportReloadTimer);
  }, [currentViewportBboxKey, Boolean(selectedBbox), selectionMode]);

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

    if (bboxAreaKm2(bbox) > MAX_SENTINEL_SELECTION_KM2) {
      setSentinelScenes([]);
      setActiveSceneId('');
      setIsLoadingSentinel(false);
      setIsLoadingSentinelTiles(false);
      setSentinelTilesLoaded(0);
      setSelectedScene(null);
      setSentinelError(`Zone trop grande. Selectionne une zone plus petite pour charger ${SENTINEL_SOURCE.label}.`);
      return;
    }

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
    [activeScene, availabilityScenes, center, selectionMode, sentinelScenes, showAvailability, tileScale, tileZoom, zoom],
  );

  const webWheelProps =
    Platform.OS === 'web'
      ? {
          onWheel: (event: { nativeEvent?: { deltaY?: number }; preventDefault?: () => void }) => {
            event.preventDefault?.();
            const deltaY = event.nativeEvent?.deltaY ?? 0;
            changeZoom(deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
          },
        }
      : {};

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
        <View style={styles.mapPanel} onLayout={handleMapLayout} {...webWheelProps}>
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
              onPress={() => {
                setSelectionMode((currentMode) => !currentMode);
                setSelectionBox(null);
              }}
              style={[styles.selectAreaButton, selectionMode && styles.selectAreaButtonActive]}
            >
              <Text style={[styles.selectAreaText, selectionMode && styles.selectAreaTextActive]}>▣</Text>
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
            <Pressable onPress={() => focusLocation({ lat: 24, lon: 5 }, INITIAL_ZOOM)} style={styles.recenterButton}>
              <Text style={styles.recenterText}>◎</Text>
            </Pressable>
          </View>

          <View style={[styles.mapViewport, mapInteractionStyle]} {...mapInputHandlers}>
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

          <View style={[styles.orbitPanel, showAvailability && styles.orbitPanelStacked]}>
            <View style={styles.orbitPanelHeader}>
              <View style={styles.orbitLiveDot} />
              <Text style={styles.orbitTitle}>Sentinel-2 live</Text>
            </View>
            <Text style={styles.orbitMeta}>
              {isLoadingOrbit
                ? 'orbites en cours...'
                : satellitePositions.length > 0
                  ? satellitePositions
                      .map((satellite) => `${satellite.label} ${satellite.lat.toFixed(1)} / ${satellite.lon.toFixed(1)}`)
                      .join(' · ')
                  : 'position indisponible'}
            </Text>
          </View>

          {selectedBbox ? (
            <View style={styles.sentinelPanel}>
              <View style={styles.sentinelPanelHeader}>
                <View style={styles.liveDot} />
                <Text style={styles.sentinelTitle}>{SENTINEL_SOURCE.label}</Text>
                <Text style={styles.sentinelMeta}>
                  {isLoadingSentinel
                    ? 'chargement des images recentes...'
                    : isLoadingSentinelTiles
                      ? `affichage des images ${loadingProgress}%...`
                    : displayedImageCount > 0
                      ? `mosaïque ${visibleSceneDates.length} date(s) / ${displayedImageCount} image(s)`
                      : sentinelError || 'zone selectionnee'}
                </Text>
                <Pressable onPress={clearSentinelLayer} style={styles.sentinelCloseButton}>
                  <Text style={styles.sentinelCloseText}>X</Text>
                </Pressable>
              </View>

              {isLoadingSentinel || isLoadingSentinelTiles ? (
                <View style={styles.loadingBarShell}>
                  <View style={[styles.loadingBarFill, { width: `${loadingProgress}%` }]} />
                </View>
              ) : null}

              {sentinelScenes.length > 0 ? (
                <>
                  <View style={styles.calendarPanel}>
                    <View style={styles.calendarHeader}>
                      <Pressable
                        disabled={!canGoToPreviousMonth}
                        onPress={() => setCalendarMonth((month) => shiftMonth(month, -1))}
                        style={[styles.calendarNavButton, !canGoToPreviousMonth && styles.calendarNavButtonDisabled]}
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
                        style={[styles.calendarNavButton, !canGoToNextMonth && styles.calendarNavButtonDisabled]}
                      >
                        <Text style={[styles.calendarNavText, !canGoToNextMonth && styles.calendarNavTextDisabled]}>
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
                  </View>

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
  sentinelPanel: {
    backgroundColor: 'rgba(6, 10, 15, 0.92)',
    borderColor: '#273141',
    borderWidth: 1,
    bottom: 48,
    left: 18,
    maxWidth: 560,
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'absolute',
    right: 86,
    zIndex: 7,
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
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
