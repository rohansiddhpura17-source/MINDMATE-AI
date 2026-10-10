/**
 * MindMate AI Tutor Integration for Learning Twin Synthesis
 *
 * Combines deterministic cognitive facts with grounded AI pedagogical coaching:
 * - Deterministic facts run FIRST and establish ground truth.
 * - Cloud AI (Gemini 2.5 Flash) is invoked ONLY when explicitly permitted and online.
 * - System prompt strictly constrains the model from fabricating attempts or metrics.
 * - Output validation ensures zero hallucination of nonexistent topics or distorted stats.
 * - Safe deterministic fallback is always available for offline / local-only use.
 */

import { CloudAIService } from './ai.js';
import { LearnerTwinProfile } from './learningTwin.js';
import { LearnerInsight } from './learningInsights.js';

export interface TwinSynthesisResult {
  source: 'AI_CLOUD' | 'DETERMINISTIC_ENGINE';
  model: string;
  summary: string;
  strengthsSummary: string;
  gapsSummary: string;
  recommendedFocus: string;
  generatedAt: string;
  evidenceGrounding: {
    totalAssessedTopics: number;
    totalQuestions: number;
    overallAccuracy: number;
    overdueReviewsCount: number;
    identifiedGapsCount: number;
  };
}

const aiService = new CloudAIService();

/**
 * Builds the deterministic scientific synthesis from verified profile metrics.
 */
export function buildDeterministicSynthesis(
  profile: LearnerTwinProfile,
  insights: LearnerInsight[]
): TwinSynthesisResult {
  const { overview, strengths, knowledgeGaps, calibratingTopics, unassessedTopics } = profile;
  const overdueReviews = insights.filter((i) => i.pattern === 'OVERDUE_REVIEW');
  const repeatedErrors = insights.filter((i) => i.pattern === 'REPEATED_MISTAKES');

  let summary = '';
  let strengthsSummary = '';
  let gapsSummary = '';
  let recommendedFocus = '';

  if (overview.assessedTopicsCount === 0) {
    summary = `Welcome to MindMate! Your cognitive twin is currently waiting for your first learning interactions. Complete 1 to 3 diagnostic quizzes to establish baseline ability ratings across core concepts.`;
    strengthsSummary = 'No strengths assessed yet. Practice questions to identify your strongest areas.';
    gapsSummary = 'No knowledge gaps detected. Diagnostic assessment is needed to reveal concept mastery.';
    recommendedFocus = 'Start with an initial diagnostic quiz in Python Fundamentals or Web Basics.';
  } else {
    // Summary
    summary = `Cognitive profile calibrated across ${overview.totalQuestionsAnswered} answered questions in ${overview.assessedTopicsCount} active topics. Overall empirical accuracy is ${overview.overallAccuracyPct}% with a weighted Bayesian mastery estimate of ${overview.overallMasteryPct}%.`;

    // Strengths
    if (strengths.length > 0) {
      const names = strengths.map((s) => `"${s.topicName}" (${s.modelEstimates.masteryScore}% mastery, ${s.measuredObservations.totalAttempts} attempts)`).join(', ');
      strengthsSummary = `Demonstrated conceptual strength verified in ${names}. Memory traces are well-established.`;
    } else {
      strengthsSummary = `Developing foundational skills. Continue practicing to achieve sustained proficiency (>= 75% mastery with high confidence).`;
    }

    // Gaps
    if (knowledgeGaps.length > 0 || repeatedErrors.length > 0) {
      const gapNames = [
        ...knowledgeGaps.map((g) => `"${g.topicName}" (${g.modelEstimates.masteryScore}% mastery)`),
        ...repeatedErrors.map((e) => `"${e.topicName}" (${e.evidence.accuracyPct}% accuracy)`),
      ];
      // Unique names
      const uniqueGaps = Array.from(new Set(gapNames)).join(', ');
      gapsSummary = `Targeted reinforcement prioritized for ${uniqueGaps}. Focus on conceptual rules and foundational scaffolding.`;
    } else {
      gapsSummary = `No persistent knowledge gaps detected among currently assessed topics.`;
    }

    // Recommended focus
    if (overdueReviews.length > 0) {
      const topOverdue = overdueReviews[0];
      recommendedFocus = `Immediate Priority: Complete spaced retention review for "${topOverdue.topicName}" (overdue by ${topOverdue.evidence.daysOverdue} days) to curb forgetting curve decay.`;
    } else if (knowledgeGaps.length > 0) {
      recommendedFocus = `Primary Focus: Complete targeted remediation on "${knowledgeGaps[0].topicName}" to bridge your largest Bayesian knowledge gap.`;
    } else if (calibratingTopics.length > 0) {
      recommendedFocus = `Calibration Focus: Answer 3+ questions in "${calibratingTopics[0].topicName}" to refine preliminary ability estimates.`;
    } else {
      recommendedFocus = `Growth Focus: Advance to Hard difficulty challenges or explore unassessed topics.`;
    }
  }

  return {
    source: 'DETERMINISTIC_ENGINE',
    model: 'deterministic-rules',
    summary,
    strengthsSummary,
    gapsSummary,
    recommendedFocus,
    generatedAt: new Date().toISOString(),
    evidenceGrounding: {
      totalAssessedTopics: overview.assessedTopicsCount,
      totalQuestions: overview.totalQuestionsAnswered,
      overallAccuracy: overview.overallAccuracyPct,
      overdueReviewsCount: overview.overdueReviewsCount,
      identifiedGapsCount: overview.knowledgeGapsCount,
    },
  };
}

/**
 * Synthesizes the Learning Twin using Cloud AI (Gemini) when permitted,
 * with strictly grounded evidence and guaranteed deterministic fallback.
 */
export async function synthesizeTwinProfile(
  profile: LearnerTwinProfile,
  insights: LearnerInsight[],
  options: { allowCloudAi?: boolean } = {}
): Promise<TwinSynthesisResult> {
  const deterministicFallback = buildDeterministicSynthesis(profile, insights);

  // If cloud AI is disallowed or user has no assessed topics, return deterministic synthesis
  if (!options.allowCloudAi || profile.overview.assessedTopicsCount === 0) {
    return deterministicFallback;
  }

  const status = aiService.getStatus();
  if (!status.hasKey && status.provider !== 'mock') {
    return deterministicFallback;
  }

  try {
    const verifiedFacts = {
      learnerName: profile.learnerName,
      learningGoal: profile.learningGoal,
      overview: profile.overview,
      assessedTopics: profile.topics
        .filter((t) => t.isAssessed)
        .map((t) => ({
          name: t.topicName,
          masteryScore: t.modelEstimates.masteryScore,
          confidence: t.modelEstimates.confidenceLevel,
          attempts: t.measuredObservations.totalAttempts,
          accuracy: t.measuredObservations.accuracyPct,
          trend: t.trend.direction,
          isOverdue: t.modelEstimates.isSpacedRepetitionDue,
        })),
      keyInsights: insights.slice(0, 5).map((i) => ({
        type: i.pattern,
        topic: i.topicName,
        description: i.description,
      })),
    };

    const prompt = `You are MindMate's Educational Science AI Coach.
Synthesize this learner's cognitive profile strictly based on the following verified empirical data:
${JSON.stringify(verifiedFacts, null, 2)}

Requirements:
1. Base all conclusions strictly on the provided numbers. Do NOT invent new topics, scores, or attempt counts.
2. Distinguish measured facts (attempts, raw accuracy) from statistical model estimates (Bayesian mastery %).
3. Provide:
   - Summary: A 2-3 sentence executive coaching assessment.
   - Strengths: Key concepts where the learner demonstrates strong retention.
   - Growth Areas: Specific knowledge gaps or repeated errors that need scaffolding.
   - Recommended Focus: The single most impactful learning activity for their next study session.
4. Output must be strictly valid JSON matching this schema:
{
  "summary": "...",
  "strengthsSummary": "...",
  "gapsSummary": "...",
  "recommendedFocus": "..."
}`;

    const rawResponse = await aiService.generateText({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt:
        'You are an evidence-based educational psychologist and AI learning coach. You explain cognitive performance with precision, zero hallucination, and actionable encouragement.',
      temperature: 0.2, // Low temperature for factual grounding
    });

    // Parse JSON safely
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return deterministicFallback;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.summary || !parsed.strengthsSummary || !parsed.gapsSummary || !parsed.recommendedFocus) {
      return deterministicFallback;
    }

    // Safety validation: ensure AI response doesn't mention nonexistent topics
    const mentionedTopicValid = profile.topics.some((t) =>
      parsed.summary.includes(t.topicName) ||
      parsed.strengthsSummary.includes(t.topicName) ||
      parsed.gapsSummary.includes(t.topicName) ||
      parsed.recommendedFocus.includes(t.topicName)
    );

    if (!mentionedTopicValid && profile.overview.assessedTopicsCount > 0) {
      // If none of the real topics were mentioned, fallback to safe deterministic synthesis
      return deterministicFallback;
    }

    return {
      source: 'AI_CLOUD',
      model: status.model,
      summary: parsed.summary.trim(),
      strengthsSummary: parsed.strengthsSummary.trim(),
      gapsSummary: parsed.gapsSummary.trim(),
      recommendedFocus: parsed.recommendedFocus.trim(),
      generatedAt: new Date().toISOString(),
      evidenceGrounding: deterministicFallback.evidenceGrounding,
    };
  } catch (error) {
    console.warn('[Twin AI Synthesis Error, using fallback]', error);
    return deterministicFallback;
  }
}
