import React, { useState } from 'react';

const S = {
  aside: {
    width: '300px',
    minWidth: '300px',
    background: '#1e1e22',
    borderRight: '1px solid #26262b',
    display: 'flex',
    flexDirection: 'column',
    padding: '1rem',
    gap: '1rem',
    overflowY: 'auto',
  },
  label: {
    fontSize: '0.65rem',
    fontWeight: 700,
    color: '#cba6f7',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '0.3rem',
    display: 'block',
  },
  textarea: {
    width: '100%',
    height: '90px',
    background: '#17171a',
    border: '1px solid #26262b',
    borderRadius: '4px',
    color: '#eae8ee',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.75rem',
    padding: '0.5rem',
    resize: 'vertical',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  btn: (disabled) => ({
    width: '100%',
    padding: '0.5rem',
    background: disabled ? 'rgba(203,166,247,0.05)' : 'rgba(203,166,247,0.12)',
    border: '1px solid rgba(203,166,247,0.25)',
    color: disabled ? '#585b70' : '#cba6f7',
    borderRadius: '4px',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.75rem',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s',
  }),
  statusMap: {
    idle:    { color: 'transparent' },
    loading: { color: '#f9e2af' },
    success: { color: '#a6e3a1' },
    error:   { color: '#f38ba8' },
  },
  stat: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.7rem',
    padding: '0.25rem 0',
    borderBottom: '1px solid #26262b',
    color: '#908f96',
  },
  statVal: {
    color: '#eae8ee',
    fontWeight: 600,
  },
  divider: {
    borderTop: '1px solid #26262b',
    marginTop: '0.5rem',
  },
  legend: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
    fontSize: '0.68rem',
  },
  legendItem: (color) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#908f96',
  }),
  legendDot: (color) => ({
    width: '10px',
    height: '2px',
    background: color,
    borderRadius: '1px',
    flexShrink: 0,
  }),
};

export default function LeftPanel({ onGenerate, status, message, cfgData }) {
  const [input, setInput] = useState('');
  const isLoading = status === 'loading';

  return (
    <aside style={S.aside}>

      {/* Logo / title */}
      <div style={{ paddingBottom: '0.5rem', borderBottom: '1px solid #26262b' }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#cba6f7', letterSpacing: '0.04em' }}>
          Pythia Visualizer
        </div>
        <div style={{ fontSize: '0.65rem', color: '#908f96', marginTop: '2px' }}>
          EVM Control-Flow Graph
        </div>
      </div>

      {/* Input */}
      <div>
        <label style={S.label}>Contract Address or Bytecode</label>
        <textarea
          style={S.textarea}
          placeholder={'0x1234…  — Ethereum address\nor raw bytecode hex'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={(e) => { e.target.style.borderColor = '#cba6f7'; }}
          onBlur={(e)  => { e.target.style.borderColor = '#26262b'; }}
          disabled={isLoading}
        />
        <button
          style={S.btn(isLoading || !input.trim())}
          disabled={isLoading || !input.trim()}
          onClick={() => onGenerate(input.trim())}
        >
          {isLoading ? '⏳  Analyzing…' : '▶  Generate Graph'}
        </button>

        {message && (
          <p style={{
            fontSize: '0.67rem',
            marginTop: '0.4rem',
            color: S.statusMap[status]?.color || '#908f96',
            lineHeight: 1.5,
          }}>
            {message}
          </p>
        )}
      </div>

      {/* Stats — only when we have data */}
      {cfgData && (
        <>
          <div style={S.divider} />
          <div>
            <label style={S.label}>Analysis Stats</label>
            <div style={S.stat}>
              <span>Blocks</span>
              <span style={S.statVal}>{cfgData.blocks.length}</span>
            </div>
            <div style={S.stat}>
              <span>Edges</span>
              <span style={S.statVal}>{cfgData.edges.length}</span>
            </div>
            <div style={{ ...S.stat, border: 'none' }}>
              <span>Instructions</span>
              <span style={S.statVal}>
                {cfgData.blocks.reduce((s, b) => s + b.instructions.length, 0)}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Legend */}
      <div style={S.divider} />
      <div>
        <label style={S.label}>Edge Legend</label>
        <div style={S.legend}>
          {[
            ['JUMP',        '#89b4fa', 'Unconditional jump'],
            ['JUMPI true',  '#a6e3a1', 'Conditional — taken'],
            ['JUMPI false', '#f38ba8', 'Conditional — not taken'],
            ['Dynamic',     '#cba6f7', 'Jump to computed target'],
          ].map(([label, color, desc]) => (
            <div key={label} style={S.legendItem(color)}>
              <div style={S.legendDot(color)} />
              <span style={{ color: '#eae8ee', minWidth: '70px' }}>{label}</span>
              <span style={{ opacity: 0.6 }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Links */}
      <div style={{ marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid #26262b' }}>
        <a
          href="https://github.com/yukhyShell5/pythia"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: '0.68rem', color: '#908f96', display: 'block' }}
        >
          ↗ yukhyShell5/pythia
        </a>
      </div>

    </aside>
  );
}
