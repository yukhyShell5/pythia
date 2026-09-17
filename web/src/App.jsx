import React from 'react';
import CFGViewer from './components/CFGViewer';
import LeftPanel from './components/LeftPanel';
import { usePythia } from './hooks/usePythia';

// Demo CFG shown on first load
const DEMO_BLOCKS = [
  { startPc: 0,  instructions: [{ pc: 0, mnemonic: 'PUSH1', data: '0x80' }, { pc: 2, mnemonic: 'PUSH1', data: '0x40' }, { pc: 4, mnemonic: 'MSTORE' }, { pc: 5, mnemonic: 'CALLDATASIZE' }, { pc: 6, mnemonic: 'JUMPI', data: '→ 0x000A' }] },
  { startPc: 10, instructions: [{ pc: 10, mnemonic: 'JUMPDEST' }, { pc: 11, mnemonic: 'CALLDATALOAD', data: '0x00' }, { pc: 12, mnemonic: 'PUSH1', data: '0xe0' }, { pc: 14, mnemonic: 'SHR' }, { pc: 15, mnemonic: 'JUMPI', data: '→ 0x0020', comment: 'selector check' }] },
  { startPc: 32, instructions: [{ pc: 32, mnemonic: 'JUMPDEST' }, { pc: 33, mnemonic: 'SLOAD', data: '0x00' }, { pc: 34, mnemonic: 'CALLER' }, { pc: 35, mnemonic: 'REVERT' }] },
  { startPc: 40, instructions: [{ pc: 40, mnemonic: 'JUMPDEST' }, { pc: 41, mnemonic: 'STOP' }] },
];

const DEMO_EDGES = [
  { from: 0,  to: 10, type: 'JUMPI_TRUE' },
  { from: 0,  to: 40, type: 'JUMPI_FALSE' },
  { from: 10, to: 32, type: 'JUMPI_TRUE' },
  { from: 10, to: 40, type: 'JUMPI_FALSE' },
];

export default function App() {
  const { generate, status, message, cfgData } = usePythia();

  const blocks = cfgData?.blocks ?? DEMO_BLOCKS;
  const edges  = cfgData?.edges  ?? DEMO_EDGES;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <LeftPanel
        onGenerate={generate}
        status={status}
        message={message}
        cfgData={cfgData}
      />
      <main style={{ flex: 1, position: 'relative' }}>
        <CFGViewer blocks={blocks} edges={edges} />
      </main>
    </div>
  );
}
