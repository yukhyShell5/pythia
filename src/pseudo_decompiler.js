const { ASTBuilder } = require('./ast_builder.js');

class PseudoDecompiler {
    constructor(blocks, edges) {
        this.blocks = blocks;
        this.edges = edges;
        this.astBuilder = new ASTBuilder(blocks, edges);
        this.blockStacks = new Map();
    }

    simplify(expr) {
        if (typeof expr !== 'string') return expr;
        let prev;
        do {
            prev = expr;
            // (a + 0) or (0 + a) -> a
            expr = expr.replace(/\(\((.*?)\) \+ (0x0+|0)\)/g, '($1)');
            expr = expr.replace(/\((0x0+|0) \+ \((.*?)\)\)/g, '($1)');
            expr = expr.replace(/\(([a-zA-Z0-9_\.\[\]]+) \+ (0x0+|0)\)/g, '$1');
            expr = expr.replace(/\((0x0+|0) \+ ([a-zA-Z0-9_\.\[\]]+)\)/g, '$1');
            // msg.sig
            expr = expr.replace(/\(msg\.data\[0x0+\] \/ 0x0*100000000000000000000000000000000000000000000000000000000\)/g, 'msg.sig');
            // AND 0xffffffffffffffffffffffffffffffffffffffff (address mask)
            expr = expr.replace(/\(0xffffffffffffffffffffffffffffffffffffffff & (.*?)\)/g, 'address($1)');
            // Remove double address()
            expr = expr.replace(/address\(address\((.*?)\)\)/g, 'address($1)');
            // Hex addition if both are hex
            expr = expr.replace(/\(0x([0-9a-fA-F]+) \+ 0x([0-9a-fA-F]+)\)/g, (match, a, b) => {
                return '0x' + (BigInt('0x'+a) + BigInt('0x'+b)).toString(16).padStart(2, '0');
            });
            // Hex subtraction
            expr = expr.replace(/\(0x([0-9a-fA-F]+) \- 0x([0-9a-fA-F]+)\)/g, (match, a, b) => {
                const res = BigInt('0x'+a) - BigInt('0x'+b);
                return res >= 0 ? '0x' + res.toString(16).padStart(2, '0') : match;
            });
        } while (expr !== prev);
        return expr;
    }

    identifyFunctions() {
        const functions = new Map(); 
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
                                    funcName = ins.comment.split('(')[0]; 
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

    propagateStacks(functionEntryPcs) {
        const queue = [];
        for (const entry of functionEntryPcs) {
            this.blockStacks.set(entry, []);
            queue.push(entry);
        }
        this.blockStacks.set(0, []);
        queue.push(0);

        while (queue.length > 0) {
            const pc = queue.shift();
            const block = this.blocks.find(b => b.startPc === pc);
            if (!block) continue;
            
            const stack = [...(this.blockStacks.get(pc) || [])];
            
            for (const ins of block.instructions) {
                if (ins.opcode >= 0x60 && ins.opcode <= 0x7f) {
                    stack.push(ins.data);
                } else if (ins.opcode === 0x50) {
                    stack.pop();
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
                    stack.push(this.simplify(`(${a} ${op} ${b})`));
                } else if (ins.opcode === 0x15) {
                    const a = stack.pop() || 'loc_a';
                    stack.push(this.simplify(`(${a} == 0)`));
                } else if (ins.opcode === 0x20) {
                    const offset = stack.pop() || 'loc_offset';
                    const length = stack.pop() || 'loc_len';
                    stack.push(this.simplify(`keccak256(memory[${offset}:${offset}+${length}])`));
                } else if (ins.opcode === 0x30) {
                    stack.push(`address(this)`);
                } else if (ins.opcode === 0x31) {
                    const addr = stack.pop() || 'loc_addr';
                    stack.push(this.simplify(`${addr}.balance`));
                } else if (ins.opcode === 0x32) {
                    stack.push(`tx.origin`);
                } else if (ins.opcode === 0x33) {
                    stack.push(`msg.sender`);
                } else if (ins.opcode === 0x34) {
                    stack.push(`msg.value`);
                } else if (ins.opcode === 0x35) {
                    const offset = stack.pop() || 'loc_offset';
                    stack.push(this.simplify(`msg.data[${offset}]`));
                } else if (ins.opcode === 0x36) {
                    stack.push(`msg.data.length`);
                } else if (ins.opcode === 0x51) {
                    const offset = stack.pop() || 'loc_offset';
                    stack.push(this.simplify(`memory[${offset}]`));
                } else if (ins.opcode === 0x54) {
                    const key = stack.pop() || 'loc_key';
                    stack.push(this.simplify(`storage[${key}]`));
                } else if (ins.opcode >= 0x80 && ins.opcode <= 0x8f) {
                    const depth = ins.opcode - 0x80 + 1;
                    if (stack.length >= depth) {
                        stack.push(stack[stack.length - depth]);
                    } else {
                        stack.push(`loc_dup${depth}`);
                    }
                } else if (ins.opcode >= 0x90 && ins.opcode <= 0x9f) {
                    const depth = ins.opcode - 0x90 + 1;
                    if (stack.length > depth) {
                        const temp = stack[stack.length - 1];
                        stack[stack.length - 1] = stack[stack.length - 1 - depth];
                        stack[stack.length - 1 - depth] = temp;
                    }
                } else {
                    const { getStackEffect } = require('./stack_effects.js');
                    const effect = getStackEffect(ins.opcode);
                    if (effect) {
                        for(let i=0; i<effect[0]; i++) stack.pop();
                        for(let i=0; i<effect[1]; i++) stack.push(`op_${ins.mnemonic}()`);
                    }
                }
            }
            
            for (const edge of this.edges) {
                if (edge.from === pc) {
                    if (!this.blockStacks.has(edge.to)) {
                        this.blockStacks.set(edge.to, [...stack]);
                        queue.push(edge.to);
                    }
                }
            }
        }
    }

    decompileBlock(block, indentLevel = 1) {
        let code = '';
        const stack = [...(this.blockStacks.get(block.startPc) || [])];
        const indent = '    '.repeat(indentLevel);

        for (const ins of block.instructions) {
            if (ins.opcode >= 0x60 && ins.opcode <= 0x7f) {
                stack.push(ins.data);
            } else if (ins.opcode === 0x50) {
                stack.pop();
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
                stack.push(this.simplify(`(${a} ${op} ${b})`));
            } else if (ins.opcode === 0x15) {
                const a = stack.pop() || 'loc_a';
                stack.push(this.simplify(`(${a} == 0)`));
            } else if (ins.opcode === 0x20) {
                const offset = stack.pop() || 'loc_offset';
                const length = stack.pop() || 'loc_len';
                stack.push(this.simplify(`keccak256(memory[${offset}:${offset}+${length}])`));
            } else if (ins.opcode === 0x30) {
                stack.push(`address(this)`);
            } else if (ins.opcode === 0x31) {
                const addr = stack.pop() || 'loc_addr';
                stack.push(this.simplify(`${addr}.balance`));
            } else if (ins.opcode === 0x32) {
                stack.push(`tx.origin`);
            } else if (ins.opcode === 0x33) {
                stack.push(`msg.sender`);
            } else if (ins.opcode === 0x34) {
                stack.push(`msg.value`);
            } else if (ins.opcode === 0x35) {
                const offset = stack.pop() || 'loc_offset';
                stack.push(this.simplify(`msg.data[${offset}]`));
            } else if (ins.opcode === 0x36) {
                stack.push(`msg.data.length`);
            } else if (ins.opcode === 0x51) {
                const offset = stack.pop() || 'loc_offset';
                stack.push(this.simplify(`memory[${offset}]`));
            } else if (ins.opcode === 0x52) {
                const offset = stack.pop() || 'loc_offset';
                const value = stack.pop() || 'loc_val';
                code += `${indent}memory[${offset}] = ${value};\n`;
            } else if (ins.opcode === 0x54) {
                const key = stack.pop() || 'loc_key';
                stack.push(this.simplify(`storage[${key}]`));
            } else if (ins.opcode === 0x55) {
                const key = stack.pop() || 'loc_key';
                const value = stack.pop() || 'loc_val';
                code += `${indent}storage[${key}] = ${value};\n`;
            } else if (ins.opcode === 0xf3) {
                const offset = stack.pop() || 'loc_offset';
                const length = stack.pop() || 'loc_len';
                let o = offset;
                let l = length;
                if(o.startsWith('0x') && l.startsWith('0x')) {
                    const end = '0x' + (BigInt(o) + BigInt(l)).toString(16).padStart(2, '0');
                    code += `${indent}return memory[${offset}:${end}];\n`;
                } else {
                    code += `${indent}return memory[${offset}:${offset}+${length}];\n`;
                }
            } else if (ins.opcode === 0xfd) {
                const offset = stack.pop() || 'loc_offset';
                const length = stack.pop() || 'loc_len';
                let o = offset;
                let l = length;
                if(o.startsWith('0x') && l.startsWith('0x')) {
                    const end = '0x' + (BigInt(o) + BigInt(l)).toString(16).padStart(2, '0');
                    code += `${indent}revert(memory[${offset}:${end}]);\n`;
                } else {
                    code += `${indent}revert(memory[${offset}:${offset}+${length}]);\n`;
                }
            } else if (ins.opcode >= 0x80 && ins.opcode <= 0x8f) {
                const depth = ins.opcode - 0x80 + 1;
                if (stack.length >= depth) {
                    stack.push(stack[stack.length - depth]);
                } else {
                    stack.push(`loc_dup${depth}`);
                }
            } else if (ins.opcode >= 0x90 && ins.opcode <= 0x9f) {
                const depth = ins.opcode - 0x90 + 1;
                if (stack.length > depth) {
                    const temp = stack[stack.length - 1];
                    stack[stack.length - 1] = stack[stack.length - 1 - depth];
                    stack[stack.length - 1 - depth] = temp;
                }
            } else if (ins.opcode === 0x57) {
                const dest = stack.pop() || 'loc_dest';
                const cond = stack.pop() || 'loc_cond';
                block.jumpCondition = cond;
            } else if (ins.opcode === 0x56) {
                const dest = stack.pop() || 'loc_dest';
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
        
        this.propagateStacks(functionEntryPcs);

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

        for (const [selector, funcData] of functions.entries()) {
            out += `    function ${funcData.name}() public {\n`;
            const funcAstBuilder = new ASTBuilder(this.blocks, this.edges);
            const ast = funcAstBuilder.build(funcData.entryPc, functionEntryPcs);
            out += traverseAST(ast.body, 2);
            out += '    }\n\n';
        }

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
