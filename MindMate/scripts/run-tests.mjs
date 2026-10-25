import { createServer } from 'vite';

async function main() {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });

  try {
    const mod = await vite.ssrLoadModule('/src/services/__tests__/adaptiveAndAssessment.test.ts');
    const results = await mod.runAllAdaptiveAndAssessmentTests();

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

    console.log(`\nSummary: ${results.length - failed}/${results.length} passed, ${failed} failed.\n`);
    await vite.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test runner error:', err);
    await vite.close();
    process.exit(1);
  }
}

main();
