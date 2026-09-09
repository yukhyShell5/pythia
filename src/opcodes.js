function getMathOpcodes(z3) {
    const Z3_ONE  = z3.BitVec.val(1, 256);
    const Z3_ZERO = z3.BitVec.val(0, 256);

    /**
     * Crée une variable symbolique STABLE pour les opcodes que Z3 BitVec ne peut pas
     * modéliser nativement (EXP, BYTE, SIGNEXTEND).
     *
     * ❌ Ancien comportement : `z3.BitVec.const('exp_' + Math.random(), 256)`
     *    → Chaque évaluation produit une variable DIFFÉRENTE.
     *    → Z3 ne peut jamais relier deux occurrences de la même expression,
     *      rendant les contraintes inter-branches inutilisables.
     *
     * ✅ Nouveau comportement : utilise les IDs internes des nœuds Z3 (.ast).
     *    Z3 utilise le "hash consing" : deux expressions identiques partagent
     *    le même nœud C++, donc le même .ast (entier). Le nom est ainsi
     *    DÉTERMINISTE et REPRODUCTIBLE — le même couple (base, exp) donnera
     *    toujours le même nom de variable symbolique, quelle que soit la branche.
     */
    const stableSymbol = (name, ...operands) =>
        z3.BitVec.const(`${name}_${operands.map(o => o.ast).join('_')}`, 256);

    return {
        // ── Arithmétique ───────────────────────────────────────────────────────
        0x01: { name: 'ADD',        args: 2, exec: (a, b) => a.add(b) },
        0x02: { name: 'MUL',        args: 2, exec: (a, b) => a.mul(b) },
        0x03: { name: 'SUB',        args: 2, exec: (a, b) => a.sub(b) },
        0x04: { name: 'DIV',        args: 2, exec: (a, b) => z3.If(b.eq(Z3_ZERO), Z3_ZERO, a.udiv(b)) },
        0x05: { name: 'SDIV',       args: 2, exec: (a, b) => z3.If(b.eq(Z3_ZERO), Z3_ZERO, a.sdiv(b)) },
        0x06: { name: 'MOD',        args: 2, exec: (a, b) => z3.If(b.eq(Z3_ZERO), Z3_ZERO, a.urem(b)) },
        0x07: { name: 'SMOD',       args: 2, exec: (a, b) => z3.If(b.eq(Z3_ZERO), Z3_ZERO, a.srem(b)) },
        0x08: { name: 'ADDMOD',     args: 3, exec: (a, b, m) => z3.If(m.eq(Z3_ZERO), Z3_ZERO, a.add(b).urem(m)) },
        0x09: { name: 'MULMOD',     args: 3, exec: (a, b, m) => z3.If(m.eq(Z3_ZERO), Z3_ZERO, a.mul(b).urem(m)) },

        // EXP (0x0a): La théorie BitVec de Z3 n'a pas d'opérateur d'exponentiation.
        // On modélise par une fonction non-interprétée STABLE : le même couple
        // (base, exposant) → toujours la même variable symbolique.
        0x0a: { name: 'EXP',        args: 2, exec: (base, exp)  => stableSymbol('exp', base, exp) },

        // SIGNEXTEND (0x0b): extension de signe sur b bits.
        // Complexe à encoder proprement en Z3 BitVec 256-bit ; stable UF.
        0x0b: { name: 'SIGNEXTEND', args: 2, exec: (b, x)       => stableSymbol('signext', b, x) },

        // ── Comparaisons ───────────────────────────────────────────────────────
        0x10: { name: 'LT',    args: 2, exec: (a, b) => z3.If(a.ult(b), Z3_ONE, Z3_ZERO) },
        0x11: { name: 'GT',    args: 2, exec: (a, b) => z3.If(a.ugt(b), Z3_ONE, Z3_ZERO) },
        0x12: { name: 'SLT',   args: 2, exec: (a, b) => z3.If(a.slt(b), Z3_ONE, Z3_ZERO) },
        0x13: { name: 'SGT',   args: 2, exec: (a, b) => z3.If(a.sgt(b), Z3_ONE, Z3_ZERO) },
        0x14: { name: 'EQ',    args: 2, exec: (a, b) => z3.If(a.eq(b),  Z3_ONE, Z3_ZERO) },
        0x15: { name: 'ISZERO',args: 1, exec: (a)    => z3.If(a.eq(Z3_ZERO), Z3_ONE, Z3_ZERO) },

        // ── Opérations binaires (Bitwise) ──────────────────────────────────────
        0x16: { name: 'AND',  args: 2, exec: (a, b) => a.and(b) },
        0x17: { name: 'OR',   args: 2, exec: (a, b) => a.or(b)  },
        0x18: { name: 'XOR',  args: 2, exec: (a, b) => a.xor(b) },
        0x19: { name: 'NOT',  args: 1, exec: (a)    => a.not()  },

        // BYTE (0x1a): extrait l'octet i du mot 256-bit x → stableSymbol.
        0x1a: { name: 'BYTE', args: 2, exec: (i, x) => stableSymbol('byte', i, x) },

        0x1b: { name: 'SHL',  args: 2, exec: (shift, value) => value.shl(shift)  },
        0x1c: { name: 'SHR',  args: 2, exec: (shift, value) => value.lshr(shift) },

        // SAR (0x1d): décalage arithmétique SIGNÉ (préserve le bit de signe).
        // ❌ Ancien : Math.random() → variable aléatoire inutilisable par Z3.
        // ✅ Nouveau : .shr() dans ce binding z3-solver JS correspond au décalage
        //   arithmétique (confirmé : shr(0xFF, 1) = 0xFF, lshr(0xFF, 1) = 0x7F).
        0x1d: { name: 'SAR',  args: 2, exec: (shift, value) => value.shr(shift) },

        // ── Hash ───────────────────────────────────────────────────────────────
        // keccak256 est une fonction de hachage cryptographique → non inversible par Z3.
        // Même couple (offset, length) → même symbole stable.
        0x20: { name: 'SHA3', args: 2, exec: (offset, length) => stableSymbol('keccak256', offset, length) },
    };
}

module.exports = { getMathOpcodes };
