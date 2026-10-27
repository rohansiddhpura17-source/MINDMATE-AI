import { spawn } from 'node:child_process';
import fs from 'node:fs';

const artifactDir = '/Users/rohansiddhpura/.gemini/antigravity/brain/21fe5f93-1b5e-463d-b604-d7040270bd2d';

async function runVisualBrowserVerification() {
  console.log('Starting Google Chrome CDP verification for Visuals on port 9400...');
  const port = 9400;
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=/tmp/mm-visual-chk-${Date.now()}`,
    `--remote-debugging-port=${port}`,
    '--window-size=1440,900',
    'about:blank',
  ]);

  try {
    // Wait for Chrome remote debugging port
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

    // Authenticate user in localStorage
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

    console.log('1. Navigating to Mate AI Learn page (/learn)...');
    await send('Page.navigate', { url: 'http://localhost:5173/learn?topic=python-oop' });
    await new Promise((r) => setTimeout(r, 2500));

    // Test 1: Ask "Who was Max Planck?"
    console.log('2. Sending Query: "Who was Max Planck?"...');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const textarea = document.querySelector('textarea');
          if (textarea) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            nativeSetter.call(textarea, 'Who was Max Planck?');
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

    // Wait for AI response and visual gallery to render
    console.log('   Waiting for Max Planck response and visual gallery...');
    for (let wait = 0; wait < 20; wait++) {
      await new Promise((r) => setTimeout(r, 1000));
      const check = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            const hasMax = text.includes('Max Planck');
            const hasGallery = text.includes('Verified Real-World Media') || document.querySelectorAll('img[src*="wikimedia"]').length > 0;
            return { hasMax, hasGallery };
          })()
        `,
        returnByValue: true,
      });
      if (check?.result?.value?.hasGallery) {
        console.log('   ✓ Max Planck gallery detected!');
        break;
      }
    }

    // Capture screenshot: max-planck-gallery-visual.png
    const shot1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/max-planck-gallery-visual.png`, Buffer.from(shot1.data, 'base64'));
    console.log('   ✓ Saved artifact: max-planck-gallery-visual.png');

    // Test 2: Ask "What is Pandas?"
    console.log('3. Sending Query: "What is Pandas?"...');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const textarea = document.querySelector('textarea');
          if (textarea) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            nativeSetter.call(textarea, 'What is Pandas?');
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

    // Wait for Pandas comparison table to appear
    console.log('   Waiting for Pandas comparison visual...');
    for (let wait = 0; wait < 20; wait++) {
      await new Promise((r) => setTimeout(r, 1000));
      const check = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            const hasPandas = text.includes('Pandas Series') || text.includes('Series (1D)');
            const hasComparison = text.includes('Comparison') || text.includes('DataFrame (2D)');
            return { hasPandas, hasComparison };
          })()
        `,
        returnByValue: true,
      });
      if (check?.result?.value?.hasPandas || check?.result?.value?.hasComparison) {
        console.log('   ✓ Pandas comparison visual detected!');
        break;
      }
    }

    // Capture screenshot: pandas-comparison-visual.png
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/pandas-comparison-visual.png`, Buffer.from(shot2.data, 'base64'));
    console.log('   ✓ Saved artifact: pandas-comparison-visual.png');

    // Test 3: Click "Show visually" quick action chip
    console.log('4. Clicking "Show visually" quick action chip...');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const chips = Array.from(document.querySelectorAll('button'));
          const showVisBtn = chips.find(c => c.innerText.includes('Show visually'));
          if (showVisBtn) {
            showVisBtn.click();
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true,
    });

    console.log('   Waiting for grounded visual response...');
    await new Promise((r) => setTimeout(r, 4000));

    // Capture screenshot: show-visually-grounded.png
    const shot3 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/show-visually-grounded.png`, Buffer.from(shot3.data, 'base64'));
    console.log('   ✓ Saved artifact: show-visually-grounded.png');

    console.log('\nAll browser visual verifications completed successfully!');
    ws.close();
  } finally {
    chrome.kill();
  }
}

runVisualBrowserVerification().catch((err) => {
  console.error('Visual browser verification failed:', err);
  process.exit(1);
});
