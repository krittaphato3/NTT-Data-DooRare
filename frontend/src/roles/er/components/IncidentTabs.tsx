export type IncidentTab = 'plan' | 'borrow' | 'pack' | 'summary';

const TABS: { id: IncidentTab; label: string; badge?: string }[] = [
  { id: 'plan', label: 'แผนเวชภัณฑ์' },
  { id: 'borrow', label: 'ยืมฉุกเฉิน', badge: '2' },
  { id: 'pack', label: 'จัดชุด', badge: '2' },
  { id: 'summary', label: 'สรุปหลังเหตุการณ์' },
];

/** Sub-tabs of the incident console (all four for the pharmacist / hospital admin view; `tabs` narrows them). */
export function IncidentTabs({ active, onChange, tabs }: { active: IncidentTab; onChange: (tab: IncidentTab) => void; tabs?: IncidentTab[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e2e8f0', paddingBottom: 2 }}>
      {TABS.filter((t) => !tabs || tabs.includes(t.id)).map((t) => (
        <button
          key={t.id}
          type="button"
          className="tab"
          style={{
            height: 38,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            borderBottom: active === t.id ? '2.5px solid #2563eb' : '2.5px solid transparent',
            background: 'none',
            color: active === t.id ? '#2563eb' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onClick={() => onChange(t.id)}
        >
          <span>{t.label}</span>
          {t.badge && (
            <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
