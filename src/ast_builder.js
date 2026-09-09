/**
 * ASTBuilder — construit un AST hiérarchique et structuré à partir du CFG.
 *
 * Améliorations vs version plate :
 * 1. `findMergePoint` : BFS-intersection pour trouver le post-dominateur immédiat
 *    d'une paire (branche-vraie, branche-fausse). Permet de délimiter if/else sans goto.
 * 2. Nœuds `If` RÉCURSIFS : trueBranch / falseBranch sont des sous-ASTs complets,
 *    bornés par le mergePoint.
 * 3. Nœuds `While` RÉCURSIFS : la body est un sous-AST borné par le back-edge target.
 * 4. `loopHeaders` : les builders récursifs reçoivent l'inStack du parent. Si un bloc
 *    fils atteint un de ces PCs, il émet un LoopBack (back-edge vers une boucle parente)
 *    au lieu de s'y ré-enfoncer indéfiniment.
 */
class ASTBuilder {
    constructor(blocks, edges) {
        this.blocks = blocks;
        this.edges  = edges;

        this.succ = new Map();
        this.pred = new Map();
        for (const b of blocks) {
            this.succ.set(b.startPc, []);
            this.pred.set(b.startPc, []);
        }
        for (const e of edges) {
            if (this.succ.has(e.from)) this.succ.get(e.from).push({ to: e.to, type: e.type });
            if (this.pred.has(e.to))   this.pred.get(e.to).push({ from: e.from, type: e.type });
        }
    }

    /**
     * Trouve le premier PC atteignable depuis DEUX blocs différents simultanément
     * (intersection de BFS) — c'est le post-dominateur immédiat / merge-point.
     *
     * @param {number} pc1 - Premier bloc de départ (branche vraie d'un JUMPI).
     * @param {number} pc2 - Second bloc de départ (branche fausse d'un JUMPI).
     * @param {Set}    stop - Frontières déjà connues (on ne traverse pas au-delà).
     * @param {number} maxDepth - Garde-fou anti-boucle infinie.
     * @returns {number|null} PC du merge-point, ou null si aucun trouvé.
     */
    findMergePoint(pc1, pc2, stop = new Set(), maxDepth = 256) {
        const vis1 = new Set();
        const vis2 = new Set();
        let f1 = [pc1];
        let f2 = [pc2];

        for (let depth = 0; depth < maxDepth; depth++) {
            // Expansion de la frontière 1
            const next1 = [];
            for (const pc of f1) {
                if (vis1.has(pc) || stop.has(pc)) continue;
                vis1.add(pc);
                if (vis2.has(pc)) return pc; // ← intersection !
                for (const s of (this.succ.get(pc) || [])) next1.push(s.to);
            }
            f1 = next1;

            // Expansion de la frontière 2
            const next2 = [];
            for (const pc of f2) {
                if (vis2.has(pc) || stop.has(pc)) continue;
                vis2.add(pc);
                if (vis1.has(pc)) return pc; // ← intersection !
                for (const s of (this.succ.get(pc) || [])) next2.push(s.to);
            }
            f2 = next2;

            if (f1.length === 0 && f2.length === 0) break;
        }
        return null;
    }

    /**
     * Construit un sous-AST hiérarchique à partir de `startPc`.
     *
     * @param {number} startPc         - PC de départ.
     * @param {Set}    stopBoundaries  - PCs où la traversée s'arrête (merge-points, frontières de fonctions).
     * @param {Set}    loopHeaders     - PCs appartenant à l'inStack du builder PARENT.
     *                                   Quand on les atteint, on émet LoopBack au lieu de re-traverser.
     */
    build(startPc = 0, stopBoundaries = new Set(), loopHeaders = new Set()) {
        const ast     = { type: 'Program', body: [] };
        const visited = new Set();
        const inStack = new Set(); // chemin DFS courant

        const traverse = (pc) => {
            // ── Garde-fous ────────────────────────────────────────────────────
            if (stopBoundaries.has(pc)) return;

            // Back-edge vers une boucle du PARENT → LoopBack (pas de ré-entrée)
            if (loopHeaders.has(pc)) {
                ast.body.push({ type: 'LoopBack', target: pc });
                return;
            }

            // Back-edge dans la traversée COURANTE → LoopBack local
            if (inStack.has(pc)) {
                ast.body.push({ type: 'LoopBack', target: pc });
                return;
            }

            // Nœud déjà intégralement traité (arête croisée) → skip
            if (visited.has(pc)) return;
            visited.add(pc);
            inStack.add(pc);

            const block = this.blocks.find(b => b.startPc === pc);
            if (!block) { inStack.delete(pc); return; }

            const successors = this.succ.get(pc) || [];
            const trueEdge   = successors.find(s => s.type === 'JUMPI_TRUE');
            const falseEdge  = successors.find(s => s.type === 'JUMPI_FALSE');

            // ── Nœud JUMPI ───────────────────────────────────────────────────
            if (successors.length === 2 && trueEdge && falseEdge) {
                const trueIsBack  = inStack.has(trueEdge.to);
                const falseIsBack = inStack.has(falseEdge.to);

                if (trueIsBack || falseIsBack) {
                    // ── While direct (le JUMPI lui-même a une back-edge) ──────
                    // Rare : typiquement un do-while ou une boucle interne serrée.
                    const backTarget = trueIsBack  ? trueEdge.to  : falseEdge.to;
                    const exitTarget = trueIsBack  ? falseEdge.to : trueEdge.to;
                    const bodyStart  = trueIsBack  ? falseEdge.to : trueEdge.to;

                    const bodyStop    = new Set([...stopBoundaries, backTarget]);
                    const innerHeaders = new Set([...inStack, ...loopHeaders]);
                    const bodyBuilder = new ASTBuilder(this.blocks, this.edges);
                    const body        = bodyBuilder.build(bodyStart, bodyStop, innerHeaders);

                    ast.body.push({ type: 'While', conditionBlockPc: pc, backEdgeTo: backTarget, body, exitTarget });
                    inStack.delete(pc);
                    if (!stopBoundaries.has(exitTarget)) traverse(exitTarget);
                    return;

                } else {
                    // ── If / If-Else structuré ────────────────────────────────
                    // On cherche le merge-point : premier bloc atteignable depuis
                    // les DEUX branches → délimite la portée du if/else.
                    const mergePoint   = this.findMergePoint(trueEdge.to, falseEdge.to, stopBoundaries);
                    const innerStop    = new Set([...stopBoundaries, ...(mergePoint !== null ? [mergePoint] : [])]);
                    // On passe l'inStack courant comme loopHeaders aux builders fils
                    // pour qu'ils émettent LoopBack en atteignant ces PCs.
                    const innerHeaders = new Set([...inStack, ...loopHeaders]);

                    const trueBuilder  = new ASTBuilder(this.blocks, this.edges);
                    const falseBuilder = new ASTBuilder(this.blocks, this.edges);
                    const trueBranch   = trueBuilder.build(trueEdge.to,  innerStop, innerHeaders);
                    const falseBranch  = falseBuilder.build(falseEdge.to, innerStop, innerHeaders);

                    ast.body.push({
                        type: 'If',
                        conditionBlockPc: pc,
                        trueTarget:  trueEdge.to,
                        falseTarget: falseEdge.to,
                        trueBranch,
                        falseBranch,
                        mergePoint,
                    });

                    // Continuer depuis le merge-point (code commun après le if/else)
                    inStack.delete(pc);
                    if (mergePoint !== null && !stopBoundaries.has(mergePoint)) {
                        traverse(mergePoint);
                    }
                    return;
                }

            // ── Nœud à un seul successeur ────────────────────────────────────
            } else if (successors.length === 1) {
                ast.body.push({ type: 'Block', pc });
                if (!stopBoundaries.has(successors[0].to)) traverse(successors[0].to);

            // ── Nœud terminal (STOP, RETURN, REVERT…) ────────────────────────
            } else {
                ast.body.push({ type: 'Block', pc });
            }

            inStack.delete(pc);
        };

        if (this.blocks.length > 0) {
            let actualStart = startPc;
            if (!this.blocks.find(b => b.startPc === startPc)) {
                actualStart = this.blocks[0].startPc;
            }
            traverse(actualStart);
        }

        return ast;
    }
}

module.exports = { ASTBuilder };
