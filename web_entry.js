const { initZ3 } = require('./src/state.js');
const { SymbolicEngine } = require('./src/engine.js');
const { CFGExporter } = require('./src/exporter.js');
const { fetchBytecode } = require('./src/fetcher.js');

// Export globally for browser usage
window.Pythia = {
    initZ3,
    SymbolicEngine,
    // Expose a helper to generate DOT string directly
    generateDOT: async (input) => {
        let bytecodeHex = input;
        if (input.startsWith('0x') && input.length === 42) {
            bytecodeHex = await fetchBytecode(input, 'https://eth.meowrpc.com');
        }
        
        const z3 = await initZ3(100);
        const engine = new SymbolicEngine(bytecodeHex, z3, 5000, 1);
        await engine.run();
        
        // Custom simple DOT generator that doesn't use fs
        const exporter = new CFGExporter(engine);
        // We bypass the file writing of exporter and just call toDot()
        return exporter.toDot();
    }
};
