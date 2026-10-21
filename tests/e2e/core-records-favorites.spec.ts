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

test('三项核心玩法初次存储失败仍可完成，原会话重试后只保存一次 @smoke', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === 'sessions' && Reflect.get(window, '__failCoreSave')) throw new DOMException('Simulated quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.goto('/#/cars');
  for (const id of ['E01', 'E02', 'M01']) {
    await page.evaluate(() => Reflect.set(window, '__failCoreSave', true));
    await page.goto(`/#/play/${id}`);
    if (id === 'E01') {
      const color = (await page.getByRole('heading', {level: 1}).innerText()).match(/红色|蓝色|白色/)![0];
      await page.getByRole('button', {name: `${color}的车`, exact: true}).click();
    } else if (id === 'E02') await page.getByRole('button', {name: '车轮 wheel', exact: true}).click();
    else {
      await page.getByRole('button', {name: '选择白色小车', exact: true}).click();
      await page.getByRole('button', {name: '车位 1，空位', exact: true}).click();
      await page.getByRole('button', {name: '选择蓝色小车', exact: true}).click();
      await page.getByRole('button', {name: '车位 2，空位', exact: true}).click();
    }
    await expect(page.getByRole('heading', {level: 1})).toHaveText(id === 'M01' ? '每辆车都有自己的位置了！' : '找到啦，真是个小发现！');
    await expect(page.getByRole('status')).toContainText('本次探索记录暂时没能保存');
    await page.evaluate(() => Reflect.set(window, '__failCoreSave', false));
    await page.getByRole('button', {name: '重试保存本次探索', exact: true}).click();
    await expect(page.getByRole('status')).toContainText('本次探索记录已保存在这台设备');
    const records = (await rows(page, 'sessions')).filter(record => record.activityId === id);
    expect(records).toHaveLength(1);
    expect(records[0].state).toBe('completed');
  }
  await page.getByRole('link', {name: '回去看车', exact: true}).first().click();
  await page.reload();
  const records = await rows(page, 'sessions');
  expect(records).toHaveLength(3);
  expect(records.every(record => record.state === 'completed')).toBe(true);
});

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
  await expect(page.getByRole('status')).toContainText('这次收藏没有保存');
  await expect(page.getByRole('button', {name: '我喜欢这辆车', exact: true})).toHaveAttribute('aria-pressed', 'false');
  expect(await rows(page, 'favorites')).toHaveLength(0);
  await page.evaluate(() => Reflect.set(window, '__failFavorite', false));
  await page.getByRole('button', {name: '我喜欢这辆车', exact: true}).click();
  await expect(page.getByRole('button', {name: '已放进车库', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', {name: '已放进车库', exact: true})).toBeVisible();
  // Init script turns the simulated failure back on after reload.
  await page.getByRole('button', {name: '已放进车库', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('这次取消收藏没有保存');
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
