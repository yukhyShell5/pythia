# Pythia

![Pythia Logo](assets/pythia-logo.jpeg)

> *"Turns incomprehensible bytecode into equally incomprehensible DOT graphs. But hey, at least it's visual."*

Pythia is a **symbolic execution engine**, **decompiler**, and **Control Flow Graph (CFG) generator** for the Ethereum Virtual Machine (EVM). It uses the **Z3 Theorem Prover** to symbolically explore smart contract bytecode paths and produces visual graphs, structured Yul code, and readable Solidity-like pseudo-code.

## Features

### 🎯 Exploit Generation (PoC)
- **Automatic Z3 Model Extraction**: Finds the exact transaction calldata required to reach a mathematically reachable Basic Block (or vulnerability).
- **Zero False-Positives**: If a path is mathematically impossible, Z3 returns UNSAT. If it returns SAT, you get the concrete `calldata_hex`.
- **Constraint Tracing**: Exports the full array of LISP S-expressions (Z3 path constraints) showing everything the solver had to satisfy.

### 🌐 RPC & Proxy Fetching
- **Direct Blockchain Fetching**: Pass an Ethereum address (`0x...`) instead of a local file, and Pythia will automatically download its bytecode via RPC.
- **Auto EIP-1967 Proxy Resolution**: When fetching a contract, Pythia automatically checks the EIP-1967 implementation storage slot. If it's a proxy, it resolves and downloads the true implementation (upgrade) automatically.

### 🔬 Symbolic Engine
- **Correct Symbolic Storage & Memory**: `SLOAD` and `MLOAD` with symbolic offsets return unconstrained Z3 variables instead of the concrete value `0`, ensuring both branches of conditions like `require(balances[x] > 0)` are fully explored.
- **Per-Path Loop Detection**: The visit counter is scoped to each execution branch (`state.pathVisited`) rather than globally shared — prevents legitimate paths from being killed because they share a `REVERT` block with 1000 other branches.
- **Stable Symbolic Opcodes**: `EXP`, `BYTE`, `SIGNEXTEND`, and `SHA3` are modelled as stable uninterpreted functions keyed to their Z3 AST node IDs. Same operands → same variable name across all branches.
- **Correct SAR**: Arithmetic shift right uses Z3's native `.shr()` (sign-preserving), not a random stub.
- **Concolic Fast-Path**: Eliminates path explosion and Z3 timeouts by quickly resolving static/concrete jumps.
- **Hybrid Symbolic Memory**: Resolves memory and storage offsets to concrete values where possible, falling back to Z3 simplification.
- **Up-to-Date EVM**: Supports the latest hardforks (Shanghai & Cancun) including `TLOAD`, `TSTORE`, `MCOPY`, `PUSH0`, `BLOBHASH`, and `BLOBBASEFEE`.
- **Auto-OOM Protection**: Periodic V8 GC to gracefully handle large contracts (e.g. Lido).

### 📐 Structured AST
- **Post-Dominator Merge Points**: `ASTBuilder` runs a simultaneous BFS from both JUMPI branches to find their immediate post-dominator — the mathematical boundary of every `if/else` block.
- **Recursive If/Else Nodes**: `trueBranch` and `falseBranch` are full sub-ASTs bounded by the merge-point. No flat lists with interleaved goto targets.
- **Automatic While Detection**: A branch containing a `LoopBack` targeting its own condition block is automatically promoted to a `while` node.
- **Back-Edge Safety**: Recursive sub-builders receive the parent's `inStack` as `loopHeaders`, emitting `LoopBack` instead of recursing infinitely.

### 📝 Pseudo-Code Decompiler
- **Type Inference (Variables & Storage)**: Infers types by tracking memory writes. Seamlessly converts `MSTORE` + `SHA3` sequences into `mapping_SLOT[key]` or `array_start_SLOT`.
- **Argument & Address Inference**: Resolves `CALLDATALOAD` offsets into `arg0, arg1, ...` and automatically casts masked values to `address(...)`.
- **Structured if/else**: Properly indented `if (cond) { … } else { … }` — no more `goto PC_X` placeholders for conditional branches.
- **Structured while loops**: Automatically detected and emitted as `while (cond) { … }` from the recursive AST.
- **Function Extraction**: Identifies individual Solidity functions from the ABI dispatcher and decompiles each one separately.
- **Expression Simplifier**: Folds constants, recognises `msg.sig`, hides scratch memory writes, and heavily nests expressions to produce clean, readable Solidity-like code without Yul-style SSA clutter.

### 📦 Yul Decompiler
- **~60 Opcode Coverage**: Every EVM opcode has a native Yul built-in equivalent — arithmetic, comparison, bitwise, memory, storage, environment, system calls (`call`, `staticcall`, `delegatecall`, `create2`), logs (`log0`–`log4`), EIP-1153 transient storage, and Cancun opcodes.
- **Stack Propagation**: A BFS pre-pass seeds each block's stack state from its CFG predecessors.
- **Structured Output**: While-loops emit `for { } 1 { } { if iszero(cond) { break } … }`, if/else uses dual `if`/`if iszero`, and back-edges emit `continue`.

### 🛠️ Tooling
- **Function Signature Resolution**: Extracts 4-byte selectors and resolves names via a local dictionary with `4byte.directory` API fallback.
- **ABI Decompilation**: Infers a standard JSON ABI by tracking state mutations, calldata reads, return statements, and `LOG` events.
- **Linear Disassembler**: Human-readable EVM instructions from the terminal.
- **CFG Export**: DOT (Graphviz) and JSON formats with dead-code pruning.

## Installation

Ensure you have [Node.js](https://nodejs.org/) installed, then clone the repository and install dependencies:

```bash
git clone https://github.com/yukhyShell5/pythia.git
cd pythia
npm install
```

## Usage

```bash
node index.js <command> <hex_bytecode_or_file> [options]
```

### Commands

| Command | Description |
| :--- | :--- |
| `cfg` | Generates a Control Flow Graph (DOT/JSON) using the Z3 symbolic engine. |
| `disasm` | Fast linear disassembly printed to the console. |
| `abi` | Symbolically executes the contract to infer and export a standard JSON ABI. |
| `ast` | Generates the Abstract Syntax Tree (AST) JSON from the CFG. |
| `yul` | Decompiles EVM bytecode into structured Yul source code (~60 opcodes). |
| `decompile` | Decompiles EVM bytecode into readable Solidity-like pseudo-code with structured if/else and while loops. |
| `exploit` | Generates a Z3 Proof-of-Concept (calldata hex) to mathematically reach a specific target PC. |

### Options

| Option | Description | Default |
| :--- | :--- | :--- |
| `--format` | Output format for `cfg`: `dot`, `json`, or `both`. | `both` |
| `--out` | Base name for the output file(s) in the `out/` directory. | `cfg_output` |
| `--rpc` | Custom RPC URL used when fetching a contract by address. | `https://eth.meowrpc.com` |
| `--target` | Target Program Counter (decimal) used by the `exploit` command. | - |
| `--tx-depth` | Maximum number of chained transactions to explore symbolically. | `1` |
| `--max-depth` | Maximum depth for symbolic exploration. | `5000` |
| `--z3-timeout` | Z3 solver timeout in milliseconds. | `100` |
| `--log-level` | Verbosity (`0` = silent, `1` = info, `2` = progress). | `0` |
| `--prune` | Prune unreachable basic blocks from the CFG. | `false` |
| `--4bytes` | Filter `disasm` output to function selectors only. | `false` |

### Examples

**Decompile a contract into readable pseudo-code:**
```bash
node index.js decompile ./smart-contract/weth.hex --log-level 1
```

**Decompile to structured Yul:**
```bash
node index.js yul ./smart-contract/weth.hex
```

**Infer and extract a JSON ABI:**
```bash
node index.js abi ./smart-contract/weth.hex --log-level 1
```

**Disassemble with automatic signature resolution:**
```bash
node index.js disasm ./smart-contract/weth.hex
```

**Generate an Exploit (PoC) to reach PC 68:**
```bash
node index.js exploit ./smart-contract/vuln.hex --target 68
```

**Generate a Multi-Transaction Exploit (e.g. deposit then withdraw):**
```bash
node index.js exploit ./smart-contract/multitx.hex --target 52 --tx-depth 2
```

**Decompile a contract directly from Mainnet (Auto-resolves EIP-1967 Proxies):**
```bash
node index.js decompile 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
```

**Extract only function selectors:**
```bash
node index.js disasm ./smart-contract/weth.hex --4bytes
```

**Generate a pruned DOT graph with progress output:**
```bash
node index.js cfg ./smart-contract/weth.hex --format dot --out weth_cfg --prune --log-level 2
```

## Architecture

```
bytecode
   │
   ▼
Disassembler ──→ Basic Blocks
   │
   ▼
SymbolicEngine (Z3)
   │  • Correct SLOAD/MLOAD (symbolic keys → free symbols)
   │  • Per-path loop counter (state.pathVisited)
   │  • Stable EXP/BYTE/SAR/SHA3 modelling
   │
   ▼
CFGExporter (DOT / JSON)
   │
   ▼
ASTBuilder
   │  • findMergePoint() — BFS post-dominator
   │  • Recursive If nodes (trueBranch / falseBranch sub-ASTs)
   │  • LoopBack / While nodes with body sub-ASTs
   │
   ├──→ PseudoDecompiler  →  Solidity-like pseudo-code
   │     • Structured if/else
   │     • Auto-detected while loops
   │
   └──→ YulDecompiler     →  Yul source
         • ~60 opcode coverage
         • Stack propagation
         • Structured for/break loops
```

## Testing

```bash
npm test
```

## Contributing

Contributions are welcome. Feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
