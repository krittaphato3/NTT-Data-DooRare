import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Icon } from '../../../components/common/icons';
import { BorrowStatusBadge, ReturnBadge, UrgencyBadge } from '../../pharmacist/components/BorrowBadges';
import { BorrowStatusTiles } from '../../pharmacist/components/BorrowStatusTiles';
import { LEG_META, TILES, tileOf } from '../../pharmacist/data/borrow';
import type { BorrowRequest, TileGroup } from '../../pharmacist/data/borrow';
import { useBorrowRequests } from '../../pharmacist/data/useBorrowRequests';
import '../../pharmacist/borrow.css';
import { ViewOnlyNote } from '../components/ViewOnlyNote';
import { whHref } from '../data/routes';
import { fmtQty } from '../data/transport';
import '../transport.css';
import '../kit.css';

/**
 * WH view of OUR hospital's borrow requests (RBAC 👁): who we asked, who accepted, how much we got.
 * No approve / add-lender / record-return actions — those are the pharmacist's. Requests other
 * hospitals send to us (lender queue) are not shown to WH; they reach WH as tasks in the work inbox.
 */
export function WhBorrowPage() {
  const { user } = useAuth();
  const [group, setGroup] = useState<TileGroup | null>(null);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  // Our hospital's requests from GET /borrow-requests (read-only for WH); mock fixtures when the API is unreachable.
  const { requests } = useBorrowRequests();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const counts = Object.fromEntries(TILES.map((g) => [g.id, requests.filter((r) => tileOf(r) === g.id).length])) as Record<TileGroup, number>;
  const needle = q.trim().toLowerCase();
  const rows = requests.filter((r) => !group || tileOf(r) === group).filter((r) => !needle || [r.id, r.drug, ...r.lender].some((t) => t.toLowerCase().includes(needle)));
  const sel: BorrowRequest | undefined = requests.find((r) => r.id === selId);

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={whHref('dashboard')} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">คำขอยืม</span>
          </nav>
          <h1 className="tr-title">
            คำขอยืมของเรา <span>/ Borrow requests · ดูอย่างเดียว</span>
          </h1>
          <div style={{ fontSize: 13 }}>{user?.hospitalName ?? 'รพ.สมุทรปราการ'} · คำขอยืมที่ รพ.เราส่งไปขอจาก รพ.อื่น · ใช้รู้ล่วงหน้าว่าของจะมาเมื่อไร</div>
        </div>
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h2 className="sec-h">
              สถานะคำขอ <span className="en">SM-1</span>
            </h2>
            {group && <button className="link" onClick={() => setGroup(null)}>ล้างตัวกรอง</button>}
          </div>
          <BorrowStatusTiles counts={counts} active={group} onPick={setGroup} />
        </div>
        <ViewOnlyNote>WH ดูอย่างเดียว · เภสัชกรเป็นผู้อนุมัติ/ส่งคำขอ · เมื่อ รพ.อื่นตอบรับและส่งของมา จะเห็นเป็นของที่จะเข้าในกล่องงานเข้า › รับเข้า</ViewOnlyNote>
        <div className="tr-filters">
          <label className="tr-search">
            <Icon name="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เลขคำขอ / ยา / รพ.ผู้ให้ยืม" aria-label="ค้นหาคำขอยืม" />
          </label>
          <span style={{ flex: '1 1 0' }} />
          <span style={{ fontSize: 12 }}>เรียง: ใหม่สุดก่อน</span>
        </div>
        <div className="scroll-x">
          <table className="tbl kt-tbl" aria-label="คำขอยืมของเรา">
            <thead>
              <tr>
                <th style={{ width: 160 }}>เลขคำขอ</th>
                <th>ยา</th>
                <th style={{ width: 100 }}>จำนวน</th>
                <th style={{ width: 200 }}>ผู้ให้ยืม</th>
                <th style={{ width: 120 }}>ความเร่งด่วน</th>
                <th style={{ width: 150 }}>สถานะ</th>
                <th style={{ width: 220 }}>ความคืบหน้า</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={selId === r.id ? 'r-active' : ''}>
                  <td>
                    <button className="rowbtn code" onClick={() => setSelId(r.id)} style={{ fontSize: 12.5, color: '#1D4ED8', fontWeight: 600 }}>{r.id}</button>
                    <span className="code" style={{ display: 'block', fontSize: 11 }}>{r.context} · {r.createdAt}</span>
                  </td>
                  <td>
                    <span className={`ved ved-${r.ved} ved-sm`} style={{ marginRight: 6 }}>{r.ved}</span>
                    <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{r.drug}</span>
                  </td>
                  <td className="num" style={{ color: '#0F2A5C', fontWeight: 600 }}>{fmtQty(r.qty)} <span className="sub">{r.unit}</span></td>
                  <td style={{ fontSize: 12.5 }}>
                    {r.lender.map((l) => (
                      <div key={l}>{l}</div>
                    ))}
                  </td>
                  <td><UrgencyBadge urgency={r.urgency} /></td>
                  <td>
                    <BorrowStatusBadge status={r.status} />
                    {r.returnState && <span style={{ display: 'block', marginTop: 4 }}><ReturnBadge state={r.returnState} /></span>}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{r.note}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28 }}>ไม่พบคำขอ</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="tbl-foot">
          <span>แสดง <span className="num">{rows.length}</span> คำขอ</span>
          <span>เห็นเฉพาะคำขอของ {user?.hospitalName ?? 'รพ.สมุทรปราการ'}</span>
        </div>
      </section>

      {sel && (
        <aside className="tr-drawer" aria-label="รายละเอียดคำขอยืม">
          <div className="tr-drawer-head">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className="sub">คำขอยืม · ดูอย่างเดียว</span>
              <button className="icbtn" aria-label="ปิด / Close" onClick={() => setSelId(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <h2 className="code" style={{ margin: 0, fontSize: 19, lineHeight: '28px', fontWeight: 600, color: '#0F2A5C' }}>{sel.id}</h2>
              <BorrowStatusBadge status={sel.status} />
              <UrgencyBadge urgency={sel.urgency} />
            </div>
            <div style={{ fontSize: 14, color: '#0F2A5C' }}>{sel.drug} · {fmtQty(sel.qty)} {sel.unit}</div>
          </div>
          <div className="tr-drawer-body">
            <div className="tr-box">
              <h3 className="tr-h3" style={{ marginBottom: 6 }}>{sel.banner.title}</h3>
              <div style={{ fontSize: 13, lineHeight: '20px' }}>{sel.banner.text}</div>
              <dl className="dlr" style={{ marginTop: 8 }}>
                <dt>ที่มา</dt>
                <dd>{sel.contextLabel}</dd>
                <dt>รอบแรก</dt>
                <dd>{sel.firstRound} · {sel.sendMode}</dd>
                <dt>สร้างโดย</dt>
                <dd>{sel.createdBy}</dd>
                {sel.approvedBy && (
                  <>
                    <dt>อนุมัติโดย</dt>
                    <dd>{sel.approvedBy}</dd>
                  </>
                )}
                {sel.stop && (
                  <>
                    <dt>ได้ยืนยันแล้ว</dt>
                    <dd>{sel.stop.got} จาก {sel.stop.target} · {sel.stop.remaining}</dd>
                  </>
                )}
              </dl>
            </div>
            <div>
              <h3 className="tr-h3">ลำดับผู้ให้ยืม <span className="en">คะแนนจัดอันดับ Si โดยระบบ</span></h3>
              <ul className="kt-list">
                {sel.legs.map((l) => (
                  <li key={l.hospital}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{l.hospital}</span>
                      <span className="sub" style={{ display: 'block' }}>{l.si !== undefined ? `Si ${l.si.toFixed(2)} · ` : 'เพิ่มโดยเภสัชกร · '}{l.detail}</span>
                    </div>
                    <span className={`badge t-${LEG_META[l.state].tone}`}>{LEG_META[l.state].label}</span>
                  </li>
                ))}
              </ul>
            </div>
            {sel.agentNote && (
              <div className="return-note">
                <span className="code">{sel.agentNote.code}</span> · {sel.agentNote.text}
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
