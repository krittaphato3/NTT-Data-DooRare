import { apiJson } from './apiFetch';

export interface LocationStatus {
  provider: string;
  region: string;
  enabled: boolean;
  apiKeyPreview: string | null;
}

export interface RouteResult {
  distanceKm: number;
  travelMinutes: number;
  durationSeconds: number;
  distanceMeters: number;
  polyline?: string;
  source: 'AMAZON_LOCATION_SERVICE' | 'HAVERSINE_FALLBACK';
  fromCode?: string;
  toCode?: string;
}

export function getLocationStatus() {
  return apiJson<{ ok: true; data: LocationStatus }>('/location/status');
}

export function calculateHospitalRoute(fromHospitalId: string, toHospitalId: string, live: boolean = false) {
  const q = new URLSearchParams({
    fromHospitalId,
    toHospitalId,
    live: live ? 'true' : 'false',
  });
  return apiJson<{ ok: true; data: RouteResult }>(`/location/route?${q}`);
}

export function calculatePointRoute(origin: [number, number], destination: [number, number]) {
  const q = new URLSearchParams({
    originLon: String(origin[0]),
    originLat: String(origin[1]),
    destLon: String(destination[0]),
    destLat: String(destination[1]),
  });
  return apiJson<{ ok: true; data: RouteResult }>(`/location/route?${q}`);
}

export function syncLocationMatrix() {
  return apiJson<{ ok: true; data: { totalPairs: number; updated: number; source: string } }>('/location/sync-matrix', {
    method: 'POST',
  });
}
