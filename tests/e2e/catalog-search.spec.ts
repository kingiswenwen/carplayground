import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const vehicleModels=JSON.parse(fs.readFileSync('content/vehicle-models.json','utf8')) as {id:string}[];

for(const width of [320,768,1440])test(`世界车库在 ${width}px 可搜索、筛选、打开新增车型和恢复空结果`,async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:1000});await page.goto('/#/cars');
 const query=page.getByRole('searchbox',{name:'查找车型或品牌'}),cards=page.locator('.garage-paged .car-gallery-card');
 await expect(page.locator('.garage-count')).toContainText(`${vehicleModels.length} 款立体车`);
 expect(await query.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
 await page.getByRole('combobox',{name:'按品牌发源地筛选'}).click();await page.getByRole('option',{name:'中国',exact:true}).click();
 await expect(cards).toHaveCount(2);await expect(page.locator('.garage-pager')).toHaveCount(0);await query.fill('seal');await expect(cards).toHaveCount(1);
 await expect(cards.getByRole('img',{name:/同车型独立立体模型渲染图/})).toHaveAttribute('src',/rendered-cars\/car160-front-left\.webp/);
 await cards.first().click();await expect(page.locator('.vehicle-webgl[data-car=CAR160]')).toHaveAttribute('data-ready','true',{timeout:45000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath(`catalog-expansion/world-catalog-${width}.png`),fullPage:true});
 await query.fill('不存在的车型');await expect(cards).toHaveCount(0);await expect(page.locator('.garage-empty')).toBeVisible();
 await expect(page.getByRole('button',{name:'下一组跑车'})).toHaveCount(0);
 await page.getByRole('button',{name:'清除筛选',exact:true}).click();await expect(cards).toHaveCount(8);
 await expect(query).toHaveValue('');await expect(page.getByRole('combobox',{name:'按品牌发源地筛选'})).toHaveText('世界各地');
 await query.fill('audi r8 coupe');await expect(cards).toHaveCount(1);await expect(cards.first()).toContainText('R8 Coupé');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('任意选中的车可以直接收藏，在车库打开并取消 @smoke',async({page})=>{
 await page.goto('/#/cars');
 await page.getByRole('searchbox',{name:'查找车型或品牌'}).fill('seal');
 await page.locator('.garage-paged button').click();
 await page.getByRole('button',{name:'收藏这辆车',exact:true}).click();
 await expect(page.getByRole('button',{name:'取消收藏',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('link',{name:'我的车库',exact:true}).click();
 const saved=page.getByRole('link',{name:/看看 .*Seal/i});
 await expect(saved).toHaveAttribute('href','#/cars/CAR160');
 await saved.click();
 await page.getByRole('button',{name:'取消收藏',exact:true}).click();
 await expect(page.getByRole('button',{name:'收藏这辆车',exact:true})).toHaveAttribute('aria-pressed','false');
 await page.getByRole('link',{name:'回到选车',exact:true}).click();
 await expect(page.locator('.vehicle-views')).toHaveAttribute('data-car','CAR160');
 await expect(page.getByRole('button',{name:'收藏这辆车',exact:true})).toHaveAttribute('aria-pressed','false');
});
