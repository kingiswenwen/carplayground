import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { verifyPackage } from './release-lib.mjs';

if (!process.argv[2] || !process.argv[3]) throw Error('Usage: node scripts/audit-runtime.mjs <release-directory> <preview-origin>');
const manifest = await verifyPackage(process.argv[2]);
const origin = new URL(process.argv[3]).origin;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${origin}/#/cars/CAR01`);
  await page.locator('.detail-stage .car-image.ready').waitFor();
  const ids = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  assert.equal(ids.appReleaseId, manifest.appReleaseId); assert.equal(ids.contentReleaseId, manifest.contentReleaseId);
  const phaser = manifest.files.find(file => /\/phaser.*\.js$/.test(file.path));
  assert(phaser, 'Phaser chunk missing');
  await page.evaluate(async modulePath => {
    const Phaser = (await import(modulePath)).default;
    const audit = { frames: 0, active: 0 }; window.__runtimeAudit = audit;
    const start = Phaser.Game.prototype.start;
    Phaser.Game.prototype.start = function (...args) {
      audit.active++;
      this.events.once(Phaser.Core.Events.DESTROY, () => { audit.active--; });
      this.events.on(Phaser.Core.Events.STEP, () => { audit.frames++; });
      return start.apply(this, args);
    };
  }, `/${phaser.path}`);
  await page.getByRole('link', { name: /小车回家/ }).click();
  await page.locator('canvas').waitFor();
  await page.getByText('停车场正在准备…').waitFor({ state: 'hidden' });
  const renderer = await page.locator('canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return null;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) };
  });
  const sampleFrames = async milliseconds => {
    const before = await page.evaluate(() => ({ frames: window.__runtimeAudit.frames, at: performance.now() }));
    await page.waitForTimeout(milliseconds);
    const after = await page.evaluate(() => ({ frames: window.__runtimeAudit.frames, at: performance.now() }));
    return { elapsedMs: Math.round(after.at - before.at), frames: after.frames - before.frames, fps: Number(((after.frames - before.frames) * 1000 / (after.at - before.at)).toFixed(2)) };
  };
  const running = await sampleFrames(2000);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: '继续探索', exact: true }).waitFor();
  const hidden = await sampleFrames(300);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  const foregroundStillPaused = await sampleFrames(300);
  await page.getByRole('button', { name: '继续探索', exact: true }).click();
  const resumed = await sampleFrames(300);
  await page.getByRole('link', { name: '回去看车', exact: true }).click();
  await page.locator('.detail-stage .car-image.ready').waitFor();
  await page.waitForFunction(() => window.__runtimeAudit.active === 0);
  const feedback = [];
  for (const part of ['wheel', 'door', 'light', 'wheel', 'door', 'light', 'wheel', 'door', 'light']) {
    const labels = { wheel: '车轮', door: '车门', light: '车灯' };
    await page.evaluate(expected => {
      window.__feedbackSample = null;
      const button = [...document.querySelectorAll('.detail-stage button')].find(element => element.getAttribute('aria-label')?.endsWith(` ${expected}`));
      if (!button) throw Error('Part button missing');
      button.addEventListener('click', () => {
        const start = performance.now();
        // Two animation frames allow the React update to reach a paint opportunity.
        requestAnimationFrame(() => requestAnimationFrame(() => { window.__feedbackSample = { expected, actual: document.querySelector('.detail-stage .word-card strong')?.textContent, elapsedMs: Number((performance.now() - start).toFixed(2)) }; }));
      }, { once: true });
    }, part);
    await page.locator('.detail-stage').getByRole('button', { name: `${labels[part]} ${part}`, exact: true }).click();
    await page.waitForFunction(() => window.__feedbackSample !== null);
    feedback.push(await page.evaluate(() => window.__feedbackSample));
  }
  const report = {
    generatedAt: new Date().toISOString(), date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date()), appReleaseId: manifest.appReleaseId, contentReleaseId: manifest.contentReleaseId, sourceCommit: manifest.sourceCommit,
    environment: `${process.platform} headless Chromium ${browser.version()}, 1440x1000, local HTTP, no network or CPU throttling; not a mobile-device result`,
    method: 'Actual Phaser STEP events; visibility simulated; click capture to second animation frame with displayed-word check. No child data or device records.',
    renderer, running, hidden, foregroundStillPaused, resumed, feedback, maxFeedbackMs: Math.max(...feedback.map(sample => sample.elapsedMs)), activeEnginesAfterExit: await page.evaluate(() => window.__runtimeAudit.active), pageErrors,
  };
  report.pauseAndFeedbackChecksPassed = running.frames > 0 && hidden.frames === 0 && foregroundStillPaused.frames === 0 && resumed.frames > 0 && report.activeEnginesAfterExit === 0 && report.maxFeedbackMs <= 150 && feedback.every(sample => sample.actual === sample.expected) && pageErrors.length === 0;
  await fs.writeFile(new URL('../docs/development/r4-runtime-check.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  assert(report.pauseAndFeedbackChecksPassed, 'Pause/feedback target failed; inspect the recorded measurements');
} finally { await browser.close(); }
