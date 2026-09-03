const { exec } = require('child_process');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

async function testPerfWeth() {
    console.log("--- Lancement de test_perf_weth.js ---");
    const startTime = Date.now();
    const scriptPath = path.resolve(__dirname, '../index.js');
    const wethPath = path.resolve(__dirname, '../smart-contract/weth.hex');
    
    try {
        await execPromise(`node "${scriptPath}" "${wethPath}" --format both --out weth --max-depth 900000`);
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`[Timer] WETH CFG généré en ${elapsed.toFixed(2)} secondes.`);
        
        if (elapsed > 60) {
            throw new Error(`Performance dégradée : Le temps d'exécution (${elapsed.toFixed(2)}s) a dépassé la limite stricte de 60s.`);
        }
        console.log("✔ test_perf_weth.js passé avec succès !");
    } catch (e) {
        throw e;
    }
}

if (require.main === module) {
    testPerfWeth().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = testPerfWeth;
