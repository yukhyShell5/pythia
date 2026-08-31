const MNEMONICS = {
    0x00: 'STOP',
    0x01: 'ADD', 0x02: 'MUL', 0x03: 'SUB', 0x04: 'DIV', 0x05: 'SDIV', 0x06: 'MOD', 0x07: 'SMOD',
    0x08: 'ADDMOD', 0x09: 'MULMOD', 0x0a: 'EXP', 0x0b: 'SIGNEXTEND',
    0x10: 'LT', 0x11: 'GT', 0x12: 'SLT', 0x13: 'SGT', 0x14: 'EQ', 0x15: 'ISZERO', 0x16: 'AND',
    0x17: 'OR', 0x18: 'XOR', 0x19: 'NOT', 0x1a: 'BYTE', 0x1b: 'SHL', 0x1c: 'SHR', 0x1d: 'SAR',
    0x20: 'SHA3',
    0x30: 'ADDRESS', 0x31: 'BALANCE', 0x32: 'ORIGIN', 0x33: 'CALLER', 0x34: 'CALLVALUE',
    0x35: 'CALLDATALOAD', 0x36: 'CALLDATASIZE', 0x37: 'CALLDATACOPY', 0x38: 'CODESIZE',
    0x39: 'CODECOPY', 0x3a: 'GASPRICE', 0x3b: 'EXTCODESIZE', 0x3c: 'EXTCODECOPY',
    0x3d: 'RETURNDATASIZE', 0x3e: 'RETURNDATACOPY', 0x3f: 'EXTCODEHASH',
    0x40: 'BLOCKHASH', 0x41: 'COINBASE', 0x42: 'TIMESTAMP', 0x43: 'NUMBER', 0x44: 'PREVRANDAO',
    0x45: 'GASLIMIT', 0x46: 'CHAINID', 0x47: 'SELFBALANCE', 0x48: 'BASEFEE',
    0x50: 'POP', 0x51: 'MLOAD', 0x52: 'MSTORE', 0x53: 'MSTORE8', 0x54: 'SLOAD', 0x55: 'SSTORE',
    0x56: 'JUMP', 0x57: 'JUMPI', 0x58: 'PC', 0x59: 'MSIZE', 0x5a: 'GAS', 0x5b: 'JUMPDEST', 0x5f: 'PUSH0',
    0xf0: 'CREATE', 0xf1: 'CALL', 0xf2: 'CALLCODE', 0xf3: 'RETURN', 0xf4: 'DELEGATECALL',
    0xf5: 'CREATE2', 0xfa: 'STATICCALL', 0xfd: 'REVERT', 0xfe: 'INVALID', 0xff: 'SELFDESTRUCT'
};

function getMnemonic(opcode) {
    if (MNEMONICS[opcode]) return MNEMONICS[opcode];
    if (opcode >= 0x60 && opcode <= 0x7f) return `PUSH${opcode - 0x60 + 1}`;
    if (opcode >= 0x80 && opcode <= 0x8f) return `DUP${opcode - 0x80 + 1}`;
    if (opcode >= 0x90 && opcode <= 0x9f) return `SWAP${opcode - 0x90 + 1}`;
    if (opcode >= 0xa0 && opcode <= 0xa4) return `LOG${opcode - 0xa0}`;
    return `UNKNOWN_${opcode.toString(16)}`;
}

class Disassembler {
    /**
     * Désassemble linéairement le bytecode et le regroupe en Basic Blocks.
     * @param {Buffer} bytecode 
     * @param {Set} validJumpDests 
     * @param {Number} execLength 
     * @returns {Array} Liste des Basic Blocks
     */
    static buildBasicBlocks(bytecode, validJumpDests, execLength) {
        let i = 0;
        let currentBlock = { startPc: 0, instructions: [] };
        const blocks = [];
        
        while (i < execLength) {
            const pc = i;
            const opcode = bytecode[i];
            const mnemonic = getMnemonic(opcode);
            let data = null;
            
            // Si on rencontre un JUMPDEST, cela force le début d'un nouveau block
            // (sauf si le bloc actuel est complètement vide)
            if (opcode === 0x5b && validJumpDests.has(pc) && currentBlock.instructions.length > 0) {
                blocks.push(currentBlock);
                currentBlock = { startPc: pc, instructions: [] };
            }
            
            // Traitement des données PUSH
            if (opcode >= 0x60 && opcode <= 0x7f) {
                const pushSize = (opcode - 0x60) + 1;
                const dataBytes = bytecode.slice(i + 1, i + 1 + pushSize);
                data = "0x" + (dataBytes.toString('hex') || '0');
                i += pushSize; // Sauter les données
            }
            
            currentBlock.instructions.push({ pc, opcode, mnemonic, data });
            i += 1;
            
            // Si l'instruction termine le flux (JUMP, JUMPI, STOP, REVERT, RETURN, INVALID)
            // cela clôture le block actuel.
            if ([0x56, 0x57, 0x00, 0xf3, 0xfd, 0xfe].includes(opcode)) {
                blocks.push(currentBlock);
                if (i < execLength) {
                    currentBlock = { startPc: i, instructions: [] };
                } else {
                    currentBlock = null;
                }
            }
        }
        
        // Pousser le dernier bloc s'il n'est pas vide
        if (currentBlock && currentBlock.instructions.length > 0) {
            blocks.push(currentBlock);
        }
        
        return blocks;
    }
}

module.exports = {
    Disassembler,
    getMnemonic
};
