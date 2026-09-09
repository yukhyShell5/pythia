const { ASTBuilder } = require('./ast_builder.js');

class YulDecompiler {
    constructor(blocks, edges) {
        this.blocks = blocks;
        this.edges = edges;
        this.astBuilder = new ASTBuilder(blocks, edges);
    }

    /**
     * Translates a single basic block into a string of Yul instructions
     */
    decompileBlock(block) {
        let yulCode = '';
        const stack = [];
        let varCounter = 0;

        for (const ins of block.instructions) {
            if (ins.opcode >= 0x60 && ins.opcode <= 0x7f) {
                // PUSH
                stack.push(ins.data);
            } else if (ins.opcode === 0x01) {
                // ADD
                const a = stack.pop() || 'unknown';
                const b = stack.pop() || 'unknown';
                const v = `v${varCounter++}`;
                yulCode += `      let ${v} := add(${a}, ${b})\n`;
                stack.push(v);
            } else if (ins.opcode === 0x52) {
                // MSTORE
                const offset = stack.pop() || 'unknown';
                const value = stack.pop() || 'unknown';
                yulCode += `      mstore(${offset}, ${value})\n`;
            } else if (ins.opcode === 0x55) {
                // SSTORE
                const key = stack.pop() || 'unknown';
                const value = stack.pop() || 'unknown';
                yulCode += `      sstore(${key}, ${value})\n`;
            }
            // Add more opcodes as needed...
            else {
                // Generic fallback for unsupported/untranslated opcodes for now
                // yulCode += `      // [${ins.mnemonic}] not translated\n`;
            }
        }
        return yulCode;
    }

    decompile() {
        const ast = this.astBuilder.build();
        let out = 'object "DecompiledContract" {\n';
        out += '  code {\n';
        out += '    // Yul code generated from CFG\n';
        
        for (const node of ast.body) {
            if (node.type === 'Block') {
                const block = this.blocks.find(b => b.startPc === node.pc);
                if (block) {
                    out += `    // Block @ PC ${node.pc}\n`;
                    out += this.decompileBlock(block);
                }
            } else if (node.type === 'If') {
                out += `    // If-Else Block (Cond PC: ${node.conditionBlockPc})\n`;
                out += `    // True branch goes to ${node.trueTarget}, False to ${node.falseTarget}\n`;
                const condBlock = this.blocks.find(b => b.startPc === node.conditionBlockPc);
                if (condBlock) {
                    out += this.decompileBlock(condBlock);
                }
            }
        }
        
        out += '  }\n';
        out += '}\n';
        return out;
    }
}

module.exports = { YulDecompiler };
