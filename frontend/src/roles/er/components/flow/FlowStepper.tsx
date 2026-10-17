export interface FlowStepDef {
  id: number;
  label: string;
  hint: string;
}

interface FlowStepperProps {
  steps: FlowStepDef[];
  current: number;
  /** Steps up to this one may be revisited. */
  reached: number;
  onGo: (id: number) => void;
}

/** Horizontal step indicator. Finished steps are clickable so staff can go back and change them. */
export function FlowStepper({ steps, current, reached, onGo }: FlowStepperProps) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {steps.map((s) => {
        const done = s.id < current;
        const active = s.id === current;
        const clickable = s.id <= reached && !active;
        return (
          <li key={s.id} style={{ flex: '1 1 118px', minWidth: 110 }}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onGo(s.id)}
              aria-current={active ? 'step' : undefined}
              style={{
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 10,
                border: active ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                background: active ? '#eff6ff' : done ? '#f0fdf4' : '#ffffff',
                cursor: clickable ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  flex: 'none',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  background: active ? '#2563eb' : done ? '#16a34a' : '#e2e8f0',
                  color: active || done ? '#ffffff' : '#64748b',
                }}
              >
                {done ? '✓' : s.id}
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: active ? '#1d4ed8' : '#0f2a5c' }}>{s.label}</span>
                <span style={{ display: 'block', fontSize: 10.5, color: '#64748b' }}>{s.hint}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
