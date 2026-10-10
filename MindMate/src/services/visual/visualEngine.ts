/**
 * MindMate Visual Learning Engine
 * 
 * Generates and orchestrates rich visual learning assets:
 * 1. Real-world images via Wikimedia Commons API (online) with licenses & attribution
 * 2. Technical and educational diagrams (flowcharts, process diagrams - Mermaid/SVG)
 * 3. Architecture & concept maps
 * 4. Data charts & performance graphs (Recharts)
 * 5. Interactive step-by-step algorithm visualizers
 * 6. Structured comparison tables & summaries
 * 
 * Strict Offline Rule: ZERO external network or image requests when in offline mode.
 */

import {
  VisualPayload,
  VisualFormatType,
  VisualImageItem,
  VisualChartData,
  VisualAlgorithmData,
  VisualComparisonData,
  VisualDiagramData,
  VisualGenerationContext
} from './types';
import { contentModerationService } from '../safety/contentModerationService';

/**
 * Detects the most suitable primary visual format from conversation turn
 */
export function detectVisualFormat(question: string, answer: string): VisualFormatType {
  const combined = `${question} ${answer}`.toLowerCase();
  const qLower = question.toLowerCase();

  // 1. Check for Algorithms and Data Structures
  if (
    combined.includes('binary search') ||
    combined.includes('bubble sort') ||
    combined.includes('quick sort') ||
    combined.includes('merge sort') ||
    combined.includes('linear search') ||
    combined.includes('two pointers') ||
    combined.includes('sliding window') ||
    combined.includes('dijkstra') ||
    combined.includes('breadth first search') ||
    combined.includes('depth first search') ||
    combined.includes('algorithm step') ||
    combined.includes('step by step algorithm') ||
    (combined.includes('search') && combined.includes('pointer'))
  ) {
    return 'algorithm_steps';
  }

  // 2. Check for Quantitative / Charts / Complexity / Benchmarks
  if (
    combined.includes('time complexity') ||
    combined.includes('space complexity') ||
    combined.includes('big o') ||
    combined.includes('benchmark') ||
    combined.includes('performance comparison') ||
    combined.includes('statistics') ||
    combined.includes('growth rate') ||
    combined.includes('latency comparison') ||
    combined.includes('chart') ||
    combined.includes('graph')
  ) {
    return 'chart';
  }

  // 3. Check for Comparisons (vs, difference, trade-offs)
  if (
    qLower.includes(' vs ') ||
    qLower.includes(' versus ') ||
    qLower.includes('difference between') ||
    qLower.includes('compare ') ||
    combined.includes('pros and cons') ||
    combined.includes('trade-offs') ||
    combined.includes('differences between')
  ) {
    return 'comparison_table';
  }

  // 4. Check for Real-World Entities, People, Monuments, Biological/Physical items
  const isPersonOrEntity =
    qLower.startsWith('who is') ||
    qLower.startsWith('who was') ||
    combined.includes('albert einstein') ||
    combined.includes('eiffel tower') ||
    combined.includes('statue of liberty') ||
    combined.includes('pyramids') ||
    combined.includes('taj mahal') ||
    combined.includes('monument') ||
    combined.includes('dna double helix') ||
    combined.includes('human heart') ||
    combined.includes('solar system') ||
    combined.includes('mars rover') ||
    combined.includes('cell anatomy') ||
    combined.includes('animal species') ||
    combined.includes('telescope') ||
    combined.includes('microscope');

  if (isPersonOrEntity) {
    return 'image_gallery';
  }

  // 5. Default for Workflows, Systems, Architectures, Protocols, Functions -> Diagram / Flowchart
  return 'flowchart';
}

/**
 * Extracts a concise search query for media search
 */
export function extractVisualSubject(question: string, defaultTopic = 'Topic'): string {
  const clean = question.trim().replace(/[?!.]+$/, '');
  const lower = clean.toLowerCase();

  // Strip leading question markers
  const prefixes = [
    'who is ',
    'who was ',
    'what is ',
    'what are ',
    'how does ',
    'explain ',
    'show visually ',
    'visualize ',
    'tell me about '
  ];

  for (const p of prefixes) {
    if (lower.startsWith(p)) {
      const extracted = clean.slice(p.length).trim();
      if (extracted.length > 0) return extracted;
    }
  }

  return clean || defaultTopic;
}

/**
 * Fetches educational real-world images from backend proxy (online only)
 */
async function fetchOnlineImages(query: string, limit = 4): Promise<VisualImageItem[]> {
  if (!contentModerationService.isVisualSearchPermitted(query)) {
    return [];
  }
  try {
    const res = await fetch(`/api/visual/images?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!res.ok) return [];
    const data: any = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    console.warn('[VisualEngine] Image fetch failed:', err);
    return [];
  }
}

/**
 * Builds algorithm visualization steps
 */
export function buildAlgorithmVisualization(query: string, _answer: string): VisualAlgorithmData {
  const q = query.toLowerCase();

  if (q.includes('binary search') || (!q.includes('sort') && !q.includes('linear'))) {
    // Default Binary Search visualizer
    const items = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
    return {
      algorithmName: 'Binary Search (Target: 23)',
      description: 'Logarithmic O(log n) divide-and-conquer search on a sorted array.',
      complexity: { time: 'O(log n)', space: 'O(1)' },
      steps: [
        {
          step: 1,
          title: 'Initial Search Range',
          description: 'Set Left pointer to index 0, Right pointer to index 9. Calculate Mid = Math.floor((0 + 9) / 2) = 4.',
          highlightIndices: [0, 4, 9],
          pointerLabels: { 0: 'Left (0)', 4: 'Mid (16)', 9: 'Right (9)' },
          items: items.map((val, idx) => ({
            value: val,
            status: idx === 4 ? 'active' : 'default'
          })),
          stateSummary: 'Value at Mid is 16. Target (23) > Mid (16) → Search right half.'
        },
        {
          step: 2,
          title: 'Narrow to Right Half',
          description: 'Move Left = Mid + 1 = 5. Recalculate Mid = Math.floor((5 + 9) / 2) = 7.',
          highlightIndices: [5, 7, 9],
          pointerLabels: { 5: 'Left (5)', 7: 'Mid (56)', 9: 'Right (9)' },
          items: items.map((val, idx) => ({
            value: val,
            status: idx < 5 ? 'eliminated' : idx === 7 ? 'active' : 'default'
          })),
          stateSummary: 'Value at Mid is 56. Target (23) < Mid (56) → Search left partition.'
        },
        {
          step: 3,
          title: 'Target Found at Index 5',
          description: 'Move Right = Mid - 1 = 6. Recalculate Mid = Math.floor((5 + 6) / 2) = 5.',
          highlightIndices: [5],
          pointerLabels: { 5: 'Target Matched! Mid (23)' },
          items: items.map((val, idx) => ({
            value: val,
            status: idx === 5 ? 'found' : idx < 5 || idx > 6 ? 'eliminated' : 'default'
          })),
          stateSummary: 'Array[5] == 23! Search succeeded in 3 comparisons instead of 10.'
        }
      ]
    };
  }

  // Bubble sort / Linear search visualizer
  const sortItems = [45, 12, 89, 34, 23];
  return {
    algorithmName: 'Bubble Sort Pass Visualization',
    description: 'Iterative pairwise comparison swapping adjacent elements if out of order.',
    complexity: { time: 'O(n²)', space: 'O(1)' },
    steps: [
      {
        step: 1,
        title: 'Compare (45, 12)',
        description: '45 > 12 → Swap needed.',
        highlightIndices: [0, 1],
        pointerLabels: { 0: 'i (45)', 1: 'i+1 (12)' },
        items: [
          { value: 45, status: 'active' },
          { value: 12, status: 'active' },
          { value: 89, status: 'default' },
          { value: 34, status: 'default' },
          { value: 23, status: 'default' }
        ],
        stateSummary: 'Swapping 45 and 12.'
      },
      {
        step: 2,
        title: 'After Swap (12, 45)',
        description: 'Now compare index 1 and 2: 45 vs 89. 45 < 89 → No swap.',
        highlightIndices: [1, 2],
        pointerLabels: { 1: '45', 2: '89' },
        items: [
          { value: 12, status: 'default' },
          { value: 45, status: 'active' },
          { value: 89, status: 'active' },
          { value: 34, status: 'default' },
          { value: 23, status: 'default' }
        ],
        stateSummary: 'No swap needed.'
      },
      {
        step: 3,
        title: 'Compare (89, 34)',
        description: '89 > 34 → Swap needed. 89 bubbles toward end.',
        highlightIndices: [2, 3],
        pointerLabels: { 2: '89', 3: '34' },
        items: [
          { value: 12, status: 'default' },
          { value: 45, status: 'default' },
          { value: 34, status: 'active' },
          { value: 89, status: 'active' },
          { value: 23, status: 'default' }
        ],
        stateSummary: '89 swapped with 34.'
      }
    ]
  };
}

/**
 * Builds comparison table data
 */
export function buildComparisonData(subject: string, question: string, answer: string): VisualComparisonData {
  const combined = `${question} ${answer}`.toLowerCase();

  if (combined.includes('python') && (combined.includes('javascript') || combined.includes('js'))) {
    return {
      title: 'Python vs JavaScript: Architectural Comparison',
      description: 'Core paradigm, runtime, and typing differences.',
      headers: ['Feature / Dimension', 'Python', 'JavaScript (Node / Web)'],
      rows: [
        { feature: 'Primary Domain', values: ['AI, Data Science, Backend, Automation', 'Full-Stack Web, Browser, APIs, Microservices'], highlight: true },
        { feature: 'Type System', values: ['Dynamic, Strongly typed', 'Dynamic, Weakly typed (or TypeScript)'], highlight: false },
        { feature: 'Concurrency Model', values: ['GIL, Threading, asyncio, Multiprocessing', 'Single-threaded Non-blocking Event Loop'], highlight: true },
        { feature: 'Syntax / Scoping', values: ['Indentation-based whitespace scoping', 'Brace `{}` scoped with lexical closures'], highlight: false },
        { feature: 'Execution Speed', values: ['Interpreted bytecode (CPython, PyPy)', 'JIT Compiled (V8, SpiderMonkey, JSC)'], highlight: false }
      ]
    };
  }

  if (combined.includes('sql') && combined.includes('nosql')) {
    return {
      title: 'SQL (Relational) vs NoSQL (Document/Key-Value)',
      headers: ['Dimension', 'SQL (PostgreSQL, SQLite)', 'NoSQL (MongoDB, Redis)'],
      rows: [
        { feature: 'Data Schema', values: ['Fixed, relational tabular schema', 'Flexible, dynamic document/key-value'], highlight: true },
        { feature: 'Scaling', values: ['Vertical scale-up primary', 'Horizontal partition / scale-out'], highlight: false },
        { feature: 'Transactions', values: ['ACID compliant by default', 'BASE (Eventual consistency or local ACID)'], highlight: true },
        { feature: 'Complex Queries', values: ['Rich SQL JOINs, CTEs, Aggregates', 'Limited joins, nested document queries'], highlight: false }
      ]
    };
  }

  // General 2-way comparison extracted from subject
  const parts = subject.split(/\s+(?:vs|versus|and)\s+/i);
  const colA = parts[0] || 'Approach A';
  const colB = parts[1] || 'Approach B';

  return {
    title: `Comparative Analysis: ${colA} vs ${colB}`,
    description: `Key trade-offs and structural characteristics of ${subject}.`,
    headers: ['Aspect / Metric', colA, colB],
    rows: [
      { feature: 'Core Paradigm', values: [`Optimized for ${colA} workflows`, `Tailored for ${colB} scenarios`], highlight: true },
      { feature: 'Complexity', values: ['Lower barrier, direct execution', 'Higher control, structured constraints'], highlight: false },
      { feature: 'Best Use Case', values: ['Rapid prototyping & focused tasks', 'Enterprise & scaled environments'], highlight: true },
      { feature: 'Key Trade-off', values: ['Flexibility over strict enforcement', 'Strict guarantees over ergonomics'], highlight: false }
    ]
  };
}

/**
 * Builds quantitative chart data
 */
export function buildChartData(subject: string): VisualChartData {
  const sLower = subject.toLowerCase();

  if (sLower.includes('complexity') || sLower.includes('big o')) {
    return {
      chartType: 'line',
      title: 'Algorithm Time Complexity Growth: O(1) vs O(log n) vs O(n) vs O(n²)',
      description: 'Operations count required as input size (N) scales.',
      xKey: 'n',
      series: [
        { key: 'o_1', name: 'O(1) Constant', color: '#10b981' },
        { key: 'o_log_n', name: 'O(log n) Logarithmic', color: '#3b82f6' },
        { key: 'o_n', name: 'O(n) Linear', color: '#f59e0b' },
        { key: 'o_n2', name: 'O(n²) Quadratic', color: '#ef4444' }
      ],
      data: [
        { n: 'N=2', o_1: 1, o_log_n: 1, o_n: 2, o_n2: 4 },
        { n: 'N=4', o_1: 1, o_log_n: 2, o_n: 4, o_n2: 16 },
        { n: 'N=8', o_1: 1, o_log_n: 3, o_n: 8, o_n2: 64 },
        { n: 'N=16', o_1: 1, o_log_n: 4, o_n: 16, o_n2: 256 },
        { n: 'N=32', o_1: 1, o_log_n: 5, o_n: 32, o_n2: 1024 }
      ]
    };
  }

  // Bar chart of performance/retention
  return {
    chartType: 'bar',
    title: `${subject} - Comparative Efficiency Metric`,
    description: 'Normalized relative performance benchmark.',
    xKey: 'category',
    series: [
      { key: 'score', name: 'Efficiency Score (%)', color: '#6366f1' },
      { key: 'throughput', name: 'Throughput Index', color: '#10b981' }
    ],
    data: [
      { category: 'Baseline', score: 62, throughput: 55 },
      { category: 'Optimized', score: 88, throughput: 92 },
      { category: 'Cached', score: 96, throughput: 99 }
    ]
  };
}

/**
 * Builds Mermaid / SVG diagram code
 */
export function buildDiagramData(subject: string, question: string, answer: string): VisualDiagramData {
  const combined = `${question} ${answer}`.toLowerCase();

  if (combined.includes('request') && (combined.includes('backend') || combined.includes('server'))) {
    return {
      diagramType: 'mermaid',
      title: 'HTTP Request Lifecycle & Server Pipeline',
      description: 'End-to-end architecture from client dispatch to database persistence.',
      code: `flowchart LR
    A["User Browser\n(React UI)"] -->|"1. GET /api/..."| B["Vite Dev / Nginx"]
    B -->|"2. Forward"| C["Express.js\nApp Server"]
    C -->|"3. Auth & Guard"| D{"Cookie / JWT\nValid?"}
    D -- Yes --> E["Service Layer\n& Business Logic"]
    D -- No --> F["401 Unauthorized"]
    E -->|"4. Query"| G[("Database\nSQLite / Postgres")]
    G -->|"5. Results"| E
    E -->|"6. JSON / Stream"| A
    style A fill:#e0e7ff,stroke:#6366f1,stroke-width:2px
    style C fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    style G fill:#dcfce7,stroke:#10b981,stroke-width:2px`
    };
  }

  if (combined.includes('function') || combined.includes('python function')) {
    return {
      diagramType: 'mermaid',
      title: 'Function Execution & Stack Frame Lifecycle',
      description: 'How parameters, memory frames, and return values operate.',
      code: `flowchart TD
    A["Function Call\nfunc(arg1, arg2)"] --> B["Allocate Stack Frame in Call Stack"]
    B --> C["Bind Arguments to Parameters"]
    C --> D["Execute Function Body"]
    D --> E{"Return Statement\nReached?"}
    E -- Yes --> F["Return Specified Value"]
    E -- No --> G["Return Default None"]
    F --> H["Deallocate Stack Frame\n& Resume Caller"]
    G --> H
    style A fill:#e0e7ff,stroke:#6366f1,stroke-width:2px
    style E fill:#fef3c7,stroke:#f59e0b,stroke-width:2px
    style H fill:#dcfce7,stroke:#10b981,stroke-width:2px`
    };
  }

  if (combined.includes('oauth') || combined.includes('auth')) {
    return {
      diagramType: 'mermaid',
      title: 'Authentication & Session Flow',
      description: 'Cryptographic token validation and state verification.',
      code: `flowchart TD
    A["Client"] -->|"POST /login (creds)"| B["Auth Service"]
    B -->|"Verify Hash"| C[("User Store")]
    C -->|"Valid"| B
    B -->|"Issue Secure HTTP-only Cookie"| A
    A -->|"Subsequent Requests with Cookie"| D["Protected API"]
    D -->|"Validate Signature"| E["Serve User Data"]
    style A fill:#e0e7ff,stroke:#6366f1,stroke-width:2px
    style B fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    style D fill:#dcfce7,stroke:#10b981,stroke-width:2px`
    };
  }

  // Clean fallback concept diagram
  const cleanSubj = subject.replace(/["'\\]/g, '').slice(0, 30) || 'Topic';
  return {
    diagramType: 'mermaid',
    title: `Concept Map: ${cleanSubj}`,
    description: `Structural decomposition and core relationships of ${cleanSubj}.`,
    code: `flowchart TD
    Core["${cleanSubj}"] --> Comp1["Fundamental Principles"]
    Core --> Comp2["Implementation & Architecture"]
    Core --> Comp3["Applications & Real-world Usage"]
    Comp1 --> Sub1["Core Definitions\n& Rules"]
    Comp2 --> Sub2["Patterns &\nBest Practices"]
    Comp3 --> Sub3["Outcomes &\nValue Produced"]
    style Core fill:#ede9fe,stroke:#8b5cf6,stroke-width:3px
    style Comp1 fill:#e0e7ff,stroke:#6366f1,stroke-width:2px
    style Comp2 fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    style Comp3 fill:#dcfce7,stroke:#10b981,stroke-width:2px`
  };
}

/**
 * Main Visual Learning Engine generation entrypoint
 */
export async function generateVisualRepresentation(context: VisualGenerationContext): Promise<VisualPayload> {
  const { question, answer, subject, mode, isOnline, previousQuestion, previousAnswer } = context;

  // Pre-flight content moderation check for user prompt and conversational context
  const modResult = contentModerationService.evaluate(question, {
    previousQuestion,
    previousAnswer,
    currentSubject: subject
  });

  if (modResult.decision !== 'ALLOW') {
    return {
      format: 'moderation_refusal',
      title: 'Visual Representation Unavailable',
      summary: modResult.userExplanation,
      topic: subject || 'Educational Safety',
      availableFormats: [],
      blocked: true,
      moderationExplanation: modResult.userExplanation
    };
  }

  const primaryFormat = detectVisualFormat(question, answer);
  const targetSubject = extractVisualSubject(question, subject);

  // Secondary check on target subject extracted
  if (!contentModerationService.isVisualSearchPermitted(targetSubject)) {
    return {
      format: 'moderation_refusal',
      title: 'Visual Representation Unavailable',
      summary: modResult.userExplanation || 'This visual topic is unavailable on MindMate.',
      topic: targetSubject,
      availableFormats: [],
      blocked: true,
      moderationExplanation: modResult.userExplanation
    };
  }

  const availableFormats: VisualFormatType[] = [
    'flowchart',
    'comparison_table',
    'chart',
    'algorithm_steps'
  ];

  // In offline mode: STRICT 0 external network calls!
  const isOffline = mode === 'offline' || !isOnline;

  let effectiveFormat = primaryFormat;
  let images: VisualImageItem[] = [];
  let offlineFallback = false;

  if (primaryFormat === 'image_gallery') {
    if (isOffline) {
      // Offline rule: Do NOT make external image search requests
      offlineFallback = true;
      effectiveFormat = 'flowchart';
    } else {
      // Online mode: Query Wikimedia Commons & Wikipedia via backend
      images = await fetchOnlineImages(targetSubject, 4);
      if (images.length === 0) {
        // Fallback to diagram if no image found
        effectiveFormat = 'flowchart';
      } else {
        availableFormats.unshift('image_gallery');
      }
    }
  }

  // Pre-generate rich representations for each modality so learner can switch seamlessly
  const diagram = buildDiagramData(targetSubject, question, answer);
  const comparison = buildComparisonData(targetSubject, question, answer);
  const chart = buildChartData(targetSubject);
  const algorithm = buildAlgorithmVisualization(targetSubject, answer);

  let summary = `Visual learning representation for "${targetSubject}".`;
  if (offlineFallback) {
    summary += ' (Offline mode active — generated local architectural diagram with 0 network calls).';
  }

  return {
    format: effectiveFormat,
    title: `${targetSubject} — Visual Architecture & Learning Map`,
    summary,
    topic: targetSubject,
    availableFormats,
    images: images.length > 0 ? images : undefined,
    diagram,
    chart,
    algorithm,
    comparison,
    offlineFallback
  };
}
