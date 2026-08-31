function getMathOpcodes(z3) {
    const Z3_ONE = z3.BitVec.val(1, 256);
    const Z3_ZERO = z3.BitVec.val(0, 256);

    return {
        // --- Opérations Arithmétiques ---
        0x01: { name: 'ADD', args: 2, exec: (a, b) => a.add(b) },
        0x02: { name: 'MUL', args: 2, exec: (a, b) => a.mul(b) },
        0x03: { name: 'SUB', args: 2, exec: (a, b) => a.sub(b) },
        0x04: { name: 'DIV', args: 2, exec: (a, b) => z3.If(b.eq(Z3_ZERO), Z3_ZERO, a.udiv(b)) },
        0x05: { name: 'SDIV', args: 2, exec: (a, b) => z3.If(b.eq(Z3_ZERO), Z3_ZERO, a.sdiv(b)) },
        0x06: { name: 'MOD', args: 2, exec: (a, b) => z3.If(b.eq(Z3_ZERO), Z3_ZERO, a.urem(b)) },
        0x07: { name: 'SMOD', args: 2, exec: (a, b) => z3.If(b.eq(Z3_ZERO), Z3_ZERO, a.srem(b)) },
        0x08: { name: 'ADDMOD', args: 3, exec: (a, b, m) => z3.If(m.eq(Z3_ZERO), Z3_ZERO, a.add(b).urem(m)) },
        0x09: { name: 'MULMOD', args: 3, exec: (a, b, m) => z3.If(m.eq(Z3_ZERO), Z3_ZERO, a.mul(b).urem(m)) },
        0x0a: { name: 'EXP', args: 2, exec: (a, b) => z3.BitVec.const(`exp_${Math.random()}`, 256) }, // Z3 ne gère pas bien l'EXP binaire, on met une variable symbolique
        0x0b: { name: 'SIGNEXTEND', args: 2, exec: (a, b) => z3.BitVec.const(`signextend_${Math.random()}`, 256) }, // Complexe à écrire de façon concise en Z3 JS

        // --- Comparaisons ---
        0x10: { name: 'LT', args: 2, exec: (a, b) => z3.If(a.ult(b), Z3_ONE, Z3_ZERO) },
        0x11: { name: 'GT', args: 2, exec: (a, b) => z3.If(a.ugt(b), Z3_ONE, Z3_ZERO) },
        0x12: { name: 'SLT', args: 2, exec: (a, b) => z3.If(a.slt(b), Z3_ONE, Z3_ZERO) },
        0x13: { name: 'SGT', args: 2, exec: (a, b) => z3.If(a.sgt(b), Z3_ONE, Z3_ZERO) },
        0x14: { name: 'EQ', args: 2, exec: (a, b) => z3.If(a.eq(b), Z3_ONE, Z3_ZERO) },
        0x15: { name: 'ISZERO', args: 1, exec: (a) => z3.If(a.eq(Z3_ZERO), Z3_ONE, Z3_ZERO) },

        // --- Logique Binaire (Bitwise) ---
        0x16: { name: 'AND', args: 2, exec: (a, b) => a.and(b) },
        0x17: { name: 'OR',  args: 2, exec: (a, b) => a.or(b) },
        0x18: { name: 'XOR', args: 2, exec: (a, b) => a.xor(b) },
        0x19: { name: 'NOT', args: 1, exec: (a) => a.not() },
        0x1a: { name: 'BYTE', args: 2, exec: (i, x) => z3.BitVec.const(`byte_${Math.random()}`, 256) }, // Approximation
        0x1b: { name: 'SHL', args: 2, exec: (shift, value) => value.shl(shift) },
        0x1c: { name: 'SHR', args: 2, exec: (shift, value) => value.lshr(shift) },
        0x1d: { name: 'SAR', args: 2, exec: (shift, value) => z3.BitVec.const(`sar_${Math.random()}`, 256) }, // Approximation si ashr n'est pas dispo
        
        // --- Hash ---
        0x20: { name: 'SHA3', args: 2, exec: (offset, length) => z3.BitVec.const(`sha3_${Math.random()}`, 256) }
    };
}

module.exports = { getMathOpcodes };
