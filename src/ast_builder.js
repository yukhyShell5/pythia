class ASTBuilder {
    constructor(blocks, edges) {
        this.blocks = blocks;
        this.edges = edges;
        
        this.succ = new Map();
        this.pred = new Map();
        for (const b of blocks) {
            this.succ.set(b.startPc, []);
            this.pred.set(b.startPc, []);
        }
        
        for (const e of edges) {
            if (this.succ.has(e.from)) this.succ.get(e.from).push({to: e.to, type: e.type});
            if (this.pred.has(e.to)) this.pred.get(e.to).push({from: e.from, type: e.type});
        }
    }

    build(startPc = 0, stopBoundaries = new Set()) {
        const ast = { type: 'Program', body: [] };
        const visited = new Set();
        
        const traverse = (pc) => {
            if (visited.has(pc)) return;
            visited.add(pc);
            
            const block = this.blocks.find(b => b.startPc === pc);
            if (!block) return;
            
            const successors = this.succ.get(pc) || [];
            
            if (successors.length === 2 && successors.find(s => s.type === 'JUMPI_TRUE') && successors.find(s => s.type === 'JUMPI_FALSE')) {
                const trueEdge = successors.find(s => s.type === 'JUMPI_TRUE');
                const falseEdge = successors.find(s => s.type === 'JUMPI_FALSE');
                
                ast.body.push({
                    type: 'If',
                    conditionBlockPc: pc,
                    trueTarget: trueEdge.to,
                    falseTarget: falseEdge.to
                });
                
                if (!stopBoundaries.has(trueEdge.to)) traverse(trueEdge.to);
                if (!stopBoundaries.has(falseEdge.to)) traverse(falseEdge.to);
            } else if (successors.length === 1) {
                ast.body.push({ type: 'Block', pc: pc });
                if (!stopBoundaries.has(successors[0].to)) traverse(successors[0].to);
            } else {
                ast.body.push({ type: 'Block', pc: pc });
            }
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
