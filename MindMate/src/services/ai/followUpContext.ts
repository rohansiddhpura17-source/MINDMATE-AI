/**
 * Follow-Up Context Builder for MindMate AI Tutor
 * 
 * Ensures all quick-action chips ('Explain differently', 'Simplify', 'Give example',
 * 'Quiz me', 'Show visually') and user follow-up questions remain strictly grounded in
 * the relevant preceding conversation turn, preventing context drift or accidental
 * topic hijacking (e.g. pivoting to Python Functions or unrelated subjects).
 */

export type QuickActionType =
  | 'Explain differently'
  | 'Simplify'
  | 'Give example'
  | 'Quiz me'
  | 'Show visually';

export interface ConversationTurn {
  question: string;
  answer: string;
  subject: string;
}

export interface FollowUpContextResult {
  /** The clean user-facing label to display in the UI chat bubble */
  displayContent: string;
  /** The explicit, context-grounded prompt to send to the AI model */
  promptContent: string;
  /** The identified subject of the preceding turn */
  subject: string;
  /** Whether a valid preceding turn was located in the conversation history */
  hasPrecedingContext: boolean;
  /** The normalized action type if detected */
  actionType: QuickActionType | null;
}

/**
 * Normalizes user text to detect if it matches any quick-action intent
 */
export function normalizeAction(text: string): QuickActionType | null {
  if (!text) return null;
  const clean = text.trim().toLowerCase();

  if (
    clean === 'explain differently' ||
    clean === 'explain this differently' ||
    clean === 'explain in another way' ||
    clean === 'explain another way' ||
    clean.startsWith('explain differently')
  ) {
    return 'Explain differently';
  }

  if (
    clean === 'simplify' ||
    clean === 'simplify this' ||
    clean === 'explain simpler' ||
    clean === 'make it simpler' ||
    clean.startsWith('simplify')
  ) {
    return 'Simplify';
  }

  if (
    clean === 'give example' ||
    clean === 'give an example' ||
    clean === 'provide example' ||
    clean === 'show an example' ||
    clean.startsWith('give example')
  ) {
    return 'Give example';
  }

  if (
    clean === 'quiz me' ||
    clean === 'quiz me on this' ||
    clean === 'test me' ||
    clean.startsWith('quiz me')
  ) {
    return 'Quiz me';
  }

  if (
    clean === 'show visually' ||
    clean === 'visualize' ||
    clean === 'visual explanation' ||
    clean.startsWith('show visually')
  ) {
    return 'Show visually';
  }

  return null;
}

/**
 * Checks if a string is a recognized follow-up action
 */
export function isFollowUpAction(text: string): boolean {
  return normalizeAction(text) !== null;
}

/**
 * Finds the immediately preceding user-assistant turn in the conversation history.
 */
export function findPrecedingTurn(
  messages: Array<{
    id?: number | string;
    role: string;
    content: string;
    explanation?: string;
    code?: string;
  }>,
  excludeId?: number | string
): ConversationTurn | null {
  if (!messages || messages.length === 0) return null;

  // Filter out excluded ID (e.g. current pending assistant placeholder) and empty assistant messages
  const validMessages = messages.filter(
    (m) =>
      m.id !== excludeId &&
      (m.role === 'user' ? m.content?.trim().length > 0 : (m.content?.trim().length > 0 || m.explanation?.trim()))
  );

  // Find the last completed assistant message
  let lastAssistantIdx = -1;
  for (let i = validMessages.length - 1; i >= 0; i--) {
    if (validMessages[i].role === 'assistant') {
      lastAssistantIdx = i;
      break;
    }
  }

  if (lastAssistantIdx === -1) return null;

  const assistantMsg = validMessages[lastAssistantIdx];
  const answerText = [assistantMsg.content, assistantMsg.explanation, assistantMsg.code]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  // Find the user message immediately preceding that assistant message
  let lastUserIdx = -1;
  for (let i = lastAssistantIdx - 1; i >= 0; i--) {
    if (validMessages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx === -1) return null;

  const userMsg = validMessages[lastUserIdx];
  const questionText = userMsg.content.trim();

  // Extract a clean subject summary (first 80 chars of question)
  const subject = questionText.length > 80 ? questionText.slice(0, 80) + '...' : questionText;

  return {
    question: questionText,
    answer: answerText,
    subject
  };
}

/**
 * Builds a context-grounded prompt payload for quick-action chips and follow-up requests.
 */
export function buildFollowUpContext(
  messages: Array<{
    id?: number | string;
    role: string;
    content: string;
    explanation?: string;
    code?: string;
  }>,
  actionInput: string,
  excludeId?: number | string
): FollowUpContextResult {
  const actionType = normalizeAction(actionInput);

  // If this is a regular question and not a follow-up action, return as-is
  if (!actionType) {
    return {
      displayContent: actionInput,
      promptContent: actionInput,
      subject: '',
      hasPrecedingContext: false,
      actionType: null
    };
  }

  const precedingTurn = findPrecedingTurn(messages, excludeId);

  // Case: No preceding turn exists (empty conversation or no previous answer)
  if (!precedingTurn) {
    return {
      displayContent: actionInput,
      promptContent: `I would like to ${actionInput.toLowerCase()}. What specific topic, subject, or question should we focus on? Please tell me what you are studying to begin.`,
      subject: '',
      hasPrecedingContext: false,
      actionType
    };
  }

  const { question, answer, subject } = precedingTurn;
  let promptContent = '';

  switch (actionType) {
    case 'Explain differently':
      promptContent = `[Follow-up Action: Explain Differently]
Please re-explain your previous answer using a different pedagogical approach, alternative analogies, or a fresh perspective, while strictly preserving the exact same subject and facts.

• Subject / Previous Question: "${question}"
• Previous Answer Provided: "${answer}"

Important constraints:
- Strictly stay on the topic of "${question}".
- Do NOT pivot, substitute, or switch to unrelated subjects (such as coding, syntax, or technical memory) unless the previous subject was specifically about that.
- Provide a clear, alternative explanation focused on this exact subject.`;
      break;

    case 'Simplify':
      promptContent = `[Follow-up Action: Simplify]
Please explain the subject of your previous answer in simpler, more accessible language (as if explaining to a beginner), preserving the same subject and facts.

• Subject / Previous Question: "${question}"
• Previous Answer Provided: "${answer}"

Important constraints:
- Strictly stay on the topic of "${question}".
- Do NOT pivot or switch to unrelated subjects.
- Break down any complex concepts or jargon simply, clearly, and directly.`;
      break;

    case 'Give example':
      promptContent = `[Follow-up Action: Give Example]
Please provide clear, concrete, and intuitive examples directly illustrating the subject of your previous answer.

• Subject / Previous Question: "${question}"
• Previous Answer Provided: "${answer}"

Important constraints:
- The examples must directly relate to "${question}".
- Do NOT switch to unrelated subjects (such as programming or Python) unless the previous subject was specifically about that.`;
      break;

    case 'Quiz me':
      promptContent = `[Follow-up Action: Quiz Me]
Generate a short, engaging 2-3 question quiz to test my understanding of the subject from your previous answer.

• Subject / Previous Question: "${question}"
• Previous Answer Provided: "${answer}"

Important constraints:
- All quiz questions must strictly test knowledge of "${question}".
- Do NOT generate questions about unrelated subjects (such as programming or course curriculum) unless the previous subject was specifically about that.
- Provide multiple choice or short answer questions with clear answer keys or explanations.`;
      break;

    case 'Show visually':
      promptContent = `[Follow-up Action: Show Visually]
Provide a visual explanation (using Markdown comparison tables, ASCII diagrams, structured bulleted visual flows, or mind-map style layouts) for the subject of your previous answer.

• Subject / Previous Question: "${question}"
• Previous Answer Provided: "${answer}"

Important constraints:
- Strictly visually structure the topic of "${question}".
- Do NOT pivot or switch to unrelated subjects.`;
      break;
  }

  return {
    displayContent: actionInput,
    promptContent,
    subject,
    hasPrecedingContext: true,
    actionType
  };
}
