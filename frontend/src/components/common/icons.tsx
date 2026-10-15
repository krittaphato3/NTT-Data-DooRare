import type { SVGProps } from 'react';

/* Thin-stroke outline icon set — `d` strings are verbatim ground truth from
 * Mockups/Dashboard - Pharmacist Hospital/Main.dc.html `P` map + hardcoded
 * <path d="..."> markup. Styling comes from the `.ic` / `.ic20` / `.ic14`
 * classes in src/index.css (fill:none; stroke:currentColor; width/height).
 * Presentation attributes below are a defense-in-depth fallback so icons
 * never render as solid black blobs even if CSS fails to load. */

type IconSvgProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

function Ic({ d, className, ...rest }: IconSvgProps & { d: string }) {
  const cls = className ? `ic ${className}` : 'ic';
  return (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d={d} fill="none" />
    </svg>
  );
}

const CIRCLE = 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z';

export const PATHS = {
  grid: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  box: 'M7.5 4.3l9 5.2M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7L12 12l8.7-5M12 22V12',
  inbox:
    'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z',
  hand: 'M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15',
  layers: 'M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  truck:
    'M2 6h12v10H2zM14 9h4l4 4v3h-8M6 20a2 2 0 1 0 0-4a2 2 0 1 0 0 4zM18 20a2 2 0 1 0 0-4a2 2 0 1 0 0 4z',
  pin: 'M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 12a2 2 0 1 0 0-4a2 2 0 1 0 0 4z',
  calx: 'M8 2v4M16 2v4M3 6h18v15H3zM3 10h18M10 14l4 4M14 14l-4 4',
  calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  siren: 'M7 18v-6a5 5 0 1 1 10 0v6M5 21h14v-3H5zM12 2v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4',
  chart: 'M3 3v18h18M7 16v-4M12 16V8M17 16v-7',
  gear: 'M12 15a3 3 0 1 0 0-6a3 3 0 1 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  hosp: 'M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M2 21h20M10 7h4M12 5v4M9 21v-4h6v4',
  sparkle:
    'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z',
  tri: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  clock: `${CIRCLE}M12 6v6l4 2`,
  check: 'M5 12l5 5L20 7',
  checkc: `${CIRCLE}M8.5 12l2.5 2.5 4.5-5`,
  x: 'M18 6L6 18M6 6l12 12',
  xc: `${CIRCLE}M15 9l-6 6M9 9l6 6`,
  hourglass:
    'M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2',
  pkg: 'M16 16l2 2 4-4M21 10V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l2-1.1M3.3 7L12 12l8.7-5M12 22V12',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  alertc: `${CIRCLE}M12 8v4M12 16h.01`,
  minusc: `${CIRCLE}M8 12h8`,
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  trendUp: 'M7 17L17 7M9 7h8v8',
  trendDown: 'M7 7l10 10M17 9v8H9',
  phone: 'M7 2h10v20H7zM11 18h2',
  tablet: 'M5 2h14v20H5zM11 18h2',
  search: 'M11 19a8 8 0 1 0 0-16a8 8 0 1 0 0 16zM21 21l-4.3-4.3',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  chev: 'M6 9l6 6 6-6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6a3 3 0 1 0 0 6z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  refresh: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  login: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  collapse: 'M3 4h18v16H3zM9 4v16M15 10l-2 2 2 2',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
  undo: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13',
  menu: 'M4 6h16M4 12h16M4 18h16',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2',
  camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 17a4 4 0 1 0 0-8a4 4 0 1 0 0 8z',
  wifiOff: 'M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.3-1.7M12 20h.01',
  sync: 'M21 12a9 9 0 0 1-15.5 6.3L3 16M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M3 21v-5h5',
  outArrow: 'M7 17L17 7M9 7h8v8',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  inArrow: 'M17 7L7 17M7 9v8h8',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  fileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, className, style }: IconProps) {
  return <Ic d={PATHS[name]} className={className} style={style} />;
}
