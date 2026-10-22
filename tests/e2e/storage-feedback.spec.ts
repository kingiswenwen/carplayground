import {test, expect, type Route} from '@playwright/test';

test('故事保存失败不会声称已经保存，可重试并在刷新后恢复 @smoke', async ({page}) => {
  await page.addInitScript(() => {
    Reflect.set(window, '__failStoryWrite', true);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === 'storyProgress' && Reflect.get(window, '__failStoryWrite')) {
        throw new DOMException('Simulated quota failure', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  });
  await page.goto('/#/stories/ST01?step=3');
  await page.getByRole('button', {name: '故事看完啦', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('故事进度暂时没能保存');
  await expect(page.getByText('这段故事已经记在这台设备。', {exact: false})).toHaveCount(0);
  await expect(page.getByRole('button', {name: '故事的小脚印已记下'})).toHaveCount(0);
  await page.evaluate(() => Reflect.set(window, '__failStoryWrite', false));
  await page.getByRole('button', {name: '重试保存进度', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('这段故事已经记在这台设备');
  await expect(page.getByRole('button', {name: '故事的小脚印已记下'})).toBeVisible();
  // A real reload must recover the committed final frame. Read succeeds even
  // though the injected write failure is enabled again by the init script.
  await page.goto('/#/stories/ST01');
  await page.reload();
  await expect(page.locator('.story-chapter')).toHaveText('04');
});

test('加载中的语音关闭后不恢复旧请求，重新开启仍可播放', async ({page}) => {
  const pending: Route[] = [];
  const errors: string[] = [];
  let hold = true;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/media/**/*.mp3', route => {if (hold) pending.push(route); else void route.continue();});
  await page.goto('/#/play/E02');
  await page.getByRole('button', {name: '开启声音', exact: true}).click();
  await expect.poll(() => pending.length).toBeGreaterThan(0);
  const sounds = () => page.evaluate(() => (Reflect.get(window, 'Howler') as unknown as {_howls: unknown[]})._howls.length);
  await page.getByRole('button', {name: '关闭声音', exact: true}).click();
  await expect.poll(sounds).toBe(0);
  hold = false;
  await Promise.all(pending.map(route => route.continue().catch(() => {})));
  await page.waitForLoadState('networkidle');
  await expect.poll(sounds).toBe(0);
  await page.getByRole('button', {name: '开启声音', exact: true}).click();
  await expect.poll(() => page.evaluate(() => (Reflect.get(window, 'Howler') as unknown as {_howls: {playing: () => boolean}[]})._howls.filter(howl => howl.playing()).length)).toBe(1);
  await page.getByRole('link', {name: '回去看车', exact: true}).click();
  await expect.poll(sounds).toBe(0);
  expect(errors).toEqual([]);
});

test('故事进度写入等待时不提前换幕，显示后立即刷新仍停在同一幕 @smoke',async({page})=>{
 await page.goto('/#/stories/ST01');
 await expect(page.getByRole('heading',{level:1})).toHaveText('展厅开门啦');
 await page.evaluate(()=>new Promise<void>(resolve=>{
  Reflect.set(window,'__holdStoryTransaction',true);
  const request=indexedDB.open('carplayground-local-v1');
  request.onsuccess=()=>{
   const database=request.result;
   const transaction=database.transaction('storyProgress','readwrite');
   transaction.oncomplete=()=>database.close();
   const keep=()=>{
    const query=transaction.objectStore('storyProgress').get('ST01');
    query.onsuccess=()=>{resolve();if(Reflect.get(window,'__holdStoryTransaction'))keep();};
   };
   keep();
  };
 }));
 await page.getByRole('button',{name:'跳过玩法，继续故事',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('正在记下这一幕');
 await expect(page.getByRole('heading',{level:1})).toHaveText('展厅开门啦');
 await expect(page.getByRole('button',{name:'跳过玩法，继续故事',exact:true})).toBeDisabled();
 await page.evaluate(()=>Reflect.set(window,'__holdStoryTransaction',false));
 await expect(page.getByRole('heading',{level:1})).toHaveText('给朋友留个位置');
 await page.reload();
 await expect(page.getByRole('heading',{level:1})).toHaveText('给朋友留个位置');
});
