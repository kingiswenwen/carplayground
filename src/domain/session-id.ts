// LAN HTTP previews do not expose randomUUID on some browsers. Session IDs
// identify local attempts; they are never credentials or authentication tokens.
export function newSessionId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `session-${Date.now().toString(36)}-${Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('')}`;
}
