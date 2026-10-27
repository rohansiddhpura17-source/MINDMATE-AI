import { VoiceCommandResult } from './types';
import {
  parseDeterministicAction,
  actionRegistry,
  TARGET_ROUTE_MAP,
  ActionExecutionContext,
} from '../actions';

export interface VoiceCommandContext {
  activeTopic?: string;
  hasLastAssistantResponse?: boolean;
  weakTopics?: string[];
  recommendationTopic?: string;
  recommendationReason?: string;
  userId?: string;
}

/**
 * Normalizes text for deterministic command comparison by removing
 * leading/trailing whitespace, punctuation, and multiple spaces.
 */
function normalizeCommand(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,?!:;'"(){}\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Shared action router that connects voice input to the application's central ActionRegistry.
 * Text and voice commands share the identical action definitions, schemas, and confirmation boundaries.
 */
export function parseVoiceCommand(
  rawTranscript: string,
  context?: VoiceCommandContext
): VoiceCommandResult {
  const norm = normalizeCommand(rawTranscript);

  if (!norm) {
    return {
      type: 'clarification',
      clarificationQuestion: 'I didn’t catch that. Could you please repeat?',
    };
  }

  // 1. Destructive or privacy-sensitive action safety barrier
  if (
    /delete\s+(my\s+)?(account|history|learning|data)/.test(norm) ||
    /clear\s+(my\s+)?(history|learning|chat|data)/.test(norm) ||
    /reset\s+(my\s+)?(account|progress)/.test(norm)
  ) {
    return {
      type: 'clarification',
      action: 'prompt_settings_confirmation',
      confirmationMessage:
        'Sensitive account and data actions require explicit confirmation in Settings.',
      clarificationQuestion:
        'To protect your study history, clearing data must be confirmed in Settings. Would you like me to open Settings?',
      route: '/settings',
    };
  }

  // 2. Audio & playback controls
  if (/^(stop speaking|be quiet|stop talking|stop audio|silence|mute)$/.test(norm)) {
    return {
      type: 'learning',
      action: 'stop_speaking',
      confirmationMessage: 'Stopped speaking.',
    };
  }

  if (
    /^(read that answer aloud|read that aloud|read the answer|repeat the answer|repeat answer|say that again)$/.test(
      norm
    )
  ) {
    return {
      type: 'learning',
      action: 'repeat_answer',
      confirmationMessage: 'Repeating the latest answer aloud.',
    };
  }

  // 3. Ambiguous voice command handling (catches vague standalone keywords)
  if (
    /^(open|open it|go there|take me|navigate|start|quiz|quiz me|explain|help|test)$/.test(norm)
  ) {
    if (norm === 'open' || norm === 'open it' || norm === 'go there') {
      return {
        type: 'clarification',
        clarificationQuestion:
          'Where would you like to go? You can say "Open my progress", "Open planner", "Open practice", or "Open materials".',
      };
    }
    if (norm === 'quiz' || norm === 'quiz me') {
      return {
        type: 'clarification',
        clarificationQuestion: `Would you like a quiz on "${context?.activeTopic || 'Python Functions'}" or a different topic?`,
      };
    }
    if (norm === 'explain') {
      return {
        type: 'clarification',
        clarificationQuestion:
          'What would you like me to explain? You can ask a concept question or say "Explain this topic".',
      };
    }
  }

  // 4. Shared ActionRegistry evaluation via parseDeterministicAction
  const execContext: ActionExecutionContext = {
    userId: context?.userId || 'guest',
    activeTopic: context?.activeTopic,
  };

  const actionPlan = parseDeterministicAction(rawTranscript, execContext);

  if (actionPlan && actionPlan.steps.length > 0) {
    // 1. Planner task or multi-day study plan creation (requires confirmation!)
    const planStep = actionPlan.steps.find(
      (s) => s.action === 'create_study_plan' || s.action === 'add_planner_task'
    );
    if (planStep) {
      return {
        type: 'learning',
        action: planStep.action,
        confirmationMessage: actionPlan.summary,
        payload: { plan: actionPlan },
      };
    }

    // 2. Navigation action from registry
    const navStep = actionPlan.steps.find((s) => s.action === 'navigate_page');
    if (navStep) {
      const target = navStep.params.target;
      const route =
        navStep.params.route || TARGET_ROUTE_MAP[target as keyof typeof TARGET_ROUTE_MAP] || '/home';
      return {
        type: 'navigation',
        action: `navigate_${target}`,
        route,
        confirmationMessage: actionPlan.summary,
      };
    }

    // 3. Quiz action from registry
    const quizStep = actionPlan.steps.find((s) => s.action === 'start_quiz');
    if (quizStep) {
      const topicId = quizStep.params.topicId;
      const quizType = quizStep.params.quizType || 'adaptive';
      const route = `/practice/adaptive-quiz?topic=${encodeURIComponent(topicId)}&type=${quizType}`;
      return {
        type: 'learning',
        action: 'quiz_on_topic',
        route,
        confirmationMessage: actionPlan.summary,
        payload: {
          topic: quizStep.params.originalTopic || quizStep.params.topicName || topicId,
        },
      };
    }

    // 4. Recommendation action from registry
    const recStep = actionPlan.steps.find((s) => s.action === 'recommend_next_action');
    if (recStep) {
      return {
        type: 'progress',
        action: 'what_should_i_study_next',
        confirmationMessage: actionPlan.summary,
      };
    }

    // 5. Materials action
    const matStep = actionPlan.steps.find((s) => s.action === 'open_materials');
    if (matStep) {
      return {
        type: 'navigation',
        action: 'navigate_materials',
        route: '/materials',
        confirmationMessage: actionPlan.summary,
      };
    }
  }

  // 5. Educational shortcuts (simplify, give example, progress check)
  if (/^(explain this topic|explain the topic|teach me this|teach this topic)$/.test(norm)) {
    return {
      type: 'learning',
      action: 'explain_topic',
      confirmationMessage: `Explaining ${context?.activeTopic || 'the current topic'}.`,
      payload: { topic: context?.activeTopic },
    };
  }

  if (
    /^(explain it more simply|explain it simply|explain simply|simplify this|simplify|make it simpler)$/.test(
      norm
    )
  ) {
    return {
      type: 'learning',
      action: 'simplify',
      confirmationMessage: 'Simplifying the explanation.',
    };
  }

  if (/^(give me an example|give an example|show me an example|show an example)$/.test(norm)) {
    return {
      type: 'learning',
      action: 'give_example',
      confirmationMessage: 'Providing an example.',
    };
  }

  if (/^(how am i doing|how am i performing|check my progress|what is my score)$/.test(norm)) {
    return {
      type: 'progress',
      action: 'how_am_i_doing',
      confirmationMessage: 'Fetching your overall mastery and study streak.',
    };
  }

  // 6. Regular educational query routed to the AI tutor (Gemma 4)
  return {
    type: 'question',
  };
}
