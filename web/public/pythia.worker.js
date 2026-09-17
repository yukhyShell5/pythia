// Pythia Web Worker — runs the symbolic engine off the main thread
// This file is served by Express at /pythia.worker.js
// and loaded by usePythia.js via new Worker('/pythia.worker.js')

importScripts('/pythia.bundle.js');

self.onmessage = async function (e) {
  try {
    const { input } = e.data;
    const cfgData = await self.Pythia.generateCFG(input);
    self.postMessage({ ok: true, cfgData });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};
