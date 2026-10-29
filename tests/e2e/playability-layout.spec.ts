import {test, expect} from '@playwright/test';
import {openTouch, dropTouch, completedTouch, touchCanvas, touchState} from './touch-helpers';

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

test('完成邀请动画从开始到结束都不撑宽手机页面 @smoke', async ({page}) => {
  test.setTimeout(60000);
  await page.emulateMedia({reducedMotion: 'no-preference'});
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({width, height: 844});
    await openTouch(page, 'M03');
    await page.getByRole('button', {name: '重新玩', exact: true}).click();
    await expect(page.locator('.touch-play')).toHaveAttribute('data-completed', 'false');
    await expect.poll(async () => (await touchState(page)).ready).toBe(true);
    // Pause from the moment the invitation mounts, including on a busy runner.
    await page.addStyleTag({content: '.next-destination { animation-play-state: paused !important; }'});
    for (let index = 0; index < 3; index++) await dropTouch(page, `car-${index}`, `bay-${index}`);
    await completedTouch(page);
    const destination = page.locator('.next-destination');
    for (const phase of [0, .25, .5, .75, .99, 1]) {
      const layout = await destination.evaluate((element, progress) => {
        const animation = element.getAnimations()[0];
        if (animation) {
          animation.pause();
          animation.currentTime = Number(animation.effect!.getTiming().duration) * progress;
        }
        const rect = element.getBoundingClientRect();
        return {animated: !!animation, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, left: rect.left, right: rect.right};
      }, phase);
      expect(layout.animated, `${width}px / animation ${phase}`).toBe(true);
      expect(layout.scrollWidth, `${width}px / animation ${phase}`).toBeLessThanOrEqual(layout.viewport);
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(layout.viewport);
    }
  }
});
