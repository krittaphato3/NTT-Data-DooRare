import { Icon } from '../../../components/common/icons';
import type { IconName } from '../../../components/common/icons';

export type Direction = 'all' | 'out' | 'in';

export interface DirectionOption {
  id: Direction;
  th: string;
  en: string;
  icon: IconName;
  count: number;
  todo: string;
  iconBg: string;
  iconFg: string;
}

interface DirectionTabsProps {
  options: DirectionOption[];
  value: Direction;
  onChange: (d: Direction) => void;
}

export function DirectionTabs({ options, value, onChange }: DirectionTabsProps) {
  return (
    <section role="tablist" aria-label="ทิศทาง" className="dirs">
      {options.map((d) => (
        <button key={d.id} role="tab" aria-selected={value === d.id ? 'true' : 'false'} className={`dir ${value === d.id ? 'dir-on' : ''}`} onClick={() => onChange(d.id)}>
          <span className="dir-icon" style={{ background: d.iconBg, color: d.iconFg }}>
            <Icon name={d.icon} className="ic20" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="dir-th">{d.th}</span>
            <span className="dir-en">{d.en}</span>
          </span>
          <span className="num dir-count">{d.count}</span>
          {d.todo && (
            <span className="badge t-amber" style={{ fontWeight: 600 }}>
              {d.todo}
            </span>
          )}
        </button>
      ))}
    </section>
  );
}
