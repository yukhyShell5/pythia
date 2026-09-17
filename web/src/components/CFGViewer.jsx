import React from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_W          = 280;
const NODE_H_PER_LINE = 17;
const NODE_HEADER     = 44;
const NODE_PADDING    = 14;

function nodeHeight(lineCount) {
  return NODE_HEADER + lineCount * NODE_H_PER_LINE + NODE_PADDING;
}

// ─── Opcode syntax highlighting ───────────────────────────────────────────────

const OPCODE_COLORS = {
  PUSH:         '#cba6f7',
  JUMP:         '#f38ba8',
  JUMPI:        '#89b4fa',
  JUMPDEST:     '#f9e2af',
  STOP:         '#f38ba8',
  REVERT:       '#f38ba8',
  RETURN:       '#f38ba8',
  INVALID:      '#f38ba8',
  SELFDESTRUCT: '#f38ba8',
  SSTORE:       '#a6e3a1',
  SLOAD:        '#a6e3a1',
  TSTORE:       '#94e2d5',
  TLOAD:        '#94e2d5',
  MSTORE:       '#89b4fa',
  MLOAD:        '#89b4fa',
  CALL:         '#fab387',
  STATICCALL:   '#fab387',
  DELEGATECALL: '#f38ba8',
  CALLCODE:     '#f38ba8',
  CREATE:       '#cba6f7',
  CREATE2:      '#cba6f7',
  SHA3:         '#94e2d5',
  CALLER:       '#eba0ac',
  ORIGIN:       '#eba0ac',
  CALLDATALOAD: '#fab387',
  CALLDATACOPY: '#fab387',
  LOG:          '#b4befe',
};

function opcodeColor(mnemonic) {
  const upper = (mnemonic || '').toUpperCase();
  for (const [prefix, color] of Object.entries(OPCODE_COLORS)) {
    if (upper.startsWith(prefix)) return color;
  }
  return '#908f96';
}

// ─── Edge helpers ─────────────────────────────────────────────────────────────

function edgeColor(type) {
  switch (type) {
    case 'JUMPI_TRUE':    return '#a6e3a1';
    case 'JUMPI_FALSE':   return '#f38ba8';
    case 'JUMP':          return '#89b4fa';
    case 'JUMP_DYNAMIC':  return '#cba6f7';
    default:              return '#585b70';
  }
}

// ─── Dagre layout ─────────────────────────────────────────────────────────────

function layoutGraph(blocks, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70 });

  const flowNodes = blocks.map((b) => {
    const h = nodeHeight(b.instructions.length);
    g.setNode(String(b.startPc), { width: NODE_W, height: h });
    return {
      id: String(b.startPc),
      type: 'blockNode',
      position: { x: 0, y: 0 },
      data: { block: b, nodeH: h },
    };
  });

  const seen = new Set();
  const flowEdges = edges
    .filter((e) => {
      const key = `${e.from}->${e.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((e) => {
      g.setEdge(String(e.from), String(e.to));
      const color = edgeColor(e.type);
      return {
        id: `e${e.from}-${e.to}-${e.type}`,
        source: String(e.from),
        target: String(e.to),
        label: e.type,
        style: { stroke: color, strokeWidth: 1.5 },
        labelStyle: { fill: color, fontSize: 9, fontFamily: 'JetBrains Mono' },
        labelBgStyle: { fill: '#1e1e22', fillOpacity: 0.9 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 12,
          height: 12,
        },
      };
    });

  dagre.layout(g);

  const layoutedNodes = flowNodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      position: {
        x: pos.x - NODE_W / 2,
        y: pos.y - n.data.nodeH / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges: flowEdges };
}

// ─── Block Node component ──────────────────────────────────────────────────────

function BlockNode({ data }) {
  const { block } = data;
  const pcHex = '0x' + block.startPc.toString(16).toUpperCase().padStart(4, '0');

  return (
    <div
      style={{
        width: NODE_W,
        background: '#1e1e22',
        border: '1px solid #313137',
        borderRadius: '6px',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '10.5px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#cba6f7';
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(203,166,247,0.12)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#313137';
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.35)';
      }}
    >
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 10px',
        background: 'rgba(203,166,247,0.06)',
        borderBottom: '1px solid #26262b',
      }}>
        <span style={{ fontWeight: 700, color: '#eae8ee', fontSize: '10px', letterSpacing: '0.03em' }}>
          Block {pcHex}
        </span>
        <span style={{
          fontSize: '9px',
          color: '#908f96',
          border: '1px solid #35353d',
          borderRadius: '3px',
          padding: '1px 5px',
        }}>
          {block.instructions.length} ops
        </span>
      </div>

      {/* Instructions */}
      <div style={{ padding: '6px 10px 8px' }}>
        {block.instructions.map((ins, i) => {
          const hexPc = ins.pc.toString(16).padStart(4, '0').toUpperCase();
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: '6px',
                lineHeight: '1.5',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <span style={{ color: '#44475a', minWidth: '36px', userSelect: 'none' }}>
                {hexPc}
              </span>
              <span style={{ color: opcodeColor(ins.mnemonic), fontWeight: 500 }}>
                {ins.mnemonic}
              </span>
              {ins.data && (
                <span style={{ color: '#6272a4', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ins.data}
                </span>
              )}
              {ins.comment && (
                <span style={{ color: '#908f96', opacity: 0.7 }}>
                  // {ins.comment}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  );
}

const nodeTypes = { blockNode: BlockNode };

// ─── Main CFGViewer component ─────────────────────────────────────────────────

export default function CFGViewer({ blocks, edges }) {
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState([]);
  const [rfInstance, setRfInstance] = React.useState(null);

  React.useEffect(() => {
    if (!blocks || blocks.length === 0) return;
    const { nodes: n, edges: e } = layoutGraph(blocks, edges);
    setFlowNodes(n);
    setFlowEdges(e);
  }, [blocks, edges, setFlowNodes, setFlowEdges]);

  // Auto-fit on first load
  React.useEffect(() => {
    if (rfInstance && flowNodes.length > 0) {
      setTimeout(() => rfInstance.fitView({ padding: 0.12, duration: 500 }), 50);
    }
  }, [rfInstance, flowNodes.length]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={setRfInstance}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#26262b" gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={() => '#26262b'}
          maskColor="rgba(23,23,26,0.85)"
          style={{ background: '#1e1e22' }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
