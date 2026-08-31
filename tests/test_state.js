const assert = require('assert');
const { initZ3, SymbolicState } = require('../src/state.js');

async function testState() {
    console.log("--- Lancement de test_state.js ---");
    
    // Test 1: Initialisation de Z3
    const z3 = await initZ3();
    assert.ok(z3, "Z3 devrait être initialisé");
    
    // Test 2: Création de SymbolicState
    const state1 = new SymbolicState(z3);
    state1.pc = 42;
    state1.stack.push("Fake_Z3_Value");
    
    assert.strictEqual(state1.pc, 42, "Le PC devrait être 42");
    assert.strictEqual(state1.stack.length, 1, "La pile devrait contenir 1 élément");
    
    // Test 3: Clonage de SymbolicState
    const state2 = state1.clone();
    state2.pc = 99;
    state2.stack.pop(); // On modifie le clone
    
    assert.strictEqual(state1.pc, 42, "L'original ne doit pas être modifié");
    assert.strictEqual(state1.stack.length, 1, "La pile de l'original ne doit pas être affectée");
    assert.strictEqual(state2.pc, 99, "Le clone doit être modifié");
    assert.strictEqual(state2.stack.length, 0, "La pile du clone doit être modifiée");
    
    console.log("✔ test_state.js passé avec succès !");
}

if (require.main === module) {
    testState().catch(console.error);
}

module.exports = testState;
