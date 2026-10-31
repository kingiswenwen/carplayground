import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const vehicleModels=JSON.parse(fs.readFileSync('content/vehicle-models.json','utf8')) as {id:string}[];

for(const width of [320,768,1440])test(`世界车库在 ${width}px 可搜索、筛选、打开新增车型和恢复空结果`,async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:1000});await page.goto('/#/cars');
 const query=page.getByRole('searchbox',{name:'查找车型或品牌'}),cards=page.locator('.garage-paged .car-gallery-card');
 await expect(page.locator('.garage-count')).toContainText(`${vehicleModels.length} 款立体车`);
 expect(await query.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
 await page.getByRole('combobox',{name:'按品牌发源地筛选'}).selectOption('中国');
 await expect(cards).toHaveCount(2);await query.fill('seal');await expect(cards).toHaveCount(1);
 await expect(cards.locator('img')).toHaveAttribute('src',/catalog-illustrations\/car160-side\.webp/);
 await cards.first().click();await expect(page.locator('.vehicle-webgl[data-car=CAR160]')).toHaveAttribute('data-ready','true',{timeout:45000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`.private/catalog-expansion/world-catalog-${width}.png`,fullPage:true});
 await query.fill('不存在的车型');await expect(cards).toHaveCount(0);await expect(page.locator('.garage-empty')).toBeVisible();
 await expect(page.getByRole('button',{name:'下一组跑车'})).toHaveCount(0);
 await page.getByRole('button',{name:'清除筛选',exact:true}).click();await expect(cards).toHaveCount(8);
 await expect(query).toHaveValue('');await expect(page.getByRole('combobox',{name:'按品牌发源地筛选'})).toHaveValue('all');
 await query.fill('megane');await expect(cards).toHaveCount(1);await expect(cards.first()).toContainText('Mégane');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
