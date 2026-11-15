import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextFunction, Request, Response } from 'express';
import { DemoService, type DemoOperationResult } from './demo.service.js';

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1', 'db'];

/** The demo buttons rewrite whole tables: only on a local database, or when DEMO_TOOLS_ENABLED=1 says so on purpose (never on RDS by default). */
export function demoToolsGuard(_req: Request, res: Response, next: NextFunction) {
  const host = process.env.DB_HOST || '127.0.0.1';
  if (process.env.DEMO_TOOLS_ENABLED === '1' || LOCAL_HOSTS.includes(host)) return next();
  res.status(403).json({ success: false, message: `demo tools are off for database ${host} (set DEMO_TOOLS_ENABLED=1 to allow)` });
}

let running: string | null = null;

/** Runs backend/scripts/demo-seed.ts (the same script as `npm run db:demo-seed`) and returns its output as log lines. */
export async function runSeedScript(only: 'f2,f1' | 'f2', label: string): Promise<DemoOperationResult> {
  if (running) {
    const err = new Error(`seed already running (${running}), wait for it to finish`) as Error & { status?: number };
    err.status = 409;
    throw err;
  }
  running = label;
  const logs: string[] = [];
  const stamp = () => new Date().toISOString().substring(11, 19);
  logs.push(`[${stamp()}] INFO: running scripts/demo-seed.ts (ONLY=${only})`);
  try {
    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn('npx', ['tsx', 'scripts/demo-seed.ts'], {
        cwd: BACKEND_DIR,
        shell: process.platform === 'win32',
        env: { ...process.env, ONLY: only, API: `http://127.0.0.1:${process.env.PORT || 3001}/api/v1` },
      });
      let buf = '';
      const take = (d: Buffer) => {
        buf += d.toString();
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';
        for (const l of lines) if (l.trim()) logs.push(`[${stamp()}] ${l.replace(/\x1b\[[0-9;]*m/g, '').trimEnd()}`);
      };
      child.stdout.on('data', take);
      child.stderr.on('data', take);
      child.on('error', reject);
      child.on('close', (c) => { if (buf.trim()) logs.push(`[${stamp()}] ${buf.trim()}`); resolve(c ?? 1); });
    });
    const stats = await DemoService.getStats();
    if (code !== 0) logs.push(`[${stamp()}] ERROR: demo-seed exited with code ${code}`);
    return { success: code === 0, message: code === 0 ? `${label} สำเร็จ` : `${label} ไม่สำเร็จ ดู log`, logs, stats };
  } finally {
    running = null;
  }
}
