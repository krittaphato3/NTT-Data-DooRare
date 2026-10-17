import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';

const SCRIM: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,42,92,.45)',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

interface ModalProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Shared dialog shell: centred `.card.dialog`, closed by Escape or a scrim click.
 * Same pattern as the pharmacist pages' local `Modal`, hoisted so the Hospital Admin
 * screens share a single copy instead of duplicating it per page.
 */
export function Modal({ label, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={SCRIM}
    >
      <div role="dialog" aria-modal="true" aria-label={label} className="card dialog">
        {children}
      </div>
    </div>
  );
}
