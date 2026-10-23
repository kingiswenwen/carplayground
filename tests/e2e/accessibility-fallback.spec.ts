import {test, expect} from '@playwright/test';

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
  await expect(page.getByRole('link', {name: '泡泡洗车屋', exact: true})).toBeVisible();
});
