# MindMate — Adaptive Learning Engine, Assessment Analytics & Local Gemma 4 (`gemma4:e2b`) Architecture

## 1. High-Level Architecture

MindMate separates **deterministic learner assessment and adaptive decision-making** from **generative LLM teaching explanations**:

| Layer | Responsibility | Key Modules |
|---|---|---|
| **Curriculum & Question Bank** | Canonical topics, explicit prerequisite graph, concept tags, and difficulty-calibrated (levels 1–5) questions across Python, DBMS, and DSA | `src/data/learningContent.ts` |
| **Attempt Persistence & Sync (Member 3)** | Idempotent question-attempt persistence (`client_attempt_id`), explicit `saved_cloud` / `saved_local_only` / `failed` states, retry queue, and Supabase synchronization | `src/services/assessment/assessmentService.ts`, `src/lib/db.ts` |
| **Topic Mastery Engine (Member 3)** | Pure, deterministic calculation of overall accuracy, recency-weighted accuracy, difficulty-band performance, evidence confidence, and mastery status | `src/services/assessment/masteryEngine.ts` |
| **Recurring Mistake Analyzer (Member 3)** | Groups wrong answers by topic, concept tag, repeated distractor, and curriculum prerequisite without inventing unsupported diagnoses from single errors | `src/services/assessment/mistakeAnalyzer.ts` |
| **Evidence Recommendation Engine (Member 3)** | Generates prioritized learning recommendations backed by explicit attempt counts, mastery scores, recent accuracy, and prerequisite mastery | `src/services/assessment/recommendationEngine.ts` |
| **Adaptive Learning Engine (Member 2)** | Bounded difficulty progression ($\pm 1$ max step, 2 consecutive correct required to step up), exhausted-difficulty fallback notices, deterministic explanation strategy selection, and post-session adaptation deltas | `src/services/adaptive/adaptiveLearningEngine.ts` |
| **Local Gemma 4 Adapter (Ollama)** | Local LLM integration via `http://127.0.0.1:11434` (and `/ollama` Vite proxy) using `gemma4:e2b`, explicit health diagnostics, privacy sanitization, adaptive teaching prompts, and schema-validated question draft generation | `src/services/ai/ollamaAdapter.ts`, `src/services/ai/aiTutorService.ts` |

---

## 2. End-to-End Data Flow

```text
[Diagnostic / Adaptive / Follow-Up Quiz]
       │
       ▼
1. Learner submits answer (question_id, selected_option, difficulty, response_duration_ms)
       │
       ▼
2. recordVerifiedAttempt() (src/services/assessment/assessmentService.ts)
   ├─ Deduplicates via `client_attempt_id` (idempotent on retry/double-click)
   ├─ Writes immediately to local attempt store (`mindmate_attempts_<userId>`)
   ├─ Attempts Supabase insert (`user_question_attempts`) + `topics` upsert if configured
   └─ Returns honest PersistenceStatus: `saved_cloud` | `saved_local_only` | `failed`
       │
       ▼
3. Deterministic Engines Recompute Snapshot (`buildLearnerAnalyticsSnapshot`)
   ├─ `calculateAllTopicsMastery()` -> per-topic score, confidence, difficulty breakdown
   ├─ `analyzeRecurringMistakes()`  -> concept/distractor/prerequisite error patterns
   ├─ `generateEvidenceRecommendations()` -> prioritized recommendations with evidence trace
   └─ `determineNextLearningAction()` -> next topic, difficulty band, explanation strategy & reason
       │
       ▼
4. UI & AI Tutor Consume Single Source of Truth (`useMastery` hook)
   ├─ Quiz / AdaptiveQuiz Result -> Shows "What Changed & Why" (`SessionAdaptationDelta`)
   ├─ Progress / Home / Insights / LearningTwin -> Live metrics, confidence badges, mistake patterns
   └─ Learn (AI Tutor) -> Passes `AdaptiveTeachingContext` (mastery, strategy, mistakes, notes)
                          to `ollamaAdapter` (`gemma4:e2b`), `cloudAIAdapter`, or deterministic fallback
```

---

## 3. Topic Mastery Formula & Confidence Rules

Implemented in `src/services/assessment/masteryEngine.ts` (`calculateTopicMastery`):

1. **Difficulty Weights ($w_d$):**
   - Level 1: $0.85$, Level 2: $0.95$, Level 3: $1.05$, Level 4: $1.15$, Level 5: $1.25$.
   - Missing an easy question ($d \le 2$) applies a $1.10$ weight in the denominator so foundational slips are not masked.
2. **Overall Weighted Score ($S_{\text{overall}}$):**
   - Weighted ratio of earned difficulty points over total possible difficulty points across all chronological attempts in the topic.
3. **Recency-Weighted Score ($S_{\text{recent}}$):**
   - Computed over the most recent $N = 5$ attempts (`RECENT_ATTEMPT_WINDOW = 5`) using linear recency weights $r_i \in \{1, 2, \dots, k\}$ (newest attempt has highest weight $k$) multiplied by $w_d$.
4. **Raw Composite Score ($S_{\text{raw}}$):**
   $$S_{\text{raw}} = 0.60 \cdot S_{\text{recent}} + 0.40 \cdot S_{\text{overall}}$$
5. **Easy-Only Ceiling (`EASY_ONLY_CEILING = 75`):**
   - If the learner has never answered a medium ($d = 3$) or hard ($d \ge 4$) question correctly in the topic, $S_{\text{raw}}$ is capped at $75\%$.
6. **Sample-Size Evidence Shrinkage (`PRIOR_MASTERY_BASELINE = 45`, `FULL_CONFIDENCE_ATTEMPTS = 5`):**
   $$\alpha = \min\left(1, \frac{n}{5}\right), \quad \text{MasteryScore} = \text{round}\left(\alpha \cdot S_{\text{raw}} + (1 - \alpha) \cdot 45\right)$$
   - **Why:** Answering **1 easy question correctly** ($n=1, d=1$) yields $\text{round}(0.2 \times 75 + 0.8 \times 45) = 51\%$ (`developing`, `insufficient` confidence), never $100\%$ or `mastered`.
7. **Confidence Levels (`getConfidenceLevel`):**
   - `0` attempts: `none`
   - `1–2` attempts: `insufficient`
   - `3–4` attempts: `low`
   - `5–7` attempts: `medium`
   - `8+` attempts: `high`
8. **Mastery Status Thresholds (`getMasteryStatus`):**
   - `unassessed`: $n = 0$
   - `mastered`: $\text{MasteryScore} \ge 85$, $n \ge 5$, and at least one medium or hard question answered correctly
   - `strong`: $\text{MasteryScore} \ge 70$ and $n \ge 3$
   - `developing`: $45 \le \text{MasteryScore} < 70$ (or $n < 3$ with $\text{MasteryScore} \ge 45$)
   - `weak`: $\text{MasteryScore} < 45$

### Limitations of the Mastery Formula
- Temporal decay (forgetting curve over weeks of inactivity) is not yet subtracted from the score; instead, `lastPracticedAt` is surfaced directly in the UI.
- Sub-topic concept tags are tracked for recurring mistakes, while the primary mastery score is aggregated at the canonical topic level.

---

## 4. Recurring Mistake Analysis & Adaptive Strategy Rules

### Recurring Mistake Analysis (`src/services/assessment/mistakeAnalyzer.ts`)
- **Single-Error Guardrail:** A single wrong answer in a topic (`occurrences === 1`) produces `patternType: 'topic_error_summary'` and `isConfirmedPattern: false` with the message: *"You have missed 1 question in \<Topic\> (insufficient evidence for a recurring pattern)"*.
- **Confirmed Patterns (`isConfirmedPattern: true`):**
  - `prerequisite_difficulty`: $\ge 2$ misses in a topic while its curriculum prerequisite has mastery $< 60\%$.
  - `repeated_distractor`: Learner selected the exact same wrong option index $\ge 2$ times on a concept/question.
  - `repeated_concept_error`: $\ge 2$ wrong answers sharing the same `concept_tag`.
  - `repeated_question_error`: $\ge 2$ wrong answers on the same `question_id`.

### Explanation Strategy Selection (`src/services/adaptive/adaptiveLearningEngine.ts`)
1. `prerequisite-review`: Selected when the learner struggles in a topic ($< 60\%$ mastery or $\ge 2$ errors) and its explicit curriculum prerequisite is weak ($< 60\%$).
2. `simple-analogy`: Selected when the learner has $\ge 2$ recent session mistakes, $\ge 3$ recurring concept errors, or mastery $< 40\%$ with multiple errors.
3. `worked-example`: Selected when a confirmed 2-error mistake pattern exists or recent accuracy dropped below $60\%$.
4. `step-by-step`: Selected for developing mastery ($45\%–74\%$) or 1 isolated error.
5. `conceptual-recap`: Selected when a topic is unassessed ($0$ attempts).
6. `guided-practice`: Selected when topic mastery is $\ge 75\%$ with zero unresolved mistakes.

---

## 5. Database Schema Changes (`supabase/migrations/005_adaptive_assessment_and_analytics.sql`)

The migration is strictly **additive** and backward-compatible with migrations `001`–`004`:
- **`public.user_question_attempts` additions:**
  - `client_attempt_id text` (with unique index `idx_user_question_attempts_client_id` on `(user_id, client_attempt_id)` for idempotent retry protection)
  - `quiz_id text`, `attempt_type text`, `session_id text`, `concept_tag text`, `response_duration_ms integer`
- **`public.quiz_sessions` additions:**
  - `client_session_id text`, `attempt_type text`, `topic_id text`, `difficulty_band text`, `explanation_strategy text`, `adaptation_summary jsonb`
- **`public.topics` additions:**
  - `topic_id text`, `total_attempts integer`, `correct_attempts integer`, `recent_accuracy numeric`, `overall_accuracy numeric`, `confidence_level text`, `evidence_count integer`, `recurring_mistakes jsonb`, `difficulty_breakdown jsonb`, `last_practiced_at timestamptz`
- **`public.learner_recommendations` (new table):**
  - Stores generated recommendations with `supporting_evidence jsonb` and RLS policies enforcing `auth.uid() = user_id`.
- **Atomic RPC `public.record_attempt_and_update_mastery`:**
  - Inserts/deduplicates the attempt row and updates the corresponding `topics` row in a single PostgreSQL transaction while verifying `auth.uid() = p_user_id`.

---

## 6. Local Gemma 4 (`gemma4:e2b`) via Ollama Setup & Verification

### Configuration
- Default local model: `gemma4:e2b` (configurable via `VITE_OLLAMA_MODEL` in `.env`)
- Default endpoint: `/ollama` in Vite dev server (proxied in `vite.config.ts` to `http://127.0.0.1:11434`), with automatic direct fallback to `http://127.0.0.1:11434`.

### macOS Setup Commands
```bash
# 1. Install Ollama (if not already installed)
brew install ollama

# 2. Start the local Ollama daemon on 127.0.0.1:11434
ollama serve

# 3. In a new terminal tab, pull Gemma 4 (e2b)
ollama pull gemma4:e2b

# 4. Verify the model is installed and responds
curl http://127.0.0.1:11434/api/tags
curl http://127.0.0.1:11434/api/chat -d '{
  "model": "gemma4:e2b",
  "messages": [{"role": "user", "content": "Explain Python list comprehensions in 2 sentences."}],
  "stream": false
}'
```

### Runtime Health States Handled by MindMate
- `available`: Ollama is running and `gemma4:e2b` is present in `/api/tags`.
- `model_missing`: Ollama is running, but `gemma4:e2b` is not pulled yet (UI displays `ollama pull gemma4:e2b` guidance).
- `not_running`: `127.0.0.1:11434` is unreachable (UI displays `ollama serve` guidance and offers deterministic local study-guide fallback).
- `timeout`: Request exceeded timeout budget (`AbortController` aborts cleanly).
- `invalid_output`: Empty or malformed JSON stream from model; rejected before rendering or persisting.
