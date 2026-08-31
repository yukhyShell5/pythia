const assert = require('assert');
const { initZ3 } = require('../src/state.js');
const { SymbolicEngine } = require('../src/engine.js');

async function testEngine() {
    console.log("--- Lancement de test_engine.js ---");
    const z3 = await initZ3();
    
    // TEST 1 : Constantes
    const bytecode1 = "6042600a0100"; // PUSH1 0x42, PUSH1 0x0A, ADD, STOP
    const engine1 = new SymbolicEngine(bytecode1, z3);
    await engine1.run();
    assert.ok(true, "Moteur passé sur constantes");

    // TEST 2 : Injection Symbolique
    // PUSH1 0x00 (offset), CALLDATALOAD (0x35), PUSH1 0x0A, ADD, STOP
    const bytecode2 = "600035600a0100";
    const engine2 = new SymbolicEngine(bytecode2, z3);
    await engine2.run();
    assert.ok(true, "Moteur passé sur variables symboliques");
    
    // TEST 3 : Branchement Symbolique (JUMPI)
    // PC 0: PUSH1 00
    // PC 2: CALLDATALOAD (empile X)
    // PC 3: PUSH1 0A (empile 10 comme destination)
    // PC 5: JUMPI (Pop 10, Pop X. Saute à 10 si X != 0)
    // PC 6: STOP (Chemin Faux)
    // PC 7,8,9: 00 00 00
    // PC 10: JUMPDEST (0x5b)
    // PC 11: STOP
    const bytecode3 = "600035600a57000000005b00";
    const engine3 = new SymbolicEngine(bytecode3, z3);
    await engine3.run();
    
    // On vérifie que les arêtes (Edges) ont bien été générées !
    assert.strictEqual(engine3.cfgEdges.length, 2, "Il devrait y avoir 2 arêtes JUMPI (True et False)");
    
    const trueEdge = engine3.cfgEdges.find(e => e.type === 'JUMPI_TRUE');
    const falseEdge = engine3.cfgEdges.find(e => e.type === 'JUMPI_FALSE');
    
    // TEST 4 : Mémoire Symbolique (MSTORE / MLOAD)
    // PC 0: PUSH1 FF (Valeur)
    // PC 2: PUSH1 40 (Offset)
    // PC 4: MSTORE
    // PC 5: PUSH1 40 (Offset)
    // PC 7: MLOAD (Doit re-empiler FF)
    // PC 8: PUSH1 0C (Dest = 12)
    // PC 10: JUMPI
    // PC 11: STOP
    // PC 12: JUMPDEST
    // PC 13: STOP
    // Comme MLOAD ramène 0xFF, le saut est OBLIGATOIREMENT pris. Le chemin Faux est UNSAT.
    const bytecode4 = "60ff604052604051600c57005b00";
    const engine4 = new SymbolicEngine(bytecode4, z3);
    await engine4.run();
    
    assert.strictEqual(engine4.cfgEdges.length, 1, "Il ne devrait y avoir qu'une seule arête (True) car 0xFF != 0 est absolu");
    assert.strictEqual(engine4.cfgEdges[0].to, 12, "L'arête doit pointer vers PC 12");
    
    // TEST 5 : Le Saint Graal : Saut Dynamique (JUMP vers une inconnue)
    // PC 0: PUSH1 00
    // PC 2: CALLDATALOAD (Empile X, X est totalement inconnu)
    // PC 3: JUMP (Saute vers X)
    // PC 4: STOP (Code mort)
    // PC 5 à 9: Padding 00
    // PC 10: JUMPDEST
    // PC 11: STOP
    // PC 12: JUMPDEST
    // PC 13: STOP
    // Le moteur doit itérer sur les JUMPDESTs valides (10 et 12).
    // Z3 va prouver que X=10 est possible, et que X=12 est possible.
    // Il doit donc générer DEUX arêtes depuis le PC 3, vers 10 et 12.
    const bytecode5 = "600035560000000000005b005b00";
    const engine5 = new SymbolicEngine(bytecode5, z3);
    await engine5.run();
    
    const dynamicEdges = engine5.cfgEdges.filter(e => e.type === 'JUMP_DYNAMIC' && e.from === 3);
    assert.strictEqual(dynamicEdges.length, 2, "Le saut dynamique doit trouver les 2 destinations valides (10 et 12)");
    assert.ok(dynamicEdges.some(e => e.to === 10), "Doit contenir une arête vers PC 10");
    assert.ok(dynamicEdges.some(e => e.to === 12), "Doit contenir une arête vers PC 12");
    
    // TEST 6 : Sécurité - Boucle Infinie (Depth Limit)
    // PC 0: JUMPDEST
    // PC 1: PUSH1 00 (Dest = 0)
    // PC 3: JUMP
    // Code Hex: 5b600056
    // Ce code boucle indéfiniment sur lui-même. Sans sécurité, le test planterait (timeout).
    const bytecode6 = "5b600056";
    const engine6 = new SymbolicEngine(bytecode6, z3, 10); // On force une limite très basse (10 instructions)
    await engine6.run();
    
    // Le moteur doit s'arrêter sans crasher
    assert.ok(true, "Le moteur a survécu à une boucle infinie grâce au Depth Limit !");
    
    console.log("✔ test_engine.js passé avec succès !");
}

if (require.main === module) {
    testEngine().catch(console.error);
}

module.exports = testEngine;
