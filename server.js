const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CRITICAL: SharedArrayBuffer requires these two headers ──────────────────
// Z3 WASM uses pthreads (Emscripten), which requires SAB.
// SAB is only available when the page is "cross-origin isolated".
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// ─── Serve hpcc-js/wasm and d3-graphviz locally (avoid CDN MIME issues) ──────
app.use('/vendor/hpcc-js-wasm/', express.static(
    path.join(__dirname, 'node_modules/@hpcc-js/wasm/dist')
));
app.use('/vendor/viz-js/', express.static(
    path.join(__dirname, 'node_modules/@viz-js/viz/dist')
));

// ─── Serve pythia.bundle.js at root (needed by the Web Worker via importScripts) ─
app.use('/pythia.bundle.js', express.static(
    path.join(__dirname, 'pythia.bundle.js')
));

// ─── Serve the compiled React app ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist-web')));

// ─── API: Generate CFG from contract (optional server-side mode) ──────────────
app.get('/api/cfg', (req, res) => {
    const target = req.query.target;
    if (!target) {
        return res.status(400).send('Target (address or hex) is required.');
    }

    const uuid = crypto.randomBytes(8).toString('hex');
    const outName = `web_temp_${uuid}`;
    const cmd = `node index.js cfg "${target}" --format dot --out ${outName} --max-depth 5000`;
    
    exec(cmd, { cwd: __dirname }, (error, stdout, stderr) => {
        const dotPath = path.join(__dirname, 'out', `${outName}.dot`);
        
        if (fs.existsSync(dotPath)) {
            const dotContent = fs.readFileSync(dotPath, 'utf8');
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
    console.log(`Cross-Origin Isolation: enabled (SharedArrayBuffer active)`);
});
