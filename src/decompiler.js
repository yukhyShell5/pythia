class ABIDecompiler {
    constructor(blocks, edges) {
        this.blocks = blocks;
        this.edges = edges;
    }

    /**
     * Parcours le graphe en largeur pour trouver tous les blocs accessibles
     * à partir d'un point d'entrée (entryPc).
     */
    getReachableBlocks(startPc) {
        const reachable = new Set();
        const queue = [startPc];
        reachable.add(startPc);

        while (queue.length > 0) {
            const pc = queue.shift();
            for (const edge of this.edges) {
                if (edge.from === pc && !reachable.has(edge.to)) {
                    reachable.add(edge.to);
                    queue.push(edge.to);
                }
            }
        }
        return reachable;
    }

    /**
     * Génère l'ABI au format JSON standard
     */
    async generateABI() {
        const abi = [];
        const functions = new Map(); // selectorHex -> { entryPc, name }
        const events = new Map(); // topic0 -> { indexedCount }

        // 1. Recherche du Dispatcher : Identifier les sélecteurs de fonctions
        for (const block of this.blocks) {
            for (let i = 0; i < block.instructions.length; i++) {
                const ins = block.instructions[i];
                // 0x63 = PUSH4
                if (ins.opcode === 0x63 && ins.data) {
                    const selector = ins.data;
                    
                    // Un sélecteur typique est suivi d'un EQ (0x14) ou d'un DUP puis EQ
                    const nextIns = block.instructions[i + 1];
                    let isSelector = false;
                    
                    if (nextIns && nextIns.opcode === 0x14) isSelector = true;
                    if (ins.isSelector) isSelector = true; // Résolu par la Phase 2.2

                    if (isSelector) {
                        // Chercher l'arête JUMPI_TRUE sortant de ce bloc
                        const edgesFromHere = this.edges.filter(e => e.from === block.startPc && e.type === 'JUMPI_TRUE');
                        if (edgesFromHere.length > 0) {
                            const targetPc = edgesFromHere[0].to;
                            if (!functions.has(selector)) {
                                functions.set(selector, { entryPc: targetPc, name: ins.comment || null });
                            }
                        }
                    }
                }
            }
        }

        // 2. Inférer l'ABI pour chaque fonction identifiée
        for (const [selector, funcData] of functions.entries()) {
            const reachablePcs = this.getReachableBlocks(funcData.entryPc);
            const reachableBlocks = this.blocks.filter(b => reachablePcs.has(b.startPc));

            let modifiesState = false;
            let readsState = false;
            const calldataOffsets = new Set();
            let hasReturn = false;

            const calldataTypes = new Map();
            let lastOffset = null;

            for (const block of reachableBlocks) {
                for (const ins of block.instructions) {
                    // Opcodes modifiant l'état : SSTORE, TSTORE, LOG0..LOG4, CREATE, CALL, DELEGATECALL, SELFDESTRUCT
                    if (ins.opcode === 0x55 || ins.opcode === 0x5d || (ins.opcode >= 0xa0 && ins.opcode <= 0xa4) || 
                        ins.opcode === 0xf0 || ins.opcode === 0xf5 || ins.opcode === 0xff || 
                        ins.opcode === 0xf1 || ins.opcode === 0xf2 || ins.opcode === 0xf4) {
                        modifiesState = true;
                    }
                    
                    // Opcodes lisant l'état : SLOAD, TLOAD, BALANCE, EXTCODESIZE, EXTCODEHASH
                    if (ins.opcode === 0x54 || ins.opcode === 0x5c || ins.opcode === 0x31 || 
                        ins.opcode === 0x3b || ins.opcode === 0x3f) {
                        readsState = true;
                    }

                    // Arguments d'entrée : CALLDATALOAD
                    if (ins.opcode === 0x35) {
                        const idx = block.instructions.indexOf(ins);
                        // Si le CALLDATALOAD est précédé d'un PUSH, on peut extraire l'offset
                        if (idx > 0 && block.instructions[idx-1].opcode >= 0x60 && block.instructions[idx-1].opcode <= 0x7f) {
                            const offset = parseInt(block.instructions[idx-1].data, 16);
                            if (offset >= 4) { // Les arguments commencent après le sélecteur (4 octets)
                                calldataOffsets.add(offset);
                                calldataTypes.set(offset, "bytes32"); // par défaut
                                lastOffset = offset;
                            }
                        }
                    }

                    // Inférence de type `address` si masque 20 octets
                    if (ins.opcode === 0x16) { // AND
                        const idx = block.instructions.indexOf(ins);
                        if (idx > 0 && block.instructions[idx-1].opcode >= 0x60 && block.instructions[idx-1].opcode <= 0x7f) {
                            if (block.instructions[idx-1].data === "ffffffffffffffffffffffffffffffffffffffff") {
                                if (lastOffset !== null) {
                                    calldataTypes.set(lastOffset, "address");
                                }
                            }
                        }
                    }

                    // Détection des Événements (LOG1 à LOG4)
                    if (ins.opcode >= 0xa1 && ins.opcode <= 0xa4) {
                        const idx = block.instructions.indexOf(ins);
                        // topic0 (hash de la signature) est généralement poussé juste avant, mais parfois il y a des SWAP.
                        // On va chercher le dernier PUSH32 (ou PUSH en général) qui ressemble à un hash Keccak.
                        for (let j = idx - 1; j >= 0; j--) {
                            if (block.instructions[j].opcode === 0x7f) { // PUSH32
                                const topic0 = block.instructions[j].data;
                                if (!events.has(topic0)) {
                                    events.set(topic0, { indexedCount: ins.opcode - 0xa1 }); // LOG1 = 0 indexed params (just topic0)
                                }
                                break;
                            }
                        }
                    }

                    // Type de retour : RETURN
                    if (ins.opcode === 0xf3) {
                        hasReturn = true;
                    }
                }
            }

            // --- Heuristique de Mutabilité ---
            let mutability = "nonpayable"; // Par défaut
            if (!modifiesState && !readsState) mutability = "pure";
            else if (!modifiesState && readsState) mutability = "view";
            
            // Pour distinguer payable et nonpayable, on regarde le bloc d'entrée (entryPc)
            // En Solidity, une fonction nonpayable contient 'CALLVALUE ISZERO ... JUMPI REVERT'
            // Si on ne trouve pas de vérification de CALLVALUE au tout début, elle est payable !
            if (mutability === "nonpayable") {
                const entryBlock = reachableBlocks.find(b => b.startPc === funcData.entryPc);
                if (entryBlock) {
                    let hasCallvalueCheck = false;
                    for (let i = 0; i < entryBlock.instructions.length; i++) {
                        if (entryBlock.instructions[i].opcode === 0x34) { // CALLVALUE
                            hasCallvalueCheck = true;
                            break;
                        }
                    }
                    if (!hasCallvalueCheck) {
                        mutability = "payable";
                    }
                }
            }

            // --- Heuristique des Inputs ---
            const inputs = [];
            const sortedOffsets = Array.from(calldataOffsets).sort((a, b) => a - b);
            for (let i = 0; i < sortedOffsets.length; i++) {
                inputs.push({
                    name: `arg${i}`,
                    type: calldataTypes.get(sortedOffsets[i]) || "bytes32"
                });
            }

            // --- Heuristique des Outputs ---
            const outputs = [];
            if (hasReturn) {
                outputs.push({
                    name: "",
                    type: "bytes32"
                });
            }

            // --- Consolidation du Nom ---
            let finalName = `unknown_${selector.replace('0x', '')}`;
            if (funcData.name && funcData.name.includes('(')) {
                // Remplacer l'ABI heuristique par l'ABI de la signature résolue (Phase 2.2)
                finalName = funcData.name.split('(')[0];
                inputs.length = 0; // Nettoyer les arguments devinés
                const argsStr = funcData.name.split('(')[1].replace(')', '');
                if (argsStr.length > 0) {
                    const argTypes = argsStr.split(',');
                    argTypes.forEach((t, i) => {
                        inputs.push({ name: `arg${i}`, type: t });
                    });
                }
            }

            abi.push({
                type: "function",
                name: finalName,
                inputs: inputs,
                outputs: outputs,
                stateMutability: mutability
            });
        }

        // 3. Ajouter les Événements à l'ABI
        for (const [topic0, evtData] of events.entries()) {
            const inputs = [];
            for (let i = 0; i < evtData.indexedCount; i++) {
                inputs.push({
                    indexed: true,
                    name: `arg${i}`,
                    type: "bytes32"
                });
            }
            // Ajouter un paramètre non indexé par défaut pour les data (simplification)
            inputs.push({
                indexed: false,
                name: "data",
                type: "bytes"
            });

            abi.push({
                type: "event",
                name: `Event_${topic0.substring(0, 8)}`,
                inputs: inputs,
                anonymous: false
            });
        }

        return abi;
    }
}

module.exports = {
    ABIDecompiler
};
