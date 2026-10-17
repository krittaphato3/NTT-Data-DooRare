import type { ReactNode } from 'react';

interface ErPageHeadingProps {
  title: string;
  /** English subtitle shown after the title, e.g. "/ Supply plan". */
  titleEn?: string;
  subtitle?: string;
  actions?: ReactNode;
}

/** Page title row shared by every ER page. */
export function ErPageHeading({ title, titleEn, subtitle, actions }: ErPageHeadingProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f2a5c', lineHeight: '32px' }}>
          {title}
          {titleEn && (
            <>
              {' '}
              <span style={{ fontSize: 16, fontWeight: 400, color: '#94a3b8' }}>{titleEn}</span>
            </>
          )}
        </h1>
        {subtitle && <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b', lineHeight: '18px' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}
