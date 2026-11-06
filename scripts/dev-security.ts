import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';

// This is an HTTP boundary, not a Git ignore rule. Adding a new application
// entry point requires reviewing it here; arbitrary repository files stay private.
const contentFiles = new Set([
  'r3.json', 'vehicle-identities.json', 'retired-car-previews.json',
  'vehicle-models.json', 'photo-sources.json', 'photo-view-sources.json',
]);
const moduleExtension = /\.(?:[cm]?js|[cm]?ts|jsx|tsx|css|wasm)$/i;
const dependencyExtension = /\.(?:[cm]?js|json|css|wasm|map)$/i;
const mediaExtension = /\.(?:webp|png|jpe?g|gif|svg|avif|ico|mp3|wav|ogg|m4a|mp4|webm|glb|gltf|bin|woff2?|ttf)$/i;
const privateName = /(?:^|[._-])(?:secret|secrets|credential|credentials|token|tokens|private|password|passwd|trace|traces|backup|backups|deployment|planning|logs?)(?:[._-]|$)/i;
const privateExtension = /\.(?:pem|key|p12|pfx|crt|cer|env|log|zip|tar|gz|sqlite|db|md|txt|ya?ml|toml|ini)$/i;

/** Reject ambiguous/multiply encoded paths rather than relying on whichever
 * decoding a later Vite middleware happens to perform. Query strings never
 * authorize a file (including ?raw, ?url, ?import and timestamp cache busters). */
export function decodeRequestPath(url: string): string | undefined {
  const raw = url.split('?')[0];
  if (!raw.startsWith('/') || raw.startsWith('//')) return;
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { return; }
  if (/%[\da-f]{2}/i.test(decoded) || /[\\\x00-\x1f\x7f?#]/.test(decoded)) return;
  if (decoded.split('/').some(segment => segment === '.' || segment === '..')) return;
  return decoded.replace(/\/{2,}/g, '/');
}

function isPrivate(relative: string, dependency = false): boolean {
  return relative.split('/').some(segment =>
    (segment.startsWith('.') && !(dependency && segment === '.vite')) ||
    (privateName.test(segment) && !(relative === 'src/services/backup.ts' && segment === 'backup.ts')) ||
    (!dependency && /secret|credential|password|passwd|(?:api|access|refresh)[_-]?key|(?:access|refresh|auth)[_-]?token/i.test(segment)) ||
    privateExtension.test(segment) ||
    /^(?:AGENTS|START_HERE)(?:\.|$)/i.test(segment) ||
    /^id_(?:rsa|ed25519|ecdsa)(?:\.|$)/i.test(segment),
  );
}
function inside(root: string, file: string): string | undefined {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) return;
  return relative;
}
function allowedRelative(relative: string, preview: boolean): boolean {
  const dependency = !preview && relative.startsWith('node_modules/');
  if (isPrivate(relative, dependency)) return false;
  if (relative === 'index.html') return true;
  if (preview) return /^(?:assets|media|references)\//.test(relative) &&
    (mediaExtension.test(relative) || /\.(?:js|css)$/.test(relative) || relative.endsWith('.parts.json'));
  if (relative === 'package.json') return true; // content-schema imports the app version.
  if (relative.startsWith('src/')) return moduleExtension.test(relative);
  if (relative.startsWith('content/')) return contentFiles.has(relative.slice(8));
  if (dependency) return dependencyExtension.test(relative);
  return /^(?:public\/)?(?:media|references)\//.test(relative) &&
    (mediaExtension.test(relative) || relative.endsWith('.parts.json'));
}

export function isAllowedRequest(url: string, root: string, preview = false): boolean {
  const decoded = decodeRequestPath(url);
  if (!decoded) return false;
  const pathname = decoded === '/' ? '/index.html' : decoded;
  if (!preview && ['/@vite/client', '/@vite/env', '/@react-refresh'].includes(pathname)) return true;
  let file: string;
  if (pathname.startsWith('/@fs/')) {
    if (preview) return false;
    const absolute = pathname.slice('/@fs/'.length);
    file = path.resolve(absolute.startsWith('/') ? absolute : '/' + absolute);
  } else {
    // Vite's /@id/ virtual module loader is not a general-purpose file gateway.
    if (pathname.startsWith('/@')) return false;
    file = path.resolve(root, '.' + pathname);
  }
  const relative = inside(root, file);
  if (relative === undefined || !allowedRelative(relative, preview)) return false;
  // Public URLs map into public/ during dev, not the repository root.
  if (!preview && /^(?:media|references)\//.test(relative)) file = path.join(root, 'public', relative);
  try {
    const resolved = realpathSync(file);
    const resolvedRelative = inside(realpathSync(root), resolved);
    return resolvedRelative !== undefined && allowedRelative(resolvedRelative, preview);
  } catch {
    // Fail closed for missing/unresolvable files, too. Never trust a symlink
    // target just because its requested alias looked like an application path.
    return false;
  }
}

export const privateWatchIgnored = [
  '**/.private/**', '**/.git/**', '**/.release-artifacts/**', '**/trace/**', '**/traces/**',
  '**/test-results/**', '**/playwright-report/**', '**/blob-report/**',
];

export function devSecurity(): Plugin {
  let root = '';
  let outDir = '';
  const guard = (directory: string, preview: boolean): Connect.NextHandleFunction => (req, res, next) => {
    if (isAllowedRequest(req.url ?? '', directory, preview)) return next();
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end('Forbidden'); // Never echo local paths, file contents, or credentials.
  };
  return {
    name: 'application-only-http-boundary',
    enforce: 'pre',
    configResolved(config) { root = config.root; outDir = path.resolve(root, config.build.outDir); },
    configureServer(server) { server.middlewares.use(guard(root, false)); },
    configurePreviewServer(server) { server.middlewares.use(guard(outDir, true)); },
  };
}
