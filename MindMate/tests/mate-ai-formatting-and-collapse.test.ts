import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  prepareMarkdownForDisplay,
  prepareStreamingMarkdown,
  normalizeMarkdown,
  emphasizeKeyConcepts,
  hasUnclosedFence
} from '../src/components/markdown/markdownUtils.ts';
import {
  RESPONSE_FORMATTING_GUIDELINES,
  COMPACT_FORMATTING_GUIDELINES
} from '../src/services/ai/responseFormatting.ts';
import { aiTutorService } from '../src/services/ai/aiTutorService.ts';
import { localWebLLMAdapter } from '../src/services/ai/localWebLLMAdapter.ts';
import { buildFollowUpContext } from '../src/services/ai/followUpContext.ts';

describe('Mate AI: Response Formatting and Collapsible Chat Suite', () => {
  const learnPagePath = path.resolve(process.cwd(), 'src/pages/Learn.tsx');
  const learnPageCode = fs.readFileSync(learnPagePath, 'utf-8');

  // =========================================================================
  // 1. Markdown Parsing & Structural Normalization (Headings, Lists, Tables, Code, Dividers)
  // =========================================================================
  describe('1. Professional Markdown Rendering & Normalization', () => {
    it('normalizes GFM tables directly following paragraph text without blank lines', () => {
      const input = 'Here is a comparison table:\n| Concept | Type | Scope |\n| --- | --- | --- |\n| let | Block | Mutable |\n| const | Block | Constant |';
      const output = normalizeMarkdown(input);

      assert.ok(output.includes('\n\n| Concept | Type | Scope |'), 'Must insert a blank line before table');
      assert.ok(output.includes('| const | Block | Constant |'));
    });

    it('normalizes ATX headings directly following paragraph text', () => {
      const input = 'Here is the overview.\n### Key Concepts\nFunctions are reusable blocks of code.';
      const output = normalizeMarkdown(input);

      assert.ok(output.includes('\n\n### Key Concepts'), 'Must insert blank line before ATX heading');
    });

    it('preserves code blocks without corrupting indentation, symbols, or internal blank lines', () => {
      const rawCode = '```python\ndef calculate(a, b):\n    # Return sum\n    return a + b\n```';
      const output = prepareMarkdownForDisplay(rawCode);

      assert.ok(output.includes('def calculate(a, b):'));
      assert.ok(output.includes('    return a + b'));
    });

    it('handles markdown horizontal rules (dividers) properly', () => {
      const input = 'Section One\n\n---\n\nSection Two';
      const output = prepareMarkdownForDisplay(input);

      assert.ok(output.includes('---'));
    });

    it('preserves bullet lists, numbered lists, and inline code formatting', () => {
      const input = 'Key rules:\n1. Use `def` to define.\n2. Pass `args`.\n- Point A\n- Point B';
      const output = prepareMarkdownForDisplay(input);

      assert.ok(output.includes('1. Use `def` to define.'));
      assert.ok(output.includes('- Point A'));
    });
  });

  // =========================================================================
  // 2. Incomplete Markdown Handling During Streaming
  // =========================================================================
  describe('2. Streaming Safety: Incomplete Markdown Balancing', () => {
    it('detects unclosed code fences during streaming', () => {
      assert.strictEqual(hasUnclosedFence('```python\ndef hello():'), true);
      assert.strictEqual(hasUnclosedFence('```python\ndef hello():\n```'), false);
      assert.strictEqual(hasUnclosedFence('Plain text without code'), false);
    });

    it('temporarily closes unclosed code fences while tokens arrive', () => {
      const partial = '```python\ndef greet():\n    print("Hi")';
      const prepared = prepareStreamingMarkdown(partial);

      assert.ok(prepared.endsWith('```'), 'Must temporarily balance fence so it renders as code');
      assert.strictEqual(hasUnclosedFence(prepared), false);
    });

    it('balances dangling bold markers while streaming', () => {
      const partial = 'The **key concept';
      const prepared = prepareStreamingMarkdown(partial);

      assert.strictEqual(prepared, 'The **key concept**');
    });

    it('balances dangling inline code backticks while streaming', () => {
      const partial = 'Use the `function';
      const prepared = prepareStreamingMarkdown(partial);

      assert.strictEqual(prepared, 'Use the `function`');
    });

    it('hides a solitary trailing heading marker that has no text yet', () => {
      const partial = 'First paragraph.\n\n###';
      const prepared = prepareStreamingMarkdown(partial);

      assert.strictEqual(prepared, 'First paragraph.');
    });

    it('hides an incomplete table separator row while streaming', () => {
      const partial = '| Col A | Col B |\n| --- |';
      const prepared = prepareStreamingMarkdown(partial);

      assert.strictEqual(prepared, '| Col A | Col B |');
    });
  });

  // =========================================================================
  // 3. Automatic Emphasis of Defined Key Concepts
  // =========================================================================
  describe('3. Automated Pedagogical Concept Emphasis', () => {
    it('automatically bolds the defined concept when text has no emphasis', () => {
      const input = 'A function is a reusable block of code that performs a specific action.';
      const output = emphasizeKeyConcepts(input);

      assert.ok(
        output.includes('A **function** is a reusable') || output.includes('**function** is'),
        `Expected bolded concept, got: ${output}`
      );
    });

    it('does not double-emphasize when text already contains bold words', () => {
      const input = 'A **function** is a reusable block of code that takes a parameter.';
      const output = emphasizeKeyConcepts(input);

      assert.strictEqual(output, input, 'Should not alter text that already has author emphasis');
    });

    it('does not bold concepts inside code blocks, tables, or headings', () => {
      const input = '```python\n# A function is defined here\ndef foo(): pass\n```';
      const output = emphasizeKeyConcepts(input);

      assert.strictEqual(output, input, 'Must never touch text inside code fences');
    });
  });

  // =========================================================================
  // 4. Content Safety: Raw HTML Protection
  // =========================================================================
  describe('4. Untrusted Content Safety & XSS Protection', () => {
    it('MarkdownMessage component uses react-markdown with remark-gfm without raw HTML passthrough', () => {
      const markdownCompPath = path.resolve(process.cwd(), 'src/components/markdown/MarkdownMessage.tsx');
      const markdownCompCode = fs.readFileSync(markdownCompPath, 'utf-8');

      assert.ok(markdownCompCode.includes('remarkPlugins={[remarkGfm]}'));
      assert.ok(
        !markdownCompCode.includes('rehype-raw'),
        'Must NOT include rehype-raw so raw model-supplied HTML/scripts are not executed'
      );
    });
  });

  // =========================================================================
  // 5. System Prompt Guidelines: Consistent Presentation across Online, Offline, and Auto
  // =========================================================================
  describe('5. Formatting Guidelines Consistency Across Modes', () => {
    it('declares comprehensive guidelines for Online / Gemini mode', () => {
      assert.ok(RESPONSE_FORMATTING_GUIDELINES.includes('###'));
      assert.ok(RESPONSE_FORMATTING_GUIDELINES.includes('Markdown table only for genuine comparisons'));
      assert.ok(RESPONSE_FORMATTING_GUIDELINES.includes('fenced code blocks with a language tag'));
      assert.ok(RESPONSE_FORMATTING_GUIDELINES.includes('never change the subject'));
    });

    it('declares compact guidelines for Offline / WebGPU mode to preserve low prefill latency', () => {
      assert.ok(COMPACT_FORMATTING_GUIDELINES.includes('###'));
      assert.ok(COMPACT_FORMATTING_GUIDELINES.includes('**bold** only key terms'));
      assert.ok(COMPACT_FORMATTING_GUIDELINES.includes('No raw HTML'));
    });

    it('cloud adapter, local adapter, and backend inject formatting guidelines into system prompt', () => {
      const cloudAdapterCode = fs.readFileSync(path.resolve(process.cwd(), 'src/services/ai/cloudAdapter.ts'), 'utf-8');
      const localAdapterCode = fs.readFileSync(path.resolve(process.cwd(), 'src/services/ai/localWebLLMAdapter.ts'), 'utf-8');
      const backendAiCode = fs.readFileSync(path.resolve(process.cwd(), '../backend/src/services/ai.ts'), 'utf-8');

      assert.ok(cloudAdapterCode.includes('RESPONSE_FORMATTING_GUIDELINES'));
      assert.ok(localAdapterCode.includes('COMPACT_FORMATTING_GUIDELINES'));
      assert.ok(backendAiCode.includes('Presentation: write clean GitHub-flavored Markdown'));
    });
  });

  // =========================================================================
  // 6. Mate AI Header & Main Chat Panel Collapse Behavior
  // =========================================================================
  describe('6. Mate AI Chat Panel Expand/Collapse & State Preservation', () => {
    it('renders Mate AI heading and current mode badge', () => {
      assert.ok(learnPageCode.includes('data-testid="mate-ai-header"'));
      assert.ok(learnPageCode.includes('data-testid="mate-ai-mode-badge"'));
      assert.ok(learnPageCode.includes('data-testid="mate-ai-provider-badge"'));
      assert.ok(learnPageCode.includes('<span>Mate AI</span>'));
    });

    it('main chat panel declares isChatExpanded state and toggle control', () => {
      assert.ok(learnPageCode.includes('const [isChatExpanded, setIsChatExpanded] = useState(true);'));
      assert.ok(learnPageCode.includes('toggleChatExpanded'));
      assert.ok(learnPageCode.includes('data-testid="mate-ai-chat-toggle"'));
      assert.ok(learnPageCode.includes('aria-label={isChatExpanded ? \'Collapse Mate AI chat\' : \'Expand Mate AI chat\'}'));
    });

    it('chat body stays mounted in the DOM when collapsed so state is never lost', () => {
      assert.ok(learnPageCode.includes('data-testid="mate-ai-chat-body"'));
      assert.ok(learnPageCode.includes("data-collapsed={isChatExpanded ? 'false' : 'true'}"));
      assert.ok(learnPageCode.includes('aria-hidden={!isChatExpanded}'));
      assert.ok(learnPageCode.includes('inert'));
    });

    it('preserves scroll position when collapsed and restored', () => {
      assert.ok(learnPageCode.includes('collapsedScrollRef'));
      assert.ok(learnPageCode.includes('feedRef'));
    });

    it('indicates active generation in header if collapsed while generating', () => {
      assert.ok(learnPageCode.includes('!isChatExpanded && isGenerating'));
      assert.ok(learnPageCode.includes('Generating…'));
    });
  });

  // =========================================================================
  // 7. Draft Preservation & Mode Switching Integrity
  // =========================================================================
  describe('7. Composer Draft Preservation & Mode Switching Integrity', () => {
    it('preserves composer draft and textarea focus when switching modes', () => {
      assert.ok(learnPageCode.includes('currentCursor = textareaRef.current?.selectionStart;'));
      assert.ok(learnPageCode.includes('textareaRef.current.setSelectionRange(currentCursor, currentCursor);'));
    });

    it('does not duplicate messages or reset local model instance on mode switch', () => {
      const ad1 = localWebLLMAdapter;
      aiTutorService.setMode('online');
      aiTutorService.setMode('offline');
      const ad2 = localWebLLMAdapter;
      assert.strictEqual(ad1, ad2, 'WebLLM adapter singleton must persist');
    });

    it('buildFollowUpContext preserves exact subject across mode switches', () => {
      const messages = [
        { id: 1, role: 'user' as const, content: 'Explain merge sort' },
        { id: 2, role: 'assistant' as const, content: 'Merge sort is a divide and conquer algorithm.' }
      ];
      aiTutorService.setMode('online');
      const resOnline = buildFollowUpContext(messages, 'Explain differently');
      aiTutorService.setMode('offline');
      const resOffline = buildFollowUpContext(messages, 'Explain differently');

      assert.strictEqual(resOnline.promptContent, resOffline.promptContent);
      assert.ok(resOnline.promptContent.includes('merge sort'));
    });
  });
});
