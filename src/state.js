const { init } = require('z3-solver');

let z3Context = null;

/**
 * Initialise le moteur Z3 (WebAssembly) de manière asynchrone.
 * Ne le charge qu'une seule fois (Singleton) pour des questions de performances.
 */
async function initZ3(timeoutMs = 10000) {
    if (!z3Context) {
        console.log("[Z3] Initializing solver...");
        const { Context, setParam } = await init();
        
        // Configuration du timeout global pour éviter les blocages sur des chemins complexes
        if (typeof setParam === 'function') {
            setParam('timeout', timeoutMs);
            console.log(`[Z3] Global timeout configured to ${timeoutMs}ms.`);
        }

        // Création d'un contexte principal pour générer nos variables symboliques
        z3Context = new Context('main');
        console.log("[Z3] Solver initialized successfully.");
    }
    return z3Context;
}

/**
 * Représente un État complet de l'EVM à un instant T.
 * Cet état est 100% symbolique, prêt à être "forké" lors des branchements.
 */
class SymbolicState {
    constructor(z3) {
        this.z3 = z3;                 // Référence au contexte Z3
        this.pc = 0;                  // Program Counter
        this.depth = 0;               // Nombre d'instructions exécutées (Sécurité)
        this.stack = [];              // La Pile (Z3.BitVec)
        this.pathConstraints = [];    // Les équations logiques
        this.pathVisited = new Map(); // pc -> count pour cette branche
        
        // MÉMOIRE & STORAGE SYMBOLIQUES (Hybrid Map)
        // On utilise un Map JS pour éviter l'explosion de l'AST (OOM) 
        // avec des offsets concrets, et on fallback sur Z3 si besoin.
        this.memory = new Map();
        this.storage = new Map();
    }

    /**
     * Crée une copie exacte et indépendante de cet état.
     */
    clone() {
        const newState = new SymbolicState(this.z3);
        newState.pc = this.pc;
        newState.depth = this.depth;
        newState.stack = [...this.stack];
        newState.pathConstraints = [...this.pathConstraints];
        newState.pathVisited = new Map(this.pathVisited);
        
        // Copie des Maps
        newState.memory = new Map(this.memory);
        newState.storage = new Map(this.storage);
        
        return newState;
    }

    /**
     * Génère une empreinte unique (hash) de cet état.
     * Permet la déduplication : si on retombe sur le même PC avec la même pile et mémoire,
     * il est inutile de ré-explorer le chemin.
     */
    hash() {
        // Optimisation extrême : Z3 utilise le "Hash Consing" en interne.
        // Cela signifie que deux expressions mathématiques identiques partagent le même pointeur (AST ID).
        // On utilise `.ast` (l'identifiant entier du noeud C++) plutôt que `.toString()` 
        // pour que le calcul du hash soit instantané (O(1)) au lieu de parabolique.
        const stackStr = this.stack.map(x => x.ast).join('|');
        return `${this.pc}::${stackStr}`;
    }
}

module.exports = {
    initZ3,
    SymbolicState
};
