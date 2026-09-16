#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { initZ3 } = require('./src/state.js');
const { SymbolicEngine } = require('./src/engine.js');
const { CFGExporter } = require('./src/exporter.js');
const { fetchBytecode } = require('./src/fetcher.js');
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
  ast             Generate the Abstract Syntax Tree (AST) JSON from CFG
  yul             Decompile EVM bytecode into Yul source code
  decompile       Decompile EVM bytecode into readable pseudo-code
  exploit         Generate Z3 PoC/calldata to reach a specific PC

Arguments:
  input           Path to hex file, raw hex, or 0x contract address (required)

Options:
  --format        Output format: 'dot', 'json', or 'both' (default: both)
  --rpc           RPC URL (default: https://eth.meowrpc.com)
  --out           Base name for the output file(s) (default: cfg_output)
  --max-depth     Max depth for symbolic exploration (default: 5000)
  --z3-timeout    Timeout for the Z3 solver in ms (default: 100)
  --prune         Remove unreachable basic blocks from the graph
  --4bytes        Resolve 4-byte function signatures (disasm command)
  --target        Target PC (in decimal) to generate exploit for (exploit command)
  -h, --help      Show this help message

Examples:
  node index.js cfg ./smart-contract/weth.hex --format dot --out weth_cfg --prune
  node index.js disasm ./smart-contract/weth.hex --4bytes
  node index.js abi ./smart-contract/weth.hex
  node index.js ast ./smart-contract/weth.hex
  node index.js yul ./smart-contract/weth.hex
  node index.js decompile ./smart-contract/weth.hex
`;
        console.log(helpText);
        process.exit(0);
    }

    const command = args[0];
    if (!['cfg', 'disasm', 'abi', 'ast', 'yul', 'decompile', 'exploit'].includes(command)) {
        console.error(`[-] Error: Unknown command '${command}'. Supported commands are 'cfg', 'disasm', 'abi', 'ast', 'yul', and 'decompile'.`);
        process.exit(1);
    }

    if (args.length < 2) {
        console.error(`[-] Error: Missing bytecode or file argument for '${command}' command.`);
        process.exit(1);
    }


    let logLevel = 0;
    const logIndex = args.indexOf('--log-level');
    if (logIndex !== -1 && args[logIndex + 1]) {
        const parsed = parseInt(args[logIndex + 1], 10);
        if (!isNaN(parsed)) logLevel = parsed;
    }
    global.logLevel = logLevel;

    let rpcUrl = "https://eth.meowrpc.com";
    const rpcIndex = args.indexOf('--rpc');
    if (rpcIndex !== -1 && args[rpcIndex + 1]) {
        rpcUrl = args[rpcIndex + 1];
    }

    // 1. Récupération du bytecode
    let bytecodeInput = args[1];
    let bytecodeHex = "";

    if (bytecodeInput.startsWith('0x') && bytecodeInput.length === 42) {
        try {
            bytecodeHex = await fetchBytecode(bytecodeInput, rpcUrl);
        } catch (e) {
            console.error(`[-] Erreur lors du téléchargement: ${e.message}`);
            process.exit(1);
        }
    } else {
        const isPathLike = bytecodeInput.includes(path.sep) || bytecodeInput.includes('/') || bytecodeInput.endsWith('.hex') || bytecodeInput.endsWith('.bin');
        if (isPathLike || fs.existsSync(bytecodeInput)) {
            if (!fs.existsSync(bytecodeInput)) {
                console.error(`[-] Error: File not found at path: ${bytecodeInput}`);
                process.exit(1);
            }
            if (global.logLevel >= 1) console.log(`[+] Reading bytecode from file: ${bytecodeInput}`);
            bytecodeHex = fs.readFileSync(bytecodeInput, 'utf8').trim();
        } else {
            if (global.logLevel >= 1) console.log(`[+] Reading bytecode from command line argument.`);
            bytecodeHex = bytecodeInput.trim();
            if (!/^[0-9a-fA-F]+$/.test(bytecodeHex.replace(/^0x/, ''))) {
                 console.error(`[-] Error: Invalid input (not an address, file, or hex string).`);
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



    if (command === 'cfg' || command === 'abi' || command === 'ast' || command === 'yul' || command === 'decompile' || command === 'exploit') {
        // 3. Préparation du dossier de sortie (out/)
        const outDir = path.join(__dirname, 'out');
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir);
        }

        // Parse target/txDepth BEFORE initialising Z3 so the timeout can be adjusted
        let targetPc = null;
        let txDepth  = 1;
        if (command === 'exploit') {
            const targetIndex = args.indexOf('--target');
            if (targetIndex === -1 || !args[targetIndex + 1]) {
                console.error("Erreur : --target <pc> est requis pour la commande exploit.");
                process.exit(1);
            }
            targetPc = parseInt(args[targetIndex + 1], 10);
            if (isNaN(targetPc)) {
                console.error("Erreur : --target doit être un nombre décimal valide.");
                process.exit(1);
            }
            const txDepthIndex = args.indexOf('--tx-depth');
            if (txDepthIndex !== -1 && args[txDepthIndex + 1]) {
                const parsed = parseInt(args[txDepthIndex + 1], 10);
                if (!isNaN(parsed) && parsed >= 1) txDepth = parsed;
            }
            // En mode multi-tx, les contraintes s'accumulent → on augmente le timeout Z3
            // si l'utilisateur n'a pas spécifié explicitement --z3-timeout
            if (txDepth > 1 && !args.includes('--z3-timeout')) {
                z3Timeout = 2000 * txDepth;
                if (logLevel >= 1) console.log(`[MultiTx] Timeout Z3 auto-ajusté à ${z3Timeout}ms pour tx-depth=${txDepth}`);
            }
            if (logLevel >= 1 && txDepth > 1) {
                console.log(`[MultiTx] Mode multi-transaction activé : profondeur = ${txDepth}`);
            }
        }

        // 4. Lancement du moteur Z3 (avec le bon timeout)
        if (logLevel >= 1) console.log("[+] Initializing Z3 solver...");
        const z3 = await initZ3(z3Timeout);

        if (logLevel >= 1) console.log("[+] Running symbolic exploration (this may take a while on large contracts)...");

        const engine = new SymbolicEngine(bytecodeHex, z3, maxDepth, txDepth);
        const poc = await engine.run(targetPc);

        
        if (command === 'exploit') {
            if (poc) {
                console.log("\n\x1b[32m[SUCCESS] Chemin vulnérable (SAT) vers PC " + targetPc + " trouvé !\x1b[0m");
                console.log("=== EXPLOIT / POC ===");
                console.log(JSON.stringify(poc, null, 2));
                console.log("=====================\n");
            } else {
                console.log("\n\x1b[31m[FAILED] Impossible de trouver un chemin (UNSAT) ou bloc inatteignable.\x1b[0m\n");
            }
            process.exit(0);
        }

        if (logLevel >= 1) console.log(`[+] Exploration complete!`);
        
        if (logLevel >= 1) console.log("[+] Resolving 4-byte signatures...");
        const { Disassembler } = require('./src/disassembler.js');
        await Disassembler.resolveSignatures(engine.basicBlocks);

    
    if (command === 'cfg') {
            // --- Enrichir le CFG avec le Pseudo-code ---
            const { PseudoDecompiler } = require('./src/pseudo_decompiler.js');
            const decompiler = new PseudoDecompiler(engine.basicBlocks, engine.cfgEdges);
            const { functionEntryPcs } = decompiler.identifyFunctions();
            decompiler.propagateStacks(functionEntryPcs);
            for (const block of engine.basicBlocks) {
                block.pseudoCode = decompiler.decompileBlock(block, 0).trim();
            }

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
        } else if (command === 'ast') {
            const { ASTBuilder } = require('./src/ast_builder.js');
            const exporter = new CFGExporter(engine.cfgEdges, engine.basicBlocks);
            if (prune) exporter.pruneUnreachable();

            if (logLevel >= 1) console.log("[+] Generating AST from CFG...");
            const builder = new ASTBuilder(exporter.blocks, exporter.edges);
            const ast = builder.build();

            const outPrefix = path.join(outDir, outName);
            const astPath = `${outPrefix}.ast.json`;
            fs.writeFileSync(astPath, JSON.stringify(ast, null, 2), 'utf8');
            if (logLevel >= 0) console.log(`[+] Exported AST: ${astPath}`);
        } else if (command === 'yul') {
            const { YulDecompiler } = require('./src/yul_decompiler.js');
            const exporter = new CFGExporter(engine.cfgEdges, engine.basicBlocks);
            if (prune) exporter.pruneUnreachable();

            if (logLevel >= 1) console.log("[+] Decompiling CFG to Yul...");
            const decompiler = new YulDecompiler(exporter.blocks, exporter.edges);
            const yulCode = decompiler.decompile();

            const outPrefix = path.join(outDir, outName);
            const yulPath = `${outPrefix}.yul`;
            fs.writeFileSync(yulPath, yulCode, 'utf8');
            if (logLevel >= 0) console.log(`[+] Exported Yul: ${yulPath}`);
        } else if (command === 'decompile') {
            const { PseudoDecompiler } = require('./src/pseudo_decompiler.js');
            const exporter = new CFGExporter(engine.cfgEdges, engine.basicBlocks);
            if (prune) exporter.pruneUnreachable();

            if (logLevel >= 1) console.log("[+] Decompiling CFG to pseudo-code...");
            const decompiler = new PseudoDecompiler(exporter.blocks, exporter.edges);
            const pseudoCode = decompiler.decompile();

            const outPrefix = path.join(outDir, outName);
            const pseudoPath = `${outPrefix}.pseudo.sol`;
            fs.writeFileSync(pseudoPath, pseudoCode, 'utf8');
            if (logLevel >= 0) console.log(`[+] Exported Pseudo-Code: ${pseudoPath}`);
        }

        if (logLevel >= 0) console.log(`[+] Finished successfully.`);
    }
    process.exit(0);
}

main().catch(err => {
    console.error("[-] Fatal engine error:", err);
    process.exit(1);
});
