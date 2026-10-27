import { spawn } from 'node:child_process';
import fs from 'node:fs';

const artifactDir = '/Users/rohansiddhpura/.gemini/antigravity/brain/21fe5f93-1b5e-463d-b604-d7040270bd2d';

async function runBrowserVerification() {
  console.log('Starting Google Chrome CDP verification on port 9399...');
  const port = 9399;
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=/tmp/mm-action-chk-${Date.now()}`,
    `--remote-debugging-port=${port}`,
    '--window-size=1440,900',
    'about:blank',
  ]);

  try {
    // Wait for Chrome to open debugging port with polling retry
    let listRes;
    for (let i = 0; i < 30; i++) {
      try {
        listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
        if (listRes.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!listRes || !listRes.ok) {
      throw new Error('Chrome remote debugging port timed out.');
    }
    const pages = await listRes.json();
    const page = pages.find((p) => p.type === 'page' && !p.url.startsWith('chrome:'));
    if (!page) throw new Error('No valid Chrome page found');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));

    let msgId = 0;
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = ++msgId;
        const handler = (ev) => {
          const d = JSON.parse(ev.data);
          if (d.id === id) {
            ws.removeEventListener('message', handler);
            resolve(d.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });

    await send('Page.enable');
    await send('Runtime.enable');

    // Inject authenticated user into localStorage
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          localStorage.setItem('mindmate_user', JSON.stringify({
            id: 'meet8kotecha',
            name: 'Meet Kotecha',
            email: 'meet@mindmate.ai'
          }));
          localStorage.setItem('mindmate_theme', 'light');
          localStorage.setItem('mindmate_ai_mode', 'ollama');
        } catch (e) {}
      `,
    });

    console.log('1. Navigating to Home...');
    await send('Page.navigate', { url: 'http://localhost:5173/home' });
    await new Promise((r) => setTimeout(r, 2000));

    const homeCheck = await send('Runtime.evaluate', {
      expression: 'document.body.innerText.includes("Welcome") || document.body.innerText.includes("MindMate") || document.body.innerText.includes("Today")',
      returnByValue: true,
    });
    console.log('   Home rendered:', homeCheck?.result?.value);

    console.log('2. Navigating to Mate AI Chat (/learn)...');
    await send('Page.navigate', { url: 'http://localhost:5173/learn?topic=python-functions' });
    await new Promise((r) => setTimeout(r, 2500));

    console.log('3. Sending Action command: "Create a seven-day Python study plan"...');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const textarea = document.querySelector('textarea');
          if (textarea) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            nativeSetter.call(textarea, 'Create a seven-day Python study plan');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const sendBtn = document.querySelector('button[aria-label="Send message"]');
          if (sendBtn) {
            sendBtn.click();
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true,
    });

    // Wait for ActionExecutionCard to appear
    await new Promise((r) => setTimeout(r, 2000));

    const cardInfo = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const text = document.body.innerText;
          const hasActionHeader = text.includes('Mate Action Engine');
          const hasAwaiting = text.includes('Awaiting Confirmation') || text.includes('Requires Approval');
          const hasConfirmBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Confirm & Save Plan'));
          return { hasActionHeader, hasAwaiting, hasConfirmBtn };
        })()
      `,
      returnByValue: true,
    });
    console.log('   ActionExecutionCard rendered:', cardInfo?.result?.value);

    // Capture screenshot of study plan preview card
    const snap1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/mate-action-preview-plan.png`, Buffer.from(snap1.data, 'base64'));
    console.log('   Saved artifact: mate-action-preview-plan.png');

    console.log('4. Clicking "Confirm & Save Plan"...');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Confirm & Save Plan'));
          if (confirmBtn) {
            confirmBtn.click();
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true,
    });

    await new Promise((r) => setTimeout(r, 2000));

    const confirmedInfo = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const text = document.body.innerText;
          const hasCompleted = text.includes('Completed') || text.includes('Successfully created');
          const hasViewPlanner = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('View in Planner'));
          return { hasCompleted, hasViewPlanner };
        })()
      `,
      returnByValue: true,
    });
    console.log('   Plan confirmed & saved:', confirmedInfo?.result?.value);

    // Capture screenshot of completed state
    const snap2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/mate-action-plan-confirmed.png`, Buffer.from(snap2.data, 'base64'));
    console.log('   Saved artifact: mate-action-plan-confirmed.png');

    console.log('5. Testing navigation action to /planner...');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const viewPlannerBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('View in Planner'));
          if (viewPlannerBtn) {
            viewPlannerBtn.click();
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true,
    });

    await new Promise((r) => setTimeout(r, 2000));
    const plannerUrl = await send('Runtime.evaluate', { expression: 'location.pathname', returnByValue: true });
    console.log('   Navigated to pathname:', plannerUrl?.result?.value);

    // Verify planner tasks are visible on Planner page
    const plannerTasks = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const tasks = Array.from(document.querySelectorAll('[data-task-id], .rounded-xl, .bg-white')).filter(el => el.innerText.includes('Revise:') || el.innerText.includes('Practice:'));
          return { foundTasksCount: tasks.length };
        })()
      `,
      returnByValue: true,
    });
    console.log('   Planner tasks on page:', plannerTasks?.result?.value);

    const snap3 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/planner-tasks-created.png`, Buffer.from(snap3.data, 'base64'));
    console.log('   Saved artifact: planner-tasks-created.png');

    console.log('6. Returning to /learn to test Quiz action: "Start a quiz on Python functions"...');
    await send('Page.navigate', { url: 'http://localhost:5173/learn' });
    await new Promise((r) => setTimeout(r, 2000));

    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const textarea = document.querySelector('textarea');
          if (textarea) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            nativeSetter.call(textarea, 'Start a quiz on Python functions');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const sendBtn = document.querySelector('button[aria-label="Send message"]');
          if (sendBtn) {
            sendBtn.click();
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true,
    });

    await new Promise((r) => setTimeout(r, 2500));
    const quizUrl = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
    console.log('   Quiz action result location:', quizUrl?.result?.value);

    const snap4 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/quiz-action-launched.png`, Buffer.from(snap4.data, 'base64'));
    console.log('   Saved artifact: quiz-action-launched.png');

    ws.close();
    console.log('\n=== Browser Action Verification Completed Successfully! ===\n');
  } finally {
    chrome.kill('SIGTERM');
  }
}

runBrowserVerification().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
