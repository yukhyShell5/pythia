# Pythia

![Pythia Logo](assets/pythia-logo.jpeg)

> *"Turns incomprehensible bytecode into equally incomprehensible DOT graphs. But hey, at least it's visual."*

Pythia is a symbolic execution engine and Control Flow Graph (CFG) generator for the Ethereum Virtual Machine (EVM). It uses the **Z3 Theorem Prover** to symbolically explore smart contract bytecode paths and generates visual graphs (DOT) or structured data (JSON) representing the execution flow.

## Features

- **Symbolic Execution**: Uses Z3 to explore reachable execution paths in raw EVM bytecode.
- **Up-to-Date EVM Support**: Fully supports the latest Ethereum hardforks (Shanghai & Cancun) including `TLOAD`, `TSTORE`, `MCOPY`, `PUSH0`, and EIP-4844 opcodes.
- **Function Signature Resolution**: Automatically extracts 4-byte selectors and resolves their names using a lightning-fast local dictionary with an API fallback (`4byte.directory`).
- **Linear Disassembler**: Includes a built-in `disasm` command to read human-readable EVM instructions straight from the terminal.
- **Concolic Fast-Path**: Eliminates path explosion and Z3 timeouts by quickly resolving static/concrete jumps automatically.
- **Hybrid Symbolic Memory**: Resolves EVM memory and storage offsets to pure concrete values where possible to prevent WebAssembly AST bloat, falling back to Z3 simplification.
- **Auto-OOM Protection**: Automatically wraps the execution with V8 `--expose-gc` and triggers periodic garbage collection to gracefully handle contracts with millions of branches (e.g. Lido).
- **CFG Generation**: Exports the explored paths into a Control Flow Graph.
- **Multiple Formats**: Outputs in DOT (for Graphviz/visual rendering) and JSON (for programmatic analysis).
- **Dead Code Pruning**: Automatically removes unreachable basic blocks.
- **Configurable Limits**: Easily adjust maximum exploration depth, verbosity, and solver timeouts.

## Installation

Ensure you have [Node.js](https://nodejs.org/) installed, then clone the repository and install dependencies:

```bash
git clone https://github.com/yukhyShell5/pythia.git
cd pythia
npm install
```

## Usage

Pythia supports multiple commands. You can read raw hex EVM bytecode directly from the command line or from a file.

```bash
node index.js <command> <hex_bytecode_or_file> [options]
```

### Commands
- `cfg` : Generates a Control Flow Graph (DOT/JSON) using the Z3 symbolic engine.
- `disasm` : Performs a fast, linear disassembly of the bytecode and prints it to the console.

### Options

| Option | Description | Default |
| :--- | :--- | :--- |
| `--format` | Output format for `cfg`: `dot`, `json`, or `both`. | `both` |
| `--out` | Base name for the output file(s) in the `out/` directory. | `cfg_output` |
| `--max-depth`| Maximum depth for symbolic exploration (`cfg` only). | `5000` |
| `--z3-timeout`| Timeout for the Z3 solver in milliseconds (`cfg` only). | `100` |
| `--log-level` | Verbosity of the output (`0` for silent, `1` for info, `2` for progress loops). | `0` |
| `--prune` | If provided, prunes unreachable basic blocks (`cfg` only). | `false` |
| `--4bytes` | Acts as a function selector filter for the `disasm` command (extracts only signatures). | `false` |

*Note: Function signature resolution is performed automatically by default for both `cfg` and `disasm`. The `--4bytes` flag is exclusively used to filter the `disasm` output.*

### Examples

**Disassemble a contract with automatic signature resolution:**
```bash
node index.js disasm ./smart-contract/weth.hex
```

**Extract only the available function selectors from a contract:**
```bash
node index.js disasm ./smart-contract/weth.hex --4bytes
```

**Generate a DOT graph, pruning unreachable blocks and showing progress:**
```bash
node index.js cfg ./smart-contract/weth.hex --format dot --out weth_cfg --prune --log-level 2
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
