import { Icon } from '../../../components/common/icons';
import { STATUS_META, TILE_ORDER } from '../data/transport';
import type { TransportStatus } from '../data/transport';

const TILE_TONE: Record<string, [string, string]> = {
  amber: ['#92400E', '#FFFBEB'],
  orange: ['#9A3412', '#FFF7ED'],
  blue: ['#1E40AF', '#EFF6FF'],
  teal: ['#115E59', '#F0FDFA'],
  grey: ['#475569', '#F8FAFC'],
  green: ['#166534', '#F0FDF4'],
};

interface StatusTilesProps {
  counts: Record<TransportStatus, number>;
  active: TransportStatus | null;
  onPick: (s: TransportStatus | null) => void;
}

export function StatusTiles({ counts, active, onPick }: StatusTilesProps) {
  return (
    <div className="tiles6">
      {TILE_ORDER.map((code) => {
        const m = STATUS_META[code];
        const [fg, bg] = TILE_TONE[m.tone];
        const on = active === code;
        return (
          <button
            key={code}
            className="tile"
            aria-pressed={on ? 'true' : 'false'}
            onClick={() => onPick(on ? null : code)}
            style={{ borderColor: on ? fg : '#E2E8F0', background: on ? bg : '#FFFFFF', borderWidth: on ? 2 : 1, padding: on ? '9px 11px' : '10px 12px' }}
          >
            <span className="num tile-n">{counts[code]}</span>
            <span className="tl" style={{ color: fg }}>
              <Icon name={m.icon} className="ic14" />
              {m.tileLabel}
            </span>
            <span className="code" style={{ fontSize: 10.5, lineHeight: '14px' }}>
              {code}
            </span>
          </button>
        );
      })}
    </div>
  );
}
