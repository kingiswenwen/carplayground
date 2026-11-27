import { expect, test } from '@playwright/test';

test('手机返回小镇后保持原街区的位置和键盘焦点', async ({page}) => {
  await page.setViewportSize({width: 390, height: 780});
  await page.goto('/#/explore');
  await page.evaluate(() => document.fonts.ready);
  const place = page.getByRole('navigation', { name: '选择小镇地点' })
    .getByRole('link', { name: '故事画室' });
  await place.focus();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(300);
  await place.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('故事画室');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('link', { name: '回到小镇' }).click();
  await expect(place).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('故事画室');
});

test('从洗车返回看车时保留筛选', async ({page}) => {
  await page.goto('/#/cars');
  const search = page.getByRole('searchbox', { name: '查找车型或品牌' });
  await search.fill('保时捷');
  await page.getByRole('link', { name: '带它去洗车' }).click();
  await expect(page.locator('.touch-play')).toHaveAttribute('data-activity', 'H03');
  await page.getByRole('link', { name: '回到选车' }).click();
  await expect(search).toHaveValue('保时捷');
});

test('故事返回到原来的活动入口，等异步故事完成后恢复焦点', async ({page}) => {
  await page.setViewportSize({width: 390, height: 650});
  await page.goto('/#/stories/ST01');
  const invitation = page.getByRole('link', { name: /一起玩/ });
  await invitation.focus();
  await invitation.press('Enter');
  await expect(page.locator('.touch-play')).toBeVisible();
  await expect(page.getByRole('link', {name: '回到故事', exact: true})).toHaveCount(1);
  await page.goBack();
  await expect(invitation).toBeFocused();
});
