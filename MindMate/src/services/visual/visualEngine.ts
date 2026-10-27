/**
 * MindMate Visual Learning Engine
 * 
 * Generates and orchestrates rich visual learning assets:
 * 1. Real-world images via Wikimedia Commons API (online) with licenses & attribution
 * 2. Technical and educational diagrams (flowcharts, process diagrams - Mermaid/SVG)
 * 3. Architecture & concept maps (CPU, MindMate architecture, etc.)
 * 4. Data charts & performance graphs (Recharts)
 * 5. Interactive step-by-step algorithm visualizers
 * 6. Structured comparison tables & summaries (Pandas Series vs DataFrame, Stack vs Queue, etc.)
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
import {
  searchEducationalImages,
  isPersonOrBiographicalQuery,
  extractEntityName
} from './imageSearchService';

/**
 * Detects the most suitable primary visual format from conversation turn
 */
export function detectVisualFormat(question: string, answer: string): VisualFormatType {
  const combined = `${question} ${answer}`.toLowerCase();
  const qLower = question.toLowerCase();

  // 1. Check for Algorithms and Data Structures step visualizers
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

  // 3. Check for Specialized Comparisons: Pandas, Stack vs Queue, or explicit vs/compare
  if (
    combined.includes('pandas') ||
    combined.includes('series vs dataframe') ||
    (combined.includes('series') && combined.includes('dataframe')) ||
    (combined.includes('stack') && combined.includes('queue')) ||
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

  // 4. Check for People, Historical Figures, Scientists, and Physical/Biological entities
  if (
    isPersonOrBiographicalQuery(question) ||
    qLower.startsWith('who is') ||
    qLower.startsWith('who was') ||
    combined.includes('max planck') ||
    combined.includes('albert einstein') ||
    combined.includes('marie curie') ||
    combined.includes('ada lovelace') ||
    combined.includes('alan turing') ||
    combined.includes('isaac newton') ||
    combined.includes('eiffel tower') ||
    combined.includes('statue of liberty') ||
    combined.includes('pyramids') ||
    combined.includes('taj mahal') ||
    combined.includes('monument') ||
    combined.includes('dna double helix') ||
    combined.includes('solar system') ||
    combined.includes('mars rover')
  ) {
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

  if (
    lower === 'show visually' ||
    lower === 'visualize' ||
    lower === 'show me visually' ||
    lower === 'visual explanation'
  ) {
    return defaultTopic;
  }

  for (const p of prefixes) {
    if (lower.startsWith(p)) {
      const extracted = clean.slice(p.length).trim();
      if (extracted.length > 0) return extracted;
    }
  }

  return clean || defaultTopic;
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
  const combined = `${subject} ${question} ${answer}`.toLowerCase();

  // 1. Pandas: Series vs DataFrame
  if (
    combined.includes('pandas') ||
    combined.includes('series vs dataframe') ||
    (combined.includes('series') && combined.includes('dataframe'))
  ) {
    return {
      title: 'Pandas Data Architecture: Series (1D) vs DataFrame (2D)',
      description: 'Core tabular abstractions in Python for data manipulation and analysis.',
      headers: ['Dimension / Feature', 'Pandas Series', 'Pandas DataFrame'],
      rows: [
        { feature: 'Dimensionality', values: ['1-Dimensional labeled array', '2-Dimensional labeled tabular grid'], highlight: true },
        { feature: 'Internal Structure', values: ['Single column of data + Index', 'Collection of Series sharing a common Index'], highlight: false },
        { feature: 'Data Homogeneity', values: ['Homogeneous (single dtype per Series)', 'Heterogeneous (different column dtypes allowed)'], highlight: true },
        { feature: 'Indexing & Selection', values: ['s[label] or s.iloc[pos]', 'df[col] or df.loc[row, col]'], highlight: false },
        { feature: 'Primary Domain', values: ['1D metric vectors & time-series', 'Multi-attribute tables, SQL data & feature matrices'], highlight: false }
      ]
    };
  }

  // 2. Data Structures: Stack vs Queue
  if (combined.includes('stack') && combined.includes('queue')) {
    return {
      title: 'Data Structures: Stack (LIFO) vs Queue (FIFO)',
      description: 'Order of operations, pointer mechanics, and operational use cases.',
      headers: ['Aspect / Metric', 'Stack (LIFO)', 'Queue (FIFO)'],
      rows: [
        { feature: 'Access Principle', values: ['Last-In, First-Out (LIFO)', 'First-In, First-Out (FIFO)'], highlight: true },
        { feature: 'Insertion Point', values: ['push() at the Top pointer', 'enqueue() at the Rear / Tail pointer'], highlight: false },
        { feature: 'Deletion Point', values: ['pop() from the Top pointer', 'dequeue() from the Front / Head pointer'], highlight: true },
        { feature: 'Core Use Cases', values: ['Function call stack, undo/redo, DFS, syntax parsing', 'CPU task scheduling, print queues, BFS traversal, event buffers'], highlight: false },
        { feature: 'Time Complexity', values: ['O(1) push and pop', 'O(1) enqueue and dequeue (amortized)'], highlight: false }
      ]
    };
  }

  // 3. Python vs JavaScript
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

  // 4. SQL vs NoSQL
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

  // 5. Database Normalization: 1NF vs 2NF vs 3NF
  if (
    combined.includes('normalization') ||
    combined.includes('normal form') ||
    combined.includes('1nf') ||
    combined.includes('2nf') ||
    combined.includes('3nf') ||
    combined.includes('database normalization')
  ) {
    return {
      title: 'Database Normalization: 1NF vs 2NF vs 3NF Comparison',
      description: 'Progressive reduction of data redundancy, insertion/deletion anomalies, and functional dependencies.',
      headers: ['Normal Form', 'Core Requirement / Rule', 'Dependency Eliminated', 'Decomposition Strategy'],
      rows: [
        {
          feature: '1NF (First Normal Form)',
          values: [
            'Each column contains atomic (indivisible) values, unique primary key, no repeating attribute groups',
            'Repeating attribute groups & array structures',
            'Flatten multivalued attributes into distinct rows with primary key'
          ],
          highlight: false
        },
        {
          feature: '2NF (Second Normal Form)',
          values: [
            'Must satisfy 1NF and all non-key attributes must depend on the entire candidate/composite primary key',
            'Partial key functional dependencies',
            'Decompose tables so composite keys are split into independent tables'
          ],
          highlight: true
        },
        {
          feature: '3NF (Third Normal Form)',
          values: [
            'Must satisfy 2NF and non-key attributes must not depend on other non-key attributes (no transitive dependencies)',
            'Transitive dependencies (X → Y → Z)',
            'Extract transitive attributes into dedicated entity/lookup relations'
          ],
          highlight: true
        },
        {
          feature: 'BCNF (Boyce-Codd NF)',
          values: [
            'For every functional dependency X → Y, determinant X must strictly be a candidate superkey',
            'Anomalies from overlapping composite candidate keys',
            'Isolate overlapping candidate key relations into separate tables'
          ],
          highlight: false
        }
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
  const combined = `${subject} ${question} ${answer}`.toLowerCase();

  // 1. CPU Architecture
  if (
    combined.includes('cpu') ||
    combined.includes('processor') ||
    combined.includes('central processing unit')
  ) {
    return {
      diagramType: 'mermaid',
      title: 'Von Neumann CPU Architecture & Dataflow',
      description: 'Internal CPU subsystems: Control Unit, ALU, Registers, Cache hierarchy, and System Bus.',
      code: `flowchart TD
    subgraph CPU["Central Processing Unit (CPU)"]
      CU["Control Unit (CU)\nDecodes & Coordinates"]
      ALU["Arithmetic Logic Unit (ALU)\nExecutes Math & Logic"]
      REG["Registers\n(PC, IR, Accumulator)"]
      CACHE["L1 / L2 Cache\nHigh-Speed SRAM"]
      CU <--> REG
      ALU <--> REG
      CU --> ALU
      CACHE <--> REG
    end
    BUS{"System Bus\n(Address, Data & Control)"}
    RAM[("Main Memory (RAM)\nDRAM Instructions & Data")]
    IO["I/O Devices\n(Storage, Display, Network)"]
    CPU <--> BUS
    BUS <--> RAM
    BUS <--> IO
    style CPU fill:#ede9fe,stroke:#6366f1,stroke-width:2px
    style CU fill:#e0e7ff,stroke:#4f46e5,stroke-width:2px
    style ALU fill:#dbeafe,stroke:#2563eb,stroke-width:2px
    style RAM fill:#dcfce7,stroke:#10b981,stroke-width:2px`
    };
  }

  // 2. Water Cycle
  if (combined.includes('water cycle') || combined.includes('hydrologic cycle')) {
    return {
      diagramType: 'mermaid',
      title: 'The Hydrological Water Cycle',
      description: 'Continuous movement of water through atmosphere, land, and water bodies.',
      code: `flowchart TD
    SUN["☀️ Solar Energy & Radiation"] -->|Heats Surface Water| EVAP["Evaporation & Transpiration\n(Liquid Water to Vapor)"]
    EVAP -->|Rises & Cools| COND["Condensation\n(Clouds & Fog Form)"]
    COND -->|Droplets Grow Heavy| PREC["Precipitation\n(Rain, Snow, Sleet & Hail)"]
    PREC -->|Surface Flow| RUNOFF["Surface Runoff\n(Streams & Rivers)"]
    PREC -->|Soaks Soil| INFILT["Infiltration & Percolation\n(Groundwater Aquifers)"]
    RUNOFF --> COLL["Collection\n(Oceans, Lakes & Reservoirs)"]
    INFILT --> COLL
    COLL -->|Replenished| SUN
    style SUN fill:#fef3c7,stroke:#f59e0b,stroke-width:2px
    style COND fill:#e0e7ff,stroke:#6366f1,stroke-width:2px
    style PREC fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    style COLL fill:#dcfce7,stroke:#10b981,stroke-width:2px`
    };
  }

  // 3. MindMate System Architecture
  if (combined.includes('mindmate') && combined.includes('architecture')) {
    return {
      diagramType: 'mermaid',
      title: 'MindMate System & AI Assistant Architecture',
      description: 'Decoupled architecture connecting React UI, Action Engine, Ollama Gemma 4, and Adaptive Analytics.',
      code: `flowchart TD
    UI["React 19 Frontend\n(Learn Chat, Planner, Insights, Voice)"] --> ROUTER["Voice & Chat Action Router"]
    ROUTER --> ENGINE["Action Execution Engine\n(Planner, Navigator, Quiz, Settings)"]
    ROUTER --> TUTOR["Mate AI Tutor Pipeline\n(Relevance & Intent Classifier)"]
    TUTOR --> OLLAMA["Local Ollama Service\n(gemma4:e2b-it-qat @ 127.0.0.1:11434)"]
    TUTOR --> WEBGPU["Local WebGPU Adapter\n(Offline in-browser inference)"]
    TUTOR --> MEDIA["Media & Visual Engine\n(Wikimedia Commons & Mermaid)"]
    ENGINE --> STORE[("Supabase DB & Storage\n(Attempts, Mastery & Planner Tasks)")]
    ENGINE --> ADAPT["Adaptive Learning Engine\n(Bayesian Mastery & Mistake Analyzer)"]
    style UI fill:#ede9fe,stroke:#6366f1,stroke-width:2px
    style OLLAMA fill:#dbeafe,stroke:#2563eb,stroke-width:2px
    style ENGINE fill:#dcfce7,stroke:#10b981,stroke-width:2px
    style STORE fill:#fef3c7,stroke:#f59e0b,stroke-width:2px`
    };
  }

  // 4. Pandas Architecture Diagram
  if (combined.includes('pandas')) {
    return {
      diagramType: 'mermaid',
      title: 'Pandas Data Hierarchy: DataFrame Composed of Series',
      description: 'How 1D Series compose into 2D DataFrames and align by index.',
      code: `flowchart TD
    DF["DataFrame (2-Dimensional)\ndf = pd.DataFrame(data)"] --> COL_A["Series A (1D)\nint64 dtype"]
    DF --> COL_B["Series B (1D)\nfloat64 dtype"]
    DF --> COL_C["Series C (1D)\nobject/string dtype"]
    COL_A --> IDX["Shared Index Labels\n(0, 1, 2, ... or DatetimeIndex)"]
    COL_B --> IDX
    COL_C --> IDX
    style DF fill:#ede9fe,stroke:#6366f1,stroke-width:2px
    style COL_A fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    style COL_B fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    style COL_C fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    style IDX fill:#dcfce7,stroke:#10b981,stroke-width:2px`
    };
  }

  // 5. Stack vs Queue Diagram
  if (combined.includes('stack') && combined.includes('queue')) {
    return {
      diagramType: 'mermaid',
      title: 'Stack vs Queue Data Flow Operations',
      description: 'LIFO (Last-In, First-Out) vs FIFO (First-In, First-Out) pointer mechanics.',
      code: `flowchart LR
    subgraph STACK["Stack: LIFO (Last-In, First-Out)"]
      S_IN["push(X)"] --> S_TOP["Top Pointer [X]"]
      S_TOP --> S_1["Element 2"]
      S_1 --> S_0["Element 1 (Base)"]
      S_TOP -->|"pop() removes top"| S_OUT["Return X"]
    end
    subgraph QUEUE["Queue: FIFO (First-In, First-Out)"]
      Q_IN["enqueue(Y)"] --> Q_REAR["Rear Pointer [Y]"]
      Q_REAR --> Q_MID["Element 2"]
      Q_MID --> Q_FRONT["Front Pointer [Z]"]
      Q_FRONT -->|"dequeue() removes front"| Q_OUT["Return Z"]
    end
    style STACK fill:#e0e7ff,stroke:#6366f1,stroke-width:2px
    style QUEUE fill:#dcfce7,stroke:#10b981,stroke-width:2px`
    };
  }

  // 6. HTTP Request Pipeline
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

  // 7. Python Recursion & Call Stack Lifecycle
  if (
    combined.includes('recursion') ||
    combined.includes('recursive') ||
    combined.includes('call stack') ||
    combined.includes('base case')
  ) {
    return {
      diagramType: 'mermaid',
      title: 'Python Recursion: Call Stack Lifecycle (factorial(3))',
      description: 'Step-by-step execution: stack frame allocation (winding) followed by base case resolution (unwinding).',
      code: `flowchart TD
    subgraph PHASE1["Phase 1: Winding / Push Stack Frames"]
      C3["1. factorial(3)\nCalls factorial(2)\nNeeds 3 * result"] -->|Allocates frame| C2["2. factorial(2)\nCalls factorial(1)\nNeeds 2 * result"]
      C2 -->|Allocates frame| C1["3. factorial(1)\nCalls factorial(0)\nNeeds 1 * result"]
      C1 -->|Base Case Reached| C0["4. factorial(0)\nBase case: returns 1"]
    end
    subgraph PHASE2["Phase 2: Unwinding / Return Values & Pop Frames"]
      C0 -.->|Returns 1| R1["factorial(1) resolves:\n1 * 1 = 1"]
      R1 -.->|Returns 1| R2["factorial(2) resolves:\n2 * 1 = 2"]
      R2 -.->|Returns 2| R3["factorial(3) resolves:\n3 * 2 = 6 (Final Return)"]
    end
    style C0 fill:#fef3c7,stroke:#f59e0b,stroke-width:2px
    style R3 fill:#dcfce7,stroke:#10b981,stroke-width:2px
    style PHASE1 fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px
    style PHASE2 fill:#f0fdf4,stroke:#10b981,stroke-width:1.5px`
    };
  }

  // 8. Database Normalization (1NF -> 2NF -> 3NF Decomposition)
  if (
    combined.includes('normalization') ||
    combined.includes('normal form') ||
    combined.includes('1nf') ||
    combined.includes('2nf') ||
    combined.includes('3nf') ||
    combined.includes('database normalization')
  ) {
    return {
      diagramType: 'mermaid',
      title: 'Database Normalization: Relational Decomposition (1NF → 2NF → 3NF)',
      description: 'Progressive decomposition eliminating repeating groups, partial dependencies, and transitive dependencies.',
      code: `flowchart TD
    UNF["Unnormalized Table (0NF)\nOrders(OrderID, Customer, Address, Items[Item1, Item2], Prices)"]
    -->|"1NF: Remove Repeating Groups\nEnsure Atomic Attributes"| N1["1NF: Orders Table\n(OrderID, Customer, Address, ItemID, Price, Qty)"]
    N1 -->|"2NF: Remove Partial Dependencies\nSeparate items from order header"| N2A["Orders Table\n(OrderID, Customer, Address, OrderDate)"]
    N1 -->|"2NF Decomposition"| N2B["OrderItems Table\n(OrderID, ItemID, Qty, UnitPrice)"]
    N2A -->|"3NF: Remove Transitive Dependencies\nSeparate Customer Address to Customers table"| N3A["Orders Table\n(OrderID, CustomerID, OrderDate)"]
    N2A -->|"3NF Decomposition"| N3B["Customers Table\n(CustomerID, Name, Address)"]
    N2B -->|"3NF Clean Relations"| N3C["Items Table\n(ItemID, Name, StandardPrice)"]
    style UNF fill:#fee2e2,stroke:#ef4444,stroke-width:2px
    style N1 fill:#fef3c7,stroke:#f59e0b,stroke-width:2px
    style N2A fill:#e0e7ff,stroke:#6366f1,stroke-width:2px
    style N2B fill:#e0e7ff,stroke:#6366f1,stroke-width:2px
    style N3A fill:#dcfce7,stroke:#10b981,stroke-width:2px
    style N3B fill:#dcfce7,stroke:#10b981,stroke-width:2px
    style N3C fill:#dcfce7,stroke:#10b981,stroke-width:2px`
    };
  }

  // 9. Python Functions lifecycle
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
  const targetSubject = extractEntityName(question) || extractVisualSubject(question, subject);

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
      // Online mode: Query Wikimedia Commons & Wikipedia using imageSearchService
      images = await searchEducationalImages(targetSubject, { limit: 4 });
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
