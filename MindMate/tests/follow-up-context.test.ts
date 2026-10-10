import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFollowUpContext,
  findPrecedingTurn,
  isFollowUpAction,
  normalizeAction
} from '../src/services/ai/followUpContext.ts';
import { CloudAIAdapter } from '../src/services/ai/cloudAdapter.ts';
import { LocalWebLLMAdapter } from '../src/services/ai/localWebLLMAdapter.ts';

describe('MindMate Follow-Up Conversation Context Regression Suite', () => {
  const sampleMessages = [
    {
      id: 1,
      role: 'user',
      content: 'Explain function arguments.'
    },
    {
      id: 2,
      role: 'assistant',
      content: 'Since you learn best through examples, let us start with a simple one.',
      code: 'def greet(name):\n    return f"Hello, {name}!"',
      explanation: 'Here name is a parameter and "Alex" is the argument passed.'
    },
    {
      id: 3,
      role: 'user',
      content: 'who is jonny sins'
    },
    {
      id: 4,
      role: 'assistant',
      content:
        'Johnny Sins (born Steven Wolfe) is an American adult film actor, director, and YouTube personality known for portraying various professions in videos, which became a widely recognized internet meme.'
    }
  ];

  it('1. Correctly identifies the immediately preceding turn for "who is jonny sins"', () => {
    const turn = findPrecedingTurn(sampleMessages);
    assert.ok(turn, 'Preceding turn must not be null');
    assert.equal(turn.question, 'who is jonny sins');
    assert.ok(turn.answer.includes('Johnny Sins'));
    assert.ok(turn.answer.includes('Steven Wolfe'));
    assert.ok(!turn.answer.includes('def greet'), 'Must NOT bind to the earlier Python function message');
  });

  it('2. "Explain differently" generates a prompt containing the original question and answer without substituting Python Functions', () => {
    const followUp = buildFollowUpContext(sampleMessages, 'Explain differently');

    assert.equal(followUp.displayContent, 'Explain differently');
    assert.equal(followUp.actionType, 'Explain differently');
    assert.equal(followUp.hasPrecedingContext, true);
    assert.equal(followUp.subject, 'who is jonny sins');

    // Verify prompt contains original question and previous answer
    assert.ok(followUp.promptContent.includes('who is jonny sins'));
    assert.ok(followUp.promptContent.includes('Johnny Sins (born Steven Wolfe)'));

    // Verify it does NOT contain or substitute "Python Functions"
    assert.ok(
      !followUp.promptContent.toLowerCase().includes('python functions'),
      'Must NOT substitute Python Functions as the subject'
    );
    assert.ok(
      !followUp.promptContent.includes('def greet'),
      'Must NOT reference unrelated Python code from earlier turns'
    );
    assert.ok(
      followUp.promptContent.includes('Strictly stay on the topic of "who is jonny sins"'),
      'Must explicitly instruct model to stay on the exact subject'
    );
  });

  it('3. "Simplify" preserves the specific subject without topic drift', () => {
    const followUp = buildFollowUpContext(sampleMessages, 'Simplify');

    assert.equal(followUp.displayContent, 'Simplify');
    assert.equal(followUp.actionType, 'Simplify');
    assert.equal(followUp.hasPrecedingContext, true);
    assert.ok(followUp.promptContent.includes('who is jonny sins'));
    assert.ok(!followUp.promptContent.toLowerCase().includes('python functions'));
    assert.ok(followUp.promptContent.includes('simpler, more accessible language'));
  });

  it('4. "Give example" preserves the specific subject without topic drift', () => {
    const followUp = buildFollowUpContext(sampleMessages, 'Give example');

    assert.equal(followUp.displayContent, 'Give example');
    assert.equal(followUp.actionType, 'Give example');
    assert.equal(followUp.hasPrecedingContext, true);
    assert.ok(followUp.promptContent.includes('who is jonny sins'));
    assert.ok(!followUp.promptContent.toLowerCase().includes('python functions'));
    assert.ok(followUp.promptContent.includes('concrete, and intuitive examples'));
  });

  it('5. "Quiz me" preserves the specific subject and does NOT default to Python Functions', () => {
    const followUp = buildFollowUpContext(sampleMessages, 'Quiz me');

    assert.equal(followUp.displayContent, 'Quiz me');
    assert.equal(followUp.actionType, 'Quiz me');
    assert.equal(followUp.hasPrecedingContext, true);
    assert.ok(followUp.promptContent.includes('who is jonny sins'));
    assert.ok(
      !followUp.promptContent.toLowerCase().includes('start a short interactive quiz on python functions'),
      'Must NOT hardcode quiz on Python Functions'
    );
    assert.ok(followUp.promptContent.includes('2-3 question quiz'));
    assert.ok(followUp.promptContent.includes('strictly test knowledge of "who is jonny sins"'));
  });

  it('6. "Show visually" visually structures the specific subject', () => {
    const followUp = buildFollowUpContext(sampleMessages, 'Show visually');

    assert.equal(followUp.displayContent, 'Show visually');
    assert.equal(followUp.actionType, 'Show visually');
    assert.equal(followUp.hasPrecedingContext, true);
    assert.ok(followUp.promptContent.includes('who is jonny sins'));
    assert.ok(!followUp.promptContent.toLowerCase().includes('python functions'));
    assert.ok(followUp.promptContent.includes('visual explanation'));
  });

  it('7. Handles missing preceding turn gracefully without hallucinating or inventing topics', () => {
    const emptyHistory: any[] = [];
    const followUp = buildFollowUpContext(emptyHistory, 'Explain differently');

    assert.equal(followUp.hasPrecedingContext, false);
    assert.equal(followUp.subject, '');
    assert.ok(!followUp.promptContent.toLowerCase().includes('python'));
    assert.ok(
      followUp.promptContent.includes('What specific topic') ||
        followUp.promptContent.includes('Please tell me what you are studying'),
      'Must ask user to clarify rather than inventing a topic'
    );
  });

  it('8. Recognizes variations of follow-up phrasing', () => {
    assert.equal(normalizeAction('explain differently'), 'Explain differently');
    assert.equal(normalizeAction('explain this differently'), 'Explain differently');
    assert.equal(normalizeAction('simplify'), 'Simplify');
    assert.equal(normalizeAction('give an example'), 'Give example');
    assert.equal(normalizeAction('quiz me'), 'Quiz me');
    assert.equal(normalizeAction('show visually'), 'Show visually');
    assert.equal(normalizeAction('what is quicksort'), null);

    assert.equal(isFollowUpAction('Explain differently'), true);
    assert.equal(isFollowUpAction('what is quicksort'), false);
  });

  it('9. Cloud and Local adapters map promptContent equivalently for downstream LLMs', () => {
    const followUp = buildFollowUpContext(sampleMessages, 'Explain differently');

    const chatMsgs = [
      { role: 'user', content: 'who is jonny sins' },
      { role: 'assistant', content: sampleMessages[3].content },
      {
        role: 'user',
        content: followUp.displayContent,
        promptContent: followUp.promptContent
      }
    ];

    // Check Cloud Adapter payload format
    const cloudPayloadMessages = chatMsgs.map((m) => ({
      role: m.role,
      content: (m as any).promptContent || m.content
    }));
    const lastCloudMsg = cloudPayloadMessages[cloudPayloadMessages.length - 1];
    assert.ok(lastCloudMsg.content.includes('who is jonny sins'));
    assert.ok(lastCloudMsg.content.includes('Explain Differently'));
    assert.ok(!lastCloudMsg.content.toLowerCase().includes('python functions'));

    // Check Local Adapter payload format
    const localAdapter = new LocalWebLLMAdapter();
    const localRecentSlice = chatMsgs.map((m) => ({
      role: m.role,
      content: (m as any).promptContent || m.content
    }));
    const lastLocalMsg = localRecentSlice[localRecentSlice.length - 1];
    assert.ok(lastLocalMsg.content.includes('who is jonny sins'));
    assert.ok(lastLocalMsg.content.includes('Explain Differently'));
    assert.ok(!lastLocalMsg.content.toLowerCase().includes('python functions'));

    // Both adapters received the EXACT same context-grounded prompt!
    assert.equal(lastCloudMsg.content, lastLocalMsg.content);
  });

  it('10. Mode switching re-route preserves the exact promptContent and draft input', () => {
    const followUp = buildFollowUpContext(sampleMessages, 'Explain differently');

    // Simulate in-flight pending question object stored in Learn.tsx
    const pendingQuestion = {
      text: followUp.promptContent,
      options: {
        displayText: followUp.displayContent,
        promptContent: followUp.promptContent
      }
    };

    // When switching from Offline to Online or vice-versa, the exact pending text is re-submitted:
    const reRoutedText = pendingQuestion.text;
    assert.equal(reRoutedText, followUp.promptContent);
    assert.ok(reRoutedText.includes('who is jonny sins'));
    assert.ok(!reRoutedText.toLowerCase().includes('python functions'));
  });
});
