import {test, expect, type Page} from '@playwright/test';
import sharp from 'sharp';
import {dropTouch, completedTouch} from './touch-helpers';

async function renderedColors(page: Page) {
  const canvas = page.locator('canvas.touch-world-canvas');
  const {data, info} = await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const colors = new Set<number>();
  // Ignore rounded edges and the camera buttons, which remain visible even if
  // the WebGL drawing buffer has been cleared.
  for (let y = Math.floor(info.height * .15); y < info.height * .7; y += 3) {
    for (let x = Math.floor(info.width * .1); x < info.width * .9; x += 3) {
      const offset = (y * info.width + x) * info.channels;
      colors.add((data[offset] >> 5) * 64 + (data[offset + 1] >> 5) * 8 + (data[offset + 2] >> 5));
    }
  }
  return colors.size;
}

test('完成和横竖屏切换后，静止的立体场景仍有实际画面', async ({page}) => {
  test.setTimeout(90000);
  await page.setViewportSize({width: 1000, height: 760});
  await page.goto('/#/play/M01?car=CAR01');
  await expect(page.locator('canvas.touch-world-canvas')).toHaveAttribute('data-ready', 'true', {timeout: 45000});
  await dropTouch(page, 'car-0', 'bay-0');
  await dropTouch(page, 'car-1', 'bay-1');
  await completedTouch(page);
  // Inspect the retained scene after completion particles stop repainting it.
  await page.waitForTimeout(1400);
  await expect.poll(() => renderedColors(page), {timeout: 10000}).toBeGreaterThan(12);
  await page.setViewportSize({width: 390, height: 844});
  await expect(page.locator('canvas.touch-world-canvas')).toHaveAttribute('data-ready', 'true', {timeout: 45000});
  await page.waitForTimeout(1400);
  await expect.poll(() => renderedColors(page), {timeout: 10000}).toBeGreaterThan(12);
});
