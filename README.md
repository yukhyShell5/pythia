# Pythia

![Pythia Logo](assets/pythia-logo.jpeg)

> *"Turns incomprehensible bytecode into equally incomprehensible DOT graphs. But hey, at least it's visual."*

Pythia is a symbolic execution engine and Control Flow Graph (CFG) generator for the Ethereum Virtual Machine (EVM). It uses the **Z3 Theorem Prover** to symbolically explore smart contract bytecode paths and generates visual graphs (DOT) or structured data (JSON) representing the execution flow.

## Features

- **Symbolic Execution**: Uses Z3 to explore reachable execution paths in raw EVM bytecode.
- **Concolic Fast-Path**: Eliminates path explosion and Z3 timeouts by quickly resolving static/concrete jumps automatically.
- **CFG Generation**: Exports the explored paths into a Control Flow Graph.
- **Multiple Formats**: Outputs in DOT (for Graphviz/visual rendering) and JSON (for programmatic analysis).
- **Dead Code Pruning**: Automatically removes unreachable basic blocks.
- **Configurable Limits**: Easily adjust maximum exploration depth and solver timeouts.

## Installation

Ensure you have [Node.js](https://nodejs.org/) installed, then clone the repository and install dependencies:

```bash
git clone https://github.com/yukhyShell5/pythia.git
cd pythia
npm install
```

## Usage

Pythia can read raw hex EVM bytecode directly from the command line or from a file.

```bash
node index.js cfg <hex_bytecode_or_file> [options]
```

### Options

| Option | Description | Default |
| :--- | :--- | :--- |
| `--format` | Output format: `dot`, `json`, or `both`. | `both` |
| `--out` | Base name for the output file(s) in the `out/` directory. | `cfg_output` |
| `--max-depth`| Maximum depth for symbolic exploration. | `5000` |
| `--z3-timeout`| Timeout for the Z3 solver (in milliseconds). | `100` |
| `--prune` | If provided, prunes unreachable basic blocks. | `false` |

### Examples

**From a file with output in DOT format, pruned:**
```bash
node index.js cfg ./smart-contract/weth.hex --format dot --out weth_cfg --prune
```

**From raw hex directly in the CLI, limiting depth:**
```bash
node index.js cfg 6000355600005b00 --format both --out inline_test --max-depth 1000
```

## Testing

To run the test suite:
```bash
npm test
```

## Contributing

Contributions are welcome. Feel free to open an issue or submit a pull request if you'd like to improve Pythia (or make the graphs *slightly* more comprehensible).

## License

This project is licensed under the MIT License.
