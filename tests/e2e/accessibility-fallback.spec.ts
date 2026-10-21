import {test, expect} from '@playwright/test';

test('@smoke 减少动画仍可完成地图进入、部件和照片拼装', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/#/explore');
  await expect(page.locator('.world-map .scene-art.art-ready')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.getByRole('link', {name: '进入汽车展厅', exact: true}).click();
  await page.getByRole('link', {name: '走近看车', exact: true}).click();
  await page.getByRole('button', {name: '车轮 wheel', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('本次探索记录已保存在这台设备');
  await page.goto('/#/play/T04');
  for (const part of ['车身', '车门', '前轮', '后轮']) {
    await page.getByRole('button', {name: `选择${part}零件`, exact: true}).click();
    await page.getByRole('button', {name: `安装${part}的位置`, exact: true}).click();
    await expect.poll(() => page.locator('.assembled-part').evaluateAll(elements => elements.flatMap(element => element.getAnimations()).filter(animation => animation.playState === 'running').length)).toBe(0);
  }
  await expect(page.locator('.assembled-part')).toHaveCount(4);
  await expect(page.getByRole('status')).toContainText('本次探索记录已保存在这台设备');
  await page.getByRole('button', {name: '拆开再装', exact: true}).click();
  await expect(page.locator('.assembled-part')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('@smoke 禁用脚本时静态说明与重新打开入口仍可见', async ({browser, baseURL}) => {
  const context = await browser.newContext({javaScriptEnabled: false});
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/#/explore`);
    // Playwright's text matcher omits noscript even when scripting is disabled.
    // Read the DOM text directly, then independently require a visible box.
    await expect.poll(() => page.locator('noscript').textContent()).toBe('请开启 JavaScript，才能看车和玩游戏。');
    await expect(page.locator('noscript')).toBeVisible();
    await expect(page.getByText('建议使用较新的 Safari、Chrome、Edge 或 Firefox。', {exact: true})).toBeVisible();
    await page.getByRole('link', {name: '重新打开汽车游乐园', exact: true}).click();
    await expect(page).toHaveURL(/\/index\.html#\/explore$/);
    await expect(page.locator('noscript')).toBeVisible();
  } finally {await context.close();}
});

test('@smoke 入口脚本网络失败保留静态重试，连接恢复后可打开', async ({page}) => {
  let unavailable = true;
  await page.route('**/*', route => unavailable && route.request().resourceType() === 'script' ? route.abort() : route.continue());
  const failed = page.waitForEvent('requestfailed', request => request.resourceType() === 'script');
  await page.goto('/#/explore');
  await failed;
  await expect(page.getByText('如果一直没有打开，请检查连接后再试一次。', {exact: true})).toBeVisible();
  unavailable = false;
  await page.getByRole('link', {name: '重新打开汽车游乐园', exact: true}).click();
  await expect(page.locator('.world-map .scene-art.art-ready')).toBeVisible();
  await expect(page.getByRole('link', {name: '进入汽车展厅', exact: true})).toBeVisible();
});

test('实际WebGL上下文丢失后保留已停车辆，点选可完成并只记一次', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#/play/M01');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByText('停车场正在准备…')).toBeHidden();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 270 * box.width / 960, box.y + 205 * box.height / 600);
  await page.mouse.click(box.x + 270 * box.width / 960, box.y + 438 * box.height / 600);
  await expect(page.getByText('1 / 2 辆已停好', {exact: true})).toBeVisible();
  await canvas.evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Actual WebGL context-loss extension is unavailable');
    extension.loseContext();
  });
  await expect(page.getByText('已为你换成轻松点选，玩法一样。', {exact: true})).toBeVisible();
  await expect(canvas).toHaveCount(0);
  await expect(page.getByRole('button', {name: '选择白色小车', exact: true})).toBeDisabled();
  await expect(page.getByRole('button', {name: '车位 1，已占用', exact: true})).toBeVisible();
  await page.getByRole('button', {name: '选择蓝色小车', exact: true}).click();
  await page.getByRole('button', {name: '车位 2，空位', exact: true}).dblclick();
  await expect(page.getByRole('heading', {level: 1})).toHaveText('每辆车都有自己的位置了！');
  await expect(page.getByRole('status')).toContainText('本次探索记录已保存在这台设备');
  await page.getByRole('link', {name: '回去看车', exact: true}).first().click();
  await page.goto('/#/parent');
  const event = page.waitForEvent('download');
  await page.getByRole('button', {name: '导出本机备份', exact: true}).click();
  const download = await event;
  const fs = await import('node:fs/promises');
  const backup = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
  expect(backup.sessions).toHaveLength(1);
  expect(backup.sessions[0]).toMatchObject({activityId: 'M01', state: 'completed'});
  expect(errors).toEqual([]);
});
