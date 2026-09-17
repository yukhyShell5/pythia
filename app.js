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

  // Handle API generation (if backend is running)
  generateBtn.addEventListener('click', async () => {
    const target = contractInput.value.trim();
    if (!target) return;

    apiStatus.textContent = 'Generating... (Requires local backend)';
    apiStatus.className = 'api-status loading';

    try {
      const response = await fetch(`/api/cfg?target=${encodeURIComponent(target)}`);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      if (data.dot) {
        dotInput.value = data.dot;
        renderDot(data.dot);
        apiStatus.textContent = 'Graph generated successfully!';
        apiStatus.className = 'api-status success';
      }
    } catch (err) {
      apiStatus.textContent = `Error: ${err.message}`;
      apiStatus.className = 'api-status error';
    }
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
