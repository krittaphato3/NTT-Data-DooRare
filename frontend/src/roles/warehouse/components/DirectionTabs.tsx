export type Direction = 'out' | 'in';

export interface DirectionOption {
  id: Direction;
  label: string;
  count: number;
  /** Action badge, e.g. "รอขึ้นรถ 2" (empty = none). */
  todo: string;
  hint: string;
}

interface DirectionTabsProps {
  options: DirectionOption[];
  value: Direction;
  onChange: (d: Direction) => void;
}

/** Sub-tabs separating goods we send from goods coming to us (same tab pattern as the pharmacist pool page). */
export function DirectionTabs({ options, value, onChange }: DirectionTabsProps) {
  const active = options.find((o) => o.id === value) ?? options[0];
  return (
    <div role="tablist" aria-label="ทิศทางการขนส่ง" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id ? 'true' : 'false'} className={`tab ${value === o.id ? 'tab-on' : ''}`} onClick={() => onChange(o.id)}>
          {o.label} <span className="cnt">{o.count}</span>
          {o.todo && (
            <span className="badge t-amber" style={{ fontWeight: 600, height: 20, fontSize: 11 }}>
              {o.todo}
            </span>
          )}
        </button>
      ))}
      <span className="sub" style={{ marginLeft: 6 }}>{active.hint}</span>
    </div>
  );
}
