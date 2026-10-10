# MindMate AI 🧠 — Adaptive Learning Twin & Hybrid AI Tutor

MindMate is a full-stack personalized learning companion that adapts in real-time to how each student learns. It features an evolving **Learning Twin**, a hybrid online (**Google Gemini 3.8 Flash**) and offline (**WebLLM / SmolLM2-360M on WebGPU**) AI Tutor, a **Visual Learning Engine** for interactive diagrams, step-by-step algorithm visualizers, and comparison matrices, strict **Content Safety & Educational Relevance Guards**, automated PDF document ingestion with grounded Q&A, evidence-based cognitive insights, spaced-repetition study planning, and authoritative multiplayer duels.

---

## 🏗️ Repository Architecture

This repository contains the complete frontend, backend, database models, migrations, and test suites:

- **[`MindMate/`](./MindMate)** — Modern frontend built with React 18, Vite, Tailwind CSS, Lucide icons, and Recharts.
  - **Mate AI Hybrid Engine:** Seamlessly switches between Cloud (Gemini streaming) and Local WebLLM (SmolLM2-360M quantized via WebGPU).
  - **Collapsible Mate AI Interface:** State-preserving collapsible chat panel with smooth transitions, reading position memory, and mode-dependent sidebar visibility.
  - **Professional Response Formatting:** GitHub-flavored Markdown rendering with GFM tables, syntax-highlighted code blocks with copy controls, and pedagogical concept emphasis.
  - **Visual Learning Engine:** Generates interactive diagrams (Mermaid), algorithm step visualizers, comparative analysis tables, and Wikimedia educational image galleries.
  - **Content Safety Guard:** Deterministic pre-flight moderation blocking adult entertainment and inappropriate queries before model inference, with factual biology/health exceptions.
  - **Offline Resilience:** IndexedDB synchronization engine queues offline quiz attempts and seamlessly reconciles upon reconnection.
- **[`backend/`](./backend)** — High-performance backend API built with Express, TypeScript, and Prisma ORM.
  - **Multi-Model AI Service:** Google Gemini streaming integration with fallback handling and pre-flight content moderation.
  - **Document Processing:** PDF magic byte verification, text extraction, grounded chunking, and source citations.
  - **Adaptive Engine & SM-2 Planner:** Pedagogical mastery modeling, spaced-repetition scheduling, and 1-click task conversion.
  - **Authoritative Duels:** Real-time WebSocket game loop with sanitized challenge questions and streak persistence.
  - **Dual Database Architecture:** Local SQLite development bridge with compatibility migrations for Supabase PostgreSQL.

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run dev
# Backend server runs on http://localhost:4000
```

### 3. Frontend Setup
```bash
cd MindMate
npm install
cp .env.example .env
npm run dev
# Frontend runs on http://localhost:3000
```

---

## 🧪 Automated Testing

The codebase includes 203 automated test suites covering all architectural layers:

```bash
# Run backend test suite (117 passing tests across 20 suites)
cd backend
npm test

# Run frontend test suite (86 passing tests across 21 suites)
cd MindMate
npm test
```

---

## 🔒 Security & Privacy

- **No Secrets in Source:** All API credentials, keys, private database dumps, and user-uploaded documents are excluded via `.gitignore`.
- **Strict User Isolation:** Endpoints and database queries enforce authenticated user authorization and multi-tenant data isolation.
- **Privacy-First Local AI:** In Offline mode, all inference runs 100% locally on device WebGPU with zero network calls.
- **Content Safety & Educational Guard:** Both client and server reject adult entertainment, inappropriate visual queries, and leetspeak bypasses deterministically.
