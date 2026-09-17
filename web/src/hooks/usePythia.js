/**
 * Pythia engine hook — runs the symbolic engine in a Web Worker
 * so it doesn't freeze the UI thread during analysis.
 *
 * The worker loads pythia.bundle.js (built by esbuild) via importScripts().
 */
import { useState, useCallback, useRef } from 'react';

export function usePythia() {
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [message, setMessage] = useState('');
  const [cfgData, setCfgData] = useState(null);
  const workerRef = useRef(null);

  const generate = useCallback(async (input) => {
    if (!input.trim()) return;

    setStatus('loading');
    setMessage('Initializing Z3 engine… (30–120s depending on contract size)');
    setCfgData(null);

    // Terminate any previous worker
    if (workerRef.current) workerRef.current.terminate();

    // Build an inline worker that loads the Pythia bundle and runs analysis
    const workerCode = `
      importScripts('/pythia.bundle.js');

      self.onmessage = async function(e) {
        try {
          const { input } = e.data;
          const cfgData = await self.Pythia.generateCFG(input);
          self.postMessage({ ok: true, cfgData });
        } catch (err) {
          self.postMessage({ ok: false, error: err.message });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob), { type: 'classic' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (e.data.ok) {
        setCfgData(e.data.cfgData);
        setStatus('success');
        setMessage(`Graph generated — ${e.data.cfgData.blocks.length} blocks`);
      } else {
        setStatus('error');
        setMessage(`Error: ${e.data.error}`);
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      setStatus('error');
      setMessage(`Worker error: ${err.message}`);
      worker.terminate();
    };

    worker.postMessage({ input });
  }, []);

  return { generate, status, message, cfgData };
}
