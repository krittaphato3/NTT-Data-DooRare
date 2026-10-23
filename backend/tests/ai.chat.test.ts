import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { authService } from '../src/modules/auth/auth.service.js';
import http from 'node:http';

function makeRequest(
  server: http.Server,
  options: http.RequestOptions,
  body?: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

test('POST /api/v1/ai/chat requires authentication', async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  try {
    const res = await makeRequest(
      server,
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/ai/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      JSON.stringify({
        messages: [{ role: 'user', content: 'Ping' }],
      }),
    );

    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /api/v1/ai/chat streams SSE events with valid session token', async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  // Create active session in authService pointing to a real DB user
  const testToken = `test_sess_${Date.now()}`;
  (authService as any).activeSessions.set(testToken, {
    userId: 'e8939197-a08e-41c1-99c2-8c2d406500cf',
    email: 'system_admin1.region@example.org',
    role: 'SYSTEM_ADMIN',
    createdAt: Date.now(),
  });

  try {
    const res = await makeRequest(
      server,
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/ai/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
        },
      },
      JSON.stringify({
        messages: [{ role: 'user', content: 'ping_system test' }],
        routeContext: {
          currentPath: '/pool-allocation',
          pageTitle: 'Pool Allocation',
        },
      }),
    );

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/event-stream/);
    assert.match(res.body, /event: status/);
    assert.match(res.body, /event: token/);
    assert.match(res.body, /event: done/);
    assert.match(res.body, /event: finish/);
  } finally {
    server.close();
  }
});

