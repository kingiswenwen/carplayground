import {test,expect} from '@playwright/test';

function entry(id:string){return `<!doctype html><html><head><script type="module" src="/releases/${id}/assets/index.js"></script></head><body></body></html>`;}

test('检查更新区分当前页面与正式站，并保留本机数据和所在页面',async({page})=>{
 await page.goto('/#/parent');
 const section=page.getByRole('region',{name:'网站版本与更新'});
 await expect(section).toBeVisible();
 const loaded=await page.evaluate(()=>document.documentElement.dataset.appReleaseId!);
 await page.evaluate(()=>history.replaceState(null,'','/releases/old-bookmark/index.html#/parent'));
 await page.route('**/index.html',route=>route.fulfill({contentType:'text/html',body:entry(loaded)}));
 await section.getByRole('button',{name:'检查网站更新',exact:true}).click();
 await expect(section.getByRole('status')).toHaveText('当前页面已是正式站最新版本。');
 await expect(section.getByRole('button',{name:'重新打开最新版本'})).toHaveCount(0);
 await page.unroute('**/index.html');
 await page.route('**/index.html',route=>route.fulfill({contentType:'text/html',body:entry('app-new-production')}));
 await section.getByRole('button',{name:'检查网站更新',exact:true}).click();
 await expect(section.getByRole('status')).toContainText('正式站有新版本');
 await page.evaluate(()=>localStorage.setItem('release-update-preserve','saved'));
 await page.unroute('**/index.html');
 await section.getByRole('button',{name:'重新打开最新版本',exact:true}).click();
 await expect(page).toHaveURL(/carplayground-update=\d+#\/parent$/);
 expect(new URL(page.url()).pathname).toBe('/index.html');
 await expect(page.getByRole('region',{name:'网站版本与更新'})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('release-update-preserve'))).toBe('saved');
});

test('更新检查遇到网络故障仍可重试，不能误报为最新版本',async({page})=>{
 await page.goto('/#/parent');const section=page.getByRole('region',{name:'网站版本与更新'});
 await page.route('**/index.html',route=>route.abort());
 await section.getByRole('button',{name:'检查网站更新',exact:true}).click();
 await expect(section.getByRole('status')).toContainText('暂时无法核对正式站版本');
 await expect(section.getByRole('button',{name:'重新打开最新版本'})).toHaveCount(0);
 await expect(section.getByRole('button',{name:'检查网站更新',exact:true})).toBeEnabled();
});
