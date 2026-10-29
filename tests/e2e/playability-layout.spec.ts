import {test, expect} from '@playwright/test';
import {openTouch, dropTouch, completedTouch, touchCanvas} from './touch-helpers';

for (const viewport of [{width: 667, height: 375}, {width: 844, height: 390}]) for (const mode of ['flat', 'three']) {
  test(`手机横屏 ${viewport.width}px ${mode} 的游戏场景够大，完成后仍能继续操作`, async ({page}, info) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    if (mode === 'flat') await openTouch(page, 'M01');
    else {
      await page.goto('/#/play/M01?car=CAR01');
      await expect(page.locator('canvas.touch-world-canvas')).toHaveAttribute('data-ready', 'true', {timeout: 45000});
    }
    const surface = mode === 'flat' ? touchCanvas(page) : page.locator('canvas.touch-world-canvas');
    await page.screenshot({path: info.outputPath('landscape-start.png')});
    const before = (await surface.boundingBox())!;
    expect(before.width).toBeGreaterThanOrEqual(380);
    expect(before.height).toBeGreaterThanOrEqual(240);
    expect(before.y + before.height).toBeLessThanOrEqual(viewport.height);
    await dropTouch(page, 'car-0', 'bay-0');
    await dropTouch(page, 'car-1', 'bay-1');
    await completedTouch(page);
    const after = (await surface.boundingBox())!;
    expect(after.width).toBeGreaterThanOrEqual(before.width * .95);
    const next = (await page.locator('.next-destination').boundingBox())!;
    expect(next.y + next.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path: info.outputPath('landscape-done.png')});
  });
}
