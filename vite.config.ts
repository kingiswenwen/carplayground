import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()], base: './',
  // Some WebKit versions retain a failed modulepreload resource even across a
  // reload (https://bugs.webkit.org/show_bug.cgi?id=270357). Native imports still
  // split routes, and a normal retry can fetch a previously failed chunk again.
  build: { target: 'es2020', modulePreload: false },
});
