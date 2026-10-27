import { spawn } from 'node:child_process';
import fs from 'node:fs';

const artifactDir = '/Users/rohansiddhpura/.gemini/antigravity/brain/21fe5f93-1b5e-463d-b604-d7040270bd2d';

async function runHeaderSidebarLearnVerification() {
  console.log('Starting Google Chrome CDP verification for Header, Sidebar, and AI Status UI...');
  const port = 9405;
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=/tmp/mm-ui-cleanup-${Date.now()}`,
    `--remote-debugging-port=${port}`,
    '--window-size=1440,900',
    'about:blank',
  ]);

  try {
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
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          localStorage.setItem('mindmate_user', JSON.stringify({
            id: 'meet8kotecha',
            name: 'Meet Kotecha',
            email: 'meet@mindmate.ai'
          }));
          localStorage.setItem('mindmate_theme', 'light');
          localStorage.setItem('mindmate_sidebar_collapsed', 'false');
        } catch (e) {}
      `,
    });
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log('Navigating to http://localhost:5173/home...');
    await send('Page.navigate', { url: 'http://localhost:5173/home' });
    await new Promise((r) => setTimeout(r, 2000));

    // 1. Verify Header: No Simulated Demo Badge in Top Header
    const headerCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const header = document.querySelector('header');
        if (!header) return { error: 'No header found' };
        const text = header.innerText || '';
        const hasDemoBadge = text.includes('SIMULATED DEMO DATA') || text.includes('DEMO DATA');
        const hasSearch = !!header.querySelector('input[type="search"], input[placeholder*="Search"]');
        const hasNotifications = !!header.querySelector('button[aria-label*="notification" i], button svg.lucide-bell');
        const hasLanguage = !!header.querySelector('button[aria-label*="language" i], button svg.lucide-globe');
        const hasProfile = text.includes('meet8kotecha') || text.includes('Meet Kotecha') || text.includes('Alex');
        return {
          hasDemoBadge,
          hasSearch,
          hasNotifications,
          hasLanguage,
          hasProfile,
          headerHeight: header.offsetHeight,
          headerWidth: header.offsetWidth
        };
      })()`,
      returnByValue: true,
    });
    console.log('Header verification results:', headerCheck.result.value);

    // Take screenshot of clean top header & home dashboard
    const headerShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/header-clean-no-badge.png`, Buffer.from(headerShot.data, 'base64'));
    console.log('Saved header-clean-no-badge.png');

    // 2. Verify Expanded Sidebar
    const sidebarExpandedCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const aside = document.querySelector('aside');
        if (!aside) return { error: 'No aside element found' };
        const rect = aside.getBoundingClientRect();
        const hasLogoText = aside.innerText.includes('MindMate');
        const hasCollapseBtn = !!aside.querySelector('button[aria-label*="collapse" i]');
        return {
          width: rect.width,
          hasLogoText,
          hasCollapseBtn
        };
      })()`,
      returnByValue: true,
    });
    console.log('Sidebar expanded verification results:', sidebarExpandedCheck.result.value);

    const expandedShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/sidebar-expanded-desktop.png`, Buffer.from(expandedShot.data, 'base64'));
    console.log('Saved sidebar-expanded-desktop.png');

    // 3. Test Collapsing Sidebar
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('button[aria-label*="collapse" i]');
        if (btn) btn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 600));

    const sidebarCollapsedCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const aside = document.querySelector('aside');
        if (!aside) return { error: 'No aside element found' };
        const rect = aside.getBoundingClientRect();
        const hasExpandBtn = !!aside.querySelector('button[aria-label*="expand" i]');
        return {
          width: rect.width,
          hasExpandBtn
        };
      })()`,
      returnByValue: true,
    });
    console.log('Sidebar collapsed verification results:', sidebarCollapsedCheck.result.value);

    const collapsedShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/sidebar-collapsed-desktop.png`, Buffer.from(collapsedShot.data, 'base64'));
    console.log('Saved sidebar-collapsed-desktop.png');

    // Expand sidebar back
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('button[aria-label*="expand" i]');
        if (btn) btn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 600));

    // 4. Navigate to /learn to verify Mate AI & reorganized right panel
    console.log('Navigating to http://localhost:5173/learn...');
    await send('Page.navigate', { url: 'http://localhost:5173/learn' });
    await new Promise((r) => setTimeout(r, 2000));

    const learnCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const mateAiHeader = document.querySelector('[data-testid="mate-ai-header"]');
        const mateAiStatus = document.querySelector('[data-testid="mate-ai-status-indicator"]');
        const ollamaCard = document.querySelector('[data-testid="ollama-status-card"]');
        const offlineCard = document.querySelector('[data-testid="offline-engine-card"]');
        const contextCard = document.querySelector('[data-testid="learning-context-card"]');
        const providerBadges = document.querySelectorAll('[data-testid="mate-ai-provider-badge"]');
        return {
          hasMateAiHeader: !!mateAiHeader,
          mateAiHeaderText: mateAiHeader ? mateAiHeader.innerText.replace(/\\s+/g, ' ') : null,
          statusIndicatorText: mateAiStatus ? mateAiStatus.innerText.trim() : null,
          hasOllamaCard: !!ollamaCard,
          hasOfflineCard: !!offlineCard,
          hasContextCard: !!contextCard,
          contextCardTitle: contextCard ? contextCard.querySelector('h3')?.innerText : null,
          providerBadgesCount: providerBadges.length
        };
      })()`,
      returnByValue: true,
    });
    console.log('Learn UI verification results:', learnCheck.result.value);

    const learnShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/learn-simplified-tutor.png`, Buffer.from(learnShot.data, 'base64'));
    console.log('Saved learn-simplified-tutor.png');

    // Capture zoomed/cropped Learning Context card
    const contextCardRect = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('[data-testid="learning-context-card"]');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })()`,
      returnByValue: true,
    });
    if (contextCardRect.result.value) {
      const clip = contextCardRect.result.value;
      const contextShot = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: clip.x - 10, y: clip.y - 10, width: clip.width + 20, height: clip.height + 20, scale: 1 },
      });
      fs.writeFileSync(`${artifactDir}/learning-context-reorganized.png`, Buffer.from(contextShot.data, 'base64'));
      console.log('Saved learning-context-reorganized.png');
    }

    // 5. Test Mobile Responsive Viewport (375x700)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 700,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await new Promise((r) => setTimeout(r, 600));

    // Verify sidebar is hidden drawer on mobile
    const mobileCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const aside = document.querySelector('aside');
        const menuBtn = document.querySelector('button[aria-label*="menu" i], button[aria-label*="navigation" i]');
        return {
          asideTransform: aside ? window.getComputedStyle(aside).transform : null,
          hasMobileMenuBtn: !!menuBtn
        };
      })()`,
      returnByValue: true,
    });
    console.log('Mobile layout check:', mobileCheck.result.value);

    // Open mobile menu
    await send('Runtime.evaluate', {
      expression: `(() => {
        const menuBtn = document.querySelector('button[aria-label*="menu" i], button[aria-label*="navigation" i]');
        if (menuBtn) menuBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 500));

    const mobileDrawerShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${artifactDir}/sidebar-mobile-responsive.png`, Buffer.from(mobileDrawerShot.data, 'base64'));
    console.log('Saved sidebar-mobile-responsive.png');

    console.log('ALL BROWSER SCREENSHOTS CAPTURED SUCCESSFULLY!');
    ws.close();
  } catch (err) {
    console.error('Verification failed:', err);
    throw err;
  } finally {
    chrome.kill('SIGKILL');
  }
}

runHeaderSidebarLearnVerification().catch((e) => {
  console.error(e);
  process.exit(1);
});
