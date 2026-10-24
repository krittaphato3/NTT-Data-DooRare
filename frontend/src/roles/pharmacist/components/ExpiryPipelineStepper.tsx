import { withRole } from '../../../data/navigation';
import type { RoleCode } from '../../../lib/rbac';
import '../pipeline.css';

export type PipelineStep = 'expiry' | 'pool' | 'plans';

interface ExpiryPipelineStepperProps {
  current: PipelineStep;
  /** Open work per step: lots to review, lots in the pool, plans waiting on a decision. */
  counts: { expiry: number; pool: number; plans: number; discussion: number };
  role?: RoleCode;
  /** Pool page: switch its own tab instead of reloading. Not called for the expiry step. */
  onSelect?: (step: 'pool' | 'plans') => void;
}

const HREF: Record<PipelineStep, string> = {
  expiry: '?page=expiry',
  pool: '?page=pool&tab=pool',
  plans: '?page=pool&tab=plans',
};

/** The F2 hand-over in three steps: our own near-expiry lots -> regional pool -> allocation plans. */
export function ExpiryPipelineStepper({ current, counts, role = 'PHARMACIST', onSelect }: ExpiryPipelineStepperProps) {
  const steps: { id: PipelineStep; n: string; title: string; sub: string; alert?: string }[] = [
    { id: 'expiry', n: '1', title: 'ตรวจคลังเรา', sub: `${counts.expiry} ล็อตรอตัดสินใจ` },
    { id: 'pool', n: '2', title: 'คลังกลางเขต 6', sub: `${counts.pool} ล็อตรอจับคู่` },
    { id: 'plans', n: '3', title: 'แผนจัดสรร', sub: `${counts.plans} แผนรอเห็นชอบ`, ...(counts.discussion > 0 ? { alert: `ต้องหารือ ${counts.discussion}` } : {}) },
  ];
  return (
    <nav className="pipe" aria-label="ขั้นตอนยาใกล้หมดอายุ">
      {steps.map((s, idx) => (
        <a
          key={s.id}
          className={`pipe-step ${current === s.id ? 'pipe-on' : ''}`}
          href={withRole(HREF[s.id], role)}
          aria-current={current === s.id ? 'step' : undefined}
          onClick={(e) => {
            if (s.id !== 'expiry' && onSelect) {
              e.preventDefault();
              onSelect(s.id);
            }
          }}
        >
          <span className="pipe-n">{s.n}</span>
          <span className="pipe-text">
            <span className="pipe-title">{s.title}</span>
            <span className="pipe-sub">{s.sub}</span>
          </span>
          {s.alert && <span className="badge t-amber" style={{ fontWeight: 600 }}>{s.alert}</span>}
          {idx < steps.length - 1 && <span className="pipe-arrow" aria-hidden="true">→</span>}
        </a>
      ))}
    </nav>
  );
}
