import {test, expect} from '@playwright/test';

test('@smoke 首次加载只显示小车，不闪出浏览器说明或重试提示', async ({page}) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/*', async route => {
    if (route.request().resourceType() === 'script') await held;
    await route.continue();
  });
  try {
    await page.goto('/#/explore', {waitUntil: 'commit'});
    await expect(page.getByRole('status', {name: '正在准备小车'})).toBeVisible();
    await expect(page.locator('#entry-retry')).toBeHidden();
    await expect.poll(() => page.locator('body').innerText()).toBe('');
  } finally { release(); }
  await expect(page.getByRole('link', {name: '泡泡洗车屋', exact: true})).toBeVisible();
  await expect(page.locator('#entry-loading')).toHaveCount(0);
});

test('@smoke 禁用脚本时开启脚本说明与重新打开入口仍可见', async ({browser, baseURL}) => {
  const context = await browser.newContext({javaScriptEnabled: false});
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/#/explore`);
    // Playwright's text matcher omits noscript even when scripting is disabled.
    // Read the DOM text directly, then independently require a visible box.
    await expect(page.locator('noscript p')).toHaveText('请开启 JavaScript，才能看车和玩游戏。');
    await expect(page.locator('noscript')).toBeVisible();
    await expect(page.locator('#entry-loading')).toBeHidden();
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
  await expect(page.getByText('连接暂时中断，请再试一次。', {exact: true})).toBeVisible();
  await expect(page.locator('#entry-loading')).toBeHidden();
  unavailable = false;
  await page.getByRole('link', {name: '重新打开汽车游乐园', exact: true}).click();
  await expect(page.getByRole('link', {name: '泡泡洗车屋', exact: true})).toBeVisible();
});
