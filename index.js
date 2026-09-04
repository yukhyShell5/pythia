#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { initZ3 } = require('./src/state.js');
const { SymbolicEngine } = require('./src/engine.js');
const { CFGExporter } = require('./src/exporter.js');
const { execSync } = require('child_process');

// Relance automatique du script avec le flag --expose-gc pour protéger la RAM WebAssembly
if (!global.gc && !process.env.PYTHIA_GC_RESPAWN) {
    process.env.PYTHIA_GC_RESPAWN = '1';
    try {
        execSync(`node --expose-gc "${__filename}" ${process.argv.slice(2).join(' ')}`, { stdio: 'inherit' });
        process.exit(0);
    } catch (e) {
        process.exit(e.status || 1);
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
        const helpText = `
Pythia EVM Analyzer v1.0.0
Symbolic Execution Engine & CFG Generator

Usage:
  node index.js <command> [input] [options]

Commands:
  cfg             Generate a Control Flow Graph from EVM bytecode

Arguments:
  input           Path to a hex file or raw hex string (required for 'cfg')

Options:
  --format        Output format: 'dot', 'json', or 'both' (default: both)
  --out           Base name for the output file(s) (default: cfg_output)
  --max-depth     Max depth for symbolic exploration (default: 5000)
  --z3-timeout    Timeout for the Z3 solver in ms (default: 100)
  --prune         Remove unreachable basic blocks from the graph
  -h, --help      Show this help message

Examples:
  node index.js cfg ./smart-contract/weth.hex --format dot --out weth_cfg --prune
  node index.js cfg 6000355600005b00 --max-depth 1000
`;
        console.log(helpText);
        process.exit(0);
    }

    const command = args[0];
    if (command !== 'cfg') {
        console.error(`[-] Error: Unknown command '${command}'. Currently only 'cfg' is supported.`);
        process.exit(1);
    }

    if (args.length < 2) {
        console.error("[-] Error: Missing bytecode or file argument for 'cfg' command.");
        process.exit(1);
    }

    // 1. Récupération du bytecode (depuis un fichier ou directement en argument)
    let bytecodeInput = args[1];
    let bytecodeHex = "";

    const isPathLike = bytecodeInput.includes(path.sep) || bytecodeInput.includes('/') || bytecodeInput.endsWith('.hex') || bytecodeInput.endsWith('.bin');

    if (isPathLike) {
        if (!fs.existsSync(bytecodeInput)) {
            console.error(`[-] Error: File not found at path: ${bytecodeInput}`);
            process.exit(1);
        }
        console.log(`[+] Reading bytecode from file: ${bytecodeInput}`);
        bytecodeHex = fs.readFileSync(bytecodeInput, 'utf8').trim();
    } else {
        if (fs.existsSync(bytecodeInput)) {
            console.log(`[+] Reading bytecode from file: ${bytecodeInput}`);
            bytecodeHex = fs.readFileSync(bytecodeInput, 'utf8').trim();
        } else {
            console.log(`[+] Reading bytecode from command line argument.`);
            bytecodeHex = bytecodeInput.trim();
            // Basic validation to ensure it's actually hex
            if (!/^[0-9a-fA-F]+$/.test(bytecodeHex.replace(/^0x/, ''))) {
                 console.error(`[-] Error: The provided input is neither a valid file path nor valid hex bytecode.`);
                 process.exit(1);
            }
        }
    }

    // 2. Parsing des arguments optionnels
    let format = 'both'; // par défaut
    const formatIndex = args.indexOf('--format');
    if (formatIndex !== -1 && args[formatIndex + 1]) {
        format = args[formatIndex + 1].toLowerCase();
    }

    let outName = 'cfg_output';
    const outIndex = args.indexOf('--out');
    if (outIndex !== -1 && args[outIndex + 1]) {
        outName = args[outIndex + 1];
    }

    let maxDepth = 5000;
    const depthIndex = args.indexOf('--max-depth');
    if (depthIndex !== -1 && args[depthIndex + 1]) {
        const parsed = parseInt(args[depthIndex + 1], 10);
        if (!isNaN(parsed)) {
            maxDepth = parsed;
        }
    }

    let z3Timeout = 100;
    const timeoutIndex = args.indexOf('--z3-timeout');
    if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
        const parsed = parseInt(args[timeoutIndex + 1], 10);
        if (!isNaN(parsed)) {
            z3Timeout = parsed;
        }
    }

    let prune = args.includes('--prune');

    // 3. Préparation du dossier de sortie (out/)
    const outDir = path.join(__dirname, 'out');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
    }

    // 4. Lancement du moteur Z3
    console.log("[+] Initializing Z3 solver...");
    const z3 = await initZ3(z3Timeout);

    console.log("[+] Running symbolic exploration (this may take a while on large contracts)...");
    
    // On met la limite de profondeur choisie (par défaut 5000)
    const engine = new SymbolicEngine(bytecodeHex, z3, maxDepth); 
    await engine.run();

    console.log(`[+] Exploration complete!`);
    // 5. Exportation
    const exporter = new CFGExporter(engine.cfgEdges, engine.basicBlocks);
    
    if (prune) {
        exporter.pruneUnreachable();
    }

    console.log(`   - Basic Blocks found: ${exporter.blocks.length}`);
    console.log(`   - Edges generated: ${exporter.edges.length}`);
    const outPrefix = path.join(outDir, outName);

    if (format === 'json' || format === 'both') {
        const jsonPath = `${outPrefix}.json`;
        fs.writeFileSync(jsonPath, exporter.toJson(), 'utf8');
        console.log(`[+] Exported JSON: ${jsonPath}`);
    }
    
    if (format === 'dot' || format === 'both') {
        const dotPath = `${outPrefix}.dot`;
        fs.writeFileSync(dotPath, exporter.toDot(), 'utf8');
        console.log(`[+] Exported DOT: ${dotPath}`);
    }

    console.log("[+] Finished successfully.");
    process.exit(0);
}

main().catch(err => {
    console.error("[-] Fatal engine error:", err);
    process.exit(1);
});
