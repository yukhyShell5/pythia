document.addEventListener('DOMContentLoaded', () => {
  const graphContainer = d3.select("#graph-container");
  let graphviz = graphContainer.graphviz()
      .transition(function () {
          return d3.transition("main").ease(d3.easeLinear).delay(100).duration(500);
      })
      .logEvents(false)
      .fit(true);

  const dotInput = document.getElementById('dot-input');
  const renderBtn = document.getElementById('render-btn');
  
  const contractInput = document.getElementById('contract-input');
  const generateBtn = document.getElementById('generate-btn');
  const apiStatus = document.getElementById('api-status');

  // Renders a DOT string using d3-graphviz
  function renderDot(dotString) {
    if (!dotString || !dotString.trim()) return;
    try {
      graphviz.renderDot(dotString);
    } catch (e) {
      console.error("Graphviz Render Error:", e);
    }
  }

  // Handle direct DOT rendering
  renderBtn.addEventListener('click', () => {
    const dotString = dotInput.value;
    renderDot(dotString);
  });

  // Handle in-browser Pythia generation
  generateBtn.addEventListener('click', async () => {
    let target = contractInput.value.trim();
    if (!target) return;

    apiStatus.textContent = 'Initializing Z3 Engine & Generating CFG... (This may take a moment)';
    apiStatus.className = 'api-status loading';

    // Small delay to allow UI to update before blocking thread
    setTimeout(async () => {
        try {
            if (!window.Pythia || !window.Pythia.generateDOT) {
                throw new Error("Pythia bundle not loaded correctly.");
            }
            
            // Generate DOT in memory!
            const dotOutput = await window.Pythia.generateDOT(target);
            
            dotInput.value = dotOutput;
            renderDot(dotOutput);
            apiStatus.textContent = 'Graph generated client-side successfully!';
            apiStatus.className = 'api-status success';
        } catch (err) {
            console.error(err);
            apiStatus.textContent = `Error: ${err.message}`;
            apiStatus.className = 'api-status error';
        }
    }, 50);
  });

  // Example default graph
  const defaultDot = `digraph G {
    bgcolor="transparent";
    node [shape=box, style="filled,rounded", fillcolor="#1e1e22", color="#26262b", fontcolor="#eae8ee", fontname="JetBrains Mono"];
    edge [color="#908f96"];
    
    Start [label="Start\\nProgram Counter: 0"];
    Block1 [label="JUMPI\\nTarget: 42"];
    Block2 [label="STOP"];
    
    Start -> Block1;
    Block1 -> Block2 [label="False"];
  }`;
  
  dotInput.value = defaultDot;
  renderDot(defaultDot);
});
