import fs from 'node:fs/promises';
import {test, expect} from '@playwright/test';

test('导入已提交但下载失败时仍刷新记录，并能重试下载原档案 @smoke', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/parent');
  await page.getByRole('textbox', {name: '档案昵称（可留空）'}).fill('替换前测试档案');
  await page.getByRole('button', {name: '保存昵称', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('档案已保存在这台设备');
  const fixture = {
    formatVersion: 1, exportedAt: new Date().toISOString(),
    profile: {id: 'default', nickname: '导入测试档案'},
    settings: {id: 'default', sound: false, difficulty: 'gentle', simple: false},
    favorites: [], recent: [], sessions: [], storyProgress: [], creations: [], observations: [],
  };
  await page.getByLabel('选择备份文件').setInputFiles({name: 'test-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture))});
  await expect(page.getByRole('heading', {name: '导入前确认'})).toBeVisible();
  await page.evaluate(() => {
    Reflect.set(window, '__originalBlobUrl', URL.createObjectURL);
    URL.createObjectURL = () => {throw new DOMException('Simulated download failure', 'NotSupportedError');};
  });
  await page.getByRole('button', {name: '替换并保存当前备份', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('备份导入完成');
  await expect(page.getByRole('status')).toContainText('仍保存在本机');
  await expect(page.getByRole('textbox', {name: '档案昵称（可留空）'})).toHaveValue('导入测试档案');
  await expect(page.getByRole('heading', {name: '导入前确认'})).toHaveCount(0);
  await page.evaluate(() => {URL.createObjectURL = Reflect.get(window, '__originalBlobUrl');});
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', {name: '下载替换前备份', exact: true}).click();
  const download = await downloaded;
  const recovery = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
  expect(recovery.profile.nickname).toBe('替换前测试档案');
  await page.reload();
  await expect(page.getByRole('textbox', {name: '档案昵称（可留空）'})).toHaveValue('导入测试档案');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
