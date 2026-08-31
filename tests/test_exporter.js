const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CFGExporter } = require('../src/exporter.js');

async function testExporter() {
    console.log("--- Lancement de test_exporter.js ---");
    
    // Simuler des arêtes générées par l'engine
    const fakeEdges = [
        { from: 10, to: 20, type: 'JUMPI_TRUE' },
        { from: 10, to: 11, type: 'JUMPI_FALSE' },
        { from: 35, to: 100, type: 'JUMP_DYNAMIC' }
    ];
    
    // Simuler des Basic Blocks
    const fakeBlocks = [
        {
            startPc: 10,
            instructions: [
                { pc: 10, opcode: 0x5b, mnemonic: 'JUMPDEST', data: null },
                { pc: 11, opcode: 0x60, mnemonic: 'PUSH1', data: '0x20' },
                { pc: 13, opcode: 0x51, mnemonic: 'MLOAD', data: null },
                { pc: 14, opcode: 0x57, mnemonic: 'JUMPI', data: null }
            ]
        },
        {
            startPc: 20,
            instructions: [
                { pc: 20, opcode: 0x5b, mnemonic: 'JUMPDEST', data: null },
                { pc: 21, opcode: 0x00, mnemonic: 'STOP', data: null }
            ]
        }
    ];

    const exporter = new CFGExporter(fakeEdges, fakeBlocks);
    
    // Tester JSON
    const jsonStr = exporter.toJson();
    const parsed = JSON.parse(jsonStr);
    assert.strictEqual(parsed.edges.length, 3, "Le JSON doit contenir 3 arêtes");
    assert.strictEqual(parsed.blocks.length, 2, "Le JSON doit contenir 2 blocs");
    
    // Tester DOT
    const dotStr = exporter.toDot();
    assert.ok(dotStr.includes('digraph EVM_CFG'), "Le DOT doit commencer correctement");
    assert.ok(dotStr.includes('Block @ PC 10'), "Le DOT doit afficher le titre du bloc");
    assert.ok(dotStr.includes('0x000A: JUMPDEST'), "Le DOT doit formater le PC et l'instruction");
    
    // Tester la sauvegarde
    const tempPath = path.join(__dirname, 'temp_export_test');
    exporter.saveAll(tempPath);
    
    assert.ok(fs.existsSync(`${tempPath}.json`), "Le fichier JSON doit être créé");
    assert.ok(fs.existsSync(`${tempPath}.dot`), "Le fichier DOT doit être créé");
    
    // Nettoyage
    fs.unlinkSync(`${tempPath}.json`);
    fs.unlinkSync(`${tempPath}.dot`);
    
    console.log("✔ test_exporter.js passé avec succès !");
}

if (require.main === module) {
    testExporter().catch(console.error);
}

module.exports = testExporter;
