const { ASTBuilder } = require('./ast_builder.js');

/**
 * YulDecompiler — traduit le bytecode EVM en code Yul structuré.
 *
 * Chaque opcode EVM a un équivalent Yul natif (sauf les sauts et les opcodes
 * de pile qui sont absorbés dans la simulation de pile locale).
 * Couverture : ~60 opcodes, dont tous les opcodes arithmétiques, mémoire,
 * stockage, environnement, appels système et logs.
 */
class YulDecompiler {
    constructor(blocks, edges) {
        this.blocks  = blocks;
        this.edges   = edges;
        this.astBuilder = new ASTBuilder(blocks, edges);

        // Propagation des piles entre blocs (BFS sur les arêtes CFG)
        this.blockStacks = new Map();
        this._propagateStacks();
    }

    // ─── Propagation de pile (pass 1) ──────────────────────────────────────────

    _propagateStacks() {
        const queue = [0];
        this.blockStacks.set(0, []);

        while (queue.length > 0) {
            const pc    = queue.shift();
            const block = this.blocks.find(b => b.startPc === pc);
            if (!block) continue;

            const stack = [...(this.blockStacks.get(pc) || [])];
            this._simulateBlock(block, stack); // stack modifiée en place

            for (const edge of this.edges) {
                if (edge.from === pc && !this.blockStacks.has(edge.to)) {
                    this.blockStacks.set(edge.to, [...stack]);
                    queue.push(edge.to);
                }
            }
        }
    }

    /**
     * Simule les effets de pile d'un bloc sans émettre de code.
     * Utilisé par _propagateStacks pour transmettre les états de pile.
     */
    _simulateBlock(block, stack) {
        let vc = 0;
        const pop = () => stack.pop() || '0x0';
        const push = (expr) => { stack.push(expr); };
        const v = () => `_${block.startPc}_${vc++}`;

        for (const ins of block.instructions) {
            const op = ins.opcode;
            if (op >= 0x5f && op <= 0x7f) { push(ins.data || '0'); continue; }
            if (op === 0x50) { pop(); continue; }
            if (op >= 0x80 && op <= 0x8f) {
                const d = op - 0x80 + 1;
                push(stack.length >= d ? stack[stack.length - d] : v());
                continue;
            }
            if (op >= 0x90 && op <= 0x9f) {
                const d = op - 0x90 + 1;
                if (stack.length > d) [stack[stack.length-1], stack[stack.length-1-d]] = [stack[stack.length-1-d], stack[stack.length-1]];
                continue;
            }
            // Push-producing opcodes: just push a placeholder
            const pushCount = this._stackPushCount(op);
            const popCount  = this._stackPopCount(op);
            for (let i = 0; i < popCount; i++) pop();
            for (let i = 0; i < pushCount; i++) push(v());
        }
    }

    _stackPopCount(op) {
        const table = {
            0x01:2,0x02:2,0x03:2,0x04:2,0x05:2,0x06:2,0x07:2,0x08:3,0x09:3,0x0a:2,0x0b:2,
            0x10:2,0x11:2,0x12:2,0x13:2,0x14:2,0x15:1,0x16:2,0x17:2,0x18:2,0x19:1,
            0x1a:2,0x1b:2,0x1c:2,0x1d:2,0x20:2,
            0x31:1,0x35:1,0x37:3,0x39:3,0x3b:1,0x3c:4,0x3e:3,0x3f:1,
            0x40:1,0x51:1,0x52:2,0x53:2,0x54:1,0x55:2,0x56:1,0x57:2,
            0x5c:1,0x5d:2,0x5e:3,
            0xa0:2,0xa1:3,0xa2:4,0xa3:5,0xa4:6,
            0xf0:3,0xf1:7,0xf2:7,0xf3:2,0xf4:6,0xf5:4,0xfa:6,0xfd:2,0xff:1,
        };
        return table[op] || 0;
    }

    _stackPushCount(op) {
        const table = {
            0x01:1,0x02:1,0x03:1,0x04:1,0x05:1,0x06:1,0x07:1,0x08:1,0x09:1,0x0a:1,0x0b:1,
            0x10:1,0x11:1,0x12:1,0x13:1,0x14:1,0x15:1,0x16:1,0x17:1,0x18:1,0x19:1,
            0x1a:1,0x1b:1,0x1c:1,0x1d:1,0x20:1,
            0x30:1,0x31:1,0x32:1,0x33:1,0x34:1,0x35:1,0x36:1,0x38:1,0x3a:1,0x3b:1,0x3d:1,0x3f:1,
            0x40:1,0x41:1,0x42:1,0x43:1,0x44:1,0x45:1,0x46:1,0x47:1,0x48:1,0x49:1,0x4a:1,
            0x51:1,0x54:1,0x58:1,0x59:1,0x5a:1,0x5c:1,
            0xf0:1,0xf1:1,0xf2:1,0xf4:1,0xf5:1,0xfa:1,
        };
        return table[op] || 0;
    }

    // ─── Décompilation d'un bloc (pass 2) ─────────────────────────────────────

    /**
     * Traduit un bloc de base en code Yul.
     * Chaque valeur calculée devient un `let varN := opcode(...)`.
     * Les effets de bord (MSTORE, SSTORE, CALL, LOG...) deviennent des statements.
     *
     * @param {Object} block  - Le basic block à décompiler.
     * @param {number} indentLevel - Niveau d'indentation Yul.
     * @returns {{ code: string, jumpCond: string|null }}
     */
    decompileBlock(block, indentLevel = 2) {
        const ind   = '  '.repeat(indentLevel);
        let   code  = '';
        let   jumpCond = null;

        const stack = [...(this.blockStacks.get(block.startPc) || [])];
        let   vc    = 0;
        const v     = () => `_v${block.startPc}_${vc++}`;
        const pop   = () => stack.pop() || '0x0';

        /** Émet un let-binding et empile le nom de variable. */
        const assign = (expr) => {
            const name = v();
            code += `${ind}let ${name} := ${expr}\n`;
            stack.push(name);
            return name;
        };

        for (const ins of block.instructions) {
            const op = ins.opcode;

            // ── Pile (PUSH, POP, DUP, SWAP) ────────────────────────────────
            if (op === 0x5f) { stack.push('0'); continue; }              // PUSH0
            if (op >= 0x60 && op <= 0x7f) { stack.push(ins.data || '0x0'); continue; }
            if (op === 0x50) { pop(); continue; }                         // POP
            if (op >= 0x80 && op <= 0x8f) {                              // DUP
                const d = op - 0x80 + 1;
                stack.push(stack.length >= d ? stack[stack.length - d] : '0x0');
                continue;
            }
            if (op >= 0x90 && op <= 0x9f) {                              // SWAP
                const d = op - 0x90 + 1;
                if (stack.length > d)
                    [stack[stack.length-1], stack[stack.length-1-d]] =
                    [stack[stack.length-1-d], stack[stack.length-1]];
                continue;
            }

            // ── Arithmétique ────────────────────────────────────────────────
            if (op === 0x01) { const b=pop(),a=pop(); assign(`add(${a}, ${b})`);            continue; }
            if (op === 0x02) { const b=pop(),a=pop(); assign(`mul(${a}, ${b})`);            continue; }
            if (op === 0x03) { const b=pop(),a=pop(); assign(`sub(${a}, ${b})`);            continue; }
            if (op === 0x04) { const b=pop(),a=pop(); assign(`div(${a}, ${b})`);            continue; }
            if (op === 0x05) { const b=pop(),a=pop(); assign(`sdiv(${a}, ${b})`);           continue; }
            if (op === 0x06) { const b=pop(),a=pop(); assign(`mod(${a}, ${b})`);            continue; }
            if (op === 0x07) { const b=pop(),a=pop(); assign(`smod(${a}, ${b})`);           continue; }
            if (op === 0x08) { const m=pop(),b=pop(),a=pop(); assign(`addmod(${a}, ${b}, ${m})`); continue; }
            if (op === 0x09) { const m=pop(),b=pop(),a=pop(); assign(`mulmod(${a}, ${b}, ${m})`); continue; }
            if (op === 0x0a) { const e=pop(),b=pop(); assign(`exp(${b}, ${e})`);            continue; }
            if (op === 0x0b) { const x=pop(),b=pop(); assign(`signextend(${b}, ${x})`);    continue; }

            // ── Comparaisons ────────────────────────────────────────────────
            if (op === 0x10) { const b=pop(),a=pop(); assign(`lt(${a}, ${b})`);             continue; }
            if (op === 0x11) { const b=pop(),a=pop(); assign(`gt(${a}, ${b})`);             continue; }
            if (op === 0x12) { const b=pop(),a=pop(); assign(`slt(${a}, ${b})`);            continue; }
            if (op === 0x13) { const b=pop(),a=pop(); assign(`sgt(${a}, ${b})`);            continue; }
            if (op === 0x14) { const b=pop(),a=pop(); assign(`eq(${a}, ${b})`);             continue; }
            if (op === 0x15) { const a=pop();         assign(`iszero(${a})`);               continue; }

            // ── Logique binaire ─────────────────────────────────────────────
            if (op === 0x16) { const b=pop(),a=pop(); assign(`and(${a}, ${b})`);            continue; }
            if (op === 0x17) { const b=pop(),a=pop(); assign(`or(${a}, ${b})`);             continue; }
            if (op === 0x18) { const b=pop(),a=pop(); assign(`xor(${a}, ${b})`);            continue; }
            if (op === 0x19) { const a=pop();         assign(`not(${a})`);                  continue; }
            if (op === 0x1a) { const x=pop(),n=pop(); assign(`byte(${n}, ${x})`);           continue; }
            if (op === 0x1b) { const v2=pop(),s=pop(); assign(`shl(${s}, ${v2})`);          continue; }
            if (op === 0x1c) { const v2=pop(),s=pop(); assign(`shr(${s}, ${v2})`);          continue; } // logique
            if (op === 0x1d) { const v2=pop(),s=pop(); assign(`sar(${s}, ${v2})`);          continue; } // arithmétique

            // ── Hash ────────────────────────────────────────────────────────
            if (op === 0x20) { const l=pop(),p=pop(); assign(`keccak256(${p}, ${l})`);      continue; }

            // ── Environnement ───────────────────────────────────────────────
            if (op === 0x30) { assign('address()');                                          continue; }
            if (op === 0x31) { const a=pop(); assign(`balance(${a})`);                      continue; }
            if (op === 0x32) { assign('origin()');                                           continue; }
            if (op === 0x33) { assign('caller()');                                           continue; }
            if (op === 0x34) { assign('callvalue()');                                        continue; }
            if (op === 0x35) { const p=pop(); assign(`calldataload(${p})`);                 continue; }
            if (op === 0x36) { assign('calldatasize()');                                     continue; }
            if (op === 0x37) { const s=pop(),f=pop(),t=pop(); code += `${ind}calldatacopy(${t}, ${f}, ${s})\n`; continue; }
            if (op === 0x38) { assign('codesize()');                                         continue; }
            if (op === 0x39) { const s=pop(),f=pop(),t=pop(); code += `${ind}codecopy(${t}, ${f}, ${s})\n`;    continue; }
            if (op === 0x3a) { assign('gasprice()');                                         continue; }
            if (op === 0x3b) { const a=pop(); assign(`extcodesize(${a})`);                  continue; }
            if (op === 0x3c) { const s=pop(),f=pop(),t=pop(),a=pop(); code += `${ind}extcodecopy(${a}, ${t}, ${f}, ${s})\n`; continue; }
            if (op === 0x3d) { assign('returndatasize()');                                   continue; }
            if (op === 0x3e) { const s=pop(),f=pop(),t=pop(); code += `${ind}returndatacopy(${t}, ${f}, ${s})\n`; continue; }
            if (op === 0x3f) { const a=pop(); assign(`extcodehash(${a})`);                  continue; }
            if (op === 0x40) { const b=pop(); assign(`blockhash(${b})`);                    continue; }
            if (op === 0x41) { assign('coinbase()');                                         continue; }
            if (op === 0x42) { assign('timestamp()');                                        continue; }
            if (op === 0x43) { assign('number()');                                           continue; }
            if (op === 0x44) { assign('prevrandao()');                                       continue; }
            if (op === 0x45) { assign('gaslimit()');                                         continue; }
            if (op === 0x46) { assign('chainid()');                                          continue; }
            if (op === 0x47) { assign('selfbalance()');                                      continue; }
            if (op === 0x48) { assign('basefee()');                                          continue; }
            if (op === 0x49) { const i=pop(); assign(`blobhash(${i})`);                     continue; }
            if (op === 0x4a) { assign('blobbasefee()');                                      continue; }

            // ── Mémoire / Storage / Gas ─────────────────────────────────────
            if (op === 0x51) { const p=pop(); assign(`mload(${p})`);                        continue; }
            if (op === 0x52) { const v2=pop(),p=pop(); code += `${ind}mstore(${p}, ${v2})\n`;  continue; }
            if (op === 0x53) { const v2=pop(),p=pop(); code += `${ind}mstore8(${p}, ${v2})\n`; continue; }
            if (op === 0x54) { const p=pop(); assign(`sload(${p})`);                        continue; }
            if (op === 0x55) { const v2=pop(),p=pop(); code += `${ind}sstore(${p}, ${v2})\n`;  continue; }
            if (op === 0x58) { assign(`${ins.pc}`);                                          continue; } // PC
            if (op === 0x59) { assign('msize()');                                            continue; }
            if (op === 0x5a) { assign('gas()');                                              continue; }
            if (op === 0x5b) { /* JUMPDEST — marqueur de label, pas de code Yul */           continue; }
            if (op === 0x5c) { const p=pop(); assign(`tload(${p})`);                        continue; } // EIP-1153
            if (op === 0x5d) { const v2=pop(),p=pop(); code += `${ind}tstore(${p}, ${v2})\n`; continue; }
            if (op === 0x5e) { const s=pop(),f=pop(),d=pop(); code += `${ind}mcopy(${d}, ${f}, ${s})\n`; continue; }

            // ── Logs ────────────────────────────────────────────────────────
            if (op === 0xa0) { const s=pop(),p=pop(); code += `${ind}log0(${p}, ${s})\n`;                              continue; }
            if (op === 0xa1) { const t1=pop(),s=pop(),p=pop(); code += `${ind}log1(${p}, ${s}, ${t1})\n`;              continue; }
            if (op === 0xa2) { const t2=pop(),t1=pop(),s=pop(),p=pop(); code += `${ind}log2(${p}, ${s}, ${t1}, ${t2})\n`; continue; }
            if (op === 0xa3) { const t3=pop(),t2=pop(),t1=pop(),s=pop(),p=pop(); code += `${ind}log3(${p}, ${s}, ${t1}, ${t2}, ${t3})\n`; continue; }
            if (op === 0xa4) { const t4=pop(),t3=pop(),t2=pop(),t1=pop(),s=pop(),p=pop(); code += `${ind}log4(${p}, ${s}, ${t1}, ${t2}, ${t3}, ${t4})\n`; continue; }

            // ── Contrôle de flux ────────────────────────────────────────────
            if (op === 0x00) { code += `${ind}stop()\n`;                                    continue; }
            if (op === 0x56) { pop(); /* JUMP : absorbé par le CFG */                        continue; }
            if (op === 0x57) {
                // JUMPI : la condition est stockée pour que le nœud If puisse l'utiliser
                const dest = pop();
                jumpCond = pop();
                continue;
            }

            // ── Appels système ──────────────────────────────────────────────
            if (op === 0xf0) { const s=pop(),p=pop(),v2=pop(); assign(`create(${v2}, ${p}, ${s})`);                      continue; }
            if (op === 0xf1) { const os=pop(),o=pop(),is=pop(),i=pop(),v2=pop(),a=pop(),g=pop(); assign(`call(${g}, ${a}, ${v2}, ${i}, ${is}, ${o}, ${os})`); continue; }
            if (op === 0xf2) { const os=pop(),o=pop(),is=pop(),i=pop(),v2=pop(),a=pop(),g=pop(); assign(`callcode(${g}, ${a}, ${v2}, ${i}, ${is}, ${o}, ${os})`); continue; }
            if (op === 0xf3) { const s=pop(),p=pop(); code += `${ind}return(${p}, ${s})\n`;                              continue; }
            if (op === 0xf4) { const os=pop(),o=pop(),is=pop(),i=pop(),a=pop(),g=pop(); assign(`delegatecall(${g}, ${a}, ${i}, ${is}, ${o}, ${os})`); continue; }
            if (op === 0xf5) { const n=pop(),s=pop(),p=pop(),v2=pop(); assign(`create2(${v2}, ${p}, ${s}, ${n})`);       continue; }
            if (op === 0xfa) { const os=pop(),o=pop(),is=pop(),i=pop(),a=pop(),g=pop(); assign(`staticcall(${g}, ${a}, ${i}, ${is}, ${o}, ${os})`); continue; }
            if (op === 0xfd) { const s=pop(),p=pop(); code += `${ind}revert(${p}, ${s})\n`;                              continue; }
            if (op === 0xfe) { code += `${ind}invalid()\n`;                                  continue; }
            if (op === 0xff) { const a=pop(); code += `${ind}selfdestruct(${a})\n`;          continue; }

            // Fallback : opcode non reconnu → commentaire
            code += `${ind}// [${ins.mnemonic || `0x${op.toString(16)}`}] @ PC ${ins.pc}\n`;
        }

        return { code, jumpCond, stackOut: stack };
    }

    // ─── Décompilation principale (pass 2) ────────────────────────────────────

    decompile() {
        const ast = this.astBuilder.build();
        let out = 'object "DecompiledContract" {\n';
        out += '  code {\n';
        out += '    // Yul decompiled from EVM bytecode by Pythia\n\n';

        const traverseAST = (astBody, indentLevel) => {
            let res = '';
            const ind = '  '.repeat(indentLevel);

            for (const node of astBody) {
                if (node.type === 'Block') {
                    const block = this.blocks.find(b => b.startPc === node.pc);
                    if (block) {
                        res += `${ind}// ── Block @ 0x${node.pc.toString(16).toUpperCase()} ──\n`;
                        res += this.decompileBlock(block, indentLevel).code;
                    }

                } else if (node.type === 'If') {
                    // Récupère le bloc de condition et la valeur JUMPI
                    const condBlock = this.blocks.find(b => b.startPc === node.conditionBlockPc);
                    if (!condBlock) continue;
                    const { code: condCode, jumpCond, stackOut } = this.decompileBlock(condBlock, indentLevel);
                    const cond = jumpCond || stackOut[stackOut.length - 1] || '0x0';

                    // Détecte le pattern while : une branche contient un LoopBack vers le header
                    const trueHasLoop  = node.trueBranch  && node.trueBranch.body.some(n => n.type === 'LoopBack' && n.target === node.conditionBlockPc);
                    const falseHasLoop = node.falseBranch && node.falseBranch.body.some(n => n.type === 'LoopBack' && n.target === node.conditionBlockPc);

                    if (trueHasLoop || falseHasLoop) {
                        // ── Boucle while ──────────────────────────────────
                        // En Yul : for { } 1 { } { if iszero(cond) { break } body }
                        const bodyBranch = trueHasLoop  ? node.trueBranch  : node.falseBranch;
                        const exitBranch = trueHasLoop  ? node.falseBranch : node.trueBranch;
                        const loopCond   = trueHasLoop  ? cond : `iszero(${cond})`;
                        const bodyNodes  = bodyBranch.body.filter(n => n.type !== 'LoopBack');

                        res += `\n${ind}// ── While-loop (header @ 0x${node.conditionBlockPc.toString(16).toUpperCase()}) ──\n`;
                        res += condCode;
                        res += `${ind}for { } 1 { } {\n`;
                        res += `${'  '.repeat(indentLevel+1)}if iszero(${loopCond}) { break }\n`;
                        res += traverseAST(bodyNodes, indentLevel + 1);
                        res += `${ind}}\n`;
                        // Code post-boucle (branche de sortie)
                        if (exitBranch && exitBranch.body.length > 0)
                            res += traverseAST(exitBranch.body, indentLevel);

                    } else {
                        // ── If / If-Else ──────────────────────────────────
                        // Yul n'a pas de `else` natif : deux `if` consécutifs
                        res += `\n${ind}// ── If @ 0x${node.conditionBlockPc.toString(16).toUpperCase()} ──\n`;
                        res += condCode;

                        const hasFalseBranch = node.falseBranch && node.falseBranch.body.length > 0;

                        res += `${ind}if ${cond} {\n`;
                        if (node.trueBranch) res += traverseAST(node.trueBranch.body, indentLevel + 1);
                        res += `${ind}}\n`;

                        if (hasFalseBranch) {
                            res += `${ind}if iszero(${cond}) {\n`;
                            res += traverseAST(node.falseBranch.body, indentLevel + 1);
                            res += `${ind}}\n`;
                        }
                    }

                } else if (node.type === 'While') {
                    // Cas JUMPI direct avec back-edge (do-while ou boucle interne)
                    const condBlock = this.blocks.find(b => b.startPc === node.conditionBlockPc);
                    if (!condBlock) continue;
                    const { code: condCode, jumpCond, stackOut } = this.decompileBlock(condBlock, indentLevel);
                    const cond = jumpCond || stackOut[stackOut.length - 1] || '0x0';

                    res += `\n${ind}// ── While (back-edge @ 0x${node.conditionBlockPc.toString(16).toUpperCase()}) ──\n`;
                    res += `${ind}for { } 1 { } {\n`;
                    res += `${'  '.repeat(indentLevel+1)}if iszero(${cond}) { break }\n`;
                    res += condCode;
                    if (node.body) res += traverseAST(node.body.body, indentLevel + 1);
                    res += `${ind}}\n`;

                } else if (node.type === 'LoopBack') {
                    res += `${ind}continue\n`;
                }
            }
            return res;
        };

        out += traverseAST(ast.body, 2);
        out += '  }\n';
        out += '}\n';
        return out;
    }
}

module.exports = { YulDecompiler };
