import { test, expect } from '@playwright/test';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

// Run against a dev server with DEV_SECURITY_E2E=1 and PLAYWRIGHT_BASE_URL.
// The normal release E2E targets built artifacts, where source/HMR must NOT exist.
// This suite deliberately does not inspect any private response contents.
test.skip(process.env.DEV_SECURITY_E2E !== '1', 'Development-only HTTP/HMR suite; opt in with DEV_SECURITY_E2E=1.');
test('dev serves the real app, source, optimized /@fs deps and media with HMR connected @smoke', async ({ page, request }) => {
  const failed: string[] = [];
  const sockets: string[] = [];
  page.on('response', response => { if (response.status() >= 400) failed.push(new URL(response.url()).pathname); });
  page.on('websocket', socket => { socket.on('framereceived', event => sockets.push(String(event.payload))); });
  await page.goto('/#/parent');
  await expect(page.getByRole('combobox', { name: '操作难度' })).toBeVisible();
  await expect.poll(() => sockets.some(message => { try { return JSON.parse(message).type === 'connected'; } catch { return false; } })).toBe(true);
  for (const url of ['/src/main.tsx', '/src/services/backup.ts', '/content/r3.json', '/package.json', '/@vite/client']) {
    expect((await request.get(url)).status(), url).toBe(200);
  }
  const dependency = '/@fs' + path.join(process.cwd(), 'node_modules/.vite/deps/react.js').replaceAll('\\', '/');
  expect((await request.get(dependency)).status()).toBe(200);
  const media = '/media/scenes/showroom-v3.webp';
  const image = await request.get(media);
  expect(image.status()).toBe(200); expect(image.headers()['content-type']).toContain('image/');
  const range = await request.get(media, { headers: { Range: 'bytes=0-31' } });
  expect(range.status()).toBe(206); expect((await range.body()).length).toBe(32);
  expect(failed).toEqual([]);
});

test('private requests stay forbidden and private trace HTML cannot reload the app @smoke', async ({ page, request }) => {
  await page.goto('/#/parent');
  await expect(page.getByRole('combobox', { name: '操作难度' })).toBeVisible();
  for (const file of ['/START_HERE.md', '/AGENTS.md', '/.private/r26-completion/security/trace/watch-canary.html', '/docs/planning/00.md', '/.git/config', '/deployment/production.json', '/credentials.json', '/unknown-root-file']) {
    for (const url of [file, file + '?raw', '/@fs' + process.cwd() + file + '?import', file.replaceAll('.', '%2e'), file.replaceAll('.', '%252e')]) {
      expect((await request.get(url)).status(), url).toBe(403);
    }
  }
  const marker = await page.evaluate(() => { const value = crypto.randomUUID(); Object.assign(window, { securityNoReloadMarker: value }); return value; });
  const directory = path.resolve('.private/r26-completion/security/trace');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'watch-canary.html'), '<!doctype html><title>synthetic trace only</title>');
  // A generated trace must not generate Vite's HTML full-reload event.
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => (window as unknown as { securityNoReloadMarker: string }).securityNoReloadMarker)).toBe(marker);
  expect((await request.get('/.private/r26-completion/security/trace/watch-canary.html')).status()).toBe(403);
});
