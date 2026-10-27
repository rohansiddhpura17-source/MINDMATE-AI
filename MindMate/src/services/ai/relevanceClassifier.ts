/**
 * MindMate — Educational Topic Relevance & Intent Classifier
 *
 * Lightweight, deterministic, testable classification of learner inquiries:
 * - Distinguishes 10 specific user intents: person biography, general knowledge,
 *   places/events, programming & technical, educational tutoring, visual requests,
 *   explicit image generation, action intents, conversational follow-ups, and ambiguity.
 * - Identifies direct topic relevance and curriculum synonyms without forcing redirects.
 * - Detects broader computer science, data science (e.g. Pandas), and programming concepts.
 * - Resolves conversational pronouns ("he", "she", "what else did he do?") using preceding context.
 * - Never modifies learner mastery or assessment analytics.
 */

import {
  SUBJECTS,
  TOPICS,
  resolveTopicMetadata,
  type TopicItem,
  type SubjectItem,
} from '../../data/learningContent';
import { isPersonOrBiographicalQuery, extractEntityName } from '../visual/imageSearchService';
import { isImageGenerationRequest } from '../visual/imageGenerationService';

export type RelevanceCategory =
  | 'relevant_topic'
  | 'relevant_subject'
  | 'subject_switch_intent'
  | 'off_topic_factual'
  | 'ambiguous_or_uncertain';

export type UserIntent =
  | 'person_biography'
  | 'general_knowledge'
  | 'place_or_event'
  | 'programming_technical'
  | 'educational_tutoring'
  | 'visual_request'
  | 'image_generation_request'
  | 'action_intent'
  | 'conversational_followup'
  | 'ambiguous';

export interface TopicRelevanceResult {
  category: RelevanceCategory;
  intent: UserIntent;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  activeTopic: TopicItem;
  targetTopic?: TopicItem;
  topicReminder?: string;
  clarificationPrompt?: string;
  factualEntityHint?: {
    entity: string;
    fact: string;
    pitfallAvoidance: string;
  };
}

// Subtopic suggestions used for gentle, friendly topic reminders when relevant
const TOPIC_SUGGESTION_MAP: Record<string, string> = {
  'python-variables': 'variable assignment, scope rules (LEGB), or mutability',
  'python-loops': 'for loops, while loops, or list comprehensions',
  'python-functions': 'parameters, return values, or lambda functions',
  'python-oop': 'classes, constructors (__init__), or inheritance and MRO',
  'dbms-sql': 'SELECT queries, JOIN operations, or aggregate GROUP BY clauses',
  'dbms-normalization': '1NF, 2NF, 3NF, or functional dependency decomposition',
  'dsa-queues-stacks': 'LIFO stack operations, FIFO queues, or deque complexity',
  'dsa-trees': 'binary search trees, inorder/preorder traversals, or graph edges',
};

// Rich synonym dictionary for curriculum topics
const TOPIC_SYNONYMS: Record<string, string[]> = {
  'python-variables': [
    'variable', 'variables', 'scope', 'global', 'local', 'nonlocal', 'binding',
    'mutability', 'immutable', 'mutable', 'legb', 'reassignment', 'constant',
    'type annotation', 'primitive', 'reference', 'identifier', 'shadowing',
  ],
  'python-loops': [
    'loop', 'loops', 'for', 'while', 'iteration', 'iterable', 'iterator',
    'comprehension', 'generator', 'yield', 'range', 'enumerate', 'zip',
    'break', 'continue', 'infinite loop', 'nested loop',
  ],
  'python-functions': [
    'function', 'functions', 'def', 'return', 'returns', 'returning', 'parameter',
    'parameters', 'argument', 'arguments', 'arg', 'args', 'kwargs', 'lambda',
    'closure', 'closures', 'higher-order', 'recursion', 'recursive', 'docstring',
    'signature', 'default argument', 'mutable default', 'call', 'caller',
    'base case', 'base cases',
  ],
  'python-oop': [
    'class', 'classes', 'object', 'objects', 'instance', 'instances', 'method',
    'methods', 'inheritance', 'inherit', 'polymorphism', 'encapsulation',
    'constructor', '__init__', 'init', 'self', 'super', 'mro', 'dunder',
    'magic method', 'property', 'getter', 'setter', 'subclass', 'superclass',
  ],
  'dbms-sql': [
    'sql', 'database', 'databases', 'table', 'tables', 'select', 'insert', 'update',
    'delete', 'join', 'joins', 'inner join', 'left join', 'outer join',
    'group by', 'order by', 'having', 'aggregate', 'count', 'sum', 'avg',
    'primary key', 'foreign key', 'index', 'indexing', 'query', 'queries',
    'rdbms', 'relational', 'schema', 'where clause',
  ],
  'dbms-normalization': [
    'normalization', 'normal form', 'normal forms', '1nf', '2nf', '3nf', 'bcnf',
    '4nf', '5nf', 'functional dependency', 'dependencies', 'decomposition',
    'lossless', 'dependency preserving', 'redundancy', 'insertion anomaly',
    'update anomaly', 'deletion anomaly', 'candidate key',
  ],
  'dsa-queues-stacks': [
    'stack', 'stacks', 'queue', 'queues', 'lifo', 'fifo', 'push', 'pop', 'peek',
    'enqueue', 'dequeue', 'deque', 'circular queue', 'priority queue', 'double ended',
  ],
  'dsa-trees': [
    'tree', 'trees', 'binary tree', 'bst', 'node', 'nodes', 'root', 'leaf',
    'traversal', 'inorder', 'preorder', 'postorder', 'depth', 'height', 'graph',
    'graphs', 'dfs', 'bfs', 'vertex', 'vertices', 'edge', 'edges', 'dag',
  ],
};

// General Computer Science, Data Science, and Programming terms
const GENERAL_CS_TERMS = new Set([
  'algorithm', 'algorithms', 'code', 'coding', 'program', 'programming',
  'developer', 'software', 'bug', 'debugging', 'syntax', 'compile', 'compiler',
  'interpreter', 'runtime', 'memory', 'cpu', 'byte', 'binary', 'bit', 'boolean',
  'string', 'integer', 'float', 'array', 'list', 'dictionary', 'dict', 'tuple',
  'hash map', 'hash table', 'time complexity', 'space complexity', 'big o',
  'data structure', 'exception', 'try catch', 'null', 'undefined', 'none',
  'terminal', 'shell', 'git', 'github', 'ide', 'vs code', 'unit test',
  // Data Science and Python ecosystem
  'pandas', 'dataframe', 'dataframes', 'series', 'numpy', 'matplotlib',
  'seaborn', 'scipy', 'sklearn', 'pytorch', 'tensorflow', 'csv', 'parquet',
  'vectorization', 'indexing', 'loc', 'iloc', 'groupby', 'merge',
]);

// Subject switch regex patterns
const SUBJECT_SWITCH_PATTERNS = [
  /^(?:can\s+we\s+)?(?:switch|change|move|jump)\s+(?:over\s+)?to\s+(?:the\s+)?([a-z0-9\s&()_-]+)/i,
  /^(?:can\s+we\s+)?(?:teach|learn|study|explain|talk\s+about|cover)\s+([a-z0-9\s&()_-]+)\s+(?:instead|now)/i,
  /^(?:can\s+we|let'?s|lets|i\s+want\s+to|i'd\s+like\s+to)\s+(?:study|learn|switch\s+to|cover|practice)\s+([a-z0-9\s&()_-]+)/i,
  /^(?:start|begin)\s+(?:learning\s+)?([a-z0-9\s&()_-]+)/i,
];

// Ambiguous query patterns (lacking context or a clear subject)
const AMBIGUOUS_PATTERNS = [
  /^(?:what|how|why|where|who)\s+is\s+(?:it|this|that)\??$/i,
  /^(?:what|how|why)\s+does\s+(?:that|it|this)\s+work\??$/i,
  /^(?:what\s+about\s+the\s+other\s+one|what\s+happened|why\??|how\??)$/i,
  /^(?:the\s+thing|that\s+one|do\s+it|it|this|that)$/i,
];

// Conversational follow-up patterns
const CONVERSATIONAL_FOLLOWUP_PATTERNS = [
  /^(?:tell\s+me\s+more|explain\s+more|more\s+info|continue|go\s+on)\??$/i,
  /^(?:what\s+else\s+did\s+(?:he|she|they)\s+(?:do|discover|invent|write))\??$/i,
  /^(?:who\s+was\s+(?:he|she))\??$/i,
  /^(?:what\s+about\s+(?:his|her|their)\s+[a-z\s]+)\??$/i,
  /^(?:show\s+it\s+visually|make\s+it\s+visual|can\s+you\s+visualize\s+this)\??$/i,
  /^(?:give\s+another\s+example|another\s+one|why\s+is\s+that)\??$/i,
];

// Action intent patterns
const ACTION_PATTERNS = [
  /^(?:create|make|generate|build|prepare|schedule)\s+(?:a|an|\d+[-\s]day)?\s*(?:study\s+plan|planner\s+task|schedule|calendar)/i,
  /^(?:open|show|go\s+to|navigate\s+to|view)\s+(?:my\s+)?(?:planner|progress|insights|learning\s+twin|twin|materials|settings|classes|zoom)/i,
  /^(?:start|launch|take|begin)\s+(?:a\s+)?(?:quiz|test|assessment|practice)/i,
  /^(?:open|turn\s+on|start|launch)\s+voice\s*(?:mode|assistant)?/i,
];

// Visual request patterns
const VISUAL_REQUEST_PATTERNS = [
  /^(?:show\s+visually|visualize|diagram|make\s+it\s+visual)/i,
  /^(?:show\s+me\s+a\s+)?(?:diagram|flowchart|architecture|mind\s*map|visual\s+representation)\s+(?:of|for)/i,
  /^(?:what\s+does\s+(?:this|that|it|a\s+[a-z\s]+)\s+look\s+like)/i,
];

// Known geographical or monumental entities
const PLACE_PATTERNS = [
  /\b(?:eiffel\s+tower|statue\s+of\s+liberty|pyramids|taj\s+mahal|great\s+wall|colosseum|silicon\s+valley|grand\s+canyon)\b/i,
];

// Factual entities with verified ground-truth knowledge to prevent local LLM hallucinations
const KNOWN_FACTUAL_ENTITIES: Record<string, { fact: string; pitfallAvoidance: string }> = {
  'f1': {
    fact: 'Formula One (F1) cars are high-performance, single-seat, open-cockpit racing vehicles engineered for the FIA Formula One World Championship with advanced aerodynamics, turbocharged hybrid power units, and immense downforce.',
    pitfallAvoidance: 'Formula One is a racing discipline and championship; F1 cars are Formula One racing cars and vehicles, NOT a race circuit in Australia (Albert Park in Melbourne is one specific track, but not what F1 cars are).',
  },
  'formula 1': {
    fact: 'Formula One (F1) cars are the fastest regulated road-course racing cars in the world, featuring wings for extreme aerodynamic downforce and hybrid V6 turbo power units.',
    pitfallAvoidance: 'Distinguish the car/vehicles from racing tracks or circuits.',
  },
  'formula one': {
    fact: 'Formula One cars are purpose-built open-wheel racing machines built by constructors like Ferrari, Mercedes, McLaren, and Red Bull to compete in Grand Prix races worldwide.',
    pitfallAvoidance: 'Do not confuse with a racing circuit.',
  },
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects the specific user intent from inquiry and optional previous conversational turn
 */
export function detectUserIntent(
  query: string,
  context?: { previousTurn?: { question: string; answer: string; subject: string } }
): UserIntent {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  // 1. Explicit image generation
  if (isImageGenerationRequest(trimmed)) {
    return 'image_generation_request';
  }

  // 2. Action engine operations
  if (ACTION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'action_intent';
  }

  // 3. Visual requests
  if (VISUAL_REQUEST_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'visual_request';
  }

  // 4. Conversational follow-ups
  if (CONVERSATIONAL_FOLLOWUP_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'conversational_followup';
  }

  // 5. People and biographical inquiries
  if (isPersonOrBiographicalQuery(trimmed)) {
    return 'person_biography';
  }

  // 6. Places and monuments
  if (PLACE_PATTERNS.some((pattern) => pattern.test(lower))) {
    return 'place_or_event';
  }

  // 7. Programming and Technical inquiries (e.g. Pandas, CPU, Functions, OOP, Git)
  const normWords = normalizeText(trimmed).split(/\s+/);
  if (
    normWords.some((w) => GENERAL_CS_TERMS.has(w)) ||
    Object.values(TOPIC_SYNONYMS).some((syns) => syns.some((syn) => lower.includes(syn))) ||
    lower.includes('cpu') ||
    lower.includes('stack') ||
    lower.includes('queue') ||
    lower.includes('binary search') ||
    lower.includes('pandas') ||
    lower.includes('series') ||
    lower.includes('dataframe')
  ) {
    return 'programming_technical';
  }

  // 8. Ambiguous patterns
  if (AMBIGUOUS_PATTERNS.some((p) => p.test(trimmed)) || (normWords.length <= 2 && !isPersonOrBiographicalQuery(trimmed))) {
    return 'ambiguous';
  }

  // 9. General knowledge
  return 'general_knowledge';
}

/**
 * Deterministically classify the relevance of a user prompt against the learner's active context.
 */
export function classifyTopicRelevance(
  query: string,
  activeTopicIdOrName: string = 'python-functions',
  currentSubjectId?: string,
  context?: { previousTurn?: { question: string; answer: string; subject: string } }
): TopicRelevanceResult {
  const activeTopic = resolveTopicMetadata(activeTopicIdOrName);
  const normalizedQuery = normalizeText(query);
  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  const intent = detectUserIntent(query, context);

  const topicSuggestions =
    TOPIC_SUGGESTION_MAP[activeTopic.id] ||
    `${activeTopic.name} concepts and practice problems`;
  const defaultTopicReminder = `I'm currently helping you study ${activeTopic.name}. Would you like to continue with ${topicSuggestions}?`;

  // 1. Check for explicit subject / topic switch intent
  for (const pattern of SUBJECT_SWITCH_PATTERNS) {
    const match = normalizedQuery.match(pattern);
    if (match && match[1]) {
      const candidateTarget = match[1].trim();
      const cleanedTarget = candidateTarget
        .replace(/\s+(?:now|please|next|instead|today|topic|subject)$/i, '')
        .trim();

      const targetsToTry = [cleanedTarget, candidateTarget].filter(Boolean);

      let matchedTopic: TopicItem | undefined;
      let matchedSubject: SubjectItem | undefined;

      for (const target of targetsToTry) {
        if (!matchedTopic) {
          matchedTopic = TOPICS.find(
            (t) =>
              normalizeText(t.name) === target ||
              t.id === target ||
              normalizeText(t.name).includes(target) ||
              target.includes(normalizeText(t.name))
          );
        }
        if (!matchedSubject) {
          matchedSubject = SUBJECTS.find(
            (s) =>
              normalizeText(s.name) === target ||
              s.id === target ||
              normalizeText(s.name).includes(target) ||
              target.includes(normalizeText(s.name))
          );
        }
      }

      if (matchedTopic) {
        return {
          category: 'subject_switch_intent',
          intent: 'action_intent',
          reason: `Learner explicitly requested to switch topic to "${matchedTopic.name}".`,
          confidence: 'high',
          activeTopic,
          targetTopic: matchedTopic,
        };
      }

      if (matchedSubject) {
        const firstSubjectTopic = TOPICS.find((t) => t.subjectId === matchedSubject.id) || activeTopic;
        return {
          category: 'subject_switch_intent',
          intent: 'action_intent',
          reason: `Learner explicitly requested to switch subject to "${matchedSubject.name}".`,
          confidence: 'high',
          activeTopic,
          targetTopic: firstSubjectTopic,
        };
      }
    }
  }

  // 2. Check for Ambiguous / Incomplete query
  if (words.length <= 3 && intent === 'ambiguous') {
    for (const ambigPattern of AMBIGUOUS_PATTERNS) {
      if (ambigPattern.test(query.trim())) {
        return {
          category: 'ambiguous_or_uncertain',
          intent: 'ambiguous',
          reason: 'Query is underspecified or ambiguous without clear subject context.',
          confidence: 'high',
          activeTopic,
          clarificationPrompt: `Could you clarify what specific concept or code you are asking about? If you want to continue with ${activeTopic.name}, we can explore ${topicSuggestions}.`,
        };
      }
    }
  }

  // 3. Direct Relevance to Current Active Topic
  const activeSynonyms = TOPIC_SYNONYMS[activeTopic.id] || [];
  const activeTopicWords = normalizeText(activeTopic.name).split(/\s+/);
  const activeConceptTags = activeTopic.conceptTags || [];

  const matchesActiveTopicDirectly =
    words.some((w) => activeSynonyms.includes(w)) ||
    activeSynonyms.some((syn) => normalizedQuery.includes(syn)) ||
    activeTopicWords.some((tw) => tw.length > 3 && words.includes(tw)) ||
    activeConceptTags.some((tag) => normalizedQuery.includes(tag.replace(/-/g, ' ')));

  if (matchesActiveTopicDirectly) {
    return {
      category: 'relevant_topic',
      intent: 'educational_tutoring',
      reason: `Query directly matches active topic "${activeTopic.name}" or its core concepts/synonyms.`,
      confidence: 'high',
      activeTopic,
    };
  }

  // 4. Check for People and Biographical Queries (e.g. Max Planck, Albert Einstein, Marie Curie)
  if (intent === 'person_biography' || isPersonOrBiographicalQuery(query)) {
    const personName = extractEntityName(query);
    return {
      category: 'off_topic_factual',
      intent: 'person_biography',
      reason: `Biographical inquiry about "${personName}".`,
      confidence: 'high',
      activeTopic,
      topicReminder: defaultTopicReminder,
    };
  }

  // 5. Special check for Python Pandas: Data analysis library, NOT to be redirected to OOP
  if (normalizedQuery.includes('pandas') || (normalizedQuery.includes('series') && normalizedQuery.includes('dataframe'))) {
    return {
      category: 'relevant_subject',
      intent: 'programming_technical',
      reason: 'Query is about the Python Pandas data analysis library and its core data structures.',
      confidence: 'high',
      activeTopic,
    };
  }

  // 6. Relevance to Other Topics in Curriculum or General CS / Programming
  let matchedOtherTopic: TopicItem | undefined;
  for (const [topicId, syns] of Object.entries(TOPIC_SYNONYMS)) {
    if (topicId === activeTopic.id) continue;
    if (syns.some((syn) => normalizedQuery.includes(syn))) {
      matchedOtherTopic = TOPICS.find((t) => t.id === topicId);
      break;
    }
  }

  const isGeneralCS = words.some((w) => GENERAL_CS_TERMS.has(w));

  if (matchedOtherTopic || isGeneralCS) {
    return {
      category: 'relevant_subject',
      intent: 'programming_technical',
      reason: matchedOtherTopic
        ? `Query relates to curriculum topic "${matchedOtherTopic.name}".`
        : 'Query relates to general computer science and programming concepts.',
      confidence: 'medium',
      activeTopic,
      targetTopic: matchedOtherTopic,
      topicReminder: defaultTopicReminder,
    };
  }

  // 7. Check for Known Off-Topic Factual Entities (e.g., F1 cars, Formula One, etc.)
  for (const [entityKey, data] of Object.entries(KNOWN_FACTUAL_ENTITIES)) {
    if (normalizedQuery.includes(entityKey)) {
      return {
        category: 'off_topic_factual',
        intent: 'general_knowledge',
        reason: `Query is about factual entity "${entityKey}", which is off-topic from current study curriculum.`,
        confidence: 'high',
        activeTopic,
        topicReminder: defaultTopicReminder,
        factualEntityHint: {
          entity: entityKey,
          fact: data.fact,
          pitfallAvoidance: data.pitfallAvoidance,
        },
      };
    }
  }

  // 8. Generic Question Classification (General Knowledge / Off-Topic Factual)
  const isQuestionLike =
    /^(?:what|who|when|where|why|how|define|explain|tell\s+me\s+about|can\s+you\s+explain)\b/i.test(
      query.trim()
    );

  if (isQuestionLike) {
    return {
      category: 'off_topic_factual',
      intent: 'general_knowledge',
      reason: 'General knowledge question outside active computer science curriculum.',
      confidence: 'medium',
      activeTopic,
      topicReminder: defaultTopicReminder,
    };
  }

  // 9. Fallback: If not clearly off-topic question and not matched, treat as ambiguous
  if (words.length <= 4) {
    return {
      category: 'ambiguous_or_uncertain',
      intent: 'ambiguous',
      reason: 'Short query without recognizable curriculum or general knowledge keywords.',
      confidence: 'low',
      activeTopic,
      clarificationPrompt: `I am not sure what you mean by "${query.trim()}". Could you provide more details? I am currently ready to help you with ${activeTopic.name}.`,
    };
  }

  // Default to off-topic factual
  return {
    category: 'off_topic_factual',
    intent: 'general_knowledge',
    reason: 'Unrelated query to active computer science curriculum.',
    confidence: 'low',
    activeTopic,
    topicReminder: defaultTopicReminder,
  };
}
