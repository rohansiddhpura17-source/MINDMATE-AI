// Real Multilingual Learning Content Database for MindMate
// Supported languages: 'en' (English), 'es' (Spanish), 'fr' (French), 'de' (German), 'hi' (Hindi)

export type LanguageCode = 'en' | 'es' | 'fr' | 'de' | 'hi';

export interface SupportedLanguage {
  code: LanguageCode;
  label: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
];

export interface SubjectItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  topicsCount: number;
}

export const SUBJECTS: SubjectItem[] = [
  {
    id: 'python',
    name: 'Python Programming',
    description: 'Core syntax, functional paradigms, and object-oriented architectures',
    icon: 'Code2',
    topicsCount: 4,
  },
  {
    id: 'dbms',
    name: 'Database Management Systems',
    description: 'Relational data models, SQL execution, indexing, and normalization',
    icon: 'Database',
    topicsCount: 2,
  },
  {
    id: 'dsa',
    name: 'Data Structures & Algorithms',
    description: 'Fundamental storage structures, time complexity, and search patterns',
    icon: 'BrainCircuit',
    topicsCount: 2,
  },
];

export interface TopicItem {
  id: string;
  subjectId: string;
  name: string;
  description: string;
  prerequisites?: string[];
  conceptTags?: string[];
}

export const TOPICS: TopicItem[] = [
  {
    id: 'python-variables',
    subjectId: 'python',
    name: 'Variables & Scope',
    description: 'Local, global, and nonlocal scope with variable binding',
    prerequisites: [],
    conceptTags: ['variable-binding', 'lebg-scope', 'mutability'],
  },
  {
    id: 'python-loops',
    subjectId: 'python',
    name: 'Loops & Iteration',
    description: 'For loops, while loops, comprehension expressions, and generators',
    prerequisites: ['python-variables'],
    conceptTags: ['for-while-loops', 'comprehensions', 'generators-iterators'],
  },
  {
    id: 'python-functions',
    subjectId: 'python',
    name: 'Python Functions',
    description: 'Arguments, returns, closures, and lambda expressions',
    prerequisites: ['python-variables', 'python-loops'],
    conceptTags: ['function-definition', 'arguments-packing', 'mutable-defaults', 'closures-scope'],
  },
  {
    id: 'python-oop',
    subjectId: 'python',
    name: 'Object-Oriented Programming (OOP)',
    description: 'Classes, encapsulation, inheritance, and polymorphism',
    prerequisites: ['python-functions'],
    conceptTags: ['constructors-init', 'instance-self', 'encapsulation', 'inheritance-mro'],
  },
  {
    id: 'dbms-sql',
    subjectId: 'dbms',
    name: 'SQL & Query Optimization',
    description: 'SELECT joins, aggregations, subqueries, and indexing',
    prerequisites: [],
    conceptTags: ['sql-filtering-aggregation', 'joins', 'indexing-query-plans'],
  },
  {
    id: 'dbms-normalization',
    subjectId: 'dbms',
    name: 'Database Normalization',
    description: '1NF, 2NF, 3NF, BCNF and integrity constraints',
    prerequisites: ['dbms-sql'],
    conceptTags: ['normal-forms', 'functional-dependencies', 'bcnf-decomposition'],
  },
  {
    id: 'dsa-queues-stacks',
    subjectId: 'dsa',
    name: 'Stacks & Queues',
    description: 'LIFO, FIFO, circular queues, and deque mechanics',
    prerequisites: ['python-loops'],
    conceptTags: ['lifo-stack', 'fifo-queue', 'deque-complexity'],
  },
  {
    id: 'dsa-trees',
    subjectId: 'dsa',
    name: 'Trees & Graphs',
    description: 'Binary search trees, traversal algorithms, and shortest paths',
    prerequisites: ['dsa-queues-stacks'],
    conceptTags: ['bst-properties', 'tree-traversal', 'graph-search'],
  },
];

const TOPIC_ALIAS_MAP: Record<string, string> = {
  'variables': 'python-variables',
  'variables & scope': 'python-variables',
  'conditions': 'python-variables',
  'loops': 'python-loops',
  'loops & iteration': 'python-loops',
  'functions': 'python-functions',
  'python functions': 'python-functions',
  'oop': 'python-oop',
  'object-oriented programming': 'python-oop',
  'object-oriented programming (oop)': 'python-oop',
  'dbms': 'dbms-sql',
  'sql': 'dbms-sql',
  'sql & query optimization': 'dbms-sql',
  'normalization': 'dbms-normalization',
  'database normalization': 'dbms-normalization',
  'stacks & queues': 'dsa-queues-stacks',
  'queues & stacks': 'dsa-queues-stacks',
  'trees & graphs': 'dsa-trees',
  'trees': 'dsa-trees',
};

export function resolveTopicMetadata(topicIdOrName: string): TopicItem {
  const normalized = (topicIdOrName || '').trim().toLowerCase();
  const byId = TOPICS.find((t) => t.id.toLowerCase() === normalized);
  if (byId) return byId;

  const byName = TOPICS.find((t) => t.name.toLowerCase() === normalized);
  if (byName) return byName;

  const mappedId = TOPIC_ALIAS_MAP[normalized];
  if (mappedId) {
    const found = TOPICS.find((t) => t.id === mappedId);
    if (found) return found;
  }

  return {
    id: normalized.replace(/[^a-z0-9-]+/g, '-') || 'general-topic',
    subjectId: 'python',
    name: topicIdOrName || 'General Topic',
    description: 'Topic tracked from learner assessment history',
    prerequisites: [],
    conceptTags: [],
  };
}

export interface FlashcardItem {
  id: string;
  topicId: string;
  language: LanguageCode;
  front: string;
  back: string;
  hint: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  codeSnippet?: string;
}

export interface QuickRecallItem {
  id: string;
  topicId: string;
  language: LanguageCode;
  title: string;
  category: 'definition' | 'syntax' | 'rule' | 'pitfall';
  keyFact: string;
  codeSnippet?: string;
  detail: string;
}

export interface AdaptiveQuestionItem {
  id: string;
  topicId: string;
  language: LanguageCode;
  difficulty: number; // 1 to 5
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  concept?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Multilingual Database Seed (Real Verified Content)
// ─────────────────────────────────────────────────────────────────────────────

export const MULTILINGUAL_QUESTIONS: AdaptiveQuestionItem[] = [
  // --- English Questions (Difficulty 1 to 5) ---
  {
    id: 'q-en-fn-1',
    topicId: 'python-functions',
    language: 'en',
    difficulty: 1,
    concept: 'function-definition',
    question: 'Which keyword defines a function in Python?',
    options: ['function', 'def', 'func', 'fn'],
    correct: 1,
    explanation: 'The `def` keyword introduces a function definition in Python syntax.',
  },
  {
    id: 'q-en-fn-2',
    topicId: 'python-functions',
    language: 'en',
    difficulty: 2,
    concept: 'arguments-packing',
    question: 'What occurs when calling a function without passing a required positional argument?',
    options: ['Python passes None automatically', 'Python raises a TypeError', 'Python silently skips execution', 'The function creates a default empty value'],
    correct: 1,
    explanation: 'Python raises a TypeError stating that a required positional argument was missing.',
  },
  {
    id: 'q-en-fn-3',
    topicId: 'python-functions',
    language: 'en',
    difficulty: 3,
    concept: 'arguments-packing',
    question: 'What does *args indicate in a function parameter signature?',
    options: ['A dictionary of keyword arguments', 'An immutable tuple of variable positional arguments', 'A pointer to a memory buffer', 'A mandatory list of integers'],
    correct: 1,
    explanation: '*args packs any extra positional arguments into an immutable tuple.',
  },
  {
    id: 'q-en-fn-4',
    topicId: 'python-functions',
    language: 'en',
    difficulty: 4,
    concept: 'mutable-defaults',
    question: 'Why is using a mutable default argument like `def add(item, lst=[])` problematic in Python?',
    options: ['It causes a syntax compiler error', 'The default list is created once at definition and shared across subsequent calls', 'Python garbage collects the list immediately after first call', 'Lists cannot be passed into functions'],
    correct: 1,
    explanation: 'Default argument expressions are evaluated once when the function is defined, so mutable defaults mutate across successive calls.',
  },
  {
    id: 'q-en-fn-5',
    topicId: 'python-functions',
    language: 'en',
    difficulty: 5,
    concept: 'closures-scope',
    question: 'In a Python closure, which keyword allows modifying a variable bound in an enclosing (non-global) scope?',
    options: ['global', 'nonlocal', 'outer', 'super'],
    correct: 1,
    explanation: 'The `nonlocal` keyword allows assignment to an existing variable in the nearest enclosing non-global scope.',
  },

  // Variables & Scope English
  {
    id: 'q-en-var-1',
    topicId: 'python-variables',
    language: 'en',
    difficulty: 1,
    concept: 'variable-binding',
    question: 'Which of the following is a valid variable name in Python?',
    options: ['2total_count', 'total_count_2', 'total-count', 'class'],
    correct: 1,
    explanation: 'Python identifiers must begin with a letter or underscore and cannot use reserved keywords like `class` or hyphens.',
  },
  {
    id: 'q-en-var-2',
    topicId: 'python-variables',
    language: 'en',
    difficulty: 2,
    concept: 'mutability',
    question: 'What happens after executing `a = [1, 2]; b = a; b.append(3)`?',
    options: ['`a` remains `[1, 2]` and `b` is `[1, 2, 3]`', 'Both `a` and `b` evaluate to `[1, 2, 3]`', 'Python raises an AttributeError', 'A deep copy of `a` is created automatically'],
    correct: 1,
    explanation: 'Assignment binds `b` to the same list object referenced by `a`; mutating the list in-place affects both references.',
  },
  {
    id: 'q-en-var-3',
    topicId: 'python-variables',
    language: 'en',
    difficulty: 3,
    concept: 'lebg-scope',
    question: 'In what order does Python resolve variable names according to the LEGB rule?',
    options: ['Local -> Enclosing -> Global -> Built-in', 'Global -> Local -> Enclosing -> Built-in', 'Local -> Global -> External -> Base', 'Built-in -> Global -> Enclosing -> Local'],
    correct: 0,
    explanation: 'Python resolves names from the innermost Local scope outward: Local, Enclosing, Global, and finally Built-in.',
  },
  {
    id: 'q-en-var-4',
    topicId: 'python-variables',
    language: 'en',
    difficulty: 4,
    concept: 'lebg-scope',
    question: 'Why does `x = 10; def f(): print(x); x = 20; f()` raise `UnboundLocalError`?',
    options: ['`print` cannot access integers', 'Assigning `x = 20` inside `f` makes `x` local throughout `f`, so `print(x)` reads it before assignment', 'Global variables cannot be read inside functions', 'Python does not allow shadowing global names'],
    correct: 1,
    explanation: 'Any assignment to a variable inside a function marks that identifier as local for the entire function body unless declared `global`.',
  },

  // Loops & Iteration English
  {
    id: 'q-en-loop-1',
    topicId: 'python-loops',
    language: 'en',
    difficulty: 1,
    concept: 'for-while-loops',
    question: 'What sequence of numbers does `list(range(3))` produce?',
    options: ['[1, 2, 3]', '[0, 1, 2]', '[0, 1, 2, 3]', '[3]'],
    correct: 1,
    explanation: '`range(3)` starts at 0 by default and stops before 3, yielding `0, 1, 2`.',
  },
  {
    id: 'q-en-loop-2',
    topicId: 'python-loops',
    language: 'en',
    difficulty: 2,
    concept: 'for-while-loops',
    question: 'What is the difference between `break` and `continue` inside a loop?',
    options: ['`break` exits the loop immediately; `continue` skips to the next iteration', '`continue` exits the loop; `break` pauses execution', 'They are interchangeable in `for` loops', '`break` only works in `while` loops'],
    correct: 0,
    explanation: '`break` terminates the enclosing loop, whereas `continue` jumps straight to the next iteration step.',
  },
  {
    id: 'q-en-loop-3',
    topicId: 'python-loops',
    language: 'en',
    difficulty: 3,
    concept: 'comprehensions',
    question: 'What is the result of `[x * 2 for x in range(4) if x % 2 == 1]`?',
    options: ['[0, 2, 4, 6]', '[2, 6]', '[1, 3]', '[0, 4]'],
    correct: 1,
    explanation: 'Only odd values `1` and `3` pass `x % 2 == 1`, and multiplying by 2 produces `[2, 6]`.',
  },
  {
    id: 'q-en-loop-4',
    topicId: 'python-loops',
    language: 'en',
    difficulty: 4,
    concept: 'generators-iterators',
    question: 'When does the `else` block of a Python `for` loop execute?',
    options: ['When the loop body raises an exception', 'When the loop finishes normally without hitting a `break` statement', 'Only when the iterable is empty', 'Every time after a `break` statement'],
    correct: 1,
    explanation: 'A `for...else` block runs only if the loop completes all iterations without encountering a `break`.',
  },
  {
    id: 'q-en-loop-5',
    topicId: 'python-loops',
    language: 'en',
    difficulty: 5,
    concept: 'generators-iterators',
    question: 'How does a generator expression `(x*x for x in data)` differ in memory usage from a list comprehension `[x*x for x in data]`?',
    options: ['They allocate identical memory', 'The generator yields items lazily one at a time in O(1) auxiliary memory', 'The generator caches all results in a hash table', 'The list comprehension evaluates lazily'],
    correct: 1,
    explanation: 'Generator expressions compute values on demand via the iterator protocol rather+materializing the entire list in memory.',
  },

  // OOP English
  {
    id: 'q-en-oop-1',
    topicId: 'python-oop',
    language: 'en',
    difficulty: 1,
    concept: 'constructors-init',
    question: 'What method is Python’s standard constructor for initializing class instances?',
    options: ['__create__()', '__init__()', '__new__()', '__construct__()'],
    correct: 1,
    explanation: 'The `__init__` dunder method initializes attributes when a new instance is constructed.',
  },
  {
    id: 'q-en-oop-2',
    topicId: 'python-oop',
    language: 'en',
    difficulty: 2,
    concept: 'instance-self',
    question: 'How do you call a parent class method from a subclass in Python 3?',
    options: ['parent.method()', 'super().method()', 'base().method()', 'this.super.method()'],
    correct: 1,
    explanation: '`super()` returns a proxy object that delegates method calls to a parent or sibling class in the MRO.',
  },
  {
    id: 'q-en-oop-3',
    topicId: 'python-oop',
    language: 'en',
    difficulty: 3,
    concept: 'instance-self',
    question: 'What is the role of the `self` parameter in instance methods?',
    options: ['It refers to the base parent class', 'It explicitly references the active instance object', 'It acts as an external global variable', 'It defines a private static constant'],
    correct: 1,
    explanation: '`self` represents the specific instance being operated on by the method.',
  },
  {
    id: 'q-en-oop-4',
    topicId: 'python-oop',
    language: 'en',
    difficulty: 4,
    concept: 'encapsulation',
    question: 'What is the difference between a class attribute and an instance attribute when mutated via `self.items.append(x)`?',
    options: ['Instance attributes cannot be lists', 'Mutating a shared mutable class attribute in-place affects all instances that have not overridden it', 'Python automatically copies class attributes per instance', 'Class attributes are read-only'],
    correct: 1,
    explanation: 'If `items` is defined on the class as a list, all instances share that list reference unless initialized on `self` inside `__init__`.',
  },
  {
    id: 'q-en-oop-5',
    topicId: 'python-oop',
    language: 'en',
    difficulty: 5,
    concept: 'inheritance-mro',
    question: 'What algorithm does Python 3 use for Method Resolution Order (MRO) in multiple inheritance?',
    options: ['Depth-First Search (DFS)', 'C3 Linearization', 'Breadth-First Search (BFS)', 'Dijkstra Priority Algorithm'],
    correct: 1,
    explanation: 'Python uses the C3 Linearization algorithm to enforce monotonic method resolution order.',
  },

  // DBMS SQL English
  {
    id: 'q-en-sql-1',
    topicId: 'dbms-sql',
    language: 'en',
    difficulty: 1,
    concept: 'sql-filtering-aggregation',
    question: 'Which SQL keyword removes duplicate rows from a SELECT query result set?',
    options: ['UNIQUE', 'DISTINCT', 'DEDUP', 'SINGLE'],
    correct: 1,
    explanation: '`SELECT DISTINCT` eliminates duplicate rows from the returned projection.',
  },
  {
    id: 'q-en-sql-2',
    topicId: 'dbms-sql',
    language: 'en',
    difficulty: 2,
    concept: 'sql-filtering-aggregation',
    question: 'Which SQL clause filters rows after an aggregation with GROUP BY?',
    options: ['WHERE', 'HAVING', 'FILTER', 'LIMIT'],
    correct: 1,
    explanation: '`WHERE` filters rows before grouping; `HAVING` filters aggregate group results.',
  },
  {
    id: 'q-en-sql-3',
    topicId: 'dbms-sql',
    language: 'en',
    difficulty: 3,
    concept: 'joins',
    question: 'What does a `LEFT OUTER JOIN` return when there is no matching row in the right table?',
    options: ['The row is excluded completely', 'All left-table columns with NULL values for right-table columns', 'An SQL runtime error', 'Default zero values for right-table columns'],
    correct: 1,
    explanation: '`LEFT JOIN` preserves all rows from the left table and fills unmatched right-table columns with `NULL`.',
  },
  {
    id: 'q-en-sql-4',
    topicId: 'dbms-sql',
    language: 'en',
    difficulty: 4,
    concept: 'indexing-query-plans',
    question: 'Why can applying a function to an indexed column in `WHERE YEAR(created_at) = 2026` hurt query performance?',
    options: ['SQL does not allow functions in WHERE', 'Wrapping the column in a function prevents standard B-tree index range seeks, forcing a full scan', 'It locks the entire database', 'It drops the index automatically'],
    correct: 1,
    explanation: 'Non-sargable predicates like `YEAR(created_at)` prevent standard B-tree index seeks; rewrite as a range predicate `created_at >= ... AND created_at < ...`.',
  },

  // DBMS Normalization English
  {
    id: 'q-en-norm-1',
    topicId: 'dbms-normalization',
    language: 'en',
    difficulty: 1,
    concept: 'normal-forms',
    question: 'What is the core requirement for a relational table to satisfy First Normal Form (1NF)?',
    options: ['Every column must contain atomic (indivisible) values with no repeating groups', 'Every non-key attribute must depend on a foreign key', 'All tables must have at least two indexes', 'No NULL values are allowed anywhere'],
    correct: 0,
    explanation: '1NF requires atomic attribute domains and eliminates repeating groups or multi-valued cells.',
  },
  {
    id: 'q-en-norm-2',
    topicId: 'dbms-normalization',
    language: 'en',
    difficulty: 3,
    concept: 'functional-dependencies',
    question: 'Which type of dependency must be eliminated to move a relation from 2NF to Third Normal Form (3NF)?',
    options: ['Partial dependencies on a composite key', 'Transitive dependencies where a non-key attribute depends on another non-key attribute', 'Foreign key constraints', 'Primary key uniqueness'],
    correct: 1,
    explanation: '2NF removes partial dependencies; 3NF removes transitive dependencies (`Key -> NonKeyA -> NonKeyB`).',
  },
  {
    id: 'q-en-norm-3',
    topicId: 'dbms-normalization',
    language: 'en',
    difficulty: 4,
    concept: 'bcnf-decomposition',
    question: 'In Boyce-Codd Normal Form (BCNF), for every non-trivial functional dependency X -> Y, what must hold true?',
    options: ['Y must be a prime attribute', 'X must be a superkey of the relation', 'X and Y must be in different databases', 'Y must be a foreign key'],
    correct: 1,
    explanation: 'BCNF strengthens 3NF by requiring that the determinant `X` of every non-trivial dependency `X -> Y` is a superkey.',
  },

  // DSA Stacks & Queues English
  {
    id: 'q-en-dsa-1',
    topicId: 'dsa-queues-stacks',
    language: 'en',
    difficulty: 1,
    concept: 'lifo-stack',
    question: 'Which data structure is naturally used by the runtime to manage function call frames and recursion?',
    options: ['FIFO Queue', 'Call Stack (LIFO)', 'Hash Map', 'Binary Search Tree'],
    correct: 1,
    explanation: 'Function calls push frames onto the Call Stack and pop them in Last-In, First-Out (LIFO) order upon return.',
  },
  {
    id: 'q-en-dsa-2',
    topicId: 'dsa-queues-stacks',
    language: 'en',
    difficulty: 2,
    concept: 'fifo-queue',
    question: 'Which ordering principle describes the behavior of a standard Queue?',
    options: ['LIFO (Last In, First Out)', 'FIFO (First In, First Out)', 'Random Access', 'Priority Minimum Heap'],
    correct: 1,
    explanation: 'A queue operates on First In, First Out (FIFO).',
  },
  {
    id: 'q-en-dsa-3',
    topicId: 'dsa-queues-stacks',
    language: 'en',
    difficulty: 3,
    concept: 'deque-complexity',
    question: 'Why is `collections.deque.popleft()` preferred over `list.pop(0)` for implementing a FIFO queue in Python?',
    options: ['`deque.popleft()` runs in O(1) time whereas `list.pop(0)` shifts all remaining elements in O(n) time', '`list.pop(0)` raises a SyntaxError', '`deque` uses less syntax', '`list` cannot store more than 100 items'],
    correct: 0,
    explanation: 'Python lists are contiguous dynamic arrays, so removing index 0 shifts $n-1$ elements ($O(n)$), whereas `deque` is a doubly linked block structure supporting $O(1)$ ends.',
  },
  {
    id: 'q-en-dsa-4',
    topicId: 'dsa-queues-stacks',
    language: 'en',
    difficulty: 4,
    concept: 'lifo-stack',
    question: 'How can you implement a FIFO Queue using two LIFO Stacks with amortized O(1) enqueue and dequeue?',
    options: ['Reverse both stacks on every push', 'Push new items onto an inbox stack, and lazily transfer items to an outbox stack only when the outbox is empty during dequeue', 'Sort the stack after every operation', 'It is impossible to achieve better than O(n) per operation'],
    correct: 1,
    explanation: 'By transferring elements from `inbox` to `outbox` only when `outbox` is empty, each element moves at most twice, giving amortized $O(1)$ time.',
  },

  // DSA Trees & Graphs English
  {
    id: 'q-en-tree-1',
    topicId: 'dsa-trees',
    language: 'en',
    difficulty: 1,
    concept: 'bst-properties',
    question: 'In a Binary Search Tree (BST), what invariant holds for any node N?',
    options: ['All keys in the left subtree are smaller than N, and all keys in the right subtree are greater than N', 'Left and right subtrees must have identical height', 'Every node has exactly two children', 'The root is always the smallest element'],
    correct: 0,
    explanation: 'The BST ordering property requires left subtree keys $< N.key <$ right subtree keys.',
  },
  {
    id: 'q-en-tree-2',
    topicId: 'dsa-trees',
    language: 'en',
    difficulty: 2,
    concept: 'tree-traversal',
    question: 'Which traversal of a Binary Search Tree visits the node keys in sorted ascending order?',
    options: ['Pre-order (Root, Left, Right)', 'In-order (Left, Root, Right)', 'Post-order (Left, Right, Root)', 'Level-order (Breadth-First)'],
    correct: 1,
    explanation: 'In-order traversal visits all smaller left-subtree keys, then the current root, then all larger right-subtree keys.',
  },
  {
    id: 'q-en-tree-3',
    topicId: 'dsa-trees',
    language: 'en',
    difficulty: 3,
    concept: 'graph-search',
    question: 'Which algorithm finds the shortest path in an unweighted graph using a FIFO queue?',
    options: ['Depth-First Search (DFS)', 'Breadth-First Search (BFS)', 'Kruskal Minimum Spanning Tree', 'Topological Sort'],
    correct: 1,
    explanation: 'BFS explores vertices layer by layer in increasing distance from the source, guaranteeing shortest paths in unweighted graphs.',
  },
  {
    id: 'q-en-tree-4',
    topicId: 'dsa-trees',
    language: 'en',
    difficulty: 4,
    concept: 'bst-properties',
    question: 'What is the worst-case time complexity of searching in an unbalanced Binary Search Tree after inserting already-sorted keys?',
    options: ['O(1)', 'O(log n)', 'O(n) because the tree degenerates into a skewed linked list', 'O(n log n)'],
    correct: 2,
    explanation: 'Inserting sorted keys into an unbalanced BST creates a single chain of height $n$, degrading search from $O(\log n)$ to $O(n)$.',
  },

  // --- Spanish Questions (Español) ---
  {
    id: 'q-es-fn-1',
    topicId: 'python-functions',
    language: 'es',
    difficulty: 1,
    question: '¿Qué palabra clave se utiliza para definir una función en Python?',
    options: ['function', 'def', 'func', 'definir'],
    correct: 1,
    explanation: 'La palabra clave `def` se utiliza para declarar una función en Python.',
  },
  {
    id: 'q-es-fn-2',
    topicId: 'python-functions',
    language: 'es',
    difficulty: 2,
    question: '¿Qué error lanza Python si se omite un argumento posicional obligatorio?',
    options: ['SyntaxError', 'TypeError', 'ValueError', 'IndexError'],
    correct: 1,
    explanation: 'Python lanza un TypeError indicando que falta un argumento requerido.',
  },
  {
    id: 'q-es-fn-3',
    topicId: 'python-functions',
    language: 'es',
    difficulty: 3,
    question: '¿Qué estructura crea la sintaxis `*args` dentro de una función?',
    options: ['Un diccionario mutable', 'Una tupla inmutable de argumentos posicionales', 'Una lista enlazada', 'Un conjunto desordenado'],
    correct: 1,
    explanation: '`*args` agrupa los argumentos posicionales adicionales en una tupla inmutable.',
  },
  {
    id: 'q-es-oop-2',
    topicId: 'python-oop',
    language: 'es',
    difficulty: 2,
    question: '¿Cuál es el método constructor que inicializa los atributos de una clase en Python?',
    options: ['__constructor__()', '__init__()', '__start__()', '__main__()'],
    correct: 1,
    explanation: '`__init__()` es el método de inicialización llamado automáticamente al instanciar un objeto.',
  },
  {
    id: 'q-es-dsa-2',
    topicId: 'dsa-queues-stacks',
    language: 'es',
    difficulty: 2,
    question: '¿Qué principio de ordenamiento sigue una Cola (Queue) tradicional?',
    options: ['LIFO (Último en entrar, primero en salir)', 'FIFO (Primero en entrar, primero en salir)', 'Ordenamiento rápido', 'Búsqueda binaria'],
    correct: 1,
    explanation: 'Una cola sigue el principio FIFO: el primer elemento en llegar es el primero en ser procesado.',
  },

  // --- French Questions (Français) ---
  {
    id: 'q-fr-fn-1',
    topicId: 'python-functions',
    language: 'fr',
    difficulty: 1,
    question: 'Quel mot-clé permet de définir une fonction en Python ?',
    options: ['fonction', 'def', 'lambda', 'function'],
    correct: 1,
    explanation: 'Le mot-clé `def` sert à déclarer une fonction en Python.',
  },
  {
    id: 'q-fr-fn-3',
    topicId: 'python-functions',
    language: 'fr',
    difficulty: 3,
    question: 'Que contient la variable `*args` dans une fonction Python ?',
    options: ['Un dictionnaire', 'Un tuple d’arguments positionnels', 'Une liste modifiable', 'Un ensemble unique'],
    correct: 1,
    explanation: '`*args` capture les arguments positionnels supplémentaires sous la forme d’un tuple.',
  },
  {
    id: 'q-fr-dsa-2',
    topicId: 'dsa-queues-stacks',
    language: 'fr',
    difficulty: 2,
    question: 'Quel principe régit le fonctionnement d’une file d’attente (Queue) ?',
    options: ['LIFO (Dernier entré, premier sorti)', 'FIFO (Premier entré, premier sorti)', 'Table de hachage', 'Arbre binaire'],
    correct: 1,
    explanation: 'Une file d’attente suit le principe FIFO : Premier entré, premier sorti.',
  },

  // --- German Questions (Deutsch) ---
  {
    id: 'q-de-fn-1',
    topicId: 'python-functions',
    language: 'de',
    difficulty: 1,
    question: 'Welches Schlüsselwort definiert eine Funktion in Python?',
    options: ['funktion', 'def', 'func', 'method'],
    correct: 1,
    explanation: 'Das Schlüsselwort `def` wird in Python zur Funktionsdefinition verwendet.',
  },
  {
    id: 'q-de-dsa-2',
    topicId: 'dsa-queues-stacks',
    language: 'de',
    difficulty: 2,
    question: 'Nach welchem Prinzip arbeitet eine Standard-Queue (Warteschlange)?',
    options: ['LIFO (Last In, First Out)', 'FIFO (First In, First Out)', 'Zufallsprinzip', 'Prioritätsbaum'],
    correct: 1,
    explanation: 'Eine Queue arbeitet nach dem FIFO-Prinzip: Was zuerst ankommt, wird zuerst verarbeitet.',
  },

  // --- Hindi Questions (हिन्दी) ---
  {
    id: 'q-hi-fn-1',
    topicId: 'python-functions',
    language: 'hi',
    difficulty: 1,
    question: 'पायथन में फ़ंक्शन को परिभाषित करने के लिए किस कीवर्ड का उपयोग किया जाता है?',
    options: ['function', 'def', 'func', 'define'],
    correct: 1,
    explanation: 'पायथन में फ़ंक्शन बनाने के लिए `def` कीवर्ड का उपयोग किया जाता है।',
  },
  {
    id: 'q-hi-fn-2',
    topicId: 'python-functions',
    language: 'hi',
    difficulty: 2,
    question: 'आवश्यक तर्क (argument) न देने पर पायथन कौन सा एरर दिखाता है?',
    options: ['ValueError', 'TypeError', 'SyntaxError', 'KeyError'],
    correct: 1,
    explanation: 'आवश्यक पोजीशनल तर्क न देने पर पायथन `TypeError` उत्पन्न करता है।',
  },
  {
    id: 'q-hi-dsa-2',
    topicId: 'dsa-queues-stacks',
    language: 'hi',
    difficulty: 2,
    question: 'कतार (Queue) डेटा संरचना किस नियम पर कार्य करती है?',
    options: ['LIFO (अंतिम अंदर, पहला बाहर)', 'FIFO (पहला अंदर, पहला बाहर)', 'यादृच्छिक क्रम', 'बाइनरी सर्च'],
    correct: 1,
    explanation: 'कतार (Queue) FIFO (First In, First Out) सिद्धांत पर कार्य करती है।',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Flashcards Multilingual Database
// ─────────────────────────────────────────────────────────────────────────────

export const MULTILINGUAL_FLASHCARDS: FlashcardItem[] = [
  // English
  {
    id: 'fc-en-1',
    topicId: 'python-functions',
    language: 'en',
    front: 'What is a Lambda function in Python?',
    back: 'An anonymous, inline single-expression function defined with the `lambda` keyword (e.g., `lambda x: x * 2`).',
    hint: 'Think of a short, nameless one-liner function.',
    difficulty: 'beginner',
  },
  {
    id: 'fc-en-2',
    topicId: 'python-functions',
    language: 'en',
    front: 'What is the key difference between `*args` and `**kwargs`?',
    back: '`*args` passes variable positional arguments as a tuple, while `**kwargs` passes variable keyword arguments as a dictionary.',
    hint: 'One is for positions (tuple), the other for keywords (dict).',
    difficulty: 'intermediate',
  },
  {
    id: 'fc-en-3',
    topicId: 'python-oop',
    language: 'en',
    front: 'What does Polymorphism mean in Object-Oriented Programming?',
    back: 'The ability of different classes to respond to the same method call with their own specialized implementation.',
    hint: 'Many forms sharing a common interface.',
    difficulty: 'intermediate',
  },
  {
    id: 'fc-en-4',
    topicId: 'dbms-sql',
    language: 'en',
    front: 'What is the ACID guarantee in relational databases?',
    back: 'Atomicity (all or nothing), Consistency (valid state), Isolation (independent transactions), and Durability (permanent persistence).',
    hint: '4 core properties of reliable transactions.',
    difficulty: 'advanced',
  },
  {
    id: 'fc-en-5',
    topicId: 'dsa-queues-stacks',
    language: 'en',
    front: 'What is the primary difference between a Stack and a Queue?',
    back: 'A Stack follows LIFO (Last In, First Out) like a stack of plates. A Queue follows FIFO (First In, First Out) like a ticket line.',
    hint: 'LIFO vs FIFO.',
    difficulty: 'beginner',
  },

  // Spanish
  {
    id: 'fc-es-1',
    topicId: 'python-functions',
    language: 'es',
    front: '¿Qué es una función Lambda en Python?',
    back: 'Una función anónima de una sola línea definida con la palabra clave `lambda` (ejemplo: `lambda x: x * 2`).',
    hint: 'Es una función corta sin nombre.',
    difficulty: 'beginner',
  },
  {
    id: 'fc-es-2',
    topicId: 'python-oop',
    language: 'es',
    front: '¿Qué significa Encapsulamiento en POO?',
    back: 'El empaquetado de datos y métodos que operan sobre ellos, restringiendo el acceso directo a los detalles internos del objeto.',
    hint: 'Ocultar detalles internos y proteger atributos.',
    difficulty: 'intermediate',
  },
  {
    id: 'fc-es-3',
    topicId: 'dsa-queues-stacks',
    language: 'es',
    front: '¿Cuál es la diferencia entre Pila (Stack) y Cola (Queue)?',
    back: 'La Pila es LIFO (último en entrar, primero en salir); la Cola es FIFO (primero en entrar, primero en salir).',
    hint: 'Platos apilados vs fila de personas.',
    difficulty: 'beginner',
  },

  // French
  {
    id: 'fc-fr-1',
    topicId: 'python-functions',
    language: 'fr',
    front: 'Qu’est-ce qu’une fonction Lambda en Python ?',
    back: 'Une fonction anonyme concise définie sur une seule ligne avec le mot-clé `lambda`.',
    hint: 'Fonction sans nom sur une seule ligne.',
    difficulty: 'beginner',
  },

  // German
  {
    id: 'fc-de-1',
    topicId: 'python-functions',
    language: 'de',
    front: 'Was ist eine Lambda-Funktion in Python?',
    back: 'Eine anonyme Einzeiler-Funktion, die mit dem Schlüsselwort `lambda` definiert wird.',
    hint: 'Kurze, namenlose Funktion.',
    difficulty: 'beginner',
  },

  // Hindi
  {
    id: 'fc-hi-1',
    topicId: 'python-functions',
    language: 'hi',
    front: 'पायथन में लैम्ब्डा (Lambda) फ़ंक्शन क्या है?',
    back: 'यह एक अनाम, एकल-अभिव्यक्ति (single-expression) वाला फ़ंक्शन है जिसे `lambda` कीवर्ड से परिभाषित किया जाता है।',
    hint: 'बिना नाम वाला संक्षिप्त फ़ंक्शन।',
    difficulty: 'beginner',
  },
  {
    id: 'fc-hi-2',
    topicId: 'dsa-queues-stacks',
    language: 'hi',
    front: 'स्टैक (Stack) और कतार (Queue) में मुख्य अंतर क्या है?',
    back: 'स्टैक LIFO (अंतिम अंदर, पहला बाहर) नियम का पालन करता है जबकि कतार FIFO (पहला अंदर, पहला बाहर) नियम का पालन करती है।',
    hint: 'बर्तनों का ढेर बनाम टिकट खिड़की की कतार।',
    difficulty: 'beginner',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Quick Recall Summary Items
// ─────────────────────────────────────────────────────────────────────────────

export const MULTILINGUAL_QUICK_RECALL: QuickRecallItem[] = [
  // English
  {
    id: 'qr-en-1',
    topicId: 'python-functions',
    language: 'en',
    title: 'Default Argument Binding',
    category: 'pitfall',
    keyFact: 'Default parameters evaluate once during definition, NOT on invocation.',
    codeSnippet: 'def append_to(val, target=None):\n    if target is None: target = []\n    target.append(val)\n    return target',
    detail: 'Never use mutable defaults like `def f(items=[])`. Use `None` as a sentinel to prevent shared state across calls.',
  },
  {
    id: 'qr-en-2',
    topicId: 'python-functions',
    language: 'en',
    title: 'Positional-Only & Keyword-Only Syntax',
    category: 'syntax',
    keyFact: 'Use `/` for positional-only arguments and `*` for keyword-only arguments.',
    codeSnippet: 'def compute(pos_only, /, standard, *, kw_only):\n    return pos_only + standard + kw_only',
    detail: 'Arguments before `/` cannot be called by name. Arguments after `*` must always be provided with their explicit parameter name.',
  },
  {
    id: 'qr-en-3',
    topicId: 'python-oop',
    language: 'en',
    title: 'Encapsulation with Name Mangling',
    category: 'rule',
    keyFact: 'Prefixing an attribute with two underscores triggers private name mangling.',
    codeSnippet: 'class Vault:\n    def __init__(self):\n        self.__secret = 42\n# Accessible externally as _Vault__secret',
    detail: 'Single underscore `_name` is an internal convention. Double underscore `__name` actively mangles attribute names to avoid accidental override.',
  },
  {
    id: 'qr-en-4',
    topicId: 'dbms-sql',
    language: 'en',
    title: 'JOIN Execution Order & Predicates',
    category: 'rule',
    keyFact: 'WHERE clauses execute after FROM/JOIN tables are assembled.',
    codeSnippet: 'SELECT u.name, o.total\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nWHERE u.active = true;',
    detail: 'Be cautious with LEFT JOINs: filtering right-table columns in the WHERE clause implicitly converts the join into an INNER JOIN.',
  },
  {
    id: 'qr-en-5',
    topicId: 'dsa-queues-stacks',
    language: 'en',
    title: 'Stack vs Queue Time Complexity',
    category: 'definition',
    keyFact: 'Both Stack and Queue offer O(1) amortized insertion and removal.',
    codeSnippet: 'from collections import deque\nq = deque()\nq.append(10)      # O(1) Push\nq.popleft()        # O(1) Pop Queue',
    detail: 'In Python, do not use `list.pop(0)` for a queue because it causes O(n) array memory shifting. Always use `collections.deque`.',
  },

  // Spanish
  {
    id: 'qr-es-1',
    topicId: 'python-functions',
    language: 'es',
    title: 'Argumentos Predeterminados Mutables',
    category: 'pitfall',
    keyFact: 'Los argumentos predeterminados se evalúan al compilar, no en cada llamada.',
    codeSnippet: 'def agregar(elemento, lista=None):\n    if lista is None: lista = []\n    lista.append(elemento)\n    return lista',
    detail: 'Evita listas o diccionarios como valores por defecto; utiliza `None` como centinela seguro para evitar estados compartidos.',
  },
  {
    id: 'qr-es-2',
    topicId: 'dsa-queues-stacks',
    language: 'es',
    title: 'Complejidad Temporal: Pila y Cola',
    category: 'definition',
    keyFact: 'Ambas estructuras permiten inserción y extracción en tiempo O(1).',
    codeSnippet: 'from collections import deque\ncola = deque()\ncola.append(1)   # O(1)\ncola.popleft()   # O(1)',
    detail: 'En Python nunca uses `lista.pop(0)` para una cola ya que tiene costo O(n). Utiliza siempre `collections.deque`.',
  },

  // French
  {
    id: 'qr-fr-1',
    topicId: 'python-functions',
    language: 'fr',
    title: 'Arguments par défaut en Python',
    category: 'pitfall',
    keyFact: 'Les arguments par défaut sont créés une seule fois lors de la définition.',
    codeSnippet: 'def ajouter(val, liste=None):\n    if liste is None: liste = []\n    liste.append(val)\n    return liste',
    detail: 'N’utilisez jamais d’objets modifiables comme valeurs par défaut pour éviter de partager le même état entre plusieurs appels.',
  },

  // German
  {
    id: 'qr-de-1',
    topicId: 'python-functions',
    language: 'de',
    title: 'Standardargumente in Python',
    category: 'pitfall',
    keyFact: 'Standardargumente werden einmalig bei der Funktionsdefinition ausgewertet.',
    codeSnippet: 'def addieren(wert, liste=None):\n    if liste is None: liste = []\n    liste.append(wert)\n    return liste',
    detail: 'Verwende niemals veränderliche Typen als Standardwert; nutze stattdessen `None` als sicheren Platzhalter.',
  },

  // Hindi
  {
    id: 'qr-hi-1',
    topicId: 'python-functions',
    language: 'hi',
    title: 'डिफ़ॉल्ट तर्क और म्युटेबल ऑब्जेक्ट्स',
    category: 'pitfall',
    keyFact: 'डिफ़ॉल्ट तर्क केवल फ़ंक्शन बनते समय एक बार बनाए जाते हैं।',
    codeSnippet: 'def add_item(val, items=None):\n    if items is None: items = []\n    items.append(val)\n    return items',
    detail: 'डिफ़ॉल्ट में कभी भी खाली लिस्ट `[]` न रखें; shared memory से बचने के लिए `None` का उपयोग करें।',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Content Query Helpers with Graceful Fallback
// ─────────────────────────────────────────────────────────────────────────────

export function getQuestionsByTopicAndLanguage(
  topicId: string,
  language: LanguageCode = 'en'
): { questions: AdaptiveQuestionItem[]; isFallback: boolean; activeLang: LanguageCode } {
  const match = MULTILINGUAL_QUESTIONS.filter(
    (q) => (q.topicId === topicId || topicId === 'all') && q.language === language
  );
  if (match.length > 0) {
    return { questions: match, isFallback: false, activeLang: language };
  }
  // Graceful fallback to English
  const englishFallback = MULTILINGUAL_QUESTIONS.filter(
    (q) => (q.topicId === topicId || topicId === 'all') && q.language === 'en'
  );
  return {
    questions: englishFallback,
    isFallback: language !== 'en',
    activeLang: 'en',
  };
}

export function getFlashcardsByTopicAndLanguage(
  topicId: string,
  language: LanguageCode = 'en'
): { flashcards: FlashcardItem[]; isFallback: boolean; activeLang: LanguageCode } {
  const match = MULTILINGUAL_FLASHCARDS.filter(
    (fc) => (fc.topicId === topicId || topicId === 'all') && fc.language === language
  );
  if (match.length > 0) {
    return { flashcards: match, isFallback: false, activeLang: language };
  }
  // Fallback to English
  const fallback = MULTILINGUAL_FLASHCARDS.filter(
    (fc) => (fc.topicId === topicId || topicId === 'all') && fc.language === 'en'
  );
  return {
    flashcards: fallback,
    isFallback: language !== 'en',
    activeLang: 'en',
  };
}

export function getQuickRecallByTopicAndLanguage(
  topicId: string,
  language: LanguageCode = 'en'
): { items: QuickRecallItem[]; isFallback: boolean; activeLang: LanguageCode } {
  const match = MULTILINGUAL_QUICK_RECALL.filter(
    (item) => (item.topicId === topicId || topicId === 'all') && item.language === language
  );
  if (match.length > 0) {
    return { items: match, isFallback: false, activeLang: language };
  }
  const fallback = MULTILINGUAL_QUICK_RECALL.filter(
    (item) => (item.topicId === topicId || topicId === 'all') && item.language === 'en'
  );
  return {
    items: fallback,
    isFallback: language !== 'en',
    activeLang: 'en',
  };
}
