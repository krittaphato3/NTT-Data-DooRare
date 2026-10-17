/** Out-of-scope items: alert only, never added to the plan. */
export function PlanScopeNote() {
  return (
    <div
      style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 11.5,
        color: '#64748b',
        lineHeight: '18px',
      }}
    >
      <div style={{ fontWeight: 600, color: '#475569', marginBottom: 4 }}>
        อยู่นอกขอบเขต - แจ้งเตือนเท่านั้น ไม่สร้างรายการในแผน
      </div>
      <div>· FFP / เกล็ดเลือด / cryo → ขอผ่านธนาคารเลือดโดยตรง (BR-F3-032)</div>
      <div>· เครื่องช่วยหายใจ เครื่องกระตุกหัวใจ เครื่องให้สารน้ำ → ครุภัณฑ์ ไม่อยู่ในระบบนี้</div>
      <div>· การเลือกโรงพยาบาลปลายทางของผู้ป่วย → ตามระบบสั่งการ 1669</div>
    </div>
  );
}
