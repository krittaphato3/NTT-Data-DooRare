import { Icon } from '../../../components/common/icons';
import { GROUPS } from '../data/borrow';
import type { StatusGroup, Tone } from '../data/borrow';

const TILE_TONE: Record<Tone, [string, string]> = {
  amber: ['#92400E', '#FFFBEB'],
  blue: ['#1E40AF', '#EFF6FF'],
  red: ['#991B1B', '#FEF2F2'],
  green: ['#166534', '#F0FDF4'],
  grey: ['#475569', '#F8FAFC'],
};

interface BorrowStatusTilesProps {
  counts: Record<StatusGroup, number>;
  active: StatusGroup | null;
  onPick: (g: StatusGroup | null) => void;
}

/** SM-1 status groups as filter tiles (click again to clear). */
export function BorrowStatusTiles({ counts, active, onPick }: BorrowStatusTilesProps) {
  return (
    <div className="tiles5">
      {GROUPS.map((g) => {
        const [fg, bg] = TILE_TONE[g.tone];
        const on = active === g.id;
        return (
          <button
            key={g.id}
            className="tile"
            aria-pressed={on ? 'true' : 'false'}
            onClick={() => onPick(on ? null : g.id)}
            style={{ borderColor: on ? fg : '#E2E8F0', background: on ? bg : '#FFFFFF', borderWidth: on ? 2 : 1, padding: on ? '9px 11px' : '10px 12px' }}
          >
            <span className="num tile-n">{counts[g.id]}</span>
            <span className="tl" style={{ color: fg }}>
              <Icon name={g.icon} className="ic14" />
              {g.label}
            </span>
            <span className="code" style={{ fontSize: 10.5, lineHeight: '14px' }}>
              {g.codes}
            </span>
          </button>
        );
      })}
    </div>
  );
}
