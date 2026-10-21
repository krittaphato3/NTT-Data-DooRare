import { useDataStatus } from '../../services/dataSource';

/** Shown above the page when a screen could not load its data (or runs on demo fixtures with `?mock=1`). */
export function DataStatusBanner() {
  const { errors, mock } = useDataStatus();
  if (errors.length === 0 && !mock) return null;
  return (
    <div
      role="alert"
      className="card"
      style={{ margin: '0 0 12px', padding: '10px 16px', fontSize: 13, background: errors.length ? '#FEF2F2' : '#FFFBEB', borderColor: errors.length ? '#FECACA' : '#FDE68A', color: errors.length ? '#991B1B' : '#92400E' }}
    >
      {errors.length > 0 ? (
        <>
          โหลดข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ — ข้อมูลที่เห็นอาจไม่ครบ ({errors[0]}) ·{' '}
          <button className="link" onClick={() => window.location.reload()}>ลองใหม่</button>
        </>
      ) : (
        <>โหมดข้อมูลจำลอง (?mock=1) — ข้อมูลบนหน้านี้ไม่ได้มาจากฐานข้อมูล · <a className="link" href="?mock=0">ปิดโหมดนี้</a></>
      )}
    </div>
  );
}
