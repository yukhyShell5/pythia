const { ASTBuilder } = require('./ast_builder.js');

class PseudoDecompiler {
    constructor(blocks, edges) {
        this.blocks = blocks;
        this.edges = edges;
        this.astBuilder = new ASTBuilder(blocks, edges);
    }

    identifyFunctions() {
        const functions = new Map(); // selectorHex -> { entryPc, name }
        const functionEntryPcs = new Set();
        
        for (const block of this.blocks) {
            for (let i = 0; i < block.instructions.length; i++) {
                const ins = block.instructions[i];
                if (ins.opcode === 0x63 && ins.data) {
                    const selector = ins.data;
                    let isSelector = false;
                    const nextIns = block.instructions[i + 1];
                    if (nextIns && nextIns.opcode === 0x14) isSelector = true;
                    if (ins.isSelector) isSelector = true;

                    if (isSelector) {
                        const edgesFromHere = this.edges.filter(e => e.from === block.startPc && e.type === 'JUMPI_TRUE');
                        if (edgesFromHere.length > 0) {
                            const targetPc = edgesFromHere[0].to;
                            if (!functions.has(selector)) {
                                let funcName = `func_${selector.replace('0x', '')}`;
                                if (ins.comment) {
                                    funcName = ins.comment.split('(')[0]; // Extract name without args for now
                                }
                                functions.set(selector, { entryPc: targetPc, name: funcName });
                                functionEntryPcs.add(targetPc);
                            }
                        }
                    }
                }
            }
        }
        return { functions, functionEntryPcs };
    }

    decompileBlock(block, indentLevel = 1) {
        let code = '';
        const stack = [];
        const indent = '    '.repeat(indentLevel);

        for (const ins of block.instructions) {
            if (ins.opcode >= 0x60 && ins.opcode <= 0x7f) {
                stack.push(ins.data);
            } else if (ins.opcode === 0x50) {
                stack.pop();
            } else if (ins.opcode === 0x01) {
                const a = stack.pop() || 'unknown';
                const b = stack.pop() || 'unknown';
                stack.push(`(${a} + ${b})`);
            } else if (ins.opcode === 0x02) {
                const a = stack.pop() || 'unknown';
                const b = stack.pop() || 'unknown';
                stack.push(`(${a} * ${b})`);
            } else if (ins.opcode === 0x03) {
                const a = stack.pop() || 'unknown';
                const b = stack.pop() || 'unknown';
                stack.push(`(${a} - ${b})`);
            } else if (ins.opcode === 0x04) {
                const a = stack.pop() || 'unknown';
                const b = stack.pop() || 'unknown';
                stack.push(`(${a} / ${b})`);
            } else if (ins.opcode === 0x10) {
                const a = stack.pop() || 'unknown';
                const b = stack.pop() || 'unknown';
                stack.push(`(${a} < ${b})`);
            } else if (ins.opcode === 0x11) {
                const a = stack.pop() || 'unknown';
                const b = stack.pop() || 'unknown';
                stack.push(`(${a} > ${b})`);
            } else if (ins.opcode === 0x14) {
                const a = stack.pop() || 'unknown';
                const b = stack.pop() || 'unknown';
                stack.push(`(${a} == ${b})`);
            } else if (ins.opcode === 0x15) {
                const a = stack.pop() || 'unknown';
                stack.push(`(${a} == 0)`);
            } else if (ins.opcode === 0x16) {
                const a = stack.pop() || 'unknown';
                const b = stack.pop() || 'unknown';
                stack.push(`(${a} & ${b})`);
            } else if (ins.opcode === 0x17) {
                const a = stack.pop() || 'unknown';
                const b = stack.pop() || 'unknown';
                stack.push(`(${a} | ${b})`);
            } else if (ins.opcode === 0x20) {
                const offset = stack.pop() || 'unknown';
                const length = stack.pop() || 'unknown';
                stack.push(`keccak256(memory[${offset}:${offset}+${length}])`);
            } else if (ins.opcode === 0x30) {
                stack.push(`address(this)`);
            } else if (ins.opcode === 0x31) {
                const addr = stack.pop() || 'unknown';
                stack.push(`${addr}.balance`);
            } else if (ins.opcode === 0x32) {
                stack.push(`tx.origin`);
            } else if (ins.opcode === 0x33) {
                stack.push(`msg.sender`);
            } else if (ins.opcode === 0x34) {
                stack.push(`msg.value`);
            } else if (ins.opcode === 0x35) {
                const offset = stack.pop() || 'unknown';
                stack.push(`msg.data[${offset}]`);
            } else if (ins.opcode === 0x36) {
                stack.push(`msg.data.length`);
            } else if (ins.opcode === 0x51) {
                const offset = stack.pop() || 'unknown';
                stack.push(`memory[${offset}]`);
            } else if (ins.opcode === 0x52) {
                const offset = stack.pop() || 'unknown';
                const value = stack.pop() || 'unknown';
                code += `${indent}memory[${offset}] = ${value};\n`;
            } else if (ins.opcode === 0x54) {
                const key = stack.pop() || 'unknown';
                stack.push(`storage[${key}]`);
            } else if (ins.opcode === 0x55) {
                const key = stack.pop() || 'unknown';
                const value = stack.pop() || 'unknown';
                code += `${indent}storage[${key}] = ${value};\n`;
            } else if (ins.opcode === 0xf3) {
                const offset = stack.pop() || 'unknown';
                const length = stack.pop() || 'unknown';
                code += `${indent}return memory[${offset}:${offset}+${length}];\n`;
            } else if (ins.opcode === 0xfd) {
                const offset = stack.pop() || 'unknown';
                const length = stack.pop() || 'unknown';
                code += `${indent}revert(memory[${offset}:${offset}+${length}]);\n`;
            } else if (ins.opcode >= 0x80 && ins.opcode <= 0x8f) {
                const depth = ins.opcode - 0x80 + 1;
                if (stack.length >= depth) {
                    stack.push(stack[stack.length - depth]);
                } else {
                    stack.push('unknown');
                }
            } else if (ins.opcode >= 0x90 && ins.opcode <= 0x9f) {
                const depth = ins.opcode - 0x90 + 1;
                if (stack.length > depth) {
                    const temp = stack[stack.length - 1];
                    stack[stack.length - 1] = stack[stack.length - 1 - depth];
                    stack[stack.length - 1 - depth] = temp;
                }
            } else if (ins.opcode === 0x57) {
                const dest = stack.pop() || 'unknown';
                const cond = stack.pop() || 'unknown';
                block.jumpCondition = cond;
            } else if (ins.opcode === 0x56) {
                const dest = stack.pop() || 'unknown';
                code += `${indent}goto PC_${dest};\n`;
            } else {
                 const { getStackEffect } = require('./stack_effects.js');
                 const effect = getStackEffect(ins.opcode);
                 if (effect) {
                     for(let i=0; i<effect[0]; i++) stack.pop();
                     for(let i=0; i<effect[1]; i++) stack.push(`op_${ins.mnemonic}()`);
                 }
            }
        }
        return code;
    }

    decompile() {
        const { functions, functionEntryPcs } = this.identifyFunctions();
        let out = 'contract DecompiledContract {\n\n';

        const traverseAST = (astBody, indentLevel) => {
            let res = '';
            const indent = '    '.repeat(indentLevel);
            for (const node of astBody) {
                if (node.type === 'Block') {
                    const block = this.blocks.find(b => b.startPc === node.pc);
                    if (block) {
                        res += `\n${indent}// Block @ PC ${node.pc}\n`;
                        res += this.decompileBlock(block, indentLevel);
                    }
                } else if (node.type === 'If') {
                    const condBlock = this.blocks.find(b => b.startPc === node.conditionBlockPc);
                    if (condBlock) {
                        res += `\n${indent}// If-Else Block (Cond PC: ${node.conditionBlockPc})\n`;
                        res += this.decompileBlock(condBlock, indentLevel);
                        const cond = condBlock.jumpCondition || 'unknown_condition';
                        res += `${indent}if (${cond}) {\n`;
                        res += `${indent}    goto PC_${node.trueTarget};\n`;
                        res += `${indent}} else {\n`;
                        res += `${indent}    goto PC_${node.falseTarget};\n`;
                        res += `${indent}}\n`;
                    }
                }
            }
            return res;
        };

        // Render each function separately
        for (const [selector, funcData] of functions.entries()) {
            out += `    function ${funcData.name}() public {\n`;
            
            // Build AST specifically for this function's entry point
            // For now we just use the global astBuilder, but in a real re-looper we'd stop traversal at boundaries
            // We can trick ASTBuilder by making it traverse only from funcData.entryPc
            // We need to modify ASTBuilder to accept a startPc, or just set it manually
            const funcAstBuilder = new ASTBuilder(this.blocks, this.edges);
            
            // Generate AST starting from funcData.entryPc
            const ast = funcAstBuilder.build(funcData.entryPc, functionEntryPcs);
            
            out += traverseAST(ast.body, 2);
            out += '    }\n\n';
        }

        // Render fallback (dispatcher)
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
