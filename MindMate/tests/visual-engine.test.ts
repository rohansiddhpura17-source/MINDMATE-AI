import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectVisualFormat,
  extractVisualSubject,
  buildAlgorithmVisualization,
  buildComparisonData,
  buildChartData,
  buildDiagramData,
  generateVisualRepresentation
} from '../src/services/visual/visualEngine.ts';

describe('MindMate Visual Learning Engine Suite', () => {
  it('1. Intelligently classifies visual formats based on subject context (not hardcoded)', () => {
    // Real entities / people / monuments -> image_gallery
    assert.equal(detectVisualFormat('who is jonny sins', 'Johnny Sins is an actor'), 'image_gallery');
    assert.equal(detectVisualFormat('who was albert einstein', 'Theoretical physicist'), 'image_gallery');
    assert.equal(detectVisualFormat('Tell me about the Eiffel Tower', 'Lattice tower in Paris'), 'image_gallery');

    // Algorithms -> algorithm_steps
    assert.equal(detectVisualFormat('How does binary search work?', 'Divide and conquer on sorted list'), 'algorithm_steps');
    assert.equal(detectVisualFormat('Explain bubble sort pass', 'Pairwise swapping algorithm'), 'algorithm_steps');

    // Comparisons -> comparison_table
    assert.equal(detectVisualFormat('Python vs JavaScript', 'Differences in execution model'), 'comparison_table');
    assert.equal(detectVisualFormat('Difference between SQL and NoSQL', 'Relational vs non-relational'), 'comparison_table');

    // Quantitative / Complexity -> chart
    assert.equal(detectVisualFormat('Compare Big O time complexity', 'O(1) to O(n^2) scaling'), 'chart');

    // Workflows / Systems / Functions -> flowchart / diagram
    assert.equal(detectVisualFormat('How request reaches backend server', 'Client to proxy to express'), 'flowchart');
    assert.equal(detectVisualFormat('Explain function arguments', 'Parameters and stack frames'), 'flowchart');
  });

  it('2. Extracts clean visual query subjects without question noise', () => {
    assert.equal(extractVisualSubject('who is jonny sins?'), 'jonny sins');
    assert.equal(extractVisualSubject('What is the Eiffel Tower?'), 'the Eiffel Tower');
    assert.equal(extractVisualSubject('Explain binary search.'), 'binary search');
    assert.equal(extractVisualSubject('Show visually Python Functions'), 'Python Functions');
  });

  it('3. Generates valid algorithm steps with array states, pointers, and complexity metadata', () => {
    const algo = buildAlgorithmVisualization('binary search', 'Divide and conquer');
    assert.equal(algo.algorithmName.includes('Binary Search'), true);
    assert.ok(algo.steps.length >= 3, 'Should have multiple progressive steps');
    assert.equal(algo.complexity?.time, 'O(log n)');
    assert.equal(algo.complexity?.space, 'O(1)');

    const step1 = algo.steps[0];
    assert.ok(step1.pointerLabels && step1.pointerLabels[0], 'Should label Left pointer');
    assert.ok(step1.items && step1.items.length > 0, 'Should have array items');
    assert.ok(step1.stateSummary, 'Should describe current state evaluation');
  });

  it('4. Generates structured comparison data with headers and highlighted dimensions', () => {
    const comp = buildComparisonData('Python vs JavaScript', 'Python vs JavaScript', 'Runtime differences');
    assert.ok(comp.headers.length >= 3);
    assert.ok(comp.rows.length >= 3);
    assert.equal(comp.rows.some((r) => r.highlight), true, 'Should flag key trade-off rows');
  });

  it('5. Generates valid quantitative chart data with series and data points', () => {
    const chart = buildChartData('Time complexity big o');
    assert.equal(chart.chartType, 'line');
    assert.ok(chart.series.length >= 3);
    assert.ok(chart.data.length >= 4);
    assert.equal(chart.xKey, 'n');
  });

  it('6. Generates valid Mermaid diagram syntax for system workflows and functions', () => {
    const diag = buildDiagramData('HTTP Request', 'How request reaches backend server', 'Express and prisma');
    assert.equal(diag.diagramType, 'mermaid');
    assert.ok(diag.code.includes('flowchart'));
    assert.ok(diag.code.includes('Express.js'));
    assert.ok(diag.code.includes('Database'));
  });

  it('7. Strict Offline Rule: In offline mode, strictly 0 external image requests and produces local diagram with offline indicator', async () => {
    let externalNetworkTriggered = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      externalNetworkTriggered = true;
      throw new Error(`Unexpected network call to ${url} in offline mode!`);
    }) as any;

    try {
      const visual = await generateVisualRepresentation({
        question: 'who was albert einstein',
        answer: 'Theoretical physicist who developed the theory of relativity',
        subject: 'albert einstein',
        mode: 'offline', // OFFLINE MODE
        isOnline: false
      });

      assert.equal(externalNetworkTriggered, false, 'STRICT: Offline mode must make 0 external requests');
      assert.equal(visual.offlineFallback, true, 'Should flag offlineFallback');
      assert.notEqual(visual.format, 'image_gallery', 'Should fallback from external images to local diagram');
      assert.ok(visual.diagram, 'Should provide local diagram');
      assert.ok(visual.summary.includes('Offline mode active'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('8. Supports multi-format representations allowing learners to switch modalities', async () => {
    const visual = await generateVisualRepresentation({
      question: 'Python vs JavaScript',
      answer: 'Language comparisons',
      subject: 'Python vs JavaScript',
      mode: 'online',
      isOnline: true
    });

    assert.equal(visual.format, 'comparison_table');
    assert.ok(visual.availableFormats && visual.availableFormats.length > 1);
    assert.ok(visual.diagram, 'Should pre-populate diagram format');
    assert.ok(visual.chart, 'Should pre-populate chart format');
    assert.ok(visual.algorithm, 'Should pre-populate algorithm format');
  });
});
