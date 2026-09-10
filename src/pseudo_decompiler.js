const { ASTBuilder } = require('./ast_builder.js');

class PseudoDecompiler {
    constructor(blocks, edges) {
        this.blocks = blocks;
        this.edges = edges;
        this.astBuilder = new ASTBuilder(blocks, edges);
        this.blockStacks = new Map();
        this.blockMemory = new Map();
    }

    simplify(expr) {
        if (typeof expr !== 'string') return expr;
        let prev;
        do {
            prev = expr;
            // Basic arithmetic folding
            expr = expr.replace(/\(\((.*?)\) \+ (0x0+|0)\)/g, '($1)');
            expr = expr.replace(/\((0x0+|0) \+ \((.*?)\)\)/g, '($1)');
            expr = expr.replace(/\(([a-zA-Z0-9_\.[\]]+) \+ (0x0+|0)\)/g, '$1');
            expr = expr.replace(/\((0x0+|0) \+ ([a-zA-Z0-9_\.[\]]+)\)/g, '$1');
            
            // Boolean simplifications
            expr = expr.replace(/\((0x0+|0) == 0\)/g, '1');
            expr = expr.replace(/\((0x[1-9a-fA-F]+) == 0\)/g, '0');
            expr = expr.replace(/\(\((.*?) == 0\) == 0\)/g, '($1)'); // !!x -> x
            
            // msg.sig
            expr = expr.replace(/\(msg\.data\[0x0+\] \/ 0x0*100000000000000000000000000000000000000000000000000000000\)/g, 'msg.sig');
            
            // Type Inference: Addresses
            expr = expr.replace(/\(0xffffffffffffffffffffffffffffffffffffffff & (.*?)\)/g, 'address($1)');
            expr = expr.replace(/\((.*?) & 0xffffffffffffffffffffffffffffffffffffffff\)/g, 'address($1)');
            expr = expr.replace(/address\(address\((.*?)\)\)/g, 'address($1)');
            
            // Type Inference: Mappings
            expr = expr.replace(/storage\[mapping_(.*?)\]/g, 'mapping_$1');
            
            // Hex math
            expr = expr.replace(/\(0x([0-9a-fA-F]+) \+ 0x([0-9a-fA-F]+)\)/g, (match, a, b) => {
                return '0x' + (BigInt('0x'+a) + BigInt('0x'+b)).toString(16).padStart(2, '0');
            });
            expr = expr.replace(/\(0x([0-9a-fA-F]+) \- 0x([0-9a-fA-F]+)\)/g, (match, a, b) => {
                const res = BigInt('0x'+a) - BigInt('0x'+b);
                return res >= 0 ? '0x' + res.toString(16).padStart(2, '0') : match;
            });
            expr = expr.replace(/\(0x([0-9a-fA-F]+) \* 0x([0-9a-fA-F]+)\)/g, (match, a, b) => {
                return '0x' + (BigInt('0x'+a) * BigInt('0x'+b)).toString(16).padStart(2, '0');
            });
            
            if (expr.match(/^\([a-zA-Z0-9_\.[\]]+\)$/)) {
                expr = expr.substring(1, expr.length - 1);
            }
        } while (expr !== prev);
        return expr;
    }


    // Evaluates expression and updates stack/memory without generating side-effect code
    // Used for both stack propagation and expression building
    _evalInstruction(ins, stack, mem) {
        if (ins.opcode >= 0x60 && ins.opcode <= 0x7f) {
            stack.push(ins.data);
            return null;
        } else if (ins.opcode === 0x50) {
            stack.pop();
            return null;
        } else if (ins.opcode === 0x01 || ins.opcode === 0x02 || ins.opcode === 0x03 || ins.opcode === 0x04 || ins.opcode === 0x10 || ins.opcode === 0x11 || ins.opcode === 0x14 || ins.opcode === 0x16 || ins.opcode === 0x17) {
            const a = stack.pop() || 'loc_a';
            const b = stack.pop() || 'loc_b';
            let op = '+';
            if (ins.opcode === 0x02) op = '*';
            if (ins.opcode === 0x03) op = '-';
            if (ins.opcode === 0x04) op = '/';
            if (ins.opcode === 0x10) op = '<';
            if (ins.opcode === 0x11) op = '>';
            if (ins.opcode === 0x14) op = '==';
            if (ins.opcode === 0x16) op = '&';
            if (ins.opcode === 0x17) op = '|';
            stack.push(this.simplify('(' + a + ' ' + op + ' ' + b + ')'));
            return null;
        } else if (ins.opcode === 0x15) {
            const a = stack.pop() || 'loc_a';
            stack.push(this.simplify('(' + a + ' == 0)'));
            return null;
        } else if (ins.opcode === 0x20) { // SHA3
            const offset = stack.pop() || 'loc_offset';
            const length = stack.pop() || 'loc_len';
            if ((offset === '0x0' || offset === '0x00' || offset === '0') && (length === '0x40' || length === '64' || length === '0x0040')) {
                const mem0 = mem['0x0'] || mem['0x00'] || mem['0'] || 'unknown_key';
                const mem20 = mem['0x20'] || mem['0x0020'] || mem['32'] || 'unknown_slot';
                let slot = mem20;
                let key = mem0;
                if ((mem0.startsWith('0x') || !isNaN(Number(mem0))) && (!mem20.startsWith('0x') && isNaN(Number(mem20)))) {
                    slot = mem0;
                    key = mem20;
                }
                stack.push(this.simplify('mapping_' + slot + '[' + key + ']'));
            } else if ((offset === '0x0' || offset === '0x00' || offset === '0') && (length === '0x20' || length === '32' || length === '0x0020')) {
                const slot = mem['0x0'] || mem['0x00'] || mem['0'] || 'unknown_slot';
                stack.push(this.simplify('array_start_' + slot));
            } else {
                stack.push(this.simplify('keccak256(memory[' + offset + ':' + offset + '+' + length + '])'));
            }
            return null;
        } else if (ins.opcode === 0x30) {
            stack.push('address(this)');
            return null;
        } else if (ins.opcode === 0x31) {
            const addr = stack.pop() || 'loc_addr';
            stack.push(this.simplify(addr + '.balance'));
            return null;
        } else if (ins.opcode === 0x32) {
            stack.push('tx.origin');
            return null;
        } else if (ins.opcode === 0x33) {
            stack.push('msg.sender');
            return null;
        } else if (ins.opcode === 0x34) {
            stack.push('msg.value');
            return null;
        } else if (ins.opcode === 0x35) {
            const offset = stack.pop() || 'loc_offset';
            if (offset === '0x04' || offset === '0x4' || offset === '4') stack.push('arg0');
            else if (offset === '0x24' || offset === '36') stack.push('arg1');
            else if (offset === '0x44' || offset === '68') stack.push('arg2');
            else if (offset === '0x64' || offset === '100') stack.push('arg3');
            else stack.push(this.simplify('msg.data[' + offset + ']'));
            return null;
        } else if (ins.opcode === 0x36) {
            stack.push('msg.data.length');
            return null;
        } else if (ins.opcode === 0x51) { // MLOAD
            const offset = stack.pop() || 'loc_offset';
            stack.push(mem[offset] || this.simplify('memory[' + offset + ']'));
            return null;
        } else if (ins.opcode === 0x52) { // MSTORE
            const offset = stack.pop() || 'loc_offset';
            const value = stack.pop() || 'loc_val';
            mem[offset] = value;
            if (offset === '0x0' || offset === '0x00' || offset === '0' || offset === '0x20' || offset === '32' || offset === '0x0020' || offset === '0x40' || offset === '64' || offset === '0x0040') {
                return null;
            }
            return 'memory[' + offset + '] = ' + value + ';\n';
        } else if (ins.opcode === 0x54) { // SLOAD
            const key = stack.pop() || 'loc_key';
            stack.push(this.simplify('storage[' + key + ']'));
            return null;
        } else if (ins.opcode === 0x55) { // SSTORE
            const key = stack.pop() || 'loc_key';
            const value = stack.pop() || 'loc_val';
            return 'storage[' + key + '] = ' + value + ';\n';
        } else if (ins.opcode === 0xf3) { // RETURN
            const offset = stack.pop() || 'loc_offset';
            const length = stack.pop() || 'loc_len';
            let o = offset;
            let l = length;
            if(o.startsWith('0x') && l.startsWith('0x')) {
                const end = '0x' + (BigInt(o) + BigInt(l)).toString(16).padStart(2, '0');
                return 'return memory[' + offset + ':' + end + '];\n';
            } else {
                return 'return memory[' + offset + ':' + offset + '+' + length + '];\n';
            }
        } else if (ins.opcode === 0xfd) { // REVERT
            const offset = stack.pop() || 'loc_offset';
            const length = stack.pop() || 'loc_len';
            let o = offset;
            let l = length;
            if(o.startsWith('0x') && l.startsWith('0x')) {
                const end = '0x' + (BigInt(o) + BigInt(l)).toString(16).padStart(2, '0');
                return 'revert(memory[' + offset + ':' + end + ']);\n';
            } else {
                return 'revert(memory[' + offset + ':' + offset + '+' + length + ']);\n';
            }
        } else if (ins.opcode >= 0x80 && ins.opcode <= 0x8f) { // DUP
            const depth = ins.opcode - 0x80 + 1;
            if (stack.length >= depth) {
                stack.push(stack[stack.length - depth]);
            } else {
                stack.push('loc_dup' + depth);
            }
            return null;
        } else if (ins.opcode >= 0x90 && ins.opcode <= 0x9f) { // SWAP
            const depth = ins.opcode - 0x90 + 1;
            if (stack.length > depth) {
                const temp = stack[stack.length - 1];
                stack[stack.length - 1] = stack[stack.length - 1 - depth];
                stack[stack.length - 1 - depth] = temp;
            }
            return null;
        } else if (ins.opcode === 0x57) { // JUMPI
            const dest = stack.pop() || 'loc_dest';
            const cond = stack.pop() || 'loc_cond';
            return { type: 'jumpi', cond };
        } else if (ins.opcode === 0x56) { // JUMP
            const dest = stack.pop() || 'loc_dest';
            return 'goto PC_' + dest + ';\n';
        } else {
            const { getStackEffect } = require('./stack_effects.js');
            const effect = getStackEffect(ins.opcode);
            if (effect) {
                for(let i=0; i<effect[0]; i++) stack.pop();
                for(let i=0; i<effect[1]; i++) stack.push('op_' + ins.mnemonic + '()');
            }
            return null;
        }
    }

    propagateStacks(functionEntryPcs) {
        const queue = [];
        for (const entry of functionEntryPcs) {
            this.blockStacks.set(entry, []);
            this.blockMemory.set(entry, {});
            queue.push(entry);
        }
        this.blockStacks.set(0, []);
        this.blockMemory.set(0, {});
        queue.push(0);

        while (queue.length > 0) {
            const pc = queue.shift();
            const block = this.blocks.find(b => b.startPc === pc);
            if (!block) continue;
            
            const stack = [...(this.blockStacks.get(pc) || [])];
            const mem = {...(this.blockMemory.get(pc) || {})};
            
            for (const ins of block.instructions) {
                this._evalInstruction(ins, stack, mem);
            }
            
            for (const edge of this.edges) {
                if (edge.from === pc) {
                    if (!this.blockStacks.has(edge.to)) {
                        this.blockStacks.set(edge.to, [...stack]);
                        this.blockMemory.set(edge.to, {...mem});
                        queue.push(edge.to);
                    }
                }
            }
        }
    }

    decompileBlock(block, indentLevel = 1) {
        let code = '';
        const stack = [...(this.blockStacks.get(block.startPc) || [])];
        const mem = {...(this.blockMemory.get(block.startPc) || {})};
        const indent = '    '.repeat(indentLevel);

        for (const ins of block.instructions) {
            const res = this._evalInstruction(ins, stack, mem);
            if (typeof res === 'string') {
                code += indent + this.simplify(res);
            } else if (res && res.type === 'jumpi') {
                block.jumpCondition = res.cond;
            }
        }
        return code;
    }

    decompile() {
        const { functions, functionEntryPcs } = this.identifyFunctions();
        
        this.propagateStacks(functionEntryPcs);

        let out = 'contract DecompiledContract {\n\n';

        /**
         * Parcours récursif de l'AST hiérarchique produit par ASTBuilder.
         *
         * Gère les nœuds :
         *  • Block     → code du basic block
         *  • If        → if/else structuré (avec sous-ASTs trueBranch/falseBranch)
         *                 + détection automatique du pattern while (LoopBack dans une branche)
         *  • While     → while structuré avec sous-AST body (cas JUMPI direct back-edge)
         *  • LoopBack  → `continue` (retour au début de la boucle courante)
         */
        const traverseAST = (astBody, indentLevel) => {
            let res = '';
            const indent = '    '.repeat(indentLevel);

            for (const node of astBody) {

                // ── Bloc de base ──────────────────────────────────────────────
                if (node.type === 'Block') {
                    const block = this.blocks.find(b => b.startPc === node.pc);
                    if (block) {
                        res += `\n${indent}// Block @ PC ${node.pc}\n`;
                        res += this.decompileBlock(block, indentLevel);
                    }

                // ── If / If-Else / While (via détection LoopBack) ─────────────
                } else if (node.type === 'If') {
                    const condBlock = this.blocks.find(b => b.startPc === node.conditionBlockPc);
                    if (!condBlock) continue;

                    // Code des instructions du bloc de condition (avant le JUMPI)
                    res += `\n${indent}// Cond @ PC ${node.conditionBlockPc}\n`;
                    res += this.decompileBlock(condBlock, indentLevel);
                    const cond = condBlock.jumpCondition || 'unknown_condition';

                    // Détecte le pattern while :
                    // Si la branche vraie OU la branche fausse contient un LoopBack
                    // pointant vers ce même bloc de condition → c'est une boucle while.
                    const condPc      = node.conditionBlockPc;
                    const trueNodes   = node.trueBranch  ? node.trueBranch.body  : [];
                    const falseNodes  = node.falseBranch ? node.falseBranch.body : [];
                    const trueLoops   = trueNodes.some(n  => n.type === 'LoopBack' && n.target === condPc);
                    const falseLoops  = falseNodes.some(n => n.type === 'LoopBack' && n.target === condPc);

                    if (trueLoops || falseLoops) {
                        // ── Pattern WHILE DÉTECTÉ ─────────────────────────────
                        // La branche avec LoopBack = le corps de la boucle.
                        // L'autre branche = code après la boucle (sortie).
                        const bodyNodes = (trueLoops ? trueNodes : falseNodes)
                            .filter(n => n.type !== 'LoopBack');
                        const postNodes = trueLoops ? falseNodes : trueNodes;
                        // Condition de continuation : non-nul → continue (JUMPI_TRUE = corps)
                        const whileCond = trueLoops ? cond : `!(${cond})`;

                        res += `${indent}while (${whileCond}) {\n`;
                        res += traverseAST(bodyNodes, indentLevel + 1);
                        res += `${indent}}\n`;

                        // Code de sortie (branche sans LoopBack)
                        if (postNodes.length > 0) {
                            res += traverseAST(postNodes, indentLevel);
                        }

                    } else {
                        // ── IF / IF-ELSE STRUCTURÉ ────────────────────────────
                        const hasTrueBranch  = trueNodes.length  > 0;
                        const hasFalseBranch = falseNodes.length > 0;

                        if (hasTrueBranch || hasFalseBranch) {
                            res += `${indent}if (${cond}) {\n`;
                            if (hasTrueBranch)  res += traverseAST(trueNodes,  indentLevel + 1);
                            res += `${indent}}`;
                            if (hasFalseBranch) {
                                res += ` else {\n`;
                                res += traverseAST(falseNodes, indentLevel + 1);
                                res += `${indent}}`;
                            }
                            res += '\n';
                        } else {
                            // Les deux branches sont vides (terminales) → if simple avec gotos
                            res += `${indent}if (${cond}) {\n`;
                            res += `${indent}    goto PC_${node.trueTarget};\n`;
                            res += `${indent}} else {\n`;
                            res += `${indent}    goto PC_${node.falseTarget};\n`;
                            res += `${indent}}\n`;
                        }
                    }

                // ── While direct (back-edge au niveau JUMPI) ──────────────────
                } else if (node.type === 'While') {
                    const condBlock = this.blocks.find(b => b.startPc === node.conditionBlockPc);
                    if (!condBlock) continue;

                    res += `\n${indent}// While-loop (header @ PC ${node.conditionBlockPc})\n`;
                    res += this.decompileBlock(condBlock, indentLevel);
                    const cond = condBlock.jumpCondition || 'unknown_condition';

                    res += `${indent}while (${cond}) {\n`;
                    if (node.body && node.body.body.length > 0) {
                        res += traverseAST(node.body.body, indentLevel + 1);
                    }
                    res += `${indent}}\n`;

                // ── LoopBack : retour au début de la boucle englobante ─────────
                } else if (node.type === 'LoopBack') {
                    res += `${indent}continue; // → PC_${node.target}\n`;
                }
            }
            return res;
        };

        // ── Génération par fonction ───────────────────────────────────────────
        for (const [selector, funcData] of functions.entries()) {
            out += `    function ${funcData.name}() public {\n`;
            const funcAstBuilder = new ASTBuilder(this.blocks, this.edges);
            const ast = funcAstBuilder.build(funcData.entryPc, functionEntryPcs);
            out += traverseAST(ast.body, 2);
            out += '    }\n\n';
        }

        // ── Fallback / dispatcher ─────────────────────────────────────────────
        out += '    fallback() payable {\n';
        const fallbackAstBuilder = new ASTBuilder(this.blocks, this.edges);
        const fallbackAst = fallbackAstBuilder.build(0, functionEntryPcs);
        out += traverseAST(fallbackAst.body, 2);
        out += '    }\n';

        out += '}\n';
        return out;
    }
}

module.exports = { PseudoDecompiler };
