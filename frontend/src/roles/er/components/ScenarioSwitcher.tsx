import { SCENARIOS } from '../data/scenario';
import type { Scenario } from '../data/scenario';

/** Test bar for previewing the special states S1–S7 (prototype only). */
export function ScenarioSwitcher({ scenario, onSelect }: { scenario: Scenario; onSelect: (s: Scenario) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: '#f8fafc', padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>จำลองสถานะพิเศษ (S1–S7):</span>
      {SCENARIOS.map((s) => (
        <button
          key={s}
          type="button"
          className="btn btn-sm"
          style={{
            height: 24,
            fontSize: 11,
            padding: '0 8px',
            background: scenario === s ? '#2563eb' : '#ffffff',
            color: scenario === s ? '#ffffff' : '#334155',
            border: scenario === s ? '1px solid #2563eb' : '1px solid #cbd5e1',
            fontWeight: scenario === s ? 600 : 400,
          }}
          onClick={() => onSelect(s)}
        >
          {s === 'normal' ? 'เหตุปกติ' : s.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
