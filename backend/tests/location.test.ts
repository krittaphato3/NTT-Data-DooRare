import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateHaversineDistance, calculateRoute } from '../src/modules/location/location.service.js';
import { config } from '../src/config/env.js';

test('estimateHaversineDistance: accurately calculates road distance between hospitals', () => {
  // Khon Kaen Hospital -> Srinagarind Hospital (~4-6 km straight line, ~6 km road)
  const from = { lat: 16.4322, lon: 102.8356 };
  const to = { lat: 16.4674, lon: 102.8286 };

  const result = estimateHaversineDistance(from.lat, from.lon, to.lat, to.lon);
  assert.ok(result.distanceKm > 4 && result.distanceKm < 8, `Distance was ${result.distanceKm} km`);
  assert.ok(result.travelMinutes >= 5, `Travel minutes was ${result.travelMinutes}`);
});

test('estimateHaversineDistance: handles identical coordinates with minimum travel time floor', () => {
  const result = estimateHaversineDistance(16.4322, 102.8356, 16.4322, 102.8356);
  assert.equal(result.distanceKm, 0);
  assert.equal(result.travelMinutes, 5); // 5 minutes minimum floor
});

test('calculateRoute: falls back to HAVERSINE_FALLBACK when no API key configured', async () => {
  const originalKey = config.location.apiKey;
  try {
    config.location.apiKey = '';

    const result = await calculateRoute([102.8356, 16.4322], [102.8286, 16.4674]);
    assert.equal(result.source, 'HAVERSINE_FALLBACK');
    assert.ok(result.distanceKm > 0);
    assert.ok(result.travelMinutes > 0);
    assert.equal(result.distanceMeters, Math.round(result.distanceKm * 1000));
    assert.equal(result.durationSeconds, Math.round(result.travelMinutes * 60));
  } finally {
    config.location.apiKey = originalKey;
  }
});

test('calculateRoute: gracefully handles API failure and falls back to HAVERSINE_FALLBACK', async () => {
  const originalKey = config.location.apiKey;
  const originalFetch = globalThis.fetch;
  try {
    config.location.apiKey = 'dummy-key';
    // Mock fetch to simulate network error or AWS outage
    globalThis.fetch = async () => {
      throw new Error('Connection refused to AWS endpoint');
    };

    const result = await calculateRoute([102.8356, 16.4322], [102.8286, 16.4674]);
    assert.equal(result.source, 'HAVERSINE_FALLBACK');
    assert.ok(result.distanceKm > 0);
    assert.ok(result.travelMinutes > 0);
  } finally {
    config.location.apiKey = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('calculateRoute: parses real Amazon Location Service v2 Routes API response correctly', async () => {
  const originalKey = config.location.apiKey;
  const originalFetch = globalThis.fetch;
  try {
    config.location.apiKey = 'valid-test-key';
    globalThis.fetch = async (url, init) => {
      assert.ok(String(url).includes('routes.geo.'));
      assert.ok(String(url).includes('key=valid-test-key'));
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.Origin, [102.8356, 16.4322]);
      assert.deepEqual(body.Destination, [102.8286, 16.4674]);

      return new Response(
        JSON.stringify({
          Routes: [
            {
              Summary: {
                Distance: 6266, // meters
                Duration: 716, // seconds (~11.9 mins)
              },
              Legs: [
                {
                  Geometry: {
                    Polyline: 'mock-polyline-geometry',
                  },
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const result = await calculateRoute([102.8356, 16.4322], [102.8286, 16.4674]);
    assert.equal(result.source, 'AMAZON_LOCATION_SERVICE');
    assert.equal(result.distanceMeters, 6266);
    assert.equal(result.distanceKm, 6.27);
    assert.equal(result.durationSeconds, 716);
    assert.equal(result.travelMinutes, 11.9);
    assert.equal(result.polyline, 'mock-polyline-geometry');
  } finally {
    config.location.apiKey = originalKey;
    globalThis.fetch = originalFetch;
  }
});
