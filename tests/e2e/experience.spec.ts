import { test, expect, type Page } from '@playwright/test';

async function simpleParking(page: Page) {
  await page.goto('/#/parent');
  await expect(page.getByRole('button', { name: '开启声音' })).toBeEnabled();
  await page.getByLabel('优先点选停车').check();
  await page.goto('/#/play/M01');
  await expect(page.getByRole('button', { name: '选择白色小车' })).toBeVisible();
}
async function sessions(page: Page): Promise<{ state: string; hints: number; durationMs: number }[]> {
  return page.evaluate(() => new Promise(resolve => {
    const req = indexedDB.open('carplayground-local-v1');
    req.onsuccess = () => {
      const database = req.result;
      const rows = database.transaction('sessions').objectStore('sessions').getAll();
      rows.onsuccess = () => { resolve(rows.result); database.close(); };
    };
  }));
}

test('@smoke 安静进入、准确部件、收藏刷新与车库', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '安静地逛逛' }).click();
  await page.getByRole('link', { name: '看看这辆车' }).click();
  await page.getByRole('button', { name: '车轮 wheel', exact: true }).click();
  await expect(page.locator('.word-card strong')).toHaveText('wheel');
  await page.getByRole('button', { name: '车门 door', exact: true }).click();
  await expect(page.locator('.word-card strong')).toHaveText('door');
  await page.getByRole('button', { name: '我喜欢这辆车' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '已放进车库' })).toBeVisible();
  await page.getByRole('link', { name: '我的车库', exact: true }).click();
  await expect(page.locator('.garage-car h2')).toHaveText('Revuelto');
  expect(errors).toEqual([]);
});

test('@smoke 颜色每轮唯一目标、温和重试、提示与再次游玩', async ({ page }) => {
  await page.goto('/#/play/E01');
  const instruction = await page.getByRole('heading', { level: 1 }).innerText();
  const target = instruction.match(/(红色|蓝色|白色)/)![0];
  const options = page.getByRole('button', { name: /^(红色|蓝色|白色)的车$/ });
  await expect(options).toHaveCount(2);
  for (const option of await options.all()) if ((await option.getAttribute('aria-label')) !== `${target}的车`) { await option.click(); break; }
  await expect(page.getByRole('status')).toHaveText('再看看，也可以听一遍。');
  await page.getByRole('button', { name: '需要帮忙' }).click();
  await page.getByRole('button', { name: `${target}的车` }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('找到啦，真是个小发现！');
  await expect.poll(async () => (await sessions(page)).filter(s => s.state === 'completed').length).toBe(1);
  expect((await sessions(page))[0].hints).toBe(1);
  await page.getByRole('button', { name: '再玩一次' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/找找/);
  await expect.poll(async () => (await sessions(page)).length).toBe(2);
});

test('@smoke 点选停车唯一占位、双击不重复完成、退出保留结果', async ({ page }) => {
  await simpleParking(page);
  await page.getByRole('button', { name: '选择白色小车' }).click();
  await page.getByRole('button', { name: '车位 1，空位' }).click();
  await page.getByRole('button', { name: '选择蓝色小车' }).click();
  await page.getByRole('button', { name: '车位 1，已占用' }).click();
  await expect(page.getByRole('status')).toHaveText('这里已经有车了。');
  await page.getByRole('button', { name: '车位 2，空位' }).dblclick();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('每辆车都有自己的位置了！');
  await expect.poll(async () => (await sessions(page)).filter(s => s.state === 'completed').length).toBe(1);
  await page.getByRole('link', { name: '回去看车', exact: true }).first().click();
  expect((await sessions(page)).filter(s => s.state === 'completed')).toHaveLength(1);
});

test('部件任务完成一次，完成后仍可自由探索', async ({ page }) => {
  await page.goto('/#/play/E02');
  await page.getByRole('button', { name: '车门 door', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('找找车轮在哪里。');
  await page.getByRole('button', { name: '车轮 wheel', exact: true }).dblclick();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('找到啦，真是个小发现！');
  await page.getByRole('button', { name: '车灯 light', exact: true }).click();
  await expect(page.locator('.word-card strong')).toHaveText('light');
  await expect.poll(async () => (await sessions(page)).filter(s => s.state === 'completed').length).toBe(1);
});

test('Phaser 实际点选与拖放停车', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/play/M01');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByText('停车场正在准备…')).not.toBeVisible();
  const box = (await canvas.boundingBox())!;
  const xy = (x: number, y: number) => ({ x: box.x + x * box.width / 960, y: box.y + y * box.height / 600 });
  await page.mouse.click(xy(270, 150).x, xy(270, 150).y);
  await page.mouse.click(xy(270, 420).x, xy(270, 420).y);
  await expect(page.getByText('1 / 2 辆已停好')).toBeVisible();
  await page.mouse.move(xy(690, 150).x, xy(690, 150).y); await page.mouse.down();
  await page.mouse.move(xy(690, 420).x, xy(690, 420).y, { steps: 12 }); await page.mouse.up();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('每辆车都有自己的位置了！');
  expect(errors).toEqual([]);
});

test('无 WebGL 自动降级并能完成停车', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).includes('webgl')) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto('/#/play/M01');
  await page.getByRole('button', { name: '选择白色小车' }).click();
  await page.getByRole('button', { name: '车位 1，空位' }).click();
  await page.getByRole('button', { name: '选择蓝色小车' }).click();
  await page.getByRole('button', { name: '车位 2，空位' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('每辆车都有自己的位置了！');
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('Phaser 资源模块加载失败会退回点选', async ({ page }) => {
  await page.route('**/node_modules/.vite/deps/phaser*', route => route.abort());
  await page.goto('/#/play/M01');
  await expect(page.getByRole('button', { name: '选择白色小车' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('已为你换成轻松点选，玩法一样。')).toBeVisible();
});

test('隐藏后暂停，回来需主动继续', async ({ page }) => {
  await simpleParking(page);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('heading', { name: '休息一下，再出发' })).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('heading', { name: '休息一下，再出发' })).toBeVisible();
  await page.getByRole('button', { name: '继续探索' }).click();
  await page.getByRole('button', { name: '选择白色小车' }).click();
  await page.getByRole('button', { name: '车位 1，空位' }).click();
  await expect(page.getByText('1 / 2 辆已停好')).toBeVisible();
});

test('图片失败可重试，加载失败时不显示虚假热点', async ({ page }) => {
  let fail = true;
  await page.route('**/media/revuelto-white.webp*', route => fail ? route.abort() : route.continue());
  await page.goto('/#/cars/CAR01');
  await expect(page.getByText('这张图片还没到，再试一次')).toBeVisible();
  await expect(page.locator('.hotspot')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: '重新加载' }).click();
  await expect(page.locator('.hotspot')).toHaveCount(3);
});

test('图片失败时颜色与停车不接受空图答案，重试后恢复', async ({ page }) => {
  let fail = true;
  await page.route('**/media/*.webp*', route => fail ? route.abort() : route.continue());
  await page.goto('/#/play/E01');
  const target = (await page.getByRole('heading', { level: 1 }).innerText()).match(/(红色|蓝色|白色)/)![0];
  await expect(page.getByRole('button', { name: `${target}的车` })).toBeDisabled();
  await expect(page.getByRole('button', { name: '重新加载' })).toHaveCount(2);
  fail = false;
  await page.getByRole('button', { name: '重新加载' }).first().click();
  await expect(page.locator('.color-option .car-image.ready')).toHaveCount(1);
  await expect(page.getByRole('button', { name: `${target}的车` })).toBeDisabled();
  await page.getByRole('button', { name: '重新加载' }).click();
  await page.getByRole('button', { name: `${target}的车` }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('找到啦，真是个小发现！');
  await page.goto('/#/parent');
  await page.getByLabel('优先点选停车').check();
  fail = true;
  await page.goto('/#/play/M01');
  await expect(page.getByRole('button', { name: '选择白色小车' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '选择蓝色小车' })).toBeDisabled();
});

test('存储不可用时继续玩，家长区明确提示', async ({ page }) => {
  await page.addInitScript(() => { IDBFactory.prototype.open = function () { throw new DOMException('Storage denied', 'SecurityError'); }; });
  await page.goto('/#/play/E02');
  await page.getByRole('button', { name: '车轮 wheel', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('找到啦，真是个小发现！');
  await page.goto('/#/parent');
  await expect(page.getByRole('alert')).toContainText('本次记录暂时无法保存');
});

test('音频失败不阻塞玩法，可重听重试', async ({ page }) => {
  await page.route('**/media/*.mp3', route => route.abort());
  await page.goto('/#/play/E02');
  await page.getByRole('button', { name: '开启声音' }).click();
  await expect(page.locator('.audio-notice')).toBeVisible();
  await page.getByRole('button', { name: '车轮 wheel', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('找到啦，真是个小发现！');
  await page.getByRole('link', { name: '回去看车', exact: true }).first().click();
  await expect(page.locator('.audio-notice')).toHaveCount(0);
});

test('声音可播放且快速重听、退出后无叠播', async ({ page }) => {
  await page.goto('/#/play/E02');
  await page.getByRole('button', { name: '开启声音' }).click();
  const soundCount = () => page.evaluate(() => {
    const howler = Reflect.get(window, 'Howler') as unknown as { _howls: { playing: () => boolean }[] };
    return howler._howls.filter(h => h.playing()).length;
  });
  await expect.poll(soundCount).toBe(1);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: '重听', exact: true }).click();
  await expect.poll(soundCount).toBe(1);
  await page.getByRole('link', { name: '回去看车', exact: true }).click();
  await expect.poll(soundCount).toBe(0);
  await expect(page.locator('.audio-notice')).toHaveCount(0);
});

test('20 次进入退出停车后仅一个画布，无遗留会话', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/cars/CAR01');
  for (let i = 0; i < 20; i++) {
    await page.getByRole('link', { name: /小车回家/ }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByText('停车场正在准备…')).not.toBeVisible();
    await page.getByRole('link', { name: '回去看车', exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
  }
  await expect.poll(async () => (await sessions(page)).filter(s => s.state === 'exited').length).toBe(20);
  expect(errors).toEqual([]);
});

test('局域网 HTTP 缺少 randomUUID 时仍能完成活动', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
  await page.goto('/#/play/E02');
  await page.getByRole('button', { name: '车轮 wheel', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('找到啦，真是个小发现！');
  await expect.poll(async () => (await sessions(page)).filter(s => s.state === 'completed').length).toBe(1);
});

test('手机窄屏默认点选，旋转后保留已停车辆', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/play/M01');
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: '选择白色小车' }).click();
  await page.getByRole('button', { name: '车位 1，空位' }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByText('1 / 2 辆已停好')).toBeVisible();
  await page.getByRole('button', { name: '选择蓝色小车' }).click();
  await page.getByRole('button', { name: '车位 2，空位' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('每辆车都有自己的位置了！');
});

test('响应式宽度、深链接、键盘家长入口与截图', async ({ page }) => {
  test.setTimeout(90000);
  for (const width of [320, 360, 390, 768, 820, 1024, 1180, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    for (const route of ['/cars', '/cars/CAR01', '/play/E01', '/play/M01']) {
      await page.goto(`/#${route}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (route === '/cars/CAR01') {
        await expect(page.locator('.hotspot')).toHaveCount(3);
        for (const hotspot of await page.locator('.hotspot').all()) {
          const box = (await hotspot.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(48); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
        }
      }
    }
  }
  await page.goto('/#/cars'); await page.screenshot({ path: 'test-results/showroom-desktop.png', fullPage: true });
  await page.goto('/#/cars/CAR01'); await expect(page.locator('.hotspot')).toHaveCount(3); await page.screenshot({ path: 'test-results/detail-desktop.png', fullPage: true });
  await page.goto('/#/play/M01'); await expect(page.getByText('停车场正在准备…')).not.toBeVisible(); await page.screenshot({ path: 'test-results/parking-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/#/cars'); await page.screenshot({ path: 'test-results/showroom-mobile.png', fullPage: true });
  const parent = page.getByRole('button', { name: '家长设置，长按两秒或按回车进入' }); await parent.focus(); await parent.press('Enter');
  await expect(page.getByRole('heading', { name: '陪伴小小的探索' })).toBeVisible();
});
