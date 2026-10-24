import { config } from '../../config/env.js';
import type { Db } from '../../db/tx.js';

export interface RoutePoint {
  lon: number;
  lat: number;
}

export interface RouteResult {
  distanceKm: number;
  travelMinutes: number;
  durationSeconds: number;
  distanceMeters: number;
  polyline?: string;
  source: 'AMAZON_LOCATION_SERVICE' | 'HAVERSINE_FALLBACK';
}

/**
 * Haversine formula calculation for offline/fallback road distance estimation.
 * Multiplied by 1.35 routing factor (standard urban road tortuosity).
 */
export function estimateHaversineDistance(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): { distanceKm: number; travelMinutes: number } {
  if (
    fromLat == null ||
    fromLon == null ||
    toLat == null ||
    toLon == null ||
    Number.isNaN(Number(fromLat)) ||
    Number.isNaN(Number(fromLon)) ||
    Number.isNaN(Number(toLat)) ||
    Number.isNaN(Number(toLon))
  ) {
    return { distanceKm: 0, travelMinutes: 60 };
  }

  const R = 6371; // Earth radius in km
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLon = ((toLon - fromLon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((fromLat * Math.PI) / 180) *
      Math.cos((toLat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = R * c;

  // Road factor 1.35; avg speed 45 km/h for urban/suburban ambulance/transport
  const distanceKm = Number((straightKm * 1.35).toFixed(2));
  const travelMinutes = Number(Math.max(5, (distanceKm / 45) * 60).toFixed(1));

  return { distanceKm, travelMinutes };
}

/**
 * Calculates real driving route, distance, and duration using Amazon Location Service v2 Routes API.
 * Spec: INT-04 (Amazon Location Service)
 *
 * Fallback: If API key is missing or service unreachable, calculates haversine approximation seamlessly.
 */
export async function calculateRoute(
  origin: [number, number], // [lon, lat]
  destination: [number, number], // [lon, lat]
  travelMode: 'Car' | 'Truck' = 'Car'
): Promise<RouteResult> {
  const apiKey = config.location.apiKey;
  const region = config.location.region || 'ap-southeast-1';

  if (
    !apiKey ||
    origin.some((c) => c == null || Number.isNaN(Number(c))) ||
    destination.some((c) => c == null || Number.isNaN(Number(c)))
  ) {
    const fallback = estimateHaversineDistance(origin[1], origin[0], destination[1], destination[0]);
    return {
      distanceKm: fallback.distanceKm,
      travelMinutes: fallback.travelMinutes,
      distanceMeters: Math.round(fallback.distanceKm * 1000),
      durationSeconds: Math.round(fallback.travelMinutes * 60),
      source: 'HAVERSINE_FALLBACK',
    };
  }

  const endpoint = `https://routes.geo.${region}.amazonaws.com/v2/routes?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Origin: [origin[0], origin[1]],
        Destination: [destination[0], destination[1]],
        TravelMode: travelMode,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Location Service] Route API HTTP ${response.status}: ${errText.slice(0, 100)}`);
      throw new Error(`Location Service returned status ${response.status}`);
    }

    const data: any = await response.json();
    const primaryRoute = data.Routes?.[0];

    if (!primaryRoute) {
      throw new Error('No route returned by Amazon Location Service');
    }

    const distanceMeters = primaryRoute.Summary?.Distance ?? 0;
    const durationSeconds = primaryRoute.Summary?.Duration ?? 0;
    const polyline = primaryRoute.Legs?.[0]?.Geometry?.Polyline;

    return {
      distanceMeters,
      durationSeconds,
      distanceKm: Number((distanceMeters / 1000).toFixed(2)),
      travelMinutes: Number((durationSeconds / 60).toFixed(1)),
      polyline,
      source: 'AMAZON_LOCATION_SERVICE',
    };
  } catch (error: any) {
    console.warn(`[Location Service Warning] Route calculation failed (${error.message}). Using haversine fallback.`);
    const fallback = estimateHaversineDistance(origin[1], origin[0], destination[1], destination[0]);
    return {
      distanceKm: fallback.distanceKm,
      travelMinutes: fallback.travelMinutes,
      distanceMeters: Math.round(fallback.distanceKm * 1000),
      durationSeconds: Math.round(fallback.travelMinutes * 60),
      source: 'HAVERSINE_FALLBACK',
    };
  }
}

/**
 * Computes or refreshes driving distance between two hospitals in the database.
 */
export async function getOrRefreshHospitalDistance(
  db: Db,
  fromHospitalId: string,
  toHospitalId: string,
  forceLive: boolean = false
): Promise<RouteResult & { fromCode: string; toCode: string }> {
  const hospitals = (
    await db.query(
      `SELECT id, code, lat::float8, lon::float8 FROM hospital WHERE id IN ($1, $2)`,
      [fromHospitalId, toHospitalId]
    )
  ).rows;

  const from = hospitals.find((h) => h.id === fromHospitalId);
  const to = hospitals.find((h) => h.id === toHospitalId);

  if (!from || !to) {
    throw new Error('One or both hospitals not found');
  }

  if (!forceLive) {
    const existing = (
      await db.query(
        `SELECT distance_km::float8, travel_minutes::float8, travel_minutes_override::float8, source
           FROM hospital_distance
          WHERE from_hospital_id = $1 AND to_hospital_id = $2`,
        [fromHospitalId, toHospitalId]
      )
    ).rows[0];

    if (existing) {
      const travelMinutes = existing.travel_minutes_override ?? existing.travel_minutes;
      return {
        distanceKm: existing.distance_km,
        travelMinutes,
        durationSeconds: Math.round(travelMinutes * 60),
        distanceMeters: Math.round(existing.distance_km * 1000),
        source: existing.source as any,
        fromCode: from.code,
        toCode: to.code,
      };
    }
  }

  // Calculate live route
  const route = await calculateRoute([from.lon, from.lat], [to.lon, to.lat]);

  // Upsert into hospital_distance
  await db.query(
    `INSERT INTO hospital_distance (from_hospital_id, to_hospital_id, distance_km, duration_min_normal, travel_minutes, source, refreshed_at)
     VALUES ($1, $2, $3, $4, $4, $5, now())
     ON CONFLICT (from_hospital_id, to_hospital_id) DO UPDATE SET
       distance_km = EXCLUDED.distance_km,
       duration_min_normal = EXCLUDED.duration_min_normal,
       travel_minutes = EXCLUDED.travel_minutes,
       source = EXCLUDED.source,
       refreshed_at = now()`,
    [fromHospitalId, toHospitalId, route.distanceKm, route.travelMinutes, route.source]
  );

  return { ...route, fromCode: from.code, toCode: to.code };
}

/**
 * Synchronizes distance and duration for all active hospital pairs using Amazon Location Service.
 */
export async function syncHospitalDistances(db: Db): Promise<{ totalPairs: number; updated: number; source: string }> {
  const hospitals = (
    await db.query(
      `SELECT id, code, lat::float8, lon::float8 FROM hospital WHERE active = true AND lat IS NOT NULL AND lon IS NOT NULL ORDER BY code`
    )
  ).rows;

  let totalPairs = 0;
  let updated = 0;
  let lastSource = 'AMAZON_LOCATION_SERVICE';

  for (let i = 0; i < hospitals.length; i++) {
    for (let j = 0; j < hospitals.length; j++) {
      if (i === j) continue;
      totalPairs++;
      const from = hospitals[i];
      const to = hospitals[j];

      const route = await calculateRoute([from.lon, from.lat], [to.lon, to.lat]);
      lastSource = route.source;

      await db.query(
        `INSERT INTO hospital_distance (from_hospital_id, to_hospital_id, distance_km, duration_min_normal, travel_minutes, source, refreshed_at)
         VALUES ($1, $2, $3, $4, $4, $5, now())
         ON CONFLICT (from_hospital_id, to_hospital_id) DO UPDATE SET
           distance_km = EXCLUDED.distance_km,
           duration_min_normal = EXCLUDED.duration_min_normal,
           travel_minutes = EXCLUDED.travel_minutes,
           source = EXCLUDED.source,
           refreshed_at = now()`,
        [from.id, to.id, route.distanceKm, route.travelMinutes, route.source]
      );
      updated++;
    }
  }

  return { totalPairs, updated, source: lastSource };
}
