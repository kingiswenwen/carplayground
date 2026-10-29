import {test, expect, type Page} from '@playwright/test';
import {dropTouch, completedTouch} from './touch-helpers';

const canvas = (page: Page) => page.locator('canvas.touch-world-canvas');
const state = async (page: Page) => JSON.parse((await canvas(page).getAttribute('data-state'))!);
async function open(page: Page, id: string) {
  await page.goto(`/#/play/${id}?car=CAR01`);
  await expect(canvas(page)).toHaveAttribute('data-ready', 'true', {timeout: 45000});
}
async function tap(page: Page, point: {x: number; y: number}) {
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + point.x * box.width, box.y + point.y * box.height);
}

for (const viewport of [{width: 390, height: 844}, {width: 768, height: 1024}, {width: 1440, height: 1000}]) {
  test(`立体装车在 ${viewport.width}px 可点选零件再点可见插槽放置`, async ({page}, info) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    await open(page, 'T04');
    await page.screenshot({path: info.outputPath('assembly-before.png')});
    for (const id of ['body', 'wheel-0', 'wheel-1']) {
      let snapshot = await state(page);
      await tap(page, snapshot.actors.find((actor: any) => actor.id === id).screen);
      await expect.poll(async () => (await state(page)).selected).toBe(id);
      snapshot = await state(page);
      await tap(page, snapshot.targetScreens.find((target: any) => target.id === id).screen);
      await expect.poll(async () => (await state(page)).items.find((item: any) => item.id === id).placed, {message: `${id} placed at visible socket`}).toBe(true);
    }
    await expect(page.locator('.touch-play')).toHaveAttribute('data-completed', 'true');
  });
}

test('转动观察后横竖屏切换，按钮状态与触碰操控保持一致', async ({page}) => {
  test.setTimeout(90000);
  await page.setViewportSize({width: 1000, height: 760});
  await open(page, 'M01');
  await page.getByRole('button', {name: '转动看看立体场景'}).click();
  await page.setViewportSize({width: 390, height: 844});
  await expect(canvas(page)).toHaveAttribute('data-ready', 'true', {timeout: 45000});
  const back = page.getByRole('button', {name: '回到触碰玩法'});
  await expect(back).toBeVisible();
  const inOrbit = await state(page);
  await tap(page, inOrbit.actors.find((actor: any) => actor.id === 'car-0').screen);
  expect((await state(page)).selected).toBeNull();
  await back.click();
  const snapshot = await state(page);
  await tap(page, snapshot.actors.find((actor: any) => actor.id === 'car-0').screen);
  await expect.poll(async () => (await state(page)).selected).toBe('car-0');
});

test('立体颜色框随着红蓝白任务换色，点选点放可以完整配对', async ({page}, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({width: 390, height: 844});
  await open(page, 'E01');
  for (const [id, next] of [['red', '#4e9cce'], ['blue', '#faf8e9'], ['white', '#faf8e9']]) {
    let snapshot = await state(page);
    await tap(page, snapshot.actors.find((actor: any) => actor.id === id).screen);
    await expect.poll(async () => (await state(page)).selected).toBe(id);
    snapshot = await state(page);
    await tap(page, snapshot.targetScreens.find((target: any) => target.id === 'color-home').screen);
    await expect.poll(async () => (await state(page)).items.find((item: any) => item.id === id).placed).toBe(true);
    if (id !== 'white') {
      await expect.poll(async () => (await state(page)).targetScreens[0].color).toBe(next);
      await page.screenshot({path: info.outputPath(`color-after-${id}.png`)});
    }
  }
  await expect(page.locator('.touch-play')).toHaveAttribute('data-completed', 'true');
});

test('桥板支持点选点放，短板不通过，换长板后小车能过桥', async ({page}) => {
  test.setTimeout(90000);
  await open(page, 'T02');
  for (const id of ['short', 'long']) {
    await expect.poll(async () => (await state(page)).recovering).toBe(false);
    let snapshot = await state(page);
    await tap(page, snapshot.actors.find((actor: any) => actor.id === id).screen);
    await expect.poll(async () => (await state(page)).selected).toBe(id);
    snapshot = await state(page);
    await tap(page, snapshot.targetScreens[0].screen);
    if (id === 'short') expect((await state(page)).completed).toBe(false);
  }
  await expect(page.locator('.touch-play')).toHaveAttribute('data-completed', 'true', {timeout: 25000});
});

test('WebGL不可用时自动切回平面，停车仍可完整玩完', async ({page}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Reflect.set(HTMLCanvasElement.prototype, 'getContext', function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return type.startsWith('webgl') ? null : Reflect.apply(original, this, [type, ...args]);
    });
  });
  await page.goto('/#/play/M01?car=CAR01');
  await expect(page.locator('.touch-canvas[data-presentation=flat]')).toBeVisible();
  await dropTouch(page, 'car-0', 'bay-0');
  await dropTouch(page, 'car-1', 'bay-1');
  await completedTouch(page);
});

test('顺序卡的放置提示跟随实际规则，不提前提示第三步', async ({page}) => {
  await open(page, 'C02');
  let snapshot = await state(page);
  await tap(page, snapshot.actors.find((actor: any) => actor.id === 'step-2').screen);
  await expect.poll(async () => (await state(page)).selected).toBe('step-2');
  await expect.poll(async () => (await state(page)).targetScreens.find((target: any) => target.id === 'step-2').color).toBe('#fff5da');
  snapshot = await state(page);
  await tap(page, snapshot.actors.find((actor: any) => actor.id === 'step-0').screen);
  await expect.poll(async () => (await state(page)).selected).toBe('step-0');
  await expect.poll(async () => (await state(page)).targetScreens.find((target: any) => target.id === 'step-0').color).toBe('#f1bd58');
});
