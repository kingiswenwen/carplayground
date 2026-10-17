import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import phaserPackage from 'phaser/package.json' with { type: 'json' };
import { patchPhaserVisibility } from './scripts/phaser-visibility.ts';
const phaserVisibility = {
  name: 'phaser-owned-visibility-v1',
  transform(code: string, id: string) {
    if (id.split('?')[0].replaceAll('\\', '/').endsWith('/phaser/dist/phaser.esm.js')) {
      return { code: patchPhaserVisibility(code, phaserPackage.version), map: null };
    }
  },
};
export default defineConfig({
  plugins: [react(), { ...phaserVisibility, enforce: 'pre' }], base: './',
  // Apply the same ownership fix while retaining fast prebundled dev loading.
  optimizeDeps: { rolldownOptions: { plugins: [phaserVisibility] } },
  // Some WebKit versions retain a failed modulepreload resource even across a
  // reload (https://bugs.webkit.org/show_bug.cgi?id=270357). Native imports still
  // split routes, and a normal retry can fetch a previously failed chunk again.
  build: { target: 'es2020', modulePreload: false },
});
