# Model Forge

> **A completely local, self-contained AI development workstation.**

Model Forge is an independent desktop workstation designed to run open-weight AI models directly on your local hardware with zero external API dependencies, no subscription locks, and strict workspace-jailed agent autonomy.

*Note: This project is under active, modular development. Pass 1 establishes the production-grade desktop foundation, secure IPC bridge, persistent configuration, and high-fidelity product shell.*

---

## 🎯 Key Architectural Goals

- **100% Local-First**: Run entirely on your physical machine. No OpenAI, Anthropic, Gemini, Ollama, or LM Studio required.
- **Built-in Inference Runtime**: Direct GGUF quantized model execution and memory management directly in the native process.
- **Project-Aware Agents**: Autonomous agents that read, understand, plan, and modify code within designated workspaces.
- **Jailed Autonomy (YOLO Mode)**: Strict security sandbox containing agent filesystem operations and terminal commands to the target project directory.
- **Local Model Library**: Discover, profile, benchmark, and organize local GGUF weights.
- **Multi-Model Workflows**: Route tasks across specialized local models (Architect, Coder, Reviewer, Tester).

---

## 🏗 Pass 1 Implementation Status

| Feature Area | Status in Pass 1 |
|---|---|
| **Desktop Chrome & Design System** | ✅ **Complete** — Frameless window, dark-first UI matching `mockup.png`, "100% LOCAL" indicator, window controls. |
| **Secure IPC Bridge** | ✅ **Complete** — Strict `contextIsolation`, no nodeIntegration, typed preload API surface. |
| **Hero Builder Interface** | ✅ **Complete** — Status cards, prompt composer, agent permissions visual, agent activity, and tabbed workspace. |
| **Sidebar Navigation** | ✅ **Complete** — Functional navigation across all 9 pages (Home, Models, Model Lab, Teams, Projects, Builder, Terminal, History, Settings). |
| **Command Palette (`Ctrl+K`)** | ✅ **Complete** — Global keyboard navigation and command execution. |
| **Local Persistence** | ✅ **Complete** — Versioned settings and project registry with automatic corruption recovery. |
| **Hardware Telemetry** | ✅ **Complete** — Real CPU, RAM, and OS diagnostics via secure main process. |
| **Local LLM Inference** | ⏳ *Planned for Pass 2* — Built-in llama.cpp runtime and GGUF loading. |
| **Autonomous Agent Execution** | ⏳ *Planned for Pass 2* — Jailed file reading, editing, and diff engine. |
| **Model Lab Benchmarks** | ⏳ *Planned for Pass 3* — Automated SWE-bench, HumanEval, and token latency benchmarks. |
| **Multi-Model Teams** | ⏳ *Planned for Pass 4* — Orchestration between specialized models. |

---

## 💻 Tech Stack

- **Desktop Framework**: [Electron](https://www.electronjs.org/) (Secure Process Separation)
- **UI Engine**: [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Dev Server**: [Vite](https://vitejs.dev/) + `vite-plugin-electron`
- **Iconography**: [Lucide React](https://lucide.dev/)
- **Testing**: [Vitest](https://vitest.dev/)
- **Code Quality**: ESLint 9 + TypeScript Strict Mode

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20.x or v22.x+ (Tested on Node v24)
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

Execute the automated test suite:

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
- The React renderer runs with `nodeIntegration: false` and `contextIsolation: true`.
- Raw `ipcRenderer` and Node filesystem APIs are never exposed to the renderer window.
- Communication occurs strictly through the typed `window.modelForge` bridge defined in `src/preload/index.ts`.
- All incoming IPC payloads are sanitized and validated against explicit schemas in `src/main/ipc.ts`.

---

## 📄 License

Internal Development / Proprietary — Model Forge.
