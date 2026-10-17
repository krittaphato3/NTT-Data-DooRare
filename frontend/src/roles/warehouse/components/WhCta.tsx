import { whHref } from '../data/routes';
import type { WarehousePage } from '../data/routes';

interface WhCtaProps {
  page: WarehousePage;
  label: string;
  primary?: boolean;
  small?: boolean;
  children?: React.ReactNode;
}

/** Link-styled button to a WH page; renders disabled while the target page is not built yet. */
export function WhCta({ page, label, primary = false, small = true, children }: WhCtaProps) {
  const href = whHref(page);
  const cls = `btn ${small ? 'btn-sm' : ''} ${primary ? 'btn-p' : 'btn-s'}`;
  if (!href) {
    return (
      <button className={cls} disabled title="หน้านี้อยู่ระหว่างพัฒนา">
        {children}
        {label}
      </button>
    );
  }
  return (
    <a className={cls} href={href} style={{ textDecoration: 'none' }}>
      {children}
      {label}
    </a>
  );
}
