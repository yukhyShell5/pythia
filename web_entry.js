const { Buffer } = require('buffer');
window.Buffer = Buffer;
const { initZ3 } = require('./src/state.js');
const { SymbolicEngine } = require('./src/engine.js');
const { CFGExporter } = require('./src/exporter.js');
const { Disassembler } = require('./src/disassembler.js');
const { fetchBytecode } = require('./src/fetcher.js');

// Export globally for browser usage
window.Pythia = {
    initZ3,
    SymbolicEngine,

    generateDOT: async (input) => {
        let bytecodeHex = input;

        // Fetch bytecode if an Ethereum address is provided
        if (input.startsWith('0x') && input.length === 42) {
            bytecodeHex = await fetchBytecode(input, 'https://eth.meowrpc.com');
        }

        // Strip 0x prefix if present
        bytecodeHex = bytecodeHex.replace(/^0x/, '');

        // Run symbolic engine
        const z3 = await initZ3(100);
        const engine = new SymbolicEngine(bytecodeHex, z3, 5000, 1);
        await engine.run();

        // Resolve 4byte signatures for labels (best-effort, no crash if fails)
        try {
            await Disassembler.resolveSignatures(engine.basicBlocks);
        } catch (e) {}

        // Build the CFG exporter with the correct arguments
        const exporter = new CFGExporter(engine.cfgEdges, engine.basicBlocks);
        exporter.pruneUnreachable();

        return exporter.toDot();
    }
};
