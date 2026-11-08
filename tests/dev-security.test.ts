import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createServer, preview, type ViteDevServer, type PreviewServer } from 'vite';
import { decodeRequestPath, devSecurity, isAllowedRequest, privateWatchIgnored } from '../scripts/dev-security';

const root = mkdtempSync(path.join(tmpdir(), 'carplayground-security-'));
function fixture(relative: string, text = '/* synthetic fixture */') {
  const file = path.join(root, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text);
}
const forbidden = [
  '/START_HERE.md', '/AGENTS.md', '/docs/planning/00.md', '/docs/development/audit.html',
  '/.private/receipt.html', '/.git/config', '/deployment/production.json', '/unusual-root-file',
  '/credentials.json', '/.env.local', '/src/credentials.ts', '/src/nested/token.json', '/src/myAccessToken.ts', '/src/secretConfig.ts',
  '/media/private.png', '/media/secret.json', '/media/.env', '/src/private-alias.ts', '/src/alias.ts', '/media/alias.png', '/source/main.ts', '/arbitrary.ts',
  '/%2eprivate/receipt.html', '/%252eprivate/receipt.html', '/src/%2e%2e/START_HERE.md',
  '/src/%252e%252e/START_HERE.md', '/src/%5c..%5cSTART_HERE.md', '/src/main.ts%00',
  '/src/main.ts%3fraw', '/src/main.ts%23suffix', '/%zz', '/@id/__x00__private',
];
const positive = ['/index.html', '/src/main.ts', '/src/services/backup.ts', '/package.json', '/content/r3.json', '/content/viewer-paints.json',
  '/media/car.png', '/media/car.glb', '/media/car.glb.parts.json', '/references/view.png',
  '/node_modules/.vite/deps/react.js', '/node_modules/react/index.js'];

beforeAll(() => {
  fixture('index.html', '<html><body>safe page<script type="module" src="/src/main.ts"></script></body></html>');
  fixture('src/main.ts', 'export const value: number = 1; if(import.meta.hot) import.meta.hot.accept();');
  fixture('src/services/backup.ts', 'export const backup = true;');
  fixture('package.json', '{"type":"module"}'); fixture('content/r3.json', '{}'); fixture('content/viewer-paints.json', '{}');
  for (const relative of ['public/media/car.png', 'public/media/car.glb', 'public/media/car.glb.parts.json',
    'public/references/view.png', 'node_modules/.vite/deps/react.js', 'node_modules/react/index.js']) fixture(relative);
  // All negative files contain only invented canaries, never local private data.
  for (const relative of ['START_HERE.md', 'AGENTS.md', 'docs/planning/00.md', 'docs/development/audit.html',
    '.private/receipt.html', '.git/config', 'deployment/production.json', 'unusual-root-file', 'credentials.json',
    '.env.local', 'src/credentials.ts', 'src/nested/token.json', 'public/media/private.png', 'public/media/secret.json', 'public/media/.env']) fixture(relative, 'SYNTHETIC_NOT_PUBLIC');
  symlinkSync(path.join(root, '.private/receipt.html'), path.join(root, 'src/private-alias.ts'));
  symlinkSync(path.join(root, '.private/receipt.html'), path.join(root, 'src/alias.ts'));
  symlinkSync(path.join(root, '.private/receipt.html'), path.join(root, 'public/media/alias.png'));
  fixture('dist/index.html', '<html><body>safe preview</body></html>');
  fixture('dist/assets/app.js', 'console.log("safe preview")'); fixture('dist/media/car.png');
  fixture('dist/.private/a.html', 'SYNTHETIC_NOT_PUBLIC'); fixture('dist/assets/credentials.js', 'SYNTHETIC_NOT_PUBLIC');
  symlinkSync(path.join(root, '.private/receipt.html'), path.join(root, 'dist/assets/alias.js'));
});
afterAll(() => {
  // root is the exact mkdtemp directory created above, not user/project data.
  if (!root.startsWith(path.join(tmpdir(), 'carplayground-security-'))) throw Error('Unexpected fixture root');
  rmSync(root, { recursive: true, force: true });
});

function request(url: string): Promise<{ status: number; body: string }> {
  // node:http preserves encoded traversal rather than a fetch client's URL normalization.
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 5175, path: url, agent: false }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, body }));
    }).on('error', reject);
  });
}

describe('application-only HTTP policy', () => {
  it('allows required modules, Vite clients, media and /@fs dependency paths', () => {
    for (const url of ['/', '/@vite/client', '/@react-refresh', ...positive]) expect(isAllowedRequest(url, root), url).toBe(true);
    for (const url of positive) {
      expect(isAllowedRequest(url + '?raw&import&t=1', root), url).toBe(true);
      const physical = /^(?:\/media|\/references)\//.test(url) ? '/public' + url : url;
      expect(isAllowedRequest('/@fs/' + root + physical + '?v=1', root), url).toBe(true);
    }
  });
  it('denies private paths, arbitrary root files, encodings and symlink escapes regardless of queries', () => {
    for (const url of forbidden) for (const query of ['', '?raw', '?url&import&t=1']) {
      expect(isAllowedRequest(url + query, root), url + query).toBe(false);
      expect(isAllowedRequest('/@fs/' + root + url + query, root), url + query).toBe(false);
    }
    expect(isAllowedRequest('/@fs/etc/passwd', root)).toBe(false);
    expect(decodeRequestPath('//example.invalid/src/main.ts')).toBeUndefined();
  });
  it('preview cannot serve source, dependencies or even /@fs public files', () => {
    const dist = path.join(root, 'dist');
    for (const url of ['/', '/assets/app.js', '/media/car.png']) expect(isAllowedRequest(url, dist, true), url).toBe(true);
    for (const url of [...forbidden, ...positive.filter(url => url !== '/index.html' && !url.startsWith('/media/')), '/assets/alias.js', '/assets/credentials.js', '/@vite/client']) {
      expect(isAllowedRequest(url, dist, true), url).toBe(false);
    }
    expect(isAllowedRequest('/@fs/' + dist + '/assets/app.js', dist, true)).toBe(false);
  });
  it('ignores private receipts and trace/report trees in the watcher', () => {
    expect(privateWatchIgnored).toEqual(expect.arrayContaining(['**/.private/**', '**/trace/**', '**/traces/**', '**/test-results/**', '**/playwright-report/**']));
  });
});

describe('real dev/preview HTTP, explicit LAN binding retains isolation (port 5175)', () => {
  it('serves transformed source/client and public resources, never canaries', async () => {
    let server: ViteDevServer | undefined;
    try {
      server = await createServer({ root, cacheDir: path.join(root, 'node_modules/.vite-cache'), configFile: false, plugins: [devSecurity()], server: { host: '0.0.0.0', port: 5175, strictPort: true, fs: { allow: [root] } }, logLevel: 'silent' });
      await server.listen();
      for (const url of ['/', '/src/main.ts', '/@vite/client', '/media/car.png', '/@fs' + root + '/node_modules/.vite/deps/react.js']) {
        const response = await request(url); expect(response.status, url).toBe(200); expect(response.body).not.toContain('SYNTHETIC_NOT_PUBLIC');
      }
      const messages: string[] = [];
      const socket = new WebSocket(`ws://127.0.0.1:5175/?token=${server.config.webSocketToken}`, 'vite-hmr');
      socket.addEventListener('message', event => messages.push(String(event.data)));
      try {
        await expect.poll(() => messages.some(message => JSON.parse(message).type === 'connected')).toBe(true);
        fixture('src/main.ts', 'export const value: number = 2; if(import.meta.hot) import.meta.hot.accept();');
        await expect.poll(() => messages.some(message => JSON.parse(message).type === 'update')).toBe(true);
      } finally { socket.close(); }
      for (const url of forbidden) for (const target of [url + '?raw', '/@fs/' + root + url + '?import']) {
        const response = await request(target); expect(response.status, target).toBe(403); expect(response.body).toBe('Forbidden');
      }
    } finally { await server?.close(); }
  }, 30000);
  it('preview serves only built public artifacts without requiring a build', async () => {
    let server: PreviewServer | undefined;
    try {
      server = await preview({ root, configFile: false, plugins: [devSecurity()], preview: { host: '0.0.0.0', port: 5175, strictPort: true }, logLevel: 'silent' });
      for (const url of ['/', '/assets/app.js', '/media/car.png']) expect((await request(url)).status, url).toBe(200);
      for (const url of [...forbidden, '/src/main.ts', '/assets/credentials.js', '/assets/alias.js', '/@fs/' + root + '/src/main.ts']) {
        const response = await request(url); expect(response.status, url).toBe(403); expect(response.body).toBe('Forbidden');
      }
    } finally { await server?.close(); }
  }, 30000);
});
