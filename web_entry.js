const { Buffer } = require('buffer');
globalThis.Buffer = Buffer;

const { initZ3 }     = require('./src/state.js');
const { SymbolicEngine } = require('./src/engine.js');
const { CFGExporter }    = require('./src/exporter.js');
const { Disassembler }   = require('./src/disassembler.js');
const { fetchBytecode }  = require('./src/fetcher.js');

/**
 * Normalise input → clean hex bytecode string.
 */
async function resolveBytecode(input) {
    const trimmed = input.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
        return fetchBytecode(trimmed, 'https://eth.meowrpc.com');
    }
    return trimmed.replace(/^0x/, '');
}

/**
 * Run the Pythia symbolic engine and return raw CFG data
 * (blocks + edges) ready for the React/ReactFlow frontend.
 */
async function generateCFG(input) {
    const bytecodeHex = await resolveBytecode(input);

    const z3     = await initZ3(120);
    const engine = new SymbolicEngine(bytecodeHex, z3, 8000, 1);
    await engine.run();

    try { await Disassembler.resolveSignatures(engine.basicBlocks); } catch (_) {}

    const exporter = new CFGExporter(engine.cfgEdges, engine.basicBlocks);
    exporter.pruneUnreachable();

    return {
        blocks: exporter.blocks,   // Array<BasicBlock>  { startPc, instructions[] }
        edges:  exporter.edges,    // Array<Edge>        { from, to, type }
    };
}

// Expose on globalThis so importScripts() in a Worker can access it
globalThis.Pythia = { generateCFG };
