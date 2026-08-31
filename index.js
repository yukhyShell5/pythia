const fs = require('fs');
const path = require('path');
const { initZ3 } = require('./src/state.js');
const { SymbolicEngine } = require('./src/engine.js');
const { CFGExporter } = require('./src/exporter.js');

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
        console.log("Usage: node index.js <hex_bytecode_or_file> [--format dot|json|both] [--out filename] [--max-depth integer] [--z3-timeout integer_ms] [--prune]");
        console.log("Example: node index.js 6000355600005b00 --format dot --out my_contract --max-depth 5000 --z3-timeout 100 --prune");
        process.exit(0);
    }

    // 1. Récupération du bytecode (depuis un fichier ou directement en argument)
    let bytecodeInput = args[0];
    let bytecodeHex = "";

    if (fs.existsSync(bytecodeInput)) {
        console.log(`[+] Reading bytecode from file: ${bytecodeInput}`);
        bytecodeHex = fs.readFileSync(bytecodeInput, 'utf8').trim();
    } else {
        console.log(`[+] Reading bytecode from command line argument.`);
        bytecodeHex = bytecodeInput.trim();
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
