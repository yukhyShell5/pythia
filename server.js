const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the root directory
app.use(express.static(__dirname));

app.get('/api/cfg', (req, res) => {
    const target = req.query.target;
    if (!target) {
        return res.status(400).send('Target (address or hex) is required.');
    }

    // Generate a unique ID for temporary output files
    const uuid = crypto.randomBytes(8).toString('hex');
    const outName = `web_temp_${uuid}`;
    
    // Call the pythia CLI
    const cmd = `node index.js cfg "${target}" --format dot --out ${outName} --max-depth 5000`;
    
    exec(cmd, { cwd: __dirname }, (error, stdout, stderr) => {
        const dotPath = path.join(__dirname, 'out', `${outName}.dot`);
        
        if (fs.existsSync(dotPath)) {
            const dotContent = fs.readFileSync(dotPath, 'utf8');
            // Clean up temporary files
            try {
                fs.unlinkSync(dotPath);
                const jsonPath = path.join(__dirname, 'out', `${outName}.json`);
                if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
            } catch (e) {}

            res.json({ dot: dotContent });
        } else {
            res.status(500).send(stderr || stdout || 'Failed to generate CFG.');
        }
    });
});

app.listen(PORT, () => {
    console.log(`Pythia Web Visualizer running on http://localhost:${PORT}`);
});
