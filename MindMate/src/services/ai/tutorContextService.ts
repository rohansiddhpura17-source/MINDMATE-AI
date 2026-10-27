/**
 * MindMate — Reusable Subject-Aware Tutor Context & Prompt Service
 *
 * Implements a unified, subject-aware pedagogical context builder:
 * - Integrates active subject, current topic, and prerequisites from curriculum metadata
 * - Evaluates question relevance deterministically via relevanceClassifier
 * - Enforces the 10 quality rules for local inference (Gemma 4 and WebLLM Qwen 2.5)
 * - Implements the 4-case topic relevance policy (Relevant, Off-Topic Factual, Ambiguous, Subject Switch)
 * - Ensures provider and model labels are strictly distinguished
 */

import {
  SUBJECTS,
  TOPICS,
  resolveTopicMetadata,
  type TopicItem,
  type SubjectItem,
} from '../../data/learningContent';
import { STRATEGY_LABELS } from '../adaptive/adaptiveLearningEngine';
import type {
  AdaptiveTeachingContext,
  ExecutionSource,
  SendMessageOptions,
} from './types';
import {
  classifyTopicRelevance,
  type TopicRelevanceResult,
} from './relevanceClassifier';

export interface SubjectTutorContext {
  subject: SubjectItem;
  topic: TopicItem;
  masteryScore: number;
  confidenceLevel: string;
  targetDifficulty: string;
  explanationStrategy: string;
  strategyReason?: string;
  recentMistakes: string[];
  studyMaterialTitle?: string;
  studyMaterialExcerpt?: string;
  relevance: TopicRelevanceResult;
}

/**
 * Sanitize prompt text: strip accidental tokens, emails, or personal identifiers.
 */
export function sanitizePromptText(input: string): string {
  if (!input) return '';
  return input
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[redacted-email]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, '[redacted-token]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-jwt]');
}

/**
 * Build a structured, normalized tutor context object.
 */
export function buildSubjectTutorContext(
  userPrompt: string,
  adaptiveContext?: AdaptiveTeachingContext,
  learnerProfile?: SendMessageOptions['learnerProfile']
): SubjectTutorContext {
  const topic = resolveTopicMetadata(
    adaptiveContext?.topicId || adaptiveContext?.topicName || 'python-functions'
  );
  const subject =
    SUBJECTS.find((s) => s.id === topic.subjectId) ||
    SUBJECTS.find((s) => s.id === 'python') ||
    SUBJECTS[0];

  const relevance = classifyTopicRelevance(userPrompt, topic.id, subject.id);

  const cleanMistakes = (adaptiveContext?.recentMistakesSummary || [])
    .filter((m) => typeof m === 'string' && m.trim().length > 0)
    .slice(0, 3)
    .map((m) => sanitizePromptText(m));

  return {
    subject,
    topic,
    masteryScore: adaptiveContext?.masteryScore ?? 0,
    confidenceLevel: adaptiveContext?.confidenceLevel || 'none',
    targetDifficulty: adaptiveContext?.targetDifficulty || 'Foundational',
    explanationStrategy: adaptiveContext?.explanationStrategy || 'step-by-step',
    strategyReason: adaptiveContext?.strategyReason,
    recentMistakes: cleanMistakes,
    studyMaterialTitle: adaptiveContext?.studyMaterialTitle,
    studyMaterialExcerpt: adaptiveContext?.studyMaterialExcerpt,
    relevance,
  };
}

/**
 * Build the system prompt tailored to the learner's context, chosen local model,
 * and deterministic relevance classification.
 */
export function buildEducationalSystemPrompt(
  context: SubjectTutorContext,
  basePrompt?: string,
  learnerProfile?: SendMessageOptions['learnerProfile']
): string {
  const { subject, topic, relevance } = context;
  const parts: string[] = [];

  // 1. Core Identity & Role
  parts.push(
    basePrompt ||
      `You are MindMate AI, a patient, accurate, and encouraging computer science tutor.
Active Subject: ${subject.name} (${subject.description})
Current Learning Topic: ${topic.name} (${topic.description})`
  );

  // 2. Learner Profile
  if (learnerProfile) {
    const style = learnerProfile.learningStyle || 'Examples first';
    const level = learnerProfile.level || 'Foundational';
    parts.push(`Learner Profile: Level=${level}, Preferred Style=${style}.`);
  }

  // 3. Ten Core Quality Rules for Local Inference
  parts.push(`--- CORE QUALITY INSTRUCTIONS ---
1. Answer the actual question asked, not a superficially similar question.
2. Distinguish entity categories correctly: person vs. place vs. vehicle/object vs. event vs. code syntax.
3. Keep explanations concise, beginner-friendly, and technically accurate.
4. Use valid, working code snippets when demonstrating programming concepts.
5. Clearly separate established facts from uncertainty; never invent facts, citations, or statistics.
6. Never invent learner quiz history, fake mastery percentages, or nonexistent notes.
7. Avoid repetitive boilerplate, filler introductions, and excessive meta-commentary.
8. If the question is outside the curriculum, answer factually in 1-3 sentences and add the topic reminder.
9. If a question is ambiguous or underspecified, politely ask for clarification without guessing wildly.
10. Respect local-only execution with zero references to external unavailable services.`);

  // 4. Topic-Relevance Policy Handling
  parts.push('--- CONTEXT & TOPIC-RELEVANCE DIRECTIVES ---');

  switch (relevance.category) {
    case 'off_topic_factual': {
      parts.push(`STATUS: OFF-TOPIC GENERAL KNOWLEDGE QUESTION.
The learner's question is unrelated to ${topic.name}.
REQUIRED ACTION:
1. Answer the learner's specific question factually, naturally, and accurately.
2. Do NOT lecture on or dump a multi-page tutorial about ${topic.name}.
3. Conclude your response with this exact friendly topic reminder:
"${relevance.topicReminder}"`);

      if (relevance.factualEntityHint) {
        parts.push(
          `FACTUAL GROUNDING HINT FOR "${relevance.factualEntityHint.entity}":\n` +
            `Fact: ${relevance.factualEntityHint.fact}\n` +
            `Pitfall to avoid: ${relevance.factualEntityHint.pitfallAvoidance}`
        );
      }
      break;
    }

    case 'ambiguous_or_uncertain': {
      parts.push(`STATUS: AMBIGUOUS OR UNDERSPECIFIED QUESTION.
The question is too short or ambiguous to answer reliably without guessing.
REQUIRED ACTION:
1. Politely ask a brief clarifying question (1-2 sentences). Do NOT fabricate details.
2. Suggest exploring an aspect of ${topic.name}.
Example response guidance: "${relevance.clarificationPrompt || 'Could you clarify your question?'}"`);
      break;
    }

    case 'subject_switch_intent': {
      const targetName = relevance.targetTopic?.name || 'the new topic';
      parts.push(`STATUS: TOPIC SWITCH REQUEST.
The learner explicitly asked to switch to ${targetName}.
REQUIRED ACTION:
1. Enthusiastically acknowledge the switch to ${targetName}.
2. Give a brief, high-level overview of what ${targetName} is (2-3 sentences).
3. Do NOT tell the learner to return to ${topic.name}. Ask what they would like to explore first in ${targetName}.`);
      break;
    }

    case 'relevant_subject': {
      const targetName = relevance.targetTopic?.name || 'Programming / Computer Science';
      parts.push(`STATUS: COMPUTER SCIENCE / SUBJECT RELEVANT QUESTION.
The learner is asking about ${targetName}.
REQUIRED ACTION:
1. Answer the question directly and accurately with a concise explanation and code example if appropriate.
2. Do NOT force the response to redirect to ${topic.name} unless the user explicitly asks about the connection.
3. Offer a natural follow-up check or let the learner continue exploring.`);
      break;
    }

    case 'relevant_topic':
    default: {
      const strategyKey = context.explanationStrategy;
      const strategyName =
        (strategyKey && (STRATEGY_LABELS as Record<string, string>)[strategyKey]) ||
        strategyKey ||
        'Direct Explanation';
      parts.push(`STATUS: DIRECTLY RELEVANT TO CURRENT TOPIC (${topic.name}).
Mastery: ${context.masteryScore}% (Confidence: ${context.confidenceLevel}, Difficulty: ${context.targetDifficulty}).
Strategy: ${strategyName}.`);

      if (context.strategyReason) {
        parts.push(`Why this strategy was selected: ${context.strategyReason}`);
      }

      // Strategy specific directives
      switch (strategyKey) {
        case 'simple-analogy':
          parts.push(
            'Strategy Directive: Start with an intuitive everyday analogy before formal syntax, followed by one minimal code snippet.'
          );
          break;
        case 'worked-example':
          parts.push(
            'Strategy Directive: Walk through a step-by-step worked example showing input, state changes, and final output.'
          );
          break;
        case 'prerequisite-review':
          parts.push(
            `Strategy Directive: Briefly review the foundational prerequisite (${topic.prerequisites?.join(', ') || 'basics'}) before diving into ${topic.name}.`
          );
          break;
        case 'conceptual-recap':
          parts.push(
            'Strategy Directive: Provide a crisp concept summary (definition, key rule, common trap) and a short code snippet.'
          );
          break;
        case 'guided-practice':
          parts.push(
            'Strategy Directive: Explain at an advanced level and conclude with a targeted practice question.'
          );
          break;
        case 'step-by-step':
        default:
          parts.push(
            'Strategy Directive: Break the explanation into logical, numbered steps with a clear, concise code example.'
          );
          break;
      }

      if (context.recentMistakes.length > 0) {
        parts.push(
          `Targeted Focus — Address these recent recorded mistakes gently:\n- ${context.recentMistakes.join('\n- ')}`
        );
      }

      if (context.studyMaterialExcerpt && context.studyMaterialExcerpt.trim().length > 0) {
        const title = context.studyMaterialTitle || 'Study Note';
        parts.push(
          `--- GROUNDING MATERIAL (${sanitizePromptText(title)}) ---\n` +
            `${sanitizePromptText(context.studyMaterialExcerpt.slice(0, 1600))}\n` +
            `Ground your explanation in the note above and cite "${sanitizePromptText(title)}".`
        );
      }
      break;
    }
  }

  return parts.join('\n\n');
}

/**
 * Format exact display labels for the UI beside every AI response.
 * Strictly distinguishes Ollama Gemma 4 vs. WebGPU Qwen 2.5 vs. Cloud vs. Fallback.
 */
export function formatProviderBadge(
  source?: ExecutionSource | 'deterministic-fallback' | 'mock-fallback' | string,
  model?: string
): {
  providerLabel: string;
  modelLabel: string;
  badgeLabel: string;
  badgeClass: string;
  iconKind: 'terminal' | 'hard-drive' | 'cloud' | 'brain';
} {
  if (source === 'ollama') {
    const modelName = model || 'gemma4:e2b-it-qat';
    return {
      providerLabel: 'Ollama Local AI',
      modelLabel: modelName,
      badgeLabel: `Ollama Local AI (${modelName})`,
      badgeClass: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
      iconKind: 'terminal',
    };
  }

  if (source === 'local') {
    let cleanModel = model || 'Qwen 2.5 (0.5B)';
    if (cleanModel.includes('Qwen2.5-0.5B')) cleanModel = 'Qwen 2.5 (0.5B)';
    else if (cleanModel.includes('SmolLM2-360M')) cleanModel = 'SmolLM2 (360M)';
    else if (cleanModel.includes('Qwen2.5-1.5B')) cleanModel = 'Qwen 2.5 (1.5B)';

    return {
      providerLabel: 'Browser Offline (WebGPU)',
      modelLabel: cleanModel,
      badgeLabel: `Browser Offline (WebGPU) (${cleanModel})`,
      badgeClass: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
      iconKind: 'hard-drive',
    };
  }

  if (source === 'cloud') {
    const modelName = model || 'Gemini 3.5 Flash';
    return {
      providerLabel: 'Cloud AI',
      modelLabel: modelName,
      badgeLabel: `Cloud AI (${modelName})`,
      badgeClass: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
      iconKind: 'cloud',
    };
  }

  return {
    providerLabel: 'Local Curriculum Guide',
    modelLabel: 'Deterministic Fallback',
    badgeLabel: 'Local Curriculum Guide (Deterministic Fallback)',
    badgeClass: 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]',
    iconKind: 'brain',
  };
}
