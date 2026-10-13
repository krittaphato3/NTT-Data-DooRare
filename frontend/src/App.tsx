import { useState } from 'react';
import { AlertsPanel } from './components/AlertsPanel';
import { BottomRow } from './components/BottomRow';
import { Footer } from './components/Footer';
import { KpiRow } from './components/KpiRow';
import { MiddleRow } from './components/MiddleRow';
import { PageHeader } from './components/PageHeader';
import { RequestStatusPanel } from './components/RequestStatusPanel';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';

function initialRole(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('role') === 'Admin';
  } catch {
    return false;
  }
}

export default function App() {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [hospital, setHospital] = useState('ทุกโรงพยาบาล (12)');
  const [isAdmin] = useState(initialRole);

  return (
    <div
      className={collapsed ? 'shell shell-collapsed' : 'shell'}
      style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'stretch', width: '100%', minHeight: '100vh', background: '#F5F8FC', fontFamily: "'Noto Sans Thai', 'IBM Plex Sans Thai', Inter, system-ui, sans-serif", color: '#475569', fontSize: 14, lineHeight: '22px' }}
    >
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="content" style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar query={query} onQuery={setQuery} isAdmin={isAdmin} />
        <main className="mainpad">
          <PageHeader isAdmin={isAdmin} hospital={hospital} onHospital={setHospital} />
          <KpiRow />
          <section style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' }}>
            <AlertsPanel query={query} hospital={hospital} />
            <RequestStatusPanel query={query} hospital={hospital} />
          </section>
          <MiddleRow />
          <BottomRow />
        </main>
        <Footer isAdmin={isAdmin} />
      </div>
    </div>
  );
}
