import { useEffect, useState } from 'react';

/** Mockup-faithful HH:MM:SS countdown (Main.dc.html `fmt`): clamps at 00:00:00. */
export function fmtTime(s: number): string {
  if (s < 0) s = 0;
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** Ticks once per second, mirroring the mockup's `setInterval(..., 1000)`. */
export function useTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return tick;
}
