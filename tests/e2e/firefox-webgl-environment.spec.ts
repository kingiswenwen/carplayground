import { test, expect } from '@playwright/test';
import sharp from 'sharp';

// A runner-environment gate, not a replacement for the 19 strict feature tests.
// No getContext overrides, fake renderer, or preference-only success criterion.
// Run with PLAYWRIGHT_FIREFOX_SOFTWARE_WEBGL=1 LIBGL_ALWAYS_SOFTWARE=1 under Xvfb.
test('Firefox software WebGL2 draws real pixels and a real Three scene @smoke', async ({ page, browserName, browser }, testInfo) => {
  test.skip(browserName !== 'firefox' || process.env.PLAYWRIGHT_FIREFOX_SOFTWARE_WEBGL !== '1',
    'Opt-in Firefox software WebGL environment gate; not part of normal Chromium/device coverage.');
  test.setTimeout(60000);
  const messages: string[] = [];
  page.on('console', message => messages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => messages.push(`pageerror: ${error.message}`));
  try {
    await page.goto('/#/parent');
    const webgl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 4;
      const gl = canvas.getContext('webgl2');
      if (!gl) return { available: false, renderer: '', version: '', pixel: [] as number[], error: -1 };
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      const version = String(gl.getParameter(gl.VERSION));
      gl.clearColor(0.25, 0.5, 0.75, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const pixel = new Uint8Array(4);
      gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const error = gl.getError();
      const result = { available: true, renderer, version, pixel: Array.from(pixel), error };
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return result;
    });
    console.log('Firefox real WebGL2 environment:', JSON.stringify({ browser: browser.version(), ...webgl }));
    await testInfo.attach('webgl2-environment', { body: JSON.stringify(webgl, null, 2), contentType: 'application/json' });
    expect(webgl.available, 'Runner must create a real WebGL2 context').toBe(true);
    expect(webgl.version).toContain('WebGL 2');
    expect(webgl.error, 'Real GPU readPixels must not produce a GL error').toBe(0);
    expect(webgl.pixel).toHaveLength(4);
    for (const [index, expected] of [64, 128, 191, 255].entries()) {
      expect(Math.abs(webgl.pixel![index] - expected), `clear/readPixels channel ${index}`).toBeLessThanOrEqual(1);
    }
    expect(webgl.renderer, 'This opt-in gate must actually exercise software GL').toMatch(/llvmpipe|softpipe|swrast|software/i);

    await page.goto('/#/play/E02?car=CAR01');
    const world = page.locator('canvas.touch-world-canvas');
    await expect(world).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
    const scene = await world.evaluate(canvas => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl2');
      const state = JSON.parse(canvas.getAttribute('data-state') || '{}');
      return { context: !!gl, lost: gl?.isContextLost(), triangles: state.triangles,
        actors: state.actors?.map((actor: { mesh: boolean; sourceCar: string }) => ({ mesh: actor.mesh, sourceCar: actor.sourceCar })) };
    });
    expect(scene.context).toBe(true);
    expect(scene.lost).toBe(false);
    expect(scene.triangles).toBeGreaterThan(100);
    expect(scene.actors.some((actor: { mesh: boolean; sourceCar: string }) => actor.mesh && actor.sourceCar === 'CAR01')).toBe(true);

    // Read the browser-composited canvas, not data-ready alone. WebGL defaults
    // to preserveDrawingBuffer=false, so a later readPixels could see a cleared
    // buffer even after a genuine frame. PNG decoding verifies actual output
    // without changing the app's GL attributes or hooking its render calls.
    const frame = await world.screenshot({ path: testInfo.outputPath('three-software-frame.png') });
    await testInfo.attach('three-software-frame', { body: frame, contentType: 'image/png' });
    const { data, info } = await sharp(frame).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const colors = new Map<number, number>();
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const key = ((data[offset] >> 3) << 10) | ((data[offset + 1] >> 3) << 5) | (data[offset + 2] >> 3);
      colors.set(key, (colors.get(key) || 0) + 1);
    }
    const pixels = info.width * info.height;
    const nonBackgroundPixels = pixels - Math.max(...colors.values());
    const frameEvidence = { ...scene, width: info.width, height: info.height, quantizedColors: colors.size, nonBackgroundPixels };
    console.log('Firefox real Three frame:', JSON.stringify(frameEvidence));
    await testInfo.attach('three-frame-evidence', { body: JSON.stringify(frameEvidence, null, 2), contentType: 'application/json' });
    expect(colors.size, 'A flat/blank canvas is not a rendered Three scene').toBeGreaterThan(32);
    expect(nonBackgroundPixels).toBeGreaterThan(pixels * 0.01);
  } finally {
    await testInfo.attach('browser-console', { body: messages.join('\n'), contentType: 'text/plain' });
  }
});
