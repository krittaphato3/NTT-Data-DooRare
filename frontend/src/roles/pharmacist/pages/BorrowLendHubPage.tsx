import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { homeHrefFor } from '../../../data/navigation';
import type { RoleCode } from '../../../lib/rbac';
import { isOpenRequest, LENDER_QUEUE } from '../data/borrow';
import { isOpenLeg } from '../data/lender';
import { useBorrowRequests } from '../data/useBorrowRequests';
import { useLenderQueue } from '../data/useLenderQueue';
import { BorrowRequestsPage } from './BorrowRequestsPage';
import { LenderQueuePage } from './LenderQueuePage';
import '../borrow.css';

export type HubTab = 'outbound' | 'inbound' | 'obligations';

/** Keep `?page=requests|lend` in the address bar so a reload or a shared link lands on the same tab. */
function syncUrl(tab: HubTab) {
  try {
    const q = new URLSearchParams(window.location.search);
    q.set('page', tab === 'inbound' ? 'lend' : 'requests');
    q.delete('group');
    q.delete('request');
    window.history.replaceState(null, '', `?${q.toString()}`);
  } catch {
    /* address bar sync is a convenience only */
  }
}

/**
 * Borrow & Lend hub: one screen for both sides of a hospital-to-hospital loan.
 * Outbound = what we asked for (UI-05), inbound = what neighbours asked of us (UI-06),
 * obligations = what we still owe back (SM-7, Hospital Admin only).
 */
export function BorrowLendHubPage({ role = 'PHARMACIST', initialTab = 'outbound' }: { role?: RoleCode; initialTab?: 'outbound' | 'inbound' }) {
  const mayInbound = role === 'PHARMACIST' || role === 'HOSPITAL_ADMIN';
  const mayObligations = role === 'HOSPITAL_ADMIN';
  const [tab, setTab] = useState<HubTab>(initialTab === 'inbound' && mayInbound ? 'inbound' : 'outbound');
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const mine = useBorrowRequests();
  const lender = useLenderQueue();

  const outOpen = mine.requests.filter((r) => isOpenRequest(r.status));
  const outPending = mine.requests.filter((r) => r.status === 'PENDING_APPROVAL' || r.status === 'DRAFT').length;
  const lenderDemo = lender.source === 'mock';
  const inToAnswer = lenderDemo ? LENDER_QUEUE.toAnswer : lender.requests.filter((r) => r.status === 'waiting').length;
  const inOpen = lenderDemo ? LENDER_QUEUE.total : lender.requests.filter((r) => isOpenLeg(r.status)).length;

  // The first fetch can race the sign-in and fall back to the demo list; refetch once the hub is on screen.
  const reloadMine = mine.reload;
  const reloadLender = lender.reload;
  useEffect(() => {
    void reloadMine();
    void reloadLender();
  }, [reloadMine, reloadLender]);

  const pick = (t: HubTab) => {
    setTab(t);
    syncUrl(t);
  };

  const tabs: { id: HubTab; label: string; hint: string; icon: 'inArrow' | 'hand' | 'undo'; count: number; alert: number; alertLabel: string }[] = [
    { id: 'outbound', label: 'ยาที่เราขอยืม', hint: 'ตามว่ายาจะถึงคนไข้ทันไหม', icon: 'inArrow', count: outOpen.length, alert: outPending, alertLabel: 'รออนุมัติ' },
  ];
  if (mayInbound) tabs.push({ id: 'inbound', label: 'รพ.อื่นขอยืมเรา', hint: 'ตอบรับและจัดยาส่งให้เพื่อนบ้าน', icon: 'hand', count: inOpen, alert: inToAnswer, alertLabel: 'รอเราตอบ' });
  if (mayObligations) tabs.push({ id: 'obligations', label: 'ภาระการคืน', hint: 'ยาที่เรายังต้องคืน', icon: 'undo', count: 0, alert: 0, alertLabel: '' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={homeHrefFor(role)} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a> <span aria-hidden="true">›</span> <span aria-current="page">ยืม-ให้ยืมยา</span>
          </nav>
          <h1 className="tr-title">
            ยืม-ให้ยืมยา <span>/ Borrow &amp; Lend</span>
          </h1>
          <div style={{ fontSize: 13 }}>ทุกคำขอต้องให้เภสัชกรอนุมัติก่อนส่ง · ไม่ตอบในเวลา = ส่งต่อผู้ให้ยืมถัดไปอัตโนมัติ</div>
        </div>
      </section>

      <div className="bl-bar">
        {tabs.length > 1 && (
        <div className="bl-tabs" role="tablist" aria-label="ยืม-ให้ยืมยา">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`bl-tab ${tab === t.id ? 'bl-tab-on' : ''}`}
              data-part={`hub-tab-${t.id}`}
              onClick={() => pick(t.id)}
            >
              <Icon name={t.icon} className="ic20" />
              <span className="bl-tab-text">
                <span className="bl-tab-th">{t.label}</span>
                <span className="bl-tab-hint">{t.hint}</span>
              </span>
              {t.id !== 'obligations' && <span className="num bl-tab-count">{t.count}</span>}
              {t.alert > 0 && (
                <span className="badge t-amber" style={{ fontWeight: 600 }}>
                  {t.alertLabel} {t.alert}
                </span>
              )}
            </button>
          ))}
        </div>
        )}
        <div className="bl-actions" ref={setActionsSlot} />
      </div>

      {tab === 'inbound' && mayInbound ? (
        <LenderQueuePage role={role} embedded />
      ) : (
        <BorrowRequestsPage role={role} embedded actionsSlot={actionsSlot} view={tab === 'obligations' && mayObligations ? 'obligations' : 'requests'} />
      )}
    </div>
  );
}
