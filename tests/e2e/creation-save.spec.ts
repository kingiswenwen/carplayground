import {test, expect} from '@playwright/test';

test('创作保存期间继续编辑，旧写入不能把新改动标成已保存 @smoke', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/play/A02');
  const board = page.getByRole('button', {name: '创作画纸，点击放图案，按回车添加图案'});
  await board.focus(); await board.press('Enter');
  // Hold a real native transaction so the app's next creation write waits.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('carplayground-local-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('creations', 'readwrite');
      const store = transaction.objectStore('creations');
      Reflect.set(window, '__holdCreationWrite', true);
      let started = false;
      const hold = () => {
        const read = store.get('__hold__');
        read.onsuccess = () => {
          if (!started) {started = true; resolve();}
          if (Reflect.get(window, '__holdCreationWrite')) hold();
        };
      };
      transaction.oncomplete = () => database.close();
      hold();
    };
  }));
  await page.getByRole('button', {name: '放进我的车库', exact: true}).click();
  await board.focus(); await board.press('Enter');
  await expect(board.locator('.art-mark')).toHaveCount(2);
  await page.evaluate(() => Reflect.set(window, '__holdCreationWrite', false));
  await expect(page.getByRole('button', {name: '放进我的车库', exact: true})).toBeEnabled();
  await expect(page.getByRole('status')).toContainText('还有新改动');
  await page.getByRole('button', {name: '放进我的车库', exact: true}).click();
  await expect(page.getByRole('button', {name: '已放进车库', exact: true})).toBeVisible();
  await page.goto('/#/garage');
  await page.reload();
  await expect(page.locator('.creation-card')).toHaveCount(1);
  await expect(page.locator('.creation-card .art-mark')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
