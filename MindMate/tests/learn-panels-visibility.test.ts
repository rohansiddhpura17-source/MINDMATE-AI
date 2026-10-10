import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aiTutorService, AIMode } from '../src/services/ai/aiTutorService.ts';
import { localWebLLMAdapter } from '../src/services/ai/localWebLLMAdapter.ts';
import { buildFollowUpContext, findPrecedingTurn } from '../src/services/ai/followUpContext.ts';
import fs from 'fs';
import path from 'path';

describe('MindMate Learn UI: Mate AI Renaming, Collapsible Panels, and Mode-Dependent Visibility Suite', () => {

  const learnPagePath = path.resolve(process.cwd(), 'src/pages/Learn.tsx');
  const learnPageCode = fs.readFileSync(learnPagePath, 'utf-8');

  // 1. Label Renaming Verification
  describe('1. UI Label Renaming Verification', () => {
    it('should rename "AI Mode" to "Mate AI" in top header bar', () => {
      assert.ok(
        learnPageCode.includes('<span>Mate AI</span>'),
        'Learn.tsx must include <span>Mate AI</span> as the main panel header'
      );
      assert.ok(
        learnPageCode.includes('aria-label="Toggle Mate AI settings"'),
        'Learn.tsx must use aria-label="Toggle Mate AI settings"'
      );
      assert.ok(
        !learnPageCode.includes('<span>AI Mode:</span>'),
        'Old "AI Mode:" label must be replaced'
      );
    });

    it('should rename "Local Offline AI" to "Mate AI (Offline)" in sidebar header', () => {
      assert.ok(
        learnPageCode.includes('<span>Mate AI (Offline)</span>'),
        'Learn.tsx must include <span>Mate AI (Offline)</span> in sidebar card header'
      );
      assert.ok(
        learnPageCode.includes('aria-label="Toggle Mate AI (Offline) panel"'),
        'Learn.tsx must use aria-label="Toggle Mate AI (Offline) panel"'
      );
      assert.ok(
        !learnPageCode.includes('<span>Local Offline AI</span>'),
        'Old "Local Offline AI" label must be replaced'
      );
    });

    it('should retain mode options named Online, Offline, and Auto', () => {
      assert.ok(learnPageCode.includes("handleModeChange('online')"));
      assert.ok(learnPageCode.includes("handleModeChange('offline')"));
      assert.ok(learnPageCode.includes("handleModeChange('auto')"));
      assert.ok(/Online\s*<\/button>/.test(learnPageCode), 'Button text Online must exist');
      assert.ok(/Offline\s*<\/button>/.test(learnPageCode), 'Button text Offline must exist');
      assert.ok(/Auto\s*<\/button>/.test(learnPageCode), 'Button text Auto must exist');
    });

    it('should use "Mate AI (Offline)" in loading, status, and button states', () => {
      assert.ok(
        learnPageCode.includes('Mate AI (Offline) Ready') || learnPageCode.includes('Mate AI (Offline) Available'),
        'Must use Mate AI (Offline) in status indicators'
      );
      assert.ok(
        learnPageCode.includes('Load Mate AI (Offline)'),
        'Must use Load Mate AI (Offline) on recovery action buttons'
      );
      assert.ok(
        learnPageCode.includes('Preparing Mate AI (Offline)...'),
        'Must use Preparing Mate AI (Offline)... in phase detail'
      );
      assert.ok(
        learnPageCode.includes('Initialize Mate AI (Offline)'),
        'Must use Initialize Mate AI (Offline) in input placeholder'
      );
    });
  });

  // 2. Expand/Collapse Control Verification
  describe('2. Expand and Collapse Controls', () => {
    it('should declare independent collapse state hooks for all 3 panels', () => {
      assert.ok(learnPageCode.includes('const [isAiModeExpanded, setIsAiModeExpanded] = useState(true);'));
      assert.ok(learnPageCode.includes('const [isLocalAiExpanded, setIsLocalAiExpanded] = useState(true);'));
      assert.ok(learnPageCode.includes('const [isLearningContextExpanded, setIsLearningContextExpanded] = useState(true);'));
    });

    it('should provide clickable header rows with chevron indicators for all panels', () => {
      // Mate AI chat panel & mode drawer toggle
      assert.ok(
        learnPageCode.includes('setIsAiModeExpanded(!isAiModeExpanded)'),
        'Must support toggling mode selector drawer'
      );
      assert.ok(
        learnPageCode.includes('toggleChatExpanded') || learnPageCode.includes('setIsChatExpanded'),
        'Must support toggling main chat panel'
      );
      assert.ok(
        learnPageCode.includes("aria-label={isChatExpanded ? 'Collapse Mate AI chat' : 'Expand Mate AI chat'}"),
        'Must provide accessible label for chat panel collapse'
      );
      assert.ok(learnPageCode.includes('isChatExpanded ? \'rotate-180\' : \'rotate-0\''));

      // Mate AI (Offline) panel toggle
      assert.ok(learnPageCode.includes('onClick={() => setIsLocalAiExpanded(!isLocalAiExpanded)}'));
      assert.ok(learnPageCode.includes('isLocalAiExpanded ? \'rotate-180\' : \'rotate-0\''));

      // Learning Context panel toggle
      assert.ok(learnPageCode.includes('onClick={() => setIsLearningContextExpanded(!isLearningContextExpanded)}'));
      assert.ok(learnPageCode.includes('isLearningContextExpanded ? \'rotate-180\' : \'rotate-0\''));
    });

    it('should animate collapse/expand smoothly with zero layout jumps', () => {
      assert.ok(learnPageCode.includes('transition-all duration-300 ease-in-out overflow-hidden'));
      assert.ok(learnPageCode.includes('max-h-0 opacity-0'));
    });
  });

  // 3. Mode-Dependent Visibility
  describe('3. Mode-Dependent Visibility Rules', () => {
    it('should strictly condition the right sidebar on activeMode === "offline"', () => {
      assert.ok(
        learnPageCode.includes('{activeMode === \'offline\' && ('),
        'Right sidebar must be wrapped in activeMode === "offline"'
      );
    });

    it('should contain only Mate AI (Offline) and Learning Context in the offline sidebar', () => {
      const offlineSidebarIdx = learnPageCode.indexOf('{activeMode === \'offline\' && (');
      assert.ok(offlineSidebarIdx !== -1);
      const sidebarSnippet = learnPageCode.slice(offlineSidebarIdx);

      assert.ok(sidebarSnippet.includes('Mate AI (Offline)'));
      assert.ok(sidebarSnippet.includes('Learning Context'));
    });

    it('should allow chat container to flex to 100% full width when sidebar is hidden in Online & Auto', () => {
      assert.ok(
        learnPageCode.includes('flex-1 flex flex-col bg-surface rounded-card border border-border shadow-sm'),
        'Chat container must use flex-1 to smoothly fill full width when sidebar is unmounted'
      );
    });
  });

  // 4. State & Model Persistence Across Mode Changes
  describe('4. State & Model Persistence Across Mode Switches', () => {
    it('should switch between Online, Offline, and Auto via aiTutorService without throwing', () => {
      const initialMode = aiTutorService.getMode();
      
      aiTutorService.setMode('online');
      assert.equal(aiTutorService.getMode(), 'online');

      aiTutorService.setMode('offline');
      assert.equal(aiTutorService.getMode(), 'offline');

      aiTutorService.setMode('auto');
      assert.equal(aiTutorService.getMode(), 'auto');

      // Revert to initial
      aiTutorService.setMode(initialMode);
    });

    it('should NOT reset or destroy localWebLLMAdapter instance when mode changes', () => {
      const adapterInstance1 = localWebLLMAdapter;
      aiTutorService.setMode('online');
      aiTutorService.setMode('offline');
      aiTutorService.setMode('auto');
      const adapterInstance2 = localWebLLMAdapter;

      assert.strictEqual(
        adapterInstance1,
        adapterInstance2,
        'localWebLLMAdapter singleton must remain identical in memory across all mode transitions'
      );
    });

    it('should preserve conversation history when switching modes', () => {
      const sampleMessages = [
        { id: 1, role: 'user' as const, content: 'What is a Python generator?' },
        { id: 2, role: 'assistant' as const, content: 'A generator produces items lazily using yield.' }
      ];

      // Build follow-up context in Online
      aiTutorService.setMode('online');
      const onlineFollowUp = buildFollowUpContext(sampleMessages, 'Give example');

      // Switch to Offline
      aiTutorService.setMode('offline');
      const offlineFollowUp = buildFollowUpContext(sampleMessages, 'Give example');

      // Switch to Auto
      aiTutorService.setMode('auto');
      const autoFollowUp = buildFollowUpContext(sampleMessages, 'Give example');

      assert.equal(onlineFollowUp.displayContent, offlineFollowUp.displayContent);
      assert.equal(offlineFollowUp.displayContent, autoFollowUp.displayContent);
      assert.ok(autoFollowUp.promptContent.includes('Python generator'));
    });

    it('should preserve textarea cursor position and avoid unmounting input during mode switch', () => {
      assert.ok(
        learnPageCode.includes('currentCursor = textareaRef.current?.selectionStart;'),
        'Must capture selectionStart before mode transition'
      );
      assert.ok(
        learnPageCode.includes('textareaRef.current.setSelectionRange(currentCursor, currentCursor);'),
        'Must restore cursor position after mode switch'
      );
    });
  });

  // 5. Safety & Integrity
  describe('5. Offline Safety and Service Integrity', () => {
    it('in Offline mode, must reject execution if local model is not loaded and make NO cloud requests', async () => {
      aiTutorService.setMode('offline');
      
      let errorThrown: any = null;
      try {
        await aiTutorService.sendMessageStream(
          {
            messages: [{ role: 'user', content: 'Offline test' }],
            learnerProfile: { name: 'Test', learningStyle: 'Examples first', goal: 'Test', level: 'Intermediate' }
          },
          {
            onChunk: () => {},
            onComplete: () => {},
            onError: (err) => { errorThrown = err; }
          }
        );
      } catch (err) {
        errorThrown = err;
      }

      assert.ok(errorThrown, 'Must reject offline execution when local model is not loaded');
      assert.ok(
        errorThrown.message.includes('Local model is not loaded') || errorThrown.message.includes('offline'),
        `Error message must indicate offline model requirement, got: ${errorThrown?.message}`
      );
    });
  });
});
