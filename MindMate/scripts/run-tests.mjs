import { createServer } from 'vite';

async function main() {
  const vite = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'error',
  });

  try {
    const mod = await vite.ssrLoadModule('/src/services/__tests__/adaptiveAndAssessment.test.ts');
    const results = await mod.runAllAdaptiveAndAssessmentTests();

    const voiceMod = await vite.ssrLoadModule('/src/services/voice/__tests__/voiceAssistant.test.ts');
    const voiceResults = await voiceMod.runVoiceAssistantTests();

    const panelMod = await vite.ssrLoadModule('/src/services/__tests__/panelZoomAndAutoMinimize.test.ts');
    const panelResults = await panelMod.runPanelZoomAndAutoMinimizeTests();

    const plannerMod = await vite.ssrLoadModule('/src/services/__tests__/plannerLayoutAndToast.test.ts');
    const plannerResults = await plannerMod.runPlannerLayoutAndToastTests();

    const demoMod = await vite.ssrLoadModule('/src/services/__tests__/demoLearnerProgress.test.ts');
    const demoResults = await demoMod.runDemoLearnerProgressTests();

    const offlineAiMod = await vite.ssrLoadModule('/src/services/__tests__/offlineAiAccuracyAndRelevance.test.ts');
    const offlineAiResults = await offlineAiMod.runOfflineAiAccuracyAndRelevanceTests();

    const actionEngineMod = await vite.ssrLoadModule('/src/services/__tests__/actionExecutionEngine.test.ts');
    const actionEngineResults = await actionEngineMod.runActionExecutionEngineTests();

    const generalAiMod = await vite.ssrLoadModule('/src/services/__tests__/generalPurposeAssistantAndVisuals.test.ts');
    const generalAiData = await generalAiMod.runGeneralPurposeAssistantAndVisualsTests();
    const generalAiResults = generalAiData.results;

    const showVisuallyMod = await vite.ssrLoadModule('/src/services/__tests__/showVisuallyAndDemoIsolation.test.ts');
    const showVisuallyResults = await showVisuallyMod.runShowVisuallyAndDemoIsolationTests();

    const responseQualityMod = await vite.ssrLoadModule('/src/services/__tests__/responseQualityAndVisualsLayout.test.ts');
    const responseQualityResults = await responseQualityMod.runResponseQualityAndVisualsLayoutTests();

    let failed = 0;
    console.log('\n=== MindMate Adaptive Engine, Assessment & Ollama Test Suite ===\n');
    for (const r of results) {
      if (r.passed) {
        console.log(`  PASS [${r.id.toString().padStart(2, '0')}] ${r.name}`);
      } else {
        failed += 1;
        console.error(`  FAIL [${r.id.toString().padStart(2, '0')}] ${r.name}`);
        if (r.error) {
          console.error(`       ${r.error}`);
        }
      }
    }

    console.log('\n=== Mate Voice Assistant Test Suite (STT, TTS, Commands & Privacy) ===\n');
    for (const r of voiceResults) {
      if (r.passed) {
        console.log(`  PASS [${r.id.toString().padStart(2, '0')}] ${r.name}`);
      } else {
        failed += 1;
        console.error(`  FAIL [${r.id.toString().padStart(2, '0')}] ${r.name}`);
        if (r.error) {
          console.error(`       ${r.error}`);
        }
      }
    }

    console.log('\n=== Panel Zoom, Expand/Collapse & Auto-Minimize Test Suite ===\n');
    for (const r of panelResults) {
      if (r.passed) {
        console.log(`  PASS [${r.id.toString().padStart(2, '0')}] ${r.name}`);
      } else {
        failed += 1;
        console.error(`  FAIL [${r.id.toString().padStart(2, '0')}] ${r.name}`);
        if (r.error) {
          console.error(`       ${r.error}`);
        }
      }
    }

    console.log('\n=== Weekly Planner UI, Layout & Toast Notification Test Suite ===\n');
    for (const r of plannerResults) {
      if (r.passed) {
        console.log(`  PASS [${r.id.toString().padStart(2, '0')}] ${r.name}`);
      } else {
        failed += 1;
        console.error(`  FAIL [${r.id.toString().padStart(2, '0')}] ${r.name}`);
        if (r.error) {
          console.error(`       ${r.error}`);
        }
      }
    }

    console.log('\n=== Demo Learner Progress (meet8kotecha) Test Suite ===\n');
    for (const r of demoResults) {
      if (r.passed) {
        console.log(`  PASS [${r.id.toString().padStart(2, '0')}] ${r.name}`);
      } else {
        failed += 1;
        console.error(`  FAIL [${r.id.toString().padStart(2, '0')}] ${r.name}`);
        if (r.error) {
          console.error(`       ${r.error}`);
        }
      }
    }

    console.log('\n=== Offline AI Accuracy, Topic Relevance & Answer Quality Test Suite ===\n');
    for (const r of offlineAiResults) {
      if (r.passed) {
        console.log(`  PASS [${r.id.toString().padStart(2, '0')}] ${r.name}`);
      } else {
        failed += 1;
        console.error(`  FAIL [${r.id.toString().padStart(2, '0')}] ${r.name}`);
        if (r.error) {
          console.error(`       ${r.error}`);
        }
      }
    }

    console.log('\n=== MindMate Advanced Action Execution Engine (Planner, Router & Safety) ===\n');
    for (const r of actionEngineResults) {
      if (r.passed) {
        console.log(`  PASS [${r.id.toString().padStart(2, '0')}] ${r.name}`);
      } else {
        failed += 1;
        console.error(`  FAIL [${r.id.toString().padStart(2, '0')}] ${r.name}`);
        if (r.error) {
          console.error(`       ${r.error}`);
        }
      }
    }

    console.log('\n=== MindMate General-Purpose Assistant, Image Search & Visual Learning Test Suite ===\n');
    for (const r of generalAiResults) {
      if (r.passed) {
        console.log(`  PASS [${r.id.toString().padStart(2, '0')}] ${r.name}`);
      } else {
        failed += 1;
        console.error(`  FAIL [${r.id.toString().padStart(2, '0')}] ${r.name}`);
        if (r.error) {
          console.error(`       ${r.error}`);
        }
      }
    }

    console.log('\n=== MindMate "Show Visually" & Demo Progress Isolation Test Suite ===\n');
    for (const r of showVisuallyResults) {
      if (r.passed) {
        console.log(`  PASS [${r.id.toString().padStart(2, '0')}] ${r.name}`);
      } else {
        failed += 1;
        console.error(`  FAIL [${r.id.toString().padStart(2, '0')}] ${r.name}`);
        if (r.error) {
          console.error(`       ${r.error}`);
        }
      }
    }

    console.log('\n=== Response Quality, Visual Generation & Layout Test Suite ===\n');
    for (const r of responseQualityResults) {
      if (r.passed) {
        console.log(`  PASS [${r.id.toString().padStart(2, '0')}] ${r.name}`);
      } else {
        failed += 1;
        console.error(`  FAIL [${r.id.toString().padStart(2, '0')}] ${r.name}`);
        if (r.error) {
          console.error(`       ${r.error}`);
        }
      }
    }

    const totalTests =
      results.length +
      voiceResults.length +
      panelResults.length +
      plannerResults.length +
      demoResults.length +
      offlineAiResults.length +
      actionEngineResults.length +
      generalAiResults.length +
      showVisuallyResults.length +
      responseQualityResults.length;
    console.log(`\nSummary: ${totalTests - failed}/${totalTests} passed, ${failed} failed.\n`);
    await vite.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test runner error:', err);
    await vite.close();
    process.exit(1);
  }
}

main();
