import React from 'react';
import CFGViewer from './components/CFGViewer';
import LeftPanel from './components/LeftPanel';
import { usePythia } from './hooks/usePythia';

export default function App() {
  const { generate, status, message, cfgData } = usePythia();

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <LeftPanel
        onGenerate={generate}
        status={status}
        message={message}
        cfgData={cfgData}
      />
      <main style={{ flex: 1, position: 'relative', background: 'var(--background)' }}>
        {cfgData ? (
          <CFGViewer blocks={cfgData.blocks} edges={cfgData.edges} />
        ) : (
          <div className="cfg-empty">
            <div className="icon">◇</div>
            <p>{status === 'loading' ? 'Initializing Z3 & Generating Graph…' : 'Enter an address or bytecode and click Generate'}</p>
          </div>
        )}
      </main>
    </div>
  );
}
