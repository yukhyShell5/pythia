const { CFGExporter } = require('./src/exporter.js');
const { PseudoDecompiler } = require('./src/pseudo_decompiler.js');
const { SymbolicEngine } = require('./src/engine.js');
const { initZ3 } = require('./src/state.js');
const fs = require('fs');

async function test() {
    const bytecodeHex = fs.readFileSync('./smart-contract/weth.hex', 'utf8').trim();
    const z3 = await initZ3(100);
    const engine = new SymbolicEngine(bytecodeHex, z3, 500); 
    await engine.run();
    
    const { Disassembler } = require('./src/disassembler.js');
    await Disassembler.resolveSignatures(engine.basicBlocks);

    const exporter = new CFGExporter(engine.cfgEdges, engine.basicBlocks);
    exporter.pruneUnreachable();
    
    const decompiler = new PseudoDecompiler(exporter.blocks, exporter.edges);
    const code = decompiler.decompile();
    console.log(code.substring(0, 1500));
    process.exit(0);
}
test();
