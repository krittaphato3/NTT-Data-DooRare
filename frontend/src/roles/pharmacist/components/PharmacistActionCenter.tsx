import { Icon } from '../../../components/common/icons';
import { withRole } from '../../../data/navigation';
import type { RoleCode } from '../../../lib/rbac';
import { useDashboardTiles } from '../data/useDashboardTiles';

interface PharmacistActionCenterProps {
  role?: RoleCode;
}

export function PharmacistActionCenter({ role = 'PHARMACIST' }: PharmacistActionCenterProps) {
  const t = useDashboardTiles();

  // Live data from API (/dashboard) with demo fallbacks
  const urgentAlerts = t ? t.stockAlerts.urgent : 1;
  const totalAlerts = t ? t.stockAlerts.active : 36;

  // Inbound requests (Lender queue)
  const waitingLender = t ? t.lenderQueue.waiting : 0;
  const lenderActiveCount = t ? t.transport.outInFlight : 4;
  const totalOpenLend = waitingLender + lenderActiveCount;

  // Outbound requests (Borrow requests)
  const pendingApproval = t ? t.borrowRequests.pendingApproval : 0;
  const inProgress = t ? t.borrowRequests.inProgress : 8;
  const escalated = t ? t.borrowRequests.escalated : 6;
  const totalOpenBorrow = pendingApproval + inProgress + escalated;

  const allClear = urgentAlerts === 0 && waitingLender === 0 && pendingApproval === 0;

  return (
    <section className="ph-action-center" data-part="pharmacist-action-center" aria-label="ศูนย์รวมงานด่วนประจำวัน">
      {/* Header */}
      <div className="ph-action-center-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="ph-action-center-icon">
            <Icon name="bell" className="ic20" />
          </div>
          <div>
            <h2 className="ph-action-center-title">
              ศูนย์รวมงานด่วนที่ต้องดำเนินการ <span className="en">Action Required Today</span>
            </h2>
            <p className="ph-action-center-subtitle">
              งานค้างในเวรปัจจุบันที่ต้องตัดสินใจ เพื่อให้การหมุนเวียนยาในเครือข่ายเขตสุขภาพที่ 6 เป็นไปอย่างราบรื่น
            </p>
          </div>
        </div>
        <div className="ph-action-center-live-badge">
          <span className="live-dot" />
          <span>{allClear ? 'งานในเวรเรียบร้อยดี' : 'อัปเดตสถานะแบบเรียลไทม์'}</span>
        </div>
      </div>

      {/* 3 Prominent Action Cards */}
      <div className="ph-action-cards-grid">
        {/* Card 1: 🚨 สต็อกวิกฤตต้องขอยืมทันที */}
        <a
          href={withRole('?page=alerts', role)}
          className="ph-action-card ph-action-card-red"
          title="คลิกเพื่อไปที่หน้าแจ้งเตือนสต็อก"
        >
          <div>
            <div className="ph-action-card-head">
              <span className={`ph-action-card-tag ${urgentAlerts > 0 ? 'red' : 'neutral'}`}>
                <Icon name="tri" className="ic14" />
                {urgentAlerts > 0 ? 'สต็อกวิกฤต' : 'สต็อกปกติ'}
              </span>
              <span className="ph-action-card-icon red">
                <Icon name="tri" className="ic16" />
              </span>
            </div>
            <h3 className="ph-action-card-title" style={{ marginTop: 10 }}>
              สต็อกวิกฤตต้องขอยืมทันที
            </h3>
            <div className="ph-action-card-value-wrap">
              <span className={`ph-action-card-value ${urgentAlerts > 0 ? 'red' : ''}`}>
                {urgentAlerts.toLocaleString()}
              </span>
              <span className="ph-action-card-unit">รายการวิกฤต</span>
            </div>
          </div>
          <div>
            <p className="ph-action-card-desc">
              {urgentAlerts > 0
                ? `พบยาระดับวิกฤตเสี่ยงขาดสต็อก ต้องเปิดคำขอยืมด่วน`
                : `สต็อกยาพร้อมใช้เพียงพอ ไม่มีรายงานยาขาดคลังวิกฤต`}
              <span className="ph-action-card-breakdown">
                มีแจ้งเตือนสต็อกทั้งหมด <strong>{totalAlerts}</strong> รายการในระบบ
              </span>
            </p>
            <div className="ph-action-card-cta red">
              <span>{urgentAlerts > 0 ? 'ดำเนินการขอยืมยาด่วน' : 'ตรวจสอบสต็อกทั้งหมด'}</span>
              <Icon name="arrow" className="ic14" />
            </div>
          </div>
        </a>

        {/* Card 2: 📥 รพ. อื่นขอยืมยาเข้ามา */}
        <a
          href={withRole('?page=lend', role)}
          className="ph-action-card ph-action-card-amber"
          title="คลิกเพื่อไปที่หน้าคิวตอบคำขอยืม"
        >
          <div>
            <div className="ph-action-card-head">
              <span className={`ph-action-card-tag ${waitingLender > 0 ? 'amber' : 'neutral'}`}>
                <Icon name="hand" className="ic14" />
                {waitingLender > 0 ? 'รอเราตอบกลับ' : 'ไม่มีค้างตอบ'}
              </span>
              <span className="ph-action-card-icon amber">
                <Icon name="hand" className="ic16" />
              </span>
            </div>
            <h3 className="ph-action-card-title" style={{ marginTop: 10 }}>
              รพ. อื่นขอยืมยาเข้ามา
            </h3>
            <div className="ph-action-card-value-wrap">
              <span className={`ph-action-card-value ${waitingLender > 0 ? 'amber' : ''}`}>
                {waitingLender.toLocaleString()}
              </span>
              <span className="ph-action-card-unit">คำขอรอตอบ</span>
            </div>
          </div>
          <div>
            <p className="ph-action-card-desc">
              {waitingLender > 0
                ? `มี รพ. เครือข่ายเขต 6 ส่งคำขอยืมยาเข้ามา รอเราตอบรับ`
                : `ไม่มีคำขอยืมยาใหม่ค้างตอบจาก รพ. อื่น`}
              <span className="ph-action-card-breakdown">
                กำลังจัดส่งให้เขา <strong>{lenderActiveCount}</strong> คำขอ · รวมเปิดอยู่ <strong>{totalOpenLend}</strong> คำขอ
              </span>
            </p>
            <div className="ph-action-card-cta amber">
              <span>{waitingLender > 0 ? 'เปิดตรวจสอบคิวให้ยืม' : 'ดูคิวและประวัติการให้ยืม'}</span>
              <Icon name="arrow" className="ic14" />
            </div>
          </div>
        </a>

        {/* Card 3: ✍️ คำขอยืมรอเราอนุมัติ */}
        <a
          href={withRole('?page=requests&group=pending', role)}
          className="ph-action-card ph-action-card-blue"
          title="คลิกเพื่อเปิดหน้าคำขอยืมของเรา ในหมวดหมู่รออนุมัติ"
        >
          <div>
            <div className="ph-action-card-head">
              <span className={`ph-action-card-tag ${pendingApproval > 0 ? 'blue' : 'neutral'}`}>
                <Icon name="hourglass" className="ic14" />
                {pendingApproval > 0 ? 'รออนุมัติ' : 'ไม่มีค้างอนุมัติ'}
              </span>
              <span className="ph-action-card-icon blue">
                <Icon name="hourglass" className="ic16" />
              </span>
            </div>
            <h3 className="ph-action-card-title" style={{ marginTop: 10 }}>
              คำขอยืมรอเราอนุมัติ
            </h3>
            <div className="ph-action-card-value-wrap">
              <span className={`ph-action-card-value ${pendingApproval > 0 ? 'blue' : ''}`}>
                {pendingApproval.toLocaleString()}
              </span>
              <span className="ph-action-card-unit">คำขอรออนุมัติ</span>
            </div>
          </div>
          <div>
            <p className="ph-action-card-desc">
              {pendingApproval > 0
                ? `มีคำขอที่ AI Agent หรือระบบสร้างไว้ รอเราอนุมัติส่ง`
                : `ไม่มีคำขอยืมที่ค้างรอการอนุมัติ`}
              <span className="ph-action-card-breakdown">
                กำลังขอยืม <strong>{inProgress}</strong> · ส่งต่อ <strong>{escalated}</strong> · รวมเปิดอยู่ <strong>{totalOpenBorrow}</strong> คำขอ
              </span>
            </p>
            <div className="ph-action-card-cta blue">
              <span>{pendingApproval > 0 ? 'ตรวจสอบและอนุมัติคำขอ' : 'ดูคำขอยืมทั้งหมด'}</span>
              <Icon name="arrow" className="ic14" />
            </div>
          </div>
        </a>
      </div>

      {/* Sub-bar notice for escalated requests */}
      {escalated > 0 && (
        <div className="ph-action-notices">
          <div className="ph-action-notice-bar red" role="status">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="alertc" className="ic16" />
              <span>
                มีคำขอยืมยาที่ รพ. เดิมตอบปฏิเสธหรือหมดเวลา <strong>{escalated} รายการ</strong> (ระบบส่งต่อผู้ให้ยืมสำรอง หรือต้องการการระบุ รพ. เพิ่มเติม)
              </span>
            </div>
            <a href={withRole('?page=requests&group=escalated', role)}>
              จัดการคำขอที่ส่งต่อ →
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
