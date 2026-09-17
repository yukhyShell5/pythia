/**
 * Pythia engine hook — runs the symbolic engine in a Web Worker
 * via /pythia.worker.js served by Express.
 */
import { useState, useCallback, useRef } from 'react';

export function usePythia() {
  const [status,  setStatus]  = useState('idle');
  const [message, setMessage] = useState('');
  const [cfgData, setCfgData] = useState(null);
  const workerRef = useRef(null);

  const generate = useCallback((input) => {
    if (!input.trim()) return;

    setStatus('loading');
    setMessage('Initializing Z3 engine… (30–120s depending on contract size)');
    setCfgData(null);

    // Kill any previously running worker
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    // /pythia.worker.js is a real file served by Express
    // It calls importScripts('/pythia.bundle.js') and exposes Pythia.generateCFG
    const worker = new Worker('/pythia.worker.js', { type: 'classic' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (e.data.ok) {
        setCfgData(e.data.cfgData);
        setStatus('success');
        setMessage(`Graph generated — ${e.data.cfgData.blocks.length} blocks, ${e.data.cfgData.edges.length} edges`);
      } else {
        setStatus('error');
        setMessage(`Error: ${e.data.error}`);
      }
      worker.terminate();
      workerRef.current = null;
    };

    worker.onerror = (err) => {
      setStatus('error');
      setMessage(`Worker error: ${err.message}`);
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage({ input });
  }, []);

  return { generate, status, message, cfgData };
}
