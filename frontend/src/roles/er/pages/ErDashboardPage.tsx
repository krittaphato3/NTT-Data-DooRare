import { IncidentFrame } from '../components/IncidentFrame';
import { IncidentSummaryCard } from '../components/IncidentSummaryCard';
import { KitStockCard } from '../components/KitStockCard';
import type { RoleCode } from '../../../lib/rbac';
import { EMERGENCY_BORROWS, INCIDENT_HEADER, KIT_ASSEMBLIES } from '../data/incident';
import { erHref } from '../data/navigation';
import type { ErPage } from '../data/navigation';

const NEXT: { page: ErPage; label: string; hint: string }[] = [
  { page: 'plan', label: 'ตรวจแผนเวชภัณฑ์', hint: 'แก้จำนวนจัด / ตอบคำถาม Agent / อนุมัติแผน' },
  { page: 'borrow', label: 'ติดตามคำขอยืมฉุกเฉิน', hint: 'ดูผู้ให้ยืมและเวลาที่เหลือ' },
  { page: 'pack', label: 'จัดชุด', hint: 'ยืนยันเมื่อจัดชุดจากของแยกครบ' },
  { page: 'summary', label: 'สรุปและปิดเหตุการณ์', hint: 'หลังเหตุการณ์สงบ' },
];

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: 11.5, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: tone ?? '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>
    </div>
  );
}

/** ER home: the active incident, what is waiting, kit stock and shortcuts to each step. */
export function ErDashboardPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const t = INCIDENT_HEADER.triage;
  const pendingAsks = EMERGENCY_BORROWS.reduce((n, b) => n + b.hospitals.filter((h) => h.status === 'pending').length, 0);
  const kitsToPack = KIT_ASSEMBLIES.filter((k) => k.status !== 'done').length;

  return (
    <IncidentFrame
      role={role}
      title="หน้าหลัก ER"
      titleEn="/ ER home"
      subtitle="รพ.สมุทรปราการ · เหตุที่เปิดอยู่ ของที่รออยู่ และทางลัดไปแต่ละขั้นตอน"
      showContext={false}
    >
      {({ access, openIntake }) => (
        <>
          <IncidentSummaryCard mayWrite={access.mayWrite} onEditTriage={openIntake} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Kpi label="ผู้ป่วยทั้งหมด" value={String(t.red + t.yellow + t.green + t.black)} sub={`แดง ${t.red} · เหลือง ${t.yellow} · เขียว ${t.green} · ดำ ${t.black}`} />
            <Kpi label="คำขอยืมรอผู้ให้ยืนยัน" value={String(pendingAsks)} sub="ผู้ให้ยืมยืนยันเอง" tone="#dc2626" />
            <Kpi label="ชุดที่ยังต้องจัด" value={String(kitsToPack)} sub="รอยืนยันจัดชุดเสร็จ" tone="#b45309" />
            <Kpi label="แผนปัจจุบัน" value={INCIDENT_HEADER.versionHistory.version} sub={INCIDENT_HEADER.versionHistory.approver} />
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px', minWidth: 280 }}>
              <div className="card" style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>ขั้นตอนถัดไป</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {NEXT.map((n) => (
                    <a key={n.page} href={erHref(n.page)} className="link" style={{ textDecoration: 'none' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb' }}>{n.label}</div>
                      <div style={{ fontSize: 11.5, color: '#64748b' }}>{n.hint}</div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ flex: '1 1 280px', minWidth: 260 }}>
              <KitStockCard />
            </div>
          </div>
        </>
      )}
    </IncidentFrame>
  );
}
