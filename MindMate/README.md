<div align="center">

<img src="https://img.shields.io/badge/MindMate-Adaptive%20Learning%20Twin-6366f1?style=for-the-badge&logo=brain&logoColor=white" alt="MindMate" />

# MindMate 🧠
### *An Adaptive Learning Twin & Hybrid AI Platform*

**MindMate is an intelligent, personalized learning companion that adapts in real time to each student's cognitive style, strengths, weaknesses, and study pace — featuring an evolving Learning Twin, a hybrid Online (Google Gemini 3.5 Flash) and Offline (WebGPU WebLLM / SmolLM2) AI Tutor, a Visual Learning Engine, Spaced-Repetition Practice Modes, and an Offline-First Sync Architecture.**

<br/>

[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20Postgres-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![WebGPU](https://img.shields.io/badge/WebGPU-Local%20Inference-FF6F00?style=flat-square)](https://webgpu.io)
[![Gemini](https://img.shields.io/badge/Gemini-3.5%20Flash%20Streaming-4285F4?style=flat-square&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](LICENSE)

</div>

---

## 🏗️ Architectural Overview

MindMate operates on a resilient, dual-layer architecture designed for both connected and air-gapped environments:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MINDMATE CLIENT (VITE + REACT)                  │
├────────────────────────────────────────────────────────────────────────┤
│  • Routing & Shell: AppShell, Responsive Nav, Multi-Theme (Light/Dark) │
│  • AI Routing Engine: Online (Gemini) ↔ Auto Hybrid ↔ Offline (WebGPU) │
│  • Visual Learning Engine: Mermaid Diagrams, Algorithm Visualizer     │
│  • Client Storage: IndexedDB (mindmate_offline_db) & Local Cache       │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │ Online Sync                     │ Zero Network
                   ▼                                 ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│        SUPABASE & CLOUD BACKEND      │  │    LOCAL WEBGPU RUNTIME      │
├──────────────────────────────────────┤  ├──────────────────────────────┤
│ • Supabase Auth (Recovery & Sessions)│  │ • @mlc-ai/web-llm (WebGPU)   │
│ • Postgres: Profiles, Topics, Quizzes│  │ • SmolLM2-360M-Instruct      │
│ • Vercel API: /api/ai/chat (Gemini)  │  │ • Qwen2.5-0.5B / 1.5B        │
│ • Row-Level Security (RLS)           │  │ • 100% In-Browser Privacy    │
└──────────────────────────────────────┘  └──────────────────────────────┘
```

---

## ✨ Core Capabilities

### 1. 🤖 Hybrid Online & Offline AI Tutor
- **Online Mode (Google Gemini 3.5 Flash):** Server-side streaming (`text/event-stream`) via secure Vercel API endpoints with multi-model fallback (`gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-flash-latest`, `gemini-2.5-flash-lite`).
- **Offline Mode (Device WebGPU WebLLM):** Genuine on-device neural inference powered by `@mlc-ai/web-llm`. Runs quantized local models (`SmolLM2-360M`, `Qwen 2.5 0.5B`, `Qwen 2.5 1.5B`) with zero external network calls.
- **Auto Hybrid Mode:** Prefers Cloud when available, automatically falling back to Local AI if internet is disconnected or API quota is reached.
- **Abort & Mode Switching:** Instant generation stop button and mid-flight re-routing without losing user prompt drafts.

### 2. 🛡️ Content Safety & Educational Bounds Guard
- Deterministic client-side pre-flight moderation engine.
- Rejects adult entertainment, sexually explicit content, and harmful instructions before model invocation.
- Legitimate health and biological science exception: age-appropriate coverage of reproductive anatomy, puberty, and relationship consent is fully supported.

### 3. 📊 Visual Learning Engine
- **Mermaid Interactive Diagrams:** Automatic generation of flowcharts and architecture concept maps.
- **Algorithm Step Visualizer:** Step-by-step state animations for sorting, search, and two-pointer algorithms.
- **Comparison Matrices:** Formatted markdown and table views for comparing programming paradigms, data structures, and trade-offs.

### 4. 💾 Offline-First Persistence & Sync Manager
- **IndexedDB (`mindmate_offline_db`):** Offline stores for quiz attempts, learner progress, planner tasks, and user preferences.
- **`SyncManager`:** Detects network status (`navigator.onLine` and `/api/health` reachability checks) and seamlessly flushes queued offline events to Supabase upon reconnection.

### 5. 🎯 Spaced Repetition & Practice Modes
- **Adaptive Quiz (`/practice/adaptive-quiz`):** Real-time dynamic difficulty scaling (Levels 1–5).
- **Quick Recall (`/practice/quick-recall`):** Rapid retrieval practice with instant confidence self-evaluations.
- **3D Flashcards (`/practice/flashcards`):** Spaced-repetition deck with smooth card flip animations.
- **Mistake Review (`/practice/mistake-review`):** Targeted error rehabilitation allowing students to retry past incorrect questions.

### 6. 📅 Planner Activity Verification
- Tasks cannot be prematurely checked off without completing the required practice activity.
- Deep links directly launch the relevant practice mode and automatically mark tasks complete upon session completion.

### 7. 🌍 Multilingual Learning Database
- Normalized curriculum covering Python, DBMS, and Data Structures in 5 languages:
  - 🇺🇸 English (`en`)
  - 🇪🇸 Spanish (`es`)
  - 🇫🇷 French (`fr`)
  - 🇩🇪 German (`de`)
  - 🇮🇳 Hindi (`hi`)

---

## 🚀 Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18+ and npm
- A modern browser supporting WebGPU for local AI (Chrome 113+, Edge 113+, Safari 18+)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Champion-08/MindMate.git
cd MindMate

# Install dependencies
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env.local` and configure:
```bash
cp .env.example .env.local
```

```ini
# Supabase credentials
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Server-side Gemini API key (for Vercel serverless function / local testing)
GEMINI_API_KEY=your-gemini-api-key
```

### 4. Development & Production
```bash
# Start local Vite development server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

---

## 📂 Project Structure

```
mindmate/
├── api/                             # Vercel Serverless Functions
│   ├── ai/
│   │   ├── chat.ts                  # Streaming Gemini AI chat endpoint
│   │   └── status.ts                # Provider availability endpoint
│   ├── health.ts                    # Backend reachability healthcheck
│   └── chat.ts                      # Legacy chat API bridge
├── supabase/
│   └── migrations/                  # Versioned PostgreSQL SQL schemas
│       ├── 001_initial_schema.sql
│       ├── 002_profile_avatar_and_settings.sql
│       ├── 003_planner_and_friends.sql
│       └── 004_learning_platform_and_practice.sql
├── src/
│   ├── components/
│   │   ├── layout/                  # AppShell, Sidebar, Header
│   │   ├── markdown/                # MarkdownMessage, CodeBlock with copy controls
│   │   ├── visual/                  # VisualRenderer, AlgorithmVisual, DiagramVisual
│   │   ├── shared/                  # PracticeCard, TaskCard, PlannerDay, StatCard
│   │   └── ui/                      # Button, Card, Badge, Modal, Toast, ProgressBar
│   ├── data/
│   │   └── learningContent.ts       # Multilingual educational database (5 languages)
│   ├── services/
│   │   ├── ai/                      # aiTutorService, cloudAdapter, localWebLLMAdapter
│   │   ├── safety/                  # contentModerationService
│   │   ├── visual/                  # visualEngine (diagrams, algorithm visualizer)
│   │   └── storage/                 # db (IndexedDB), syncQueue, syncManager, offlineLearner
│   ├── lib/
│   │   ├── db.ts                    # Supabase database client and helpers
│   │   └── supabase.ts              # Supabase client singleton
│   └── pages/                       # Route pages (Home, Learn, Practice, Planner, etc.)
```

---

## 🔒 Security & Privacy

1. **No Credentials in Frontend Bundles:** Secret API keys are kept server-side in Vercel environment variables (`GEMINI_API_KEY`).
2. **Local Inference Privacy:** In Offline AI mode, all prompts and completions remain strictly in browser GPU memory with 0 network calls.
3. **Database RLS:** Supabase Row Level Security ensures users can only read and write their own study history, notes, and profile records.

---

## 📄 License

This project is licensed under the MIT License.
