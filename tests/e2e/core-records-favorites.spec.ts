import {expect, test, type Page} from '@playwright/test';
async function rows(page: Page, table: string) {
  return page.evaluate(name => new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const request = indexedDB.open('carplayground-local-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result, query = database.transaction(name).objectStore(name).getAll();
      query.onerror = () => {database.close(); reject(query.error);};
      query.onsuccess = () => {database.close(); resolve(query.result);};
    };
  }), table);
}

test('收藏写入和取消失败保留已确认状态，重试刷新与车库一致 @smoke', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.addInitScript(() => {
    Reflect.set(window, '__failFavorite', true);
    for (const method of ['put', 'delete'] as const) {
      const original = IDBObjectStore.prototype[method];
      Reflect.set(IDBObjectStore.prototype, method, function (this: IDBObjectStore, ...args: unknown[]) {
        if (this.name === 'favorites' && Reflect.get(window, '__failFavorite')) throw new DOMException('Simulated quota', 'QuotaExceededError');
        return Reflect.apply(original, this, args);
      });
    }
  });
  await page.goto('/#/cars/CAR02');
  await page.getByRole('button', {name: '我喜欢这辆车', exact: true}).click();
  await expect(page.locator('.activity-feedback')).toContainText('这次收藏没有保存');
  await expect(page.getByRole('button', {name: '我喜欢这辆车', exact: true})).toHaveAttribute('aria-pressed', 'false');
  expect(await rows(page, 'favorites')).toHaveLength(0);
  await page.evaluate(() => Reflect.set(window, '__failFavorite', false));
  await page.getByRole('button', {name: '我喜欢这辆车', exact: true}).click();
  await expect(page.getByRole('button', {name: '已放进车库', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', {name: '已放进车库', exact: true})).toBeVisible();
  // Init script turns the simulated failure back on after reload.
  await page.getByRole('button', {name: '已放进车库', exact: true}).click();
  await expect(page.locator('.activity-feedback')).toContainText('这次取消收藏没有保存');
  await expect(page.getByRole('button', {name: '已放进车库', exact: true})).toHaveAttribute('aria-pressed', 'true');
  expect(await rows(page, 'favorites')).toHaveLength(1);
  await page.getByRole('link', {name: '我的车库', exact: true}).click();
  await expect(page.locator('.garage-car')).toHaveCount(1);
  await page.goto('/#/cars/CAR02');
  await page.evaluate(() => Reflect.set(window, '__failFavorite', false));
  await page.getByRole('button', {name: '已放进车库', exact: true}).click();
  await expect(page.getByRole('button', {name: '我喜欢这辆车', exact: true})).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.getByRole('button', {name: '我喜欢这辆车', exact: true})).toBeVisible();
  expect(await rows(page, 'favorites')).toHaveLength(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('收藏排队时切换车型，两辆车的确认结果都保留且不能重复提交 @smoke', async ({page}) => {
  await page.goto('/#/cars/CAR02');
  await expect(page.getByRole('button', {name: '我喜欢这辆车', exact: true})).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('carplayground-local-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result, transaction = database.transaction('favorites', 'readwrite'), store = transaction.objectStore('favorites');
      Reflect.set(window, '__holdFavorites', true);
      let started = false;
      const hold = () => {
        const read = store.get('__hold__');
        read.onsuccess = () => {
          if (!started) {started = true; resolve();}
          if (Reflect.get(window, '__holdFavorites')) hold();
        };
      };
      transaction.oncomplete = () => database.close();
      hold();
    };
  }));
  await page.getByRole('button', {name: '我喜欢这辆车', exact: true}).click();
  await expect(page.getByRole('button', {name: '正在保存…', exact: true})).toBeDisabled();
  await page.evaluate(() => {location.hash = '/cars/CAR03';});
  await page.getByRole('button', {name: '我喜欢这辆车', exact: true}).click();
  await expect(page.getByRole('button', {name: '正在保存…', exact: true})).toBeDisabled();
  await page.evaluate(() => Reflect.set(window, '__holdFavorites', false));
  await expect(page.getByRole('button', {name: '已放进车库', exact: true})).toBeVisible();
  await page.getByRole('link', {name: '我的车库', exact: true}).click();
  await expect(page.locator('.garage-car')).toHaveCount(2);
  expect((await rows(page, 'favorites')).map(record => record.carId).sort()).toEqual(['CAR02', 'CAR03']);
  await page.reload();
  await expect(page.locator('.garage-car')).toHaveCount(2);
});
