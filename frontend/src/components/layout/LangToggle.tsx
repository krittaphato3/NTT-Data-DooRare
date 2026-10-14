import { useState } from 'react';

/** TH / EN segmented switch (presentation only for now). */
export function LangToggle() {
  const [lang, setLang] = useState<'TH' | 'EN'>('TH');
  return (
    <span role="group" aria-label="ภาษา" className="lang-toggle">
      {(['TH', 'EN'] as const).map((l) => (
        <button key={l} aria-pressed={lang === l ? 'true' : 'false'} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
          {l}
        </button>
      ))}
    </span>
  );
}
