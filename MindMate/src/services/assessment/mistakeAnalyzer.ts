import { MULTILINGUAL_QUESTIONS, resolveTopicMetadata } from '../../data/learningContent';
import { sortAttemptsChronologically } from './masteryEngine';
import type {
  AttemptRecord,
  ExplanationStrategy,
  RecurringMistakePattern,
  TopicMasteryMetrics,
} from './types';

const CONCEPT_LABELS: Record<string, string> = {
  'function-definition': 'function declaration syntax (`def`)',
  'arguments-packing': 'positional & variable argument passing (`*args`, `**kwargs`)',
  'mutable-defaults': 'mutable default parameter binding',
  'closures-scope': 'enclosing closure variables (`nonlocal`)',
  'variable-binding': 'identifier naming and reference assignment',
  'lebg-scope': 'LEGB variable scope resolution',
  'mutability': 'in-place list/object mutation vs rebinding',
  'for-while-loops': 'loop bounds (`range`) and control flow (`break`/`continue`)',
  'comprehensions': 'list comprehension filtering and mapping',
  'generators-iterators': 'lazy generator evaluation and `for...else` semantics',
  'constructors-init': 'instance construction (`__init__`)',
  'instance-self': 'instance binding (`self`) and `super()` delegation',
  'encapsulation': 'class vs instance attributes and name mangling',
  'inheritance-mro': 'multiple inheritance and C3 Method Resolution Order',
  'sql-filtering-aggregation': 'SQL filtering (`WHERE` vs `HAVING`) and `DISTINCT`',
  'joins': 'outer join NULL preservation (`LEFT JOIN`)',
  'indexing-query-plans': 'sargable predicates and B-tree index usage',
  'normal-forms': 'First Normal Form (1NF) atomicity',
  'functional-dependencies': 'partial vs transitive dependencies (2NF/3NF)',
  'bcnf-decomposition': 'Boyce-Codd Normal Form superkey determinants',
  'lifo-stack': 'LIFO stack mechanics and call stack frames',
  'fifo-queue': 'FIFO queue ordering',
  'deque-complexity': 'amortized O(1) `deque` vs O(n) `list.pop(0)`',
  'bst-properties': 'Binary Search Tree ordering invariants and balance',
  'tree-traversal': 'in-order / pre-order / post-order tree traversals',
  'graph-search': 'Breadth-First Search (BFS) shortest-path layers',
};

function inferConceptTag(attempt: AttemptRecord): string | null {
  if (attempt.concept_tag && attempt.concept_tag.trim().length > 0) {
    return attempt.concept_tag.trim();
  }
  const foundQuestion = MULTILINGUAL_QUESTIONS.find((q) => q.id === attempt.question_id);
  if (foundQuestion?.concept) {
    return foundQuestion.concept;
  }
  return null;
}

/**
 * Analyze incorrect attempts across topics and return evidence-based patterns.
 *
 * Rules:
 * - Never claims a confirmed conceptual misconception from a single incorrect answer.
 * - Groups wrong answers by canonical topic and concept tag / question ID / distractor.
 * - Detects prerequisite difficulty when a topic has errors and its curriculum prerequisite
 *   also has low mastery (< 60%) or repeated errors.
 * - Falls back to transparent, count-based evidence statements when concept metadata is absent
 *   or when only a single error occurred.
 */
export function analyzeRecurringMistakes(
  attempts: AttemptRecord[],
  topicMetrics?: TopicMasteryMetrics[]
): RecurringMistakePattern[] {
  const chronological = sortAttemptsChronologically(attempts);
  const wrongAttempts = chronological.filter((a) => !a.is_correct);
  if (wrongAttempts.length === 0) {
    return [];
  }

  const metricsByTopic = new Map<string, TopicMasteryMetrics>();
  if (topicMetrics) {
    for (const m of topicMetrics) {
      metricsByTopic.set(m.topicId, m);
    }
  }

  // Group incorrect attempts by canonical topic ID
  const wrongByTopic = new Map<string, AttemptRecord[]>();
  for (const att of wrongAttempts) {
    const topicMeta = resolveTopicMetadata(att.topic_id || att.topic_name);
    const list = wrongByTopic.get(topicMeta.id) || [];
    list.push(att);
    wrongByTopic.set(topicMeta.id, list);
  }

  const patterns: RecurringMistakePattern[] = [];

  wrongByTopic.forEach((topicWrongs, topicId) => {
    const topicMeta = resolveTopicMetadata(topicId);
    const unresolvedInTopic = topicWrongs.filter((a) => !a.resolved).length;
    const latestTimestamp =
      topicWrongs[topicWrongs.length - 1]?.attempted_at || new Date(0).toISOString();

    // 1. Check for prerequisite difficulty if learner has >= 2 misses in this topic
    //    and a curriculum prerequisite has low mastery (< 60%) with at least 1 attempt
    if (topicWrongs.length >= 2 && topicMeta.prerequisites && topicMeta.prerequisites.length > 0) {
      for (const prereqId of topicMeta.prerequisites) {
        const prereqMetric = metricsByTopic.get(prereqId);
        if (
          prereqMetric &&
          prereqMetric.totalAttempts > 0 &&
          prereqMetric.masteryScore < 60
        ) {
          const prereqMeta = resolveTopicMetadata(prereqId);
          patterns.push({
            id: `pattern-prereq-${topicId}-${prereqId}`,
            topicId,
            topicName: topicMeta.name,
            conceptTag: null,
            patternType: 'prerequisite_difficulty',
            isConfirmedPattern: true,
            occurrences: topicWrongs.length,
            unresolvedCount: unresolvedInTopic,
            questionIds: Array.from(new Set(topicWrongs.map((a) => a.question_id))),
            summary: `Continued difficulty in ${topicMeta.name} linked to prerequisite ${prereqMeta.name}`,
            evidenceDetail: `You missed ${topicWrongs.length} questions in ${topicMeta.name} while prerequisite ${prereqMeta.name} is at ${prereqMetric.masteryScore}% mastery (${prereqMetric.correctAnswers}/${prereqMetric.totalAttempts} correct).`,
            suggestedStrategy: 'prerequisite-review',
            lastOccurredAt: latestTimestamp,
          });
        }
      }
    }

    // 2. Group by identifiable concept tag where supported
    const byConcept = new Map<string, AttemptRecord[]>();
    const withoutConcept: AttemptRecord[] = [];

    for (const att of topicWrongs) {
      const concept = inferConceptTag(att);
      if (concept) {
        const list = byConcept.get(concept) || [];
        list.push(att);
        byConcept.set(concept, list);
      } else {
        withoutConcept.push(att);
      }
    }

    let emittedConfirmedPatternForTopic = false;

    byConcept.forEach((conceptAttempts, conceptTag) => {
      if (conceptAttempts.length >= 2) {
        emittedConfirmedPatternForTopic = true;
        const readableConcept = CONCEPT_LABELS[conceptTag] || conceptTag;
        const unresolved = conceptAttempts.filter((a) => !a.resolved).length;
        const lastAt =
          conceptAttempts[conceptAttempts.length - 1]?.attempted_at || latestTimestamp;

        // Check if learner repeatedly picked the exact same wrong distractor on the same question
        const distractorCounts = new Map<string, number>();
        for (const cAtt of conceptAttempts) {
          const key = `${cAtt.question_id}:${cAtt.selected_option}`;
          distractorCounts.set(key, (distractorCounts.get(key) || 0) + 1);
        }
        let repeatedDistractor = false;
        distractorCounts.forEach((cnt) => {
          if (cnt >= 2) repeatedDistractor = true;
        });

        patterns.push({
          id: `pattern-concept-${topicId}-${conceptTag}`,
          topicId,
          topicName: topicMeta.name,
          conceptTag,
          patternType: repeatedDistractor
            ? 'repeated_distractor'
            : 'repeated_concept_error',
          isConfirmedPattern: true,
          occurrences: conceptAttempts.length,
          unresolvedCount: unresolved,
          questionIds: Array.from(new Set(conceptAttempts.map((a) => a.question_id))),
          summary: repeatedDistractor
            ? `Repeated distractor selection on ${readableConcept}`
            : `Recurring errors in ${readableConcept} (${conceptAttempts.length} misses)`,
          evidenceDetail: `You have missed ${conceptAttempts.length} questions involving ${readableConcept} in ${topicMeta.name}.`,
          suggestedStrategy:
            conceptAttempts.length >= 3 ? 'simple-analogy' : 'worked-example',
          lastOccurredAt: lastAt,
        });
      }
    });

    // 3. Check for repeated misses on the same question ID when concept tag wasn't present
    const byQuestionId = new Map<string, AttemptRecord[]>();
    for (const att of withoutConcept) {
      const list = byQuestionId.get(att.question_id) || [];
      list.push(att);
      byQuestionId.set(att.question_id, list);
    }

    byQuestionId.forEach((qAttempts, questionId) => {
      if (qAttempts.length >= 2) {
        emittedConfirmedPatternForTopic = true;
        const unresolved = qAttempts.filter((a) => !a.resolved).length;
        const lastAt =
          qAttempts[qAttempts.length - 1]?.attempted_at || latestTimestamp;
        patterns.push({
          id: `pattern-question-${topicId}-${questionId}`,
          topicId,
          topicName: topicMeta.name,
          conceptTag: null,
          patternType: 'repeated_question_error',
          isConfirmedPattern: true,
          occurrences: qAttempts.length,
          unresolvedCount: unresolved,
          questionIds: [questionId],
          summary: `Repeated incorrect response on the same question in ${topicMeta.name}`,
          evidenceDetail: `You have missed "${qAttempts[0].question_text.slice(0, 80)}" ${qAttempts.length} times in ${topicMeta.name}.`,
          suggestedStrategy: 'step-by-step',
          lastOccurredAt: lastAt,
        });
      }
    });

    // 4. Fallback evidence-based summary when errors exist in the topic but do not form
    //    a confirmed multi-attempt concept pattern (e.g., 1 error, or scattered errors without concept metadata).
    if (!emittedConfirmedPatternForTopic) {
      const missCount = topicWrongs.length;
      const singleQuestion = missCount === 1;
      patterns.push({
        id: `pattern-summary-${topicId}`,
        topicId,
        topicName: topicMeta.name,
        conceptTag: inferConceptTag(topicWrongs[0]),
        patternType: 'topic_error_summary',
        isConfirmedPattern: missCount >= 2,
        occurrences: missCount,
        unresolvedCount: unresolvedInTopic,
        questionIds: Array.from(new Set(topicWrongs.map((a) => a.question_id))),
        summary: singleQuestion
          ? `You have missed 1 question in ${topicMeta.name} (insufficient evidence for a recurring pattern)`
          : `You have missed ${missCount} questions in ${topicMeta.name}`,
        evidenceDetail: singleQuestion
          ? `1 incorrect attempt recorded in ${topicMeta.name}. More attempts are needed before diagnosing a recurring misconception.`
          : `You have missed ${missCount} questions across ${topicMeta.name} (${unresolvedInTopic} still unresolved).`,
        suggestedStrategy: missCount >= 2 ? 'worked-example' : 'step-by-step',
        lastOccurredAt: latestTimestamp,
      });
    }
  });

  // Sort by confirmed patterns first, then by occurrences desc, then by recency desc
  return patterns.sort((a, b) => {
    if (a.isConfirmedPattern !== b.isConfirmedPattern) {
      return a.isConfirmedPattern ? -1 : 1;
    }
    if (b.occurrences !== a.occurrences) {
      return b.occurrences - a.occurrences;
    }
    return (Date.parse(b.lastOccurredAt) || 0) - (Date.parse(a.lastOccurredAt) || 0);
  });
}
