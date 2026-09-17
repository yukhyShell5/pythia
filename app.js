document.addEventListener('DOMContentLoaded', () => {
  const graphContainer = document.getElementById('graph-container');
  const contractInput  = document.getElementById('contract-input');
  const generateBtn    = document.getElementById('generate-btn');
  const apiStatus      = document.getElementById('api-status');

  let viz = null;

  // Initialize viz-js renderer
  async function getViz() {
    if (!viz) {
      // Viz() is exposed globally by viz-global.js
      viz = await Viz.instance();
    }
    return viz;
  }

  // Renders a DOT string as SVG directly in the container
  async function renderDot(dotString) {
    if (!dotString || !dotString.trim()) return;
    try {
      const v = await getViz();
      const svg = v.renderSVGElement(dotString);

      // Style the SVG to fill the container
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.style.background = 'transparent';

      graphContainer.innerHTML = '';
      graphContainer.appendChild(svg);

      // Enable pan & zoom via simple CSS + drag (no extra lib needed)
      enablePanZoom(svg);
    } catch (e) {
      console.error('Render error:', e);
      apiStatus.textContent = `Render error: ${e.message}`;
      apiStatus.className = 'api-status error';
    }
  }

  // Minimal pan & zoom using wheel + mouse drag
  function enablePanZoom(svg) {
    let scale = 1, translateX = 0, translateY = 0;
    let dragging = false, startX = 0, startY = 0;
    const g = svg.querySelector('g') || svg;

    function applyTransform() {
      g.setAttribute('transform', `translate(${translateX}, ${translateY}) scale(${scale})`);
    }

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.85 : 1.15;
      scale = Math.max(0.1, Math.min(10, scale * delta));
      applyTransform();
    });

    svg.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
      svg.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      applyTransform();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      svg.style.cursor = 'grab';
    });
    svg.style.cursor = 'grab';
  }

  // Handle in-browser Pythia generation
  generateBtn.addEventListener('click', async () => {
    const target = contractInput.value.trim();
    if (!target) return;

    apiStatus.textContent = 'Initializing Z3 Engine & Generating CFG... (may take 30–60s)';
    apiStatus.className = 'api-status loading';
    generateBtn.disabled = true;

    // Let UI update before blocking thread
    setTimeout(async () => {
      try {
        if (!window.Pythia || !window.Pythia.generateDOT) {
          throw new Error('Pythia bundle not loaded correctly.');
        }

        const dotOutput = await window.Pythia.generateDOT(target);
        await renderDot(dotOutput);

        apiStatus.textContent = 'Graph generated client-side successfully!';
        apiStatus.className = 'api-status success';
      } catch (err) {
        console.error(err);
        apiStatus.textContent = `Error: ${err.message}`;
        apiStatus.className = 'api-status error';
      } finally {
        generateBtn.disabled = false;
      }
    }, 50);
  });

  // Render a default example graph on load
  renderDot(`digraph EVM_CFG {
    bgcolor="transparent";
    node [shape=box, style="filled,rounded", fillcolor="#1e1e22", color="#3d3d47", fontcolor="#eae8ee", fontname="JetBrains Mono", fontsize=10];
    edge [color="#908f96", fontcolor="#908f96", fontsize=9];

    "PC_0"  [label="Block @ PC 0\l───────────────\lPUSH1 0x80\lPUSH1 0x40\lMSTORE\lJUMPI\l", color="#cba6f7"];
    "PC_42" [label="Block @ PC 42\l───────────────\lCALLDATALOAD\lDIV\lJUMPI\l"];
    "PC_88" [label="Block @ PC 88\l───────────────\lSTOP\l", color="#a6e3a1"];

    "PC_0"  -> "PC_42" [label="JUMP_COND=true",  color="#a6e3a1"];
    "PC_0"  -> "PC_88" [label="JUMP_COND=false", color="#f38ba8"];
    "PC_42" -> "PC_88" [label="JUMP"];
  }`);
});
