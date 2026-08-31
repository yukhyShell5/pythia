const testState = require('./test_state.js');
const testEngine = require('./test_engine.js');
const testExporter = require('./test_exporter.js');

async function runAll() {
    console.log("=== Début de la suite de tests ===");
    try {
        await testState();
        await testEngine();
        await testExporter();
        console.log("=== TOUS LES TESTS SONT PASSÉS ! ===");
        process.exit(0);
    } catch (error) {
        console.error("❌ Échec d'un test :", error);
        process.exit(1);
    }
}

runAll();
