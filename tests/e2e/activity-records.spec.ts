import {expect, test, type Page} from '@playwright/test';

async function rows(page: Page, table: string) {
  return page.evaluate(name => new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const request = indexedDB.open('carplayground-local-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const query = database.transaction(name).objectStore(name).getAll();
      query.onerror = () => {database.close(); reject(query.error);};
      query.onsuccess = () => {database.close(); resolve(query.result);};
    };
  }), table);
}

test('表达观察保存失败保留文字，重试后才能确认记录 @smoke', async ({page}) => {
  await page.addInitScript(() => {
    Reflect.set(window, '__failObservation', true);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === 'observations' && Reflect.get(window, '__failObservation')) throw new DOMException('Simulated quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.goto('/#/play/C01');
  const note = page.getByRole('textbox');
  await note.fill('看到车灯像一片叶子');
  await page.getByRole('button', {name: '我分享好啦', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('这句话暂时没能保存');
  await expect(note).toHaveValue('看到车灯像一片叶子');
  await expect(page.getByRole('heading', {level: 1})).not.toHaveText('谢谢你分享这个小发现！');
  expect(await rows(page, 'observations')).toHaveLength(0);
  await page.evaluate(() => Reflect.set(window, '__failObservation', false));
  await page.getByRole('button', {name: '重试保存这句话', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('本次探索记录已保存在这台设备');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('谢谢你分享这个小发现！');
  await expect.poll(async () => (await rows(page, 'observations'))[0]?.text).toBe('看到车灯像一片叶子');
  await page.goto('/#/parent');
  await page.reload();
  await expect(page.locator('.observations')).toContainText('看到车灯像一片叶子');
});

test('探索记录写入失败可重试，初次建档失败仍保留原会话信息 @smoke', async ({page}) => {
  await page.addInitScript(() => {
    Reflect.set(window, '__failSessions', true);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === 'sessions' && Reflect.get(window, '__failSessions')) throw new DOMException('Simulated quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.goto('/#/play/C01?car=CAR02');
  await page.getByRole('button', {name: '我分享好啦', exact: true}).click();
  await expect(page.getByRole('heading', {level: 1})).toHaveText('谢谢你分享这个小发现！');
  await expect(page.getByRole('status')).toContainText('本次探索记录暂时没能保存');
  await expect(page.getByRole('status')).not.toContainText('已保存在');
  expect(await rows(page, 'sessions')).toHaveLength(0);
  await page.evaluate(() => {Object.defineProperty(document, 'hidden', {configurable: true, value: true}); document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.getByRole('button', {name: '重试保存本次探索', exact: true})).toBeDisabled();
  await page.evaluate(() => {Object.defineProperty(document, 'hidden', {configurable: true, value: false}); document.dispatchEvent(new Event('visibilitychange'));});
  await page.getByRole('button', {name: '继续探索', exact: true}).click();
  await page.evaluate(() => Reflect.set(window, '__failSessions', false));
  await page.getByRole('button', {name: '重试保存本次探索', exact: true}).dblclick();
  await expect(page.getByRole('status')).toContainText('本次探索记录已保存在这台设备');
  const records = await rows(page, 'sessions');
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({activityId: 'C01', carIds: ['CAR02'], state: 'participated', summary: '现场表达：自由表达'});
  expect(new Date(String(records[0].endedAt)).getTime()).toBeGreaterThanOrEqual(new Date(String(records[0].startedAt)).getTime());
  await page.getByRole('link', {name: '回到探索', exact: true}).click();
  await page.reload();
  expect(await rows(page, 'sessions')).toEqual(records);
});

test('完成写入排队时离开，迟到结果不影响新活动且不被退出覆盖 @smoke', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/play/C01');
  await expect.poll(async () => (await rows(page, 'sessions')).length).toBe(1);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('carplayground-local-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result, transaction = database.transaction('sessions', 'readwrite'), store = transaction.objectStore('sessions');
      Reflect.set(window, '__holdSessionWrite', true);
      let started = false;
      const hold = () => {
        const read = store.get('__hold__');
        read.onsuccess = () => {
          if (!started) {started = true; resolve();}
          if (Reflect.get(window, '__holdSessionWrite')) hold();
        };
      };
      transaction.oncomplete = () => database.close();
      hold();
    };
  }));
  await page.getByRole('button', {name: '我分享好啦', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('正在保存本次探索记录');
  await page.getByRole('link', {name: '回到探索', exact: true}).click();
  await page.evaluate(() => {location.hash = '/play/C03';});
  await expect(page.getByRole('button', {name: '我分享好啦', exact: true})).toBeVisible();
  await page.evaluate(() => Reflect.set(window, '__holdSessionWrite', false));
  await expect.poll(async () => (await rows(page, 'sessions')).length).toBe(2);
  await expect(page.getByRole('heading', {level: 1})).not.toHaveText('谢谢你分享这个小发现！');
  await expect(page.getByRole('status')).not.toContainText('本次探索记录已保存在');
  await page.getByRole('button', {name: '我分享好啦', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('本次探索记录已保存在');
  const records = await rows(page, 'sessions');
  expect(records).toHaveLength(2);
  expect(records.map(record => [record.activityId, record.state]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([['C01', 'participated'], ['C03', 'participated']]);
  expect(new Set(records.map(record => record.id)).size).toBe(2);
});
