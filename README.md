# Model Forge

> **A completely local, self-contained AI development workstation.**

Model Forge is an independent desktop workstation designed to run open-weight AI models directly on your local hardware with zero external API dependencies, no cloud subscriptions, and strict workspace-jailed agent autonomy.

*Note: This project is under active, modular development. Pass 2 establishes real local model discovery, multi-root library management, streaming GGUF binary inspection, and real drive storage telemetry.*

---

## 🎯 Key Architectural Goals

- **100% Local-First**: Run entirely on your physical machine. No OpenAI, Anthropic, Gemini, Ollama, or LM Studio required.
- **Built-in Inference Runtime**: Direct GGUF quantized model execution and memory management directly in the native process *(Inference core scheduled for Pass 3)*.
- **Project-Aware Agents**: Autonomous agents that read, understand, plan, and modify code within designated workspaces.
- **Jailed Autonomy (YOLO Mode)**: Strict security sandbox containing agent filesystem operations and terminal commands to the target project directory.
- **Local Model Library**: Discover, profile, benchmark, and organize local GGUF weights across multiple directories.
- **Multi-Model Workflows**: Route tasks across specialized local models (Architect, Coder, Reviewer, Tester).

---

## 🏗 Implementation Status

| Feature Area | Status in Current Build (v0.2.0) |
|---|---|
| **Desktop Chrome & Design System** | ✅ **Complete** — Frameless window, dark-first UI matching design mockup, "100% LOCAL" indicator, window controls. |
| **Secure IPC & Sandbox** | ✅ **Complete** — Strict `contextIsolation`, `sandbox: true`, no `nodeIntegration`, typed preload API surface. |
| **Multiple Model Library Roots** | ✅ **Complete** — Register and persist multiple local model directories with automatic v1-to-v2 settings migration. |
| **Recursive GGUF Discovery** | ✅ **Complete** — Discovers `*.gguf` and `*.GGUF` across nested directories with symlink cycle protection. |
| **Streaming GGUF Header Inspector** | ✅ **Complete** — Chunked 64KB reads that inspect architecture, quantization, context lengths without loading multi-gigabyte models into RAM. |
| **Persistent Model Registry & Cache** | ✅ **Complete** — Stable deterministic IDs, metadata caching, and timestamp-based invalidation. |
| **Real Drive Storage Telemetry** | ✅ **Complete** — Native `fs.statfsSync` computing actual drive capacity and usage. |
| **Hero Builder Interface** | ✅ **Complete** — Status cards, prompt composer, agent permissions visual, agent activity, and tabbed workspace. |
| **Command Palette (`Ctrl+K`)** | ✅ **Complete** — Global keyboard navigation and command execution. |
| **Local LLM Inference Engine** | ⏳ *Planned for Pass 3* — Built-in llama.cpp runtime and GGUF weight execution. |
| **Autonomous Agent Execution** | ⏳ *Planned for Pass 3* — Jailed file reading, editing, and diff engine. |
| **Model Lab Benchmarks** | ⏳ *Planned for Pass 4* — Automated SWE-bench, HumanEval, and token latency benchmarks. |
| **Multi-Model Teams** | ⏳ *Planned for Pass 5* — Orchestration between specialized models. |

---

## 💻 Tech Stack

- **Desktop Framework**: [Electron](https://www.electronjs.org/) (Process Sandboxing & IPC Separation)
- **UI Engine**: [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Dev Server**: [Vite](https://vitejs.dev/) + `vite-plugin-electron`
- **Iconography**: [Lucide React](https://lucide.dev/)
- **Testing**: [Vitest](https://vitest.dev/)
- **Code Quality**: ESLint 9 + TypeScript Strict Mode

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20.x, v22.x, or v24.x+
- **npm**: v10.x or v11.x+
- **Operating System**: Windows 10/11 (macOS / Linux support modularly architected)

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Jimmy7610/ModelForge.git
cd ModelForge
npm install
```

### Running the Development Workstation

Launch the Electron desktop application with hot-reloading:

```bash
npm run dev
```

### Running Tests

Execute the automated test suite (36 unit tests):

```bash
npm test
```

Run test suite in watch mode:

```bash
npx vitest
```

### Type Checking & Linting

```bash
# Verify TypeScript strict type checking
npm run typecheck

# Run ESLint across source and tests
npm run lint
```

### Building for Production

Compile TypeScript, bundle renderer assets, and build Electron main and preload bundles:

```bash
npm run build
```

---

## 🔒 Security Architecture

Model Forge follows a strict defense-in-depth model:
- The React renderer runs with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`.
- Raw `ipcRenderer`, Node filesystem APIs, and child process execution are never exposed to the renderer window.
- Communication occurs strictly through the typed `window.modelForge` bridge defined in `src/preload/index.ts`.
- All incoming IPC payloads are sanitized and validated against explicit schemas in `src/main/ipc.ts`.
- No network calls or telemetry are performed during local model discovery or metadata parsing.

---

## 📄 License

Internal Development / Proprietary — Model Forge.
