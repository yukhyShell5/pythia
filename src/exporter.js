const fs = require('fs');
const path = require('path');

class CFGExporter {
    /**
     * @param {Array} edges - Le tableau d'arêtes généré par SymbolicEngine (cfgEdges)
     * @param {Array} blocks - Le tableau de Basic Blocks généré par Disassembler
     */
    constructor(edges, blocks = []) {
        // Déduplication des arêtes pour éviter les explosions de graphe
        // lorsque le moteur repasse plusieurs fois par le même chemin.
        const uniqueEdges = [];
        const seen = new Set();
        
        for (const edge of edges) {
            // on ignore l'instruction exacte de départ et on associe l'arête au bloc de départ
            const fromBlock = blocks.find(b => b.instructions.some(ins => ins.pc === edge.from));
            const realFrom = fromBlock ? fromBlock.startPc : edge.from;
            
            const key = `${realFrom}->${edge.to}:${edge.type}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueEdges.push({
                    from: realFrom,
                    to: edge.to,
                    type: edge.type,
                    originalInstruction: edge.from
                });
            }
        }
        
        this.edges = uniqueEdges;
        this.blocks = blocks;
    }

    /**
     * Supprime tous les blocs et arêtes qui ne sont pas atteignables depuis le point d'entrée (PC 0).
     */
    pruneUnreachable() {
        const reachableBlocks = new Set();
        const queue = [0]; // PC 0 est toujours le point d'entrée
        
        reachableBlocks.add(0);
        
        // Trouver tous les blocs atteignables
        while (queue.length > 0) {
            const currentPc = queue.shift();
            
            // Trouver les arêtes sortant de ce bloc
            for (const edge of this.edges) {
                if (edge.from === currentPc) {
                    if (!reachableBlocks.has(edge.to)) {
                        reachableBlocks.add(edge.to);
                        queue.push(edge.to);
                    }
                }
            }
        }
        
        // Filtrer les blocs
        this.blocks = this.blocks.filter(b => reachableBlocks.has(b.startPc));
        // Filtrer les arêtes
        this.edges = this.edges.filter(e => reachableBlocks.has(e.from) && reachableBlocks.has(e.to));
    }

    /**
     * Exporte les arêtes et blocs au format JSON pur.
     */
    toJson() {
        return JSON.stringify({ blocks: this.blocks, edges: this.edges }, null, 2);
    }

    /**
     * Exporte le graphe au format Graphviz DOT avec le détail des Basic Blocks.
     */
    toDot() {
        let dot = 'digraph EVM_CFG {\n';
        dot += '  node [shape=box, style=filled, fillcolor="#f0f0f0", fontname="Courier", align="left"];\n';
        dot += '  edge [fontname="Courier", fontsize=10];\n\n';

        // 1. Déclarer tous les nœuds (Basic Blocks)
        for (const block of this.blocks) {
            let label = `Block @ PC ${block.startPc}\\l`;
            label += `----------------------\\l`;
            for (const ins of block.instructions) {
                const hexPc = ins.pc.toString(16).padStart(4, '0').toUpperCase();
                let line = `0x${hexPc}: ${ins.mnemonic}`;
                if (ins.data) {
                    line += ` ${ins.data}`;
                }
                label += `${line}\\l`; // \l force le retour à la ligne justifié à gauche dans Graphviz
            }
            dot += `  "PC_${block.startPc}" [label="${label}"];\n`;
        }

        dot += '\n';

        // 2. Déclarer les arêtes (Edges)
        for (const edge of this.edges) {
            let color = 'black';
            if (edge.type === 'JUMPI_TRUE') color = 'green';
            if (edge.type === 'JUMPI_FALSE') color = 'red';
            if (edge.type === 'JUMP_DYNAMIC') color = 'blue';

            // La destination est toujours le début d'un bloc (JUMPDEST)
            dot += `  "PC_${edge.from}" -> "PC_${edge.to}" [label="${edge.type}", color="${color}", fontcolor="${color}"];\n`;
        }

        dot += '}\n';
        return dot;
    }

    /**
     * Sauvegarde les exports dans des fichiers.
     * @param {String} outputPath - Chemin du fichier de destination (sans extension)
     */
    saveAll(outputPath) {
        const jsonPath = `${outputPath}.json`;
        const dotPath = `${outputPath}.dot`;

        fs.writeFileSync(jsonPath, this.toJson(), 'utf8');
        fs.writeFileSync(dotPath, this.toDot(), 'utf8');

        console.log(`[Export] Files generated successfully:`);
        console.log(`  - ${jsonPath}`);
        console.log(`  - ${dotPath}`);
    }
}

module.exports = {
    CFGExporter
};
