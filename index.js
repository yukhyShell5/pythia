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
  disasm          Disassemble EVM bytecode into readable instructions
  abi             Decompile EVM bytecode into a standard JSON ABI

Arguments:
  input           Path to a hex file or raw hex string (required)

Options:
  --format        Output format: 'dot', 'json', or 'both' (default: both)
  --out           Base name for the output file(s) (default: cfg_output)
  --max-depth     Max depth for symbolic exploration (default: 5000)
  --z3-timeout    Timeout for the Z3 solver in ms (default: 100)
  --prune         Remove unreachable basic blocks from the graph
  --4bytes        Resolve 4-byte function signatures (disasm command)
  -h, --help      Show this help message

Examples:
  node index.js cfg ./smart-contract/weth.hex --format dot --out weth_cfg --prune
  node index.js disasm ./smart-contract/weth.hex --4bytes
  node index.js abi ./smart-contract/weth.hex
`;
        console.log(helpText);
        process.exit(0);
    }

    const command = args[0];
    if (!['cfg', 'disasm', 'abi'].includes(command)) {
        console.error(`[-] Error: Unknown command '${command}'. Supported commands are 'cfg', 'disasm', and 'abi'.`);
        process.exit(1);
    }

    if (args.length < 2) {
        console.error(`[-] Error: Missing bytecode or file argument for '${command}' command.`);
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
        if (global.logLevel >= 1) console.log(`[+] Reading bytecode from file: ${bytecodeInput}`);
        bytecodeHex = fs.readFileSync(bytecodeInput, 'utf8').trim();
    } else {
        if (fs.existsSync(bytecodeInput)) {
            if (global.logLevel >= 1) console.log(`[+] Reading bytecode from file: ${bytecodeInput}`);
            bytecodeHex = fs.readFileSync(bytecodeInput, 'utf8').trim();
        } else {
            if (global.logLevel >= 1) console.log(`[+] Reading bytecode from command line argument.`);
            bytecodeHex = bytecodeInput.trim();
            // Basic validation to ensure it's actually hex
            if (!/^[0-9a-fA-F]+$/.test(bytecodeHex.replace(/^0x/, ''))) {
                 console.error(`[-] Error: The provided input is neither a valid file path nor valid hex bytecode.`);
                 process.exit(1);
            }
        }
    }

    const resolve4Bytes = args.includes('--4bytes');

    if (command === 'disasm') {
        const { Disassembler } = require('./src/disassembler.js');
        const cleanHex = bytecodeHex.replace(/^0x/, '');
        const bytecode = Buffer.from(cleanHex, 'hex');
        
        // Un disassembler linéaire n'a pas forcément les jumpdests dynamiques complets sans Z3,
        // mais on peut extraire statiquement les JUMPDEST pour la découpe basique.
        const validJumpDests = new Set();
        for (let i = 0; i < bytecode.length; i++) {
            if (bytecode[i] === 0x5b) validJumpDests.add(i);
            else if (bytecode[i] >= 0x60 && bytecode[i] <= 0x7f) i += (bytecode[i] - 0x60) + 1;
        }

        const blocks = Disassembler.buildBasicBlocks(bytecode, validJumpDests, bytecode.length);
        
        // On résout toujours les signatures par défaut
        if (global.logLevel >= 1) console.log("[+] Resolving 4-byte signatures...");
        await Disassembler.resolveSignatures(blocks);

        console.log("=== EVM Disassembly ===");
        let foundSelectors = 0;
        
        for (const block of blocks) {
            let blockHeaderPrinted = false;
            
            for (const ins of block.instructions) {
                // Si le flag --4bytes est utilisé comme filtre, on ne garde que les sélecteurs
                if (resolve4Bytes && !ins.isSelector) continue;
                
                if (!blockHeaderPrinted && !resolve4Bytes) {
                    console.log(`\n[Block @ 0x${block.startPc.toString(16).padStart(4, '0')}]`);
                    blockHeaderPrinted = true;
                }

                const hexPc = ins.pc.toString(16).padStart(4, '0').toUpperCase();
                let line = `  0x${hexPc}  ${ins.mnemonic}`;
                if (ins.data) line += ` ${ins.data}`;
                if (ins.comment) {
                    line += `\t// ${ins.comment}`;
                } else if (ins.isSelector) {
                    line += `\t// Unknown Signature`;
                }
                console.log(line);
                if (ins.isSelector) foundSelectors++;
            }
        }
        
        if (resolve4Bytes) {
            console.log(`\n[+] Found ${foundSelectors} function selectors.`);
        }
        
        process.exit(0);
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

    let logLevel = 0;
    const logIndex = args.indexOf('--log-level');
    if (logIndex !== -1 && args[logIndex + 1]) {
        const parsed = parseInt(args[logIndex + 1], 10);
        if (!isNaN(parsed)) {
            logLevel = parsed;
        }
    }
    global.logLevel = logLevel;

    if (command === 'cfg' || command === 'abi') {
        // 3. Préparation du dossier de sortie (out/)
        const outDir = path.join(__dirname, 'out');
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir);
        }

        // 4. Lancement du moteur Z3
        if (logLevel >= 1) console.log("[+] Initializing Z3 solver...");
        const z3 = await initZ3(z3Timeout);

        if (logLevel >= 1) console.log("[+] Running symbolic exploration (this may take a while on large contracts)...");
        
        // On met la limite de profondeur choisie (par défaut 5000)
        const engine = new SymbolicEngine(bytecodeHex, z3, maxDepth); 
        await engine.run();

        if (logLevel >= 1) console.log(`[+] Exploration complete!`);
        
        if (logLevel >= 1) console.log("[+] Resolving 4-byte signatures...");
        const { Disassembler } = require('./src/disassembler.js');
        await Disassembler.resolveSignatures(engine.basicBlocks);

        if (command === 'cfg') {
            // 5. Exportation CFG
            const exporter = new CFGExporter(engine.cfgEdges, engine.basicBlocks);
            
            if (prune) {
                exporter.pruneUnreachable();
            }

            if (logLevel >= 1) {
                console.log(`   - Basic Blocks found: ${exporter.blocks.length}`);
                console.log(`   - Edges generated: ${exporter.edges.length}`);
            }
            const outPrefix = path.join(outDir, outName);

            if (format === 'json' || format === 'both') {
                const jsonPath = `${outPrefix}.json`;
                fs.writeFileSync(jsonPath, exporter.toJson(), 'utf8');
                if (logLevel >= 0) console.log(`[+] Exported JSON: ${jsonPath}`);
            }

            if (format === 'dot' || format === 'both') {
                const dotPath = `${outPrefix}.dot`;
                fs.writeFileSync(dotPath, exporter.toDot(), 'utf8');
                if (logLevel >= 0) console.log(`[+] Exported DOT: ${dotPath}`);
            }
        } else if (command === 'abi') {
            // 5. Décompilation ABI
            const { ABIDecompiler } = require('./src/decompiler.js');
            const exporter = new CFGExporter(engine.cfgEdges, engine.basicBlocks);
            
            if (prune) {
                exporter.pruneUnreachable();
            }

            if (logLevel >= 1) console.log("[+] Inferring ABI from execution paths...");
            const decompiler = new ABIDecompiler(exporter.blocks, exporter.edges);
            const abi = await decompiler.generateABI();

            const outPrefix = path.join(outDir, outName);
            const abiPath = `${outPrefix}.abi.json`;
            fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2), 'utf8');
            
            if (logLevel >= 0) console.log(`[+] Exported ABI: ${abiPath}`);
            if (logLevel >= 1) console.log(`   - Functions inferred: ${abi.length}`);
        }

        if (logLevel >= 0) console.log(`[+] Finished successfully.`);
    }
    process.exit(0);
}

main().catch(err => {
    console.error("[-] Fatal engine error:", err);
    process.exit(1);
});
