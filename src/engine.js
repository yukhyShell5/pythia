const { initZ3, SymbolicState } = require('./state.js');
const { getMathOpcodes } = require('./opcodes.js');
const { Disassembler, getMnemonic } = require('./disassembler.js');
const { getStackEffect } = require('./stack_effects.js');

class SymbolicEngine {
    constructor(bytecodeHex, z3Context, maxDepth = 1000) {
        this.z3 = z3Context;
        this.solver = new this.z3.Solver(); // ONE global solver to prevent memory leaks
        this.mathOpcodes = getMathOpcodes(this.z3);
        
        this.bytecodeHex = bytecodeHex.replace(/^0x/, '');
        this.bytecode = Buffer.from(this.bytecodeHex, 'hex');
        
        this.cfgEdges = [];
        this.validJumpDests = this._findValidJumpDests();
        
        // --- PHASE 4.1 : CONSTRUCTION DES BASIC BLOCKS ---
        const execLength = this._getExecutableLength();
        this.basicBlocks = Disassembler.buildBasicBlocks(this.bytecode, this.validJumpDests, execLength);
        
        this.queue = [];
        this.MAX_DEPTH = maxDepth;
    }

    /**
     * Parcourt le bytecode une seule fois au démarrage pour trouver les VRAIS JUMPDEST.
     * Ignore les métadonnées CBOR (Swarm/IPFS hash) situées à la fin du contrat.
     */
    _findValidJumpDests() {
        const dests = new Set();
        const execLength = this._getExecutableLength();
        
        let i = 0;
        while (i < execLength) {
            const opcode = this.bytecode[i];
            if (opcode >= 0x60 && opcode <= 0x7f) {
                i += (opcode - 0x60) + 2; 
            } else {
                if (opcode === 0x5b) {
                    dests.add(i);
                }
                i += 1;
            }
        }
        return dests;
    }

    /**
     * Heuristique avancée pour détecter et ignorer les métadonnées CBOR de Solidity.
     */
    _getExecutableLength() {
        const len = this.bytecode.length;
        if (len < 2) return len;
        
        const metadataLen = (this.bytecode[len - 2] << 8) | this.bytecode[len - 1];
        
        if (metadataLen > 0 && metadataLen < len - 2) {
            const cborStart = len - 2 - metadataLen;
            const marker = this.bytecode[cborStart];
            
            if (marker === 0xa1 || marker === 0xa2 || marker === 0xa3) {
                return cborStart;
            }
        }
        return len;
    }

    /**
     * Boucle principale de l'exécution symbolique.
     */
    async run() {
        const initialState = new SymbolicState(this.z3);
        initialState.pc = 0;
        this.queue.push(initialState);
        
        // Utilisation d'un Set pour la déduplication parfaite des états
        this.visitedStates = new Set();
        this.visited = new Map(); 
        
        

        let iter = 0;
        while (this.queue.length > 0) {
            iter++;
            if (iter % 1000 === 0) {
                if (global.logLevel >= 2) console.log(`[+] Visited ${this.visitedStates.size} states (Queue: ${this.queue.length}, Depth: ${this.queue[this.queue.length-1].depth})`);
                // Forcer le ramasse-miettes V8 pour nettoyer les vieux ASTs C++ si l'option est activée
                if (global.gc) {
                    global.gc();
                }
                // Rendre la main à l'event loop pour le background GC
                await new Promise(r => setTimeout(r, 0));
            }
            
            let state = this.queue.pop();
            if (state.pc >= this.bytecode.length) {
                continue; 
            }

            // --- DÉDUPLICATION EXACTE (State Merging) ---
            const stateHash = state.hash();
            if (this.visitedStates.has(stateHash)) {
                // Cet état (PC + Pile + Mémoire) a déjà été exploré à l'identique.
                continue;
            }
            this.visitedStates.add(stateHash);

            // --- HEURISTIQUE (Protection contre les boucles avec état changeant) ---
            const visitCount = (this.visited.get(state.pc) || 0) + 1;
            this.visited.set(state.pc, visitCount);
            if (visitCount > 1000) {
                // On a visité ce bloc plus de 20 fois avec des états DIFFÉRENTS (ex: compteur de boucle).
                continue;
            }

            // --- SÉCURITÉ : Dépassement de la profondeur (Boucle Infinie) ---
            if (state.depth >= this.MAX_DEPTH) {
                console.warn(`[Security Alert] Path killed due to excessive depth (PC: ${state.pc}). Probable infinite loop.`);
                continue; // On abandonne ce chemin
            }
            state.depth += 1; // On incrémente le compteur d'exécution pour ce chemin

            let opcode = this.bytecode[state.pc];
            await this.executeOpcode(state, opcode);
        }
    }

    /**
     * Le routeur d'instructions (Le grand "Switch").
     * On l'implémente étape par étape pour éviter tout bug.
     */
    async executeOpcode(state, opcode) {
        // === FAMILLE : PUSH (0x5F à 0x7F) ===
        if (opcode >= 0x5f && opcode <= 0x7f) {
            let dataHex = '0';
            let pushSize = 0;
            
            if (opcode !== 0x5f) {
                pushSize = (opcode - 0x60) + 1;
                const dataBytes = this.bytecode.slice(state.pc + 1, state.pc + 1 + pushSize);
                dataHex = dataBytes.toString('hex') || '0';
            }
            
            // CRÉATION MATHÉMATIQUE : On injecte une valeur concrète de 256 bits dans Z3
            // Z3 gère les grands nombres via BigInt natif Javascript
            const z3Value = this.z3.BitVec.val(BigInt('0x' + dataHex), 256);
            
            state.stack.push(z3Value);
            
            // On avance le PC (1 octet pour l'opcode + la taille des données)
            state.pc += 1 + pushSize;
            
            // On remet l'état dans la file pour lire l'instruction suivante
            this.queue.push(state);
            return;
        }

        // === FAMILLE : DUP (0x80 à 0x8F) ===
        if (opcode >= 0x80 && opcode <= 0x8f) {
            const depth = (opcode - 0x80) + 1;
            if (state.stack.length < depth) return;
            const value = state.stack[state.stack.length - depth];
            state.stack.push(value);
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // === FAMILLE : SWAP (0x90 à 0x9F) ===
        if (opcode >= 0x90 && opcode <= 0x9f) {
            const depth = (opcode - 0x90) + 1;
            if (state.stack.length < depth + 1) return;
            const topIndex = state.stack.length - 1;
            const targetIndex = state.stack.length - 1 - depth;
            const topValue = state.stack[topIndex];
            state.stack[topIndex] = state.stack[targetIndex];
            state.stack[targetIndex] = topValue;
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // POP (0x50)
        if (opcode === 0x50) {
            if (state.stack.length < 1) return;
            state.stack.pop();
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // === FAMILLE : HALT / FIN (0x00, 0xF3, 0xFD, 0xFE, 0xFF) ===
        if (opcode === 0x00 || opcode === 0xf3 || opcode === 0xfd || opcode === 0xfe || opcode === 0xff) {
            // C'est une fin de chemin valide (STOP, RETURN, REVERT, INVALID, SELFDESTRUCT).
            // L'état est détruit (on ne le remet PAS dans la file).
            return;
        }
        
        // === FAMILLE : MATHÉMATIQUES (ADD, MUL, EQ, etc.) ===
        if (this.mathOpcodes[opcode]) {
            const mathOp = this.mathOpcodes[opcode];
            
            // Vérification de sécurité : a-t-on assez d'éléments sur la pile ?
            if (state.stack.length < mathOp.args) {
                // Stack Underflow (Erreur d'exécution EVM classique)
                return; 
            }
            
            // On dépile les arguments. Attention à l'ordre dans l'EVM : 
            // le premier élément dépilé est "a", le second est "b".
            const args = [];
            for (let i = 0; i < mathOp.args; i++) {
                args.push(state.stack.pop());
            }
            
            // On exécute la fonction Z3 définie dans opcodes.js
            const result = mathOp.exec(...args);
            
            // On empile le nouvel AST Z3
            state.stack.push(result);
            
            // On avance le PC et on continue
            state.pc += 1;
            this.queue.push(state);
            return;
        }
        
        // === FAMILLE : ENVIRONNEMENT (Inconnues de la blockchain) ===
        // CALLDATALOAD (0x35)
        if (opcode === 0x35) {
            if (state.stack.length < 1) return;
            const offsetAst = state.stack.pop();
            const symVarName = `calldata_pc${state.pc}`;
            const symbolicX = this.z3.BitVec.const(symVarName, 256);
            state.stack.push(symbolicX);
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // CALLDATASIZE (0x36)
        if (opcode === 0x36) {
            const symVarName = `calldatasize`;
            const symbolicX = this.z3.BitVec.const(symVarName, 256);
            state.stack.push(symbolicX);
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // CALLVALUE (0x34)
        if (opcode === 0x34) {
            const symVarName = `callvalue`;
            const symbolicX = this.z3.BitVec.const(symVarName, 256);
            state.stack.push(symbolicX);
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // CODESIZE (0x38)
        if (opcode === 0x38) {
            state.stack.push(this.z3.BitVec.val(this.bytecode.length, 256));
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // PC (0x58)
        if (opcode === 0x58) {
            state.stack.push(this.z3.BitVec.val(state.pc, 256));
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // === FAMILLE : CONTRÔLE DE FLUX (Sauts) ===
        // JUMPI (0x57) - Saut Conditionnel
        if (opcode === 0x57) {
            if (state.stack.length < 2) return;
            const destAst = state.stack.pop();
            const condAst = state.stack.pop();
            const Z3_ZERO = this.z3.BitVec.val(0, 256);
            
            // --- BRANCHE TRUE (Saut) ---
            this.solver.reset();
            for (const constraint of state.pathConstraints) {
                this.solver.add(constraint);
            }
            const condTrue = this.z3.Not(condAst.eq(Z3_ZERO));
            this.solver.add(condTrue);
            
            if (["sat", "unknown"].includes(await this.solver.check())) {
                let destPc = null;
                try {
                    const model = this.solver.model();
                    const concreteDest = model.eval(destAst, true);
                    destPc = Number(concreteDest.value());
                } catch(e) {}
                
                if (destPc !== null && this.validJumpDests.has(destPc)) {
                    const stateTrue = state.clone();
                    stateTrue.pc = destPc;
                    stateTrue.pathConstraints.push(condTrue); // On sauvegarde la contrainte
                    this.cfgEdges.push({ from: state.pc, to: destPc, type: 'JUMPI_TRUE' });
                    this.queue.push(stateTrue);
                }
            }
            
            // --- BRANCHE FALSE (Pas de saut) ---
            this.solver.reset();
            for (const constraint of state.pathConstraints) {
                this.solver.add(constraint);
            }
            const condFalse = condAst.eq(Z3_ZERO);
            this.solver.add(condFalse);
            
            if (["sat", "unknown"].includes(await this.solver.check())) {
                const stateFalse = state.clone();
                stateFalse.pc = state.pc + 1;
                stateFalse.pathConstraints.push(condFalse); // On sauvegarde la contrainte
                this.cfgEdges.push({ from: state.pc, to: stateFalse.pc, type: 'JUMPI_FALSE' });
                this.queue.push(stateFalse);
            }
            
            return;
        }

        // JUMP (0x56) - Saut Dynamique / Inconditionnel
        if (opcode === 0x56) {
            if (state.stack.length < 1) return;
            const destAst = state.stack.pop();
            const originalPc = state.pc;
            
            this.solver.reset();
            for (const constraint of state.pathConstraints) {
                this.solver.add(constraint);
            }
            
            if (["sat", "unknown"].includes(await this.solver.check())) {
                let model;
                try { model = this.solver.model(); } catch (e) {}
                
                if (model) {
                    const firstConcrete = model.eval(destAst, true);
                    let firstDestPc = null;
                    try { firstDestPc = Number(firstConcrete.value()); } catch(e) {}
                    
                    if (firstDestPc !== null) {
                        // OPTIMISATION MAJEURE : On demande à Z3 s'il existe une AUTRE destination possible.
                        this.solver.push(); // Sauvegarde l'état du solveur
                        const firstTargetVal = this.z3.BitVec.val(firstDestPc, 256);
                        this.solver.add(this.z3.Not(destAst.eq(firstTargetVal)));
                        const isDynamic = (await this.solver.check()) === "sat";
                        this.solver.pop(); // Restauration de l'état
                        
                        if (!isDynamic) {
                            // Le saut est statique/concret ! Une seule destination possible.
                            if (this.validJumpDests.has(firstDestPc)) {
                                const newState = state.clone();
                                newState.pc = firstDestPc;
                                this.cfgEdges.push({ from: originalPc, to: firstDestPc, type: 'JUMP' });
                                this.queue.push(newState);
                            }
                            return; // Fini, on a esquivé la boucle !
                        }
                    }
                }
                
                // Si on arrive ici, le saut est VRAIMENT DYNAMIQUE.
                // On boucle sur validJumpDests pour trouver toutes les cibles possibles.
                for (const jumpDest of this.validJumpDests) {
                    this.solver.push();
                    const targetVal = this.z3.BitVec.val(jumpDest, 256);
                    this.solver.add(destAst.eq(targetVal));
                    
                    if (["sat", "unknown"].includes(await this.solver.check())) {
                        const newState = state.clone();
                        newState.pc = jumpDest;
                        newState.pathConstraints.push(destAst.eq(targetVal));
                        this.cfgEdges.push({ from: originalPc, to: jumpDest, type: 'JUMP_DYNAMIC' });
                        this.queue.push(newState);
                    }
                    this.solver.pop();
                }
            }
            return;
        }

        // JUMPDEST (0x5B) - Piste d'atterrissage
        if (opcode === 0x5b) {
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // === FAMILLE : MÉMOIRE (MLOAD, MSTORE) ===
        // MLOAD (0x51)
        if (opcode === 0x51) {
            if (state.stack.length < 1) return;
            const offset = state.stack.pop();
            
            let value = this.z3.BitVec.val(0, 256);
            try {
                let key = null;
                if (this.z3.isBitVecVal(offset)) {
                    key = offset.value().toString();
                } else {
                    const simp = await this.z3.simplify(offset);
                    if (this.z3.isBitVecVal(simp)) {
                        key = simp.value().toString();
                    }
                }
                if (key !== null && state.memory.has(key)) {
                    value = state.memory.get(key);
                }
            } catch(e) {}
            
            state.stack.push(value);
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // MSTORE (0x52)
        if (opcode === 0x52) {
            if (state.stack.length < 2) return;
            const offset = state.stack.pop();
            const value = state.stack.pop();
            
            try {
                let key = null;
                if (this.z3.isBitVecVal(offset)) {
                    key = offset.value().toString();
                } else {
                    const simp = await this.z3.simplify(offset);
                    if (this.z3.isBitVecVal(simp)) {
                        key = simp.value().toString();
                    }
                }
                if (key !== null) {
                    state.memory.set(key, value);
                }
            } catch(e) {}
            
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // === STORAGE (SLOAD, SSTORE) ===
        // SLOAD (0x54)
        if (opcode === 0x54) {
            if (state.stack.length < 1) return;
            const offset = state.stack.pop();
            
            let value = this.z3.BitVec.val(0, 256);
            try {
                let key = null;
                if (this.z3.isBitVecVal(offset)) {
                    key = offset.value().toString();
                } else {
                    const simp = await this.z3.simplify(offset);
                    if (this.z3.isBitVecVal(simp)) {
                        key = simp.value().toString();
                    }
                }
                if (key !== null && state.storage.has(key)) {
                    value = state.storage.get(key);
                }
            } catch(e) {}
            
            state.stack.push(value);
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // SSTORE (0x55)
        if (opcode === 0x55) {
            if (state.stack.length < 2) return;
            const offset = state.stack.pop();
            const value = state.stack.pop();
            
            try {
                let key = null;
                if (this.z3.isBitVecVal(offset)) {
                    key = offset.value().toString();
                } else {
                    const simp = await this.z3.simplify(offset);
                    if (this.z3.isBitVecVal(simp)) {
                        key = simp.value().toString();
                    }
                }
                if (key !== null) {
                    state.storage.set(key, value);
                }
            } catch(e) {}
            
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // TLOAD (0x5C) - EIP-1153 Transient Storage
        if (opcode === 0x5c) {
            if (state.stack.length < 1) return;
            const offset = state.stack.pop();
            
            let value = this.z3.BitVec.val(0, 256);
            try {
                let key = null;
                if (this.z3.isBitVecVal(offset)) {
                    key = offset.value().toString();
                } else {
                    const simp = await this.z3.simplify(offset);
                    if (this.z3.isBitVecVal(simp)) {
                        key = simp.value().toString();
                    }
                }
                if (key !== null && state.tstorage.has(key)) {
                    value = state.tstorage.get(key);
                }
            } catch(e) {}
            
            state.stack.push(value);
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // TSTORE (0x5D) - EIP-1153 Transient Storage
        if (opcode === 0x5d) {
            if (state.stack.length < 2) return;
            const offset = state.stack.pop();
            const value = state.stack.pop();
            
            try {
                let key = null;
                if (this.z3.isBitVecVal(offset)) {
                    key = offset.value().toString();
                } else {
                    const simp = await this.z3.simplify(offset);
                    if (this.z3.isBitVecVal(simp)) {
                        key = simp.value().toString();
                    }
                }
                if (key !== null) {
                    state.tstorage.set(key, value);
                }
            } catch(e) {}
            
            state.pc += 1;
            this.queue.push(state);
            return;
        }

        // === FALLBACK INTELLIGENT ===
        // Implémentation générique pour tous les autres opcodes restants.
        // Utilise la table des effets de pile pour ne pas corrompre le CFG,
        // et crée des variables symboliques nommées d'après l'opcode réel !
        const [pops, pushes] = getStackEffect(opcode);
        if (state.stack.length < pops) return; // Underflow
        for (let i = 0; i < pops; i++) {
            state.stack.pop();
        }
        const mnemonic = getMnemonic(opcode) || `OP_${opcode}`;
        for (let i = 0; i < pushes; i++) {
            state.stack.push(this.z3.BitVec.const(`${mnemonic}_${state.pc}_${i}`, 256));
        }
        
        state.pc += 1;
        this.queue.push(state);
    }
}

module.exports = {
    SymbolicEngine
};
