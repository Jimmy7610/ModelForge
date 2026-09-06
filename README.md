# Model Forge

> **A completely local, self-contained AI development workstation.**

Model Forge is an independent desktop workstation designed to run open-weight AI models directly on your local hardware with zero external API dependencies, no cloud subscriptions, and strict workspace-jailed agent autonomy.

*Note: This project is under active, modular development. Pass 3 delivers the built-in local inference engine (CUDA/Vulkan/CPU), single-model memory residency, and real-time streaming local chat.*

---

## 🎯 Key Architectural Goals

- **100% Local-First**: Run entirely on your physical machine. No OpenAI, Anthropic, Gemini, Ollama, or LM Studio required.
- **Built-in Inference Core**: Direct GGUF quantized model execution and memory management running natively inside the Electron Main process via prebuilt `node-llama-cpp` bindings.
- **Hardware Acceleration**: Automatic GPU offloading detection supporting NVIDIA CUDA, Vulkan, Apple Metal, and high-performance CPU fallbacks.
- **Interactive Streaming Chat**: Real-time token-by-token streaming, performance metrics (tokens/sec, TTFT), immediate cancellation (`AbortController`), and multi-turn conversational history.
- **Project-Aware Agents**: Autonomous agents that read, understand, plan, and modify code within designated workspaces *(Scheduled for Pass 4)*.
- **Jailed Autonomy (YOLO Mode)**: Strict security sandbox containing agent filesystem operations and terminal commands to the target project directory.
- **Local Model Library**: Discover, profile, inspect, and organize local GGUF weights across multiple directories.

---

## 🏗 Implementation Status

| Feature Area | Status in Current Build (v0.3.0) |
|---|---|
| **Desktop Chrome & Design System** | ✅ **Complete** — Frameless window, dark-first UI matching design mockup, "100% LOCAL" indicator, window controls. |
| **Secure IPC & Sandbox** | ✅ **Complete** — Strict `contextIsolation`, `sandbox: true`, no `nodeIntegration`, typed preload API surface. |
| **Multiple Model Library Roots** | ✅ **Complete** — Register and persist multiple local model directories with automatic v1-to-v2 settings migration. |
| **Recursive GGUF Discovery** | ✅ **Complete** — Discovers `*.gguf` and `*.GGUF` across nested directories with symlink cycle protection. |
| **Streaming GGUF Header Inspector** | ✅ **Complete** — Chunked 64KB reads that inspect architecture, quantization, context lengths without loading multi-gigabyte models into RAM. |
| **Persistent Model Registry & Cache** | ✅ **Complete** — Stable deterministic IDs, metadata caching, and timestamp-based invalidation. |
| **Real Drive Storage Telemetry** | ✅ **Complete** — Native `fs.statfsSync` computing actual drive capacity and usage. |
| **Built-in Local Inference Engine** | ✅ **Complete** — In-process native `node-llama-cpp` runtime with zero runtime compiler/binary downloads (`build: "never"`, `skipDownload: true`). |
| **Single-Model Memory Residency** | ✅ **Complete** — Strict 1-model RAM/VRAM residency with automatic unloading and bounded safe context allocation. |
| **Streaming Local Chat** | ✅ **Complete** — Token-by-token streaming, TTFT/tok-per-sec metrics, AbortController cancellation, and multi-turn conversational memory. |
| **Autonomous Agent Execution** | ⏳ *Planned for Pass 4* — Jailed file reading, editing, and diff engine. |
| **Model Lab Benchmarks** | ⏳ *Planned for Pass 5* — Automated SWE-bench, HumanEval, and token latency benchmarks. |
| **Multi-Model Teams** | ⏳ *Planned for Pass 6* — Orchestration between specialized models. |

---

## 💻 Tech Stack

- **Desktop Framework**: [Electron](https://www.electronjs.org/) (Process Sandboxing & IPC Separation)
- **Local Inference Engine**: [node-llama-cpp](https://node-llama-cpp.withcat.ai/) (Prebuilt native llama.cpp bindings with CUDA & Vulkan support)
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
- **Operating System**: Windows 10/11 (macOS / Linux modularly supported)
- **Hardware Acceleration (Optional)**: NVIDIA GPU with CUDA drivers or Vulkan-compatible GPU

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

Execute the automated test suite (53 passing unit tests):

```bash
npm test
```

Run the opt-in real hardware inference test with a local GGUF model:

```bash
# In PowerShell:
$env:MODEL_FORGE_TEST_GGUF="C:\path\to\your\model.gguf"; npx vitest run tests/real-inference.test.ts
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
- Raw `ipcRenderer`, Node filesystem APIs, child processes, and native binary bindings are never exposed to the renderer window.
- Communication occurs strictly through the typed `window.modelForge` bridge defined in `src/preload/index.ts`.
- All incoming IPC payloads are sanitized and validated against explicit schemas in `src/main/ipc.ts` (e.g. prompt length capped at 16,000 characters).
- Zero network calls: all model discovery, metadata inspection, and LLM inference occur 100% offline.

---

## 📄 License

Internal Development / Proprietary — Model Forge.
