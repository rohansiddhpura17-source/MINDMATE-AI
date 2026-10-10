import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../src/server.js';
import { prisma } from '../src/db.js';
import {
  calculateBetaMastery,
  classifyConfidence,
  evaluateDifficultyTransition,
  evaluateAnswerMastery,
} from '../src/services/masteryModel.js';
import {
  selectNextAdaptiveQuestion,
  processAdaptiveAnswer,
  selectNonAdaptiveQuestion,
  seedQuestionsIfEmpty,
} from '../src/services/adaptiveEngine.js';

let server: http.Server;
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  await prisma.user.deleteMany({
    where: {
      email: { in: ['adaptive.alice@mindmate.app', 'adaptive.bob@mindmate.app'] },
    },
  });

  await seedQuestionsIfEmpty();
});

after(async () => {
  await prisma.user.deleteMany({
    where: {
      email: { in: ['adaptive.alice@mindmate.app', 'adaptive.bob@mindmate.app'] },
    },
  });
  await prisma.$disconnect();
  server.close();
});

describe('MindMate Milestone 5: Adaptive Learning Engine Test Suite', () => {
  let aliceCookie = '';
  let aliceId = '';

  test('1. Mathematical Mastery Formulation: Beta-Binomial update avoids violent swings', () => {
    // n = 0 (Uninformative prior mean)
    assert.equal(calculateBetaMastery(0, 0), 50);

    // Single correct answer should NOT jump to 100%
    const oneCorrect = calculateBetaMastery(1, 1);
    assert.equal(oneCorrect, 60, '1 correct out of 1 attempt must equal 60% with Beta(2,2) prior');

    // Single incorrect answer should NOT drop to 0%
    const oneIncorrect = calculateBetaMastery(0, 1);
    assert.equal(oneIncorrect, 40, '0 correct out of 1 attempt must equal 40% with Beta(2,2) prior');

    // 5 straight correct answers climbs smoothly
    assert.equal(calculateBetaMastery(5, 5), 78);

    // 5 straight incorrect answers drops smoothly
    assert.equal(calculateBetaMastery(0, 5), 22);

    // 10 attempts: 9 correct
    assert.equal(calculateBetaMastery(9, 10), 79);
  });

  test('2. Confidence Classification: Distinguishes insufficient evidence from demonstrated mastery', () => {
    const zero = classifyConfidence(0);
    assert.equal(zero.level, 'INSUFFICIENT_EVIDENCE');
    assert.ok(zero.description.includes('Insufficient evidence'));

    const two = classifyConfidence(2);
    assert.equal(two.level, 'INSUFFICIENT_EVIDENCE');

    const four = classifyConfidence(4);
    assert.equal(four.level, 'LOW');

    const eight = classifyConfidence(8);
    assert.equal(eight.level, 'MEDIUM');

    const sixteen = classifyConfidence(16);
    assert.equal(sixteen.level, 'HIGH');
  });

  test('3. Difficulty Transition Logic: Step up on 2 consecutive correct, step down on 2 errors', () => {
    // Step up from medium to hard on 2 consecutive correct
    const stepUp = evaluateDifficultyTransition('medium', 2, 0);
    assert.equal(stepUp.newDifficulty, 'hard');
    assert.ok(stepUp.reason.includes('Stepped up difficulty to Hard'));

    // Step down from hard to medium on 2 consecutive errors
    const stepDown = evaluateDifficultyTransition('hard', 0, 2);
    assert.equal(stepDown.newDifficulty, 'medium');
    assert.ok(stepDown.reason.includes('Stepped down difficulty to Medium'));

    // Step down from medium to easy on 2 consecutive errors
    const stepDownEasy = evaluateDifficultyTransition('medium', 0, 2);
    assert.equal(stepDownEasy.newDifficulty, 'easy');

    // Maintain when performance is mixed
    const maintain = evaluateDifficultyTransition('medium', 1, 0);
    assert.equal(maintain.newDifficulty, 'medium');
  });

  test('4. Setup User Registration for Adaptive Practicing', async () => {
    const reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Adaptive Alice',
        email: 'adaptive.alice@mindmate.app',
        password: 'Password123!',
      }),
    });
    assert.equal(reg.status, 201);
    const data = await reg.json();
    aliceId = data.user.id;
    aliceCookie = reg.headers.get('set-cookie')?.split(';')[0] || '';
    assert.ok(aliceCookie.includes('mindmate_session='));

    // Clear any seed progress so Alice starts with a clean 0-attempt slate
    await prisma.learnerProgress.deleteMany({ where: { userId: aliceId } });
  });

  test('5. Initial Diagnostic Question Selection for New Learner starts at Medium with explanation', async () => {
    const res = await fetch(`${baseUrl}/api/learner/adaptive/next?topicId=python-funcs`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.targetDifficulty, 'medium');
    assert.ok(data.selectionReason.includes('diagnostic') || data.selectionReason.includes('MEDIUM'));
    assert.ok(data.question.id);
    assert.ok(data.question.options.length >= 2);
    assert.equal(typeof data.question.correct, 'number');
  });

  test('6. Closed Learning Loop: Correct answer increases mastery and advances difficulty', async () => {
    // Fetch medium question
    const resQ1 = await fetch(`${baseUrl}/api/learner/adaptive/next?topicId=python-funcs`, {
      headers: { Cookie: aliceCookie },
    });
    const q1 = (await resQ1.json()).question;

    // Submit correct answer to Q1
    const resAns1 = await fetch(`${baseUrl}/api/learner/adaptive/answer`, {
      method: 'POST',
      headers: {
        Cookie: aliceCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        questionId: q1.id,
        selectedOption: q1.correct,
      }),
    });
    assert.equal(resAns1.status, 200);
    const ans1Data = await resAns1.json();
    assert.equal(ans1Data.result.isCorrect, true);
    assert.equal(ans1Data.result.masteryAfter, 60, '1st correct answer should yield 60% Beta mastery');
    assert.equal(ans1Data.result.confidenceLevel, 'INSUFFICIENT_EVIDENCE');

    // Submit correct answer to Q2 (2nd consecutive correct)
    const q2 = ans1Data.result.nextQuestion;
    assert.ok(q2);
    const resAns2 = await fetch(`${baseUrl}/api/learner/adaptive/answer`, {
      method: 'POST',
      headers: {
        Cookie: aliceCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        questionId: q2.id,
        selectedOption: q2.correct,
        sessionExcludedIds: [q1.id],
      }),
    });
    assert.equal(resAns2.status, 200);
    const ans2Data = await resAns2.json();
    assert.equal(ans2Data.result.isCorrect, true);
    assert.equal(ans2Data.result.masteryAfter, 67, '2nd correct answer yields 67% Beta mastery (4/6)');
    // After 2 consecutive correct, difficulty transitions to 'hard'
    assert.equal(ans2Data.result.nextDifficulty, 'hard');
    assert.ok(ans2Data.result.difficultyTransitionReason.includes('Hard'));
  });

  test('7. Closed Learning Loop: Repeated incorrect answers reduce difficulty to Easy for scaffolding', async () => {
    // Fetch a question and answer incorrectly twice
    const resQ = await fetch(`${baseUrl}/api/learner/adaptive/next?topicId=oop-basics`, {
      headers: { Cookie: aliceCookie },
    });
    const q1 = (await resQ.json()).question;

    // 1st wrong answer
    const wrongOpt1 = (q1.correct + 1) % q1.options.length;
    const resAns1 = await fetch(`${baseUrl}/api/learner/adaptive/answer`, {
      method: 'POST',
      headers: {
        Cookie: aliceCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        questionId: q1.id,
        selectedOption: wrongOpt1,
      }),
    });
    const data1 = await resAns1.json();
    assert.equal(data1.result.isCorrect, false);
    assert.equal(data1.result.masteryAfter, 40);

    // 2nd wrong answer on OOP
    const q2 = data1.result.nextQuestion;
    const wrongOpt2 = (q2.correct + 1) % q2.options.length;
    const resAns2 = await fetch(`${baseUrl}/api/learner/adaptive/answer`, {
      method: 'POST',
      headers: {
        Cookie: aliceCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        questionId: q2.id,
        selectedOption: wrongOpt2,
        sessionExcludedIds: [q1.id],
      }),
    });
    const data2 = await resAns2.json();
    assert.equal(data2.result.isCorrect, false);
    assert.equal(data2.result.masteryAfter, 33); // 2/6 = 33%
    // 2 consecutive errors step difficulty down to easy
    assert.equal(data2.result.nextDifficulty, 'easy');
    assert.ok(data2.result.difficultyTransitionReason.includes('Easy'));
  });

  test('8. Avoidance of Repeated Questions in Active Session', async () => {
    const resQ1 = await fetch(`${baseUrl}/api/learner/adaptive/next?topicId=data-structures`, {
      headers: { Cookie: aliceCookie },
    });
    const q1 = (await resQ1.json()).question;

    // Fetch next, excluding q1.id
    const resQ2 = await fetch(`${baseUrl}/api/learner/adaptive/next?topicId=data-structures&exclude=${q1.id}`, {
      headers: { Cookie: aliceCookie },
    });
    const q2 = (await resQ2.json()).question;

    assert.notEqual(q1.id, q2.id, 'Adaptive selector must not repeat excluded question in same session');
  });

  test('9. Diagnostic Endpoint returns complete topic state with confidence and recommendations', async () => {
    const res = await fetch(`${baseUrl}/api/learner/adaptive/diagnostic`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.topics.length >= 2);

    const oopTopic = data.topics.find((t: any) => t.topicId === 'oop-basics');
    assert.ok(oopTopic);
    assert.equal(oopTopic.masteryScore, 33);
    assert.equal(oopTopic.currentDifficulty, 'easy');

    // OOP topic with 33% should be recommended for practice
    assert.ok(data.recommendedTopics.some((r: any) => r.topicId === 'oop-basics'));
  });

  test('10. Head-to-Head Comparison: Adaptive Selector vs Static Non-Adaptive Baseline', async () => {
    // Non-adaptive selector always returns questions by index regardless of errors
    const staticQ0 = await selectNonAdaptiveQuestion('python-funcs', 0);
    const staticQ1 = await selectNonAdaptiveQuestion('python-funcs', 1);
    assert.ok(staticQ0);
    assert.ok(staticQ1);
    assert.notEqual(staticQ0.id, staticQ1.id);

    // Notice: The non-adaptive selector has 0% difficulty adaptation sensitivity.
    // In contrast, the Adaptive Engine dynamically adjusts difficulty:
    // When learner fails repeatedly -> adapts difficulty to Easy.
    // When learner succeeds repeatedly -> adapts difficulty to Hard.
    const adaptiveEasy = await selectNextAdaptiveQuestion(aliceId, {
      topicId: 'oop-basics', // Where Alice has 2 consecutive errors
    });
    assert.equal(
      adaptiveEasy.targetDifficulty,
      'easy',
      'Adaptive engine specifically personalizes difficulty to Easy based on demonstrated weakness'
    );
  });

  test('11. Regression Check: Milestone 1-4 endpoints remain intact', async () => {
    // Milestone 1: AI status
    const resAi = await fetch(`${baseUrl}/api/ai/status`);
    assert.equal(resAi.status, 200);

    // Milestone 2: Auth Me
    const resMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(resMe.status, 200);

    // Milestone 3: Sync Status
    const resSync = await fetch(`${baseUrl}/api/learner/sync/status`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(resSync.status, 200);

    // Milestone 4: Materials
    const resMat = await fetch(`${baseUrl}/api/learner/materials`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(resMat.status, 200);
  });
});
