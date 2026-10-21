import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium, expect} from '@playwright/test';
import {verifyPackage, sha256} from './release-lib.mjs';

const [directory, address, output] = process.argv.slice(2);
if (!directory || !address || !output) throw Error('Usage: node scripts/audit-delivery.mjs <release-directory> <local-preview-origin> <new-report.json>');
const origin = new URL(address).origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw Error('Use an isolated local preview for synthetic-record auditing');
try {await fs.access(output); throw Error('Refusing to replace an existing audit report');} catch (error) {if (error.code !== 'ENOENT') throw error;}
const manifest = await verifyPackage(directory);
const report = {generatedAt: new Date().toISOString(), appReleaseId: manifest.appReleaseId, contentReleaseId: manifest.contentReleaseId,
  sourceCommit: manifest.sourceCommit, packageManifestSha256: sha256(await fs.readFile(path.join(directory, 'manifest.json'))),
  scope: 'Local immutable package, desktop Chromium with 390x844 CSS viewport; no physical device, CDN or family acceptance',
  network: {downloadMbps: 10, uploadMbps: 10, latencyMs: 100, cacheDisabled: true, compression: false, cpuThrottling: false}, performance: [], failures: []};
const browser = await chromium.launch({headless: true});
report.browserVersion = browser.version();
async function checkVersion(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.appReleaseId)).toBe(manifest.appReleaseId);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.contentReleaseId), manifest.contentReleaseId);
}
async function coldStart(route, selector) {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  try {
    const page = await context.newPage(), errors = [], externalRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    context.on('request', request => {const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) externalRequests.push({origin: url.origin, path: url.pathname});});
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
    await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 100, downloadThroughput: 1250000, uploadThroughput: 1250000});
    await page.goto(`${origin}/#${route}`, {waitUntil: 'domcontentloaded'});
    await checkVersion(page);
    await page.locator(selector).waitFor();
    const elapsedMs = await page.locator(selector).evaluate(async image => {
      await image.decode();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return Math.round(performance.now());
    });
    await page.waitForLoadState('networkidle');
    const snapshot = await page.evaluate(() => ({overflow: document.documentElement.scrollWidth > innerWidth,
      resources: performance.getEntriesByType('resource').map(entry => ({path: new URL(entry.name).pathname, initiator: entry.initiatorType,
        encodedBytes: entry.encodedBodySize, transferredBytes: entry.transferSize, durationMs: Math.round(entry.duration)}))}));
    const imageBytes = snapshot.resources.filter(resource => resource.initiator === 'img').reduce((sum, resource) => sum + resource.encodedBytes, 0);
    return {elapsedMs, imageBytes, phaserLoaded: snapshot.resources.some(resource => /\/phaser[^/]*\.js$/.test(resource.path)), ...snapshot, errors, externalRequests};
  } finally {await context.close();}
}
async function privacy() {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const requests = [], blockedExternalRequests = [], dataLeaks = [], sockets = [], errors = [];
  const markers = {nickname: 'audit-only-nickname-7f062', observation: 'audit-only-observation-5ef03', caption: 'audit-only-artwork-9e32c'};
  context.on('request', request => {
    const url = new URL(request.url()), body = request.postData() || '';
    requests.push({origin: url.origin, path: url.pathname, method: request.method(), kind: request.resourceType()});
    for (const [field, marker] of Object.entries(markers)) if ((request.url() + body).includes(marker)) dataLeaks.push({field, origin: url.origin, path: url.pathname, method: request.method()});
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
      blockedExternalRequests.push({origin: url.origin, path: url.pathname});
      return route.abort();
    }
    return route.continue();
  });
  try {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => {const url = new URL(socket.url()); sockets.push({origin: url.origin, path: url.pathname});});
    await page.goto(`${origin}/#/parent`); await checkVersion(page);
    await page.getByRole('textbox', {name: '档案昵称（可留空）'}).fill(markers.nickname);
    await page.getByRole('button', {name: '保存昵称', exact: true}).click();
    await expect(page.getByRole('status')).toContainText('档案已保存在这台设备');
    await page.goto(`${origin}/#/cars/CAR02`);
    await page.getByRole('button', {name: '我喜欢这辆车', exact: true}).click();
    await expect(page.getByRole('button', {name: '已放进车库', exact: true})).toBeVisible();
    await page.goto(`${origin}/#/play/E02`);
    await page.getByRole('button', {name: '车轮 wheel', exact: true}).click();
    await expect(page.getByRole('status')).toContainText('本次探索记录已保存在这台设备');
    await page.goto(`${origin}/#/play/C01`);
    await page.getByRole('textbox').fill(markers.observation);
    await page.getByRole('button', {name: '我分享好啦', exact: true}).click();
    await expect(page.getByRole('status')).toContainText('本次探索记录已保存在这台设备');
    await page.goto(`${origin}/#/play/A01?car=CAR02`);
    await page.getByRole('textbox', {name: '给海报起个名字（可留空）'}).fill(markers.caption);
    const board = page.getByRole('button', {name: '创作画纸，点击放图案，按回车添加图案'});
    await board.focus(); await board.press('Enter');
    await page.getByRole('button', {name: '放进我的车库', exact: true}).click();
    await expect(page.getByRole('button', {name: '已放进车库', exact: true})).toBeVisible();
    await expect(page.getByRole('status')).toContainText('本次探索记录已保存在这台设备');
    await page.goto(`${origin}/#/stories/ST01?step=3`);
    await page.getByRole('button', {name: '故事看完啦', exact: true}).click();
    await expect(page.getByRole('status')).toContainText('已经记在这台设备');
    await page.goto(`${origin}/#/parent`); await page.reload();
    await expect(page.getByRole('textbox', {name: '档案昵称（可留空）'})).toHaveValue(markers.nickname);
    await expect(page.locator('.observations')).toContainText(markers.observation);
    const event = page.waitForEvent('download');
    await page.getByRole('button', {name: '导出本机备份', exact: true}).click();
    const download = await event, backup = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    assert.equal(backup.profile.nickname, markers.nickname);
    assert.equal(backup.observations[0].text, markers.observation);
    assert.equal(backup.creations[0].caption, markers.caption);
    assert.deepEqual(backup.favorites.map(row => row.carId), ['CAR02']);
    assert.equal(backup.sessions.filter(row => row.state === 'completed' || row.state === 'participated').length, 3);
    assert.equal(backup.storyProgress[0].finished, true);
    await page.waitForLoadState('networkidle');
    const mutations = requests.filter(request => !['GET', 'HEAD'].includes(request.method));
    return {scope: 'Synthetic records in a fresh isolated browser profile; external attempts are intercepted and still counted',
      actions: ['save profile', 'favorite car', 'complete core activity', 'save observation', 'save artwork', 'finish story', 'reload', 'export backup'],
      requests: requests.length, methods: [...new Set(requests.map(request => request.method))], origins: [...new Set(requests.map(request => request.origin))],
      blockedExternalRequests, mutationRequests: mutations, canaryLeaks: dataLeaks, webSockets: sockets, serviceWorkers: context.serviceWorkers().length,
      syntheticRecordsConfirmedInExport: true, errors,
      passed: !blockedExternalRequests.length && !mutations.length && !dataLeaks.length && !sockets.length && !context.serviceWorkers().length && !errors.length};
  } finally {await context.close();}
}
try {
  for (const [route, selector] of [['/explore', '.world-map .scene-art-world.art-ready img'], ['/cars', '.showroom-display-car .car-image.ready img']]) {
    const samples = [];
    for (let attempt = 0; attempt < 3; attempt++) samples.push(await coldStart(route, selector));
    const medianElapsedMs = samples.map(sample => sample.elapsedMs).sort((a, b) => a - b)[1];
    const budgetPassed = medianElapsedMs <= 3000 && samples.every(sample => sample.imageBytes <= 1500000 && !sample.phaserLoaded && !sample.overflow && !sample.errors.length && !sample.externalRequests.length);
    report.performance.push({route, medianElapsedMs, samples, budgetPassed});
    if (!budgetPassed) report.failures.push(`Desktop first-screen budget: ${route}`);
  }
  report.privacy = await privacy();
  if (!report.privacy.passed) report.failures.push('Private-record network boundary');
} catch (error) {report.failures.push(error.message);}
finally {
  await browser.close();
  report.passed = report.failures.length === 0;
  await fs.mkdir(path.dirname(path.resolve(output)), {recursive: true});
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({appReleaseId: report.appReleaseId, performance: report.performance.map(({route, medianElapsedMs, samples, budgetPassed}) => ({route, medianElapsedMs, imageBytes: samples.map(sample => sample.imageBytes), budgetPassed})), privacyPassed: report.privacy?.passed, failures: report.failures}));
}
assert(report.passed, 'Audit failed; inspect the preserved report');
