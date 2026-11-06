import {test,expect,type Page,type TestInfo} from '@playwright/test';
import fs from 'node:fs/promises';
import {localRows} from './touch-helpers';

// Playwright's fresh context contains synthetic data only; never use a real profile.
async function seed(page:Page,creations:number,observations:number,nickname:string){
  await page.evaluate(async({creations,observations,nickname})=>{
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('carplayground-local-v1');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const database=request.result,transaction=database.transaction(['profiles','creations','observations'],'readwrite');
        transaction.onerror=()=>{database.close();reject(transaction.error);};
        transaction.oncomplete=()=>{database.close();resolve();};
        for(const name of ['profiles','creations','observations'])transaction.objectStore(name).clear();
        transaction.objectStore('profiles').put({id:'default',nickname});
        const now='2026-11-06T00:00:00.000Z';
        for(let i=0;i<creations;i++)transaction.objectStore('creations').put({id:`synthetic-art-${i}`,kind:'poster',carId:'CAR01',background:'#ffffff',caption:'合成作品',marks:[],createdAt:now,version:1});
        for(let i=0;i<observations;i++)transaction.objectStore('observations').put({id:`synthetic-note-${i}`,activityId:'M01',text:'合'.repeat(500),createdAt:now});
      };
    });
  },{creations,observations,nickname});
  await page.reload();await expect(page.getByRole('heading',{name:'备份与恢复',exact:true})).toBeVisible();
}
async function saveDownload(page:Page,info:TestInfo,name:string,action:()=>Promise<unknown>){
  const pending=page.waitForEvent('download');await action();const file=await pending;
  expect(await file.failure()).toBeNull();const destination=info.outputPath(name);await file.saveAs(destination);
  return destination;
}

test('501幅作品及超过10MiB备份可通过家长页导入、下载前快照并反向恢复 @smoke',async({page},info)=>{
  test.setTimeout(120000);
  await page.goto('/#/parent');
  await expect(page.getByRole('heading',{name:'备份与恢复',exact:true})).toBeVisible();
  await seed(page,0,8000,'合成大档案');
  const large=await saveDownload(page,info,'synthetic-large.json',()=>page.getByRole('button',{name:'导出本机备份',exact:true}).click());
  expect((await fs.stat(large)).size).toBeGreaterThan(10*1024*1024);
  const exported=JSON.parse(await fs.readFile(large,'utf8'));
  expect(exported.observations).toHaveLength(8000);
  expect(exported.observations.at(-1).text).toBe('合'.repeat(500));
  await seed(page,501,0,'合成旧档案');
  await page.getByLabel('选择备份文件',{exact:true}).setInputFiles(large);
  await expect(page.getByRole('heading',{name:'导入前确认',exact:true})).toBeVisible();
  const previous=await saveDownload(page,info,'synthetic-before-import.json',()=>page.getByRole('button',{name:'替换并保存当前备份',exact:true}).click());
  await expect.poll(async()=>(await localRows(page,'observations')).length).toBe(8000);
  const old=JSON.parse(await fs.readFile(previous,'utf8'));
  expect(old.creations).toHaveLength(501);expect(old.profile.nickname).toBe('合成旧档案');
  const stored=await localRows(page,'recovery');expect(JSON.parse(stored[0].json as string)).toEqual(old);
  const recovery=await saveDownload(page,info,'synthetic-recovery.json',()=>page.getByRole('button',{name:'下载替换前备份',exact:true}).click());
  expect(JSON.parse(await fs.readFile(recovery,'utf8'))).toEqual(old);
  await page.getByLabel('选择备份文件',{exact:true}).setInputFiles(recovery);
  await expect(page.getByRole('heading',{name:'导入前确认',exact:true})).toBeVisible();
  const reversed=await saveDownload(page,info,'synthetic-reverse-before.json',()=>page.getByRole('button',{name:'替换并保存当前备份',exact:true}).click());
  await expect.poll(async()=>(await localRows(page,'creations')).length).toBe(501);
  expect(await localRows(page,'observations')).toHaveLength(0);
  expect((await localRows(page,'profiles'))[0].nickname).toBe('合成旧档案');
  expect(JSON.parse(await fs.readFile(reversed,'utf8')).observations).toHaveLength(8000);
});
