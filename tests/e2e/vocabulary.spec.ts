import { test, expect, type Page, type Browser } from '@playwright/test';
import fs from 'node:fs';
const content=JSON.parse(fs.readFileSync(new URL('../../content/r3.json',import.meta.url),'utf8'));
const groups:Record<string,string[]>={C01:['car','window','mirror','roof'],E02:['wheel','door','light'],E01:['red','blue','white'],A02:['yellow','green','black'],M01:['one','two'],M02:['three','four','five'],E03:['go','stop'],T01:['open','close','seat'],M03:['big','small'],S01:['fast','slow'],L01:['sun','rain','water'],H01:['tree','leaf']};
const planned=Object.values(groups).flat().sort();
if(JSON.stringify(planned)!==JSON.stringify(content.vocabulary.map((v:{id:string})=>v.id).sort()))throw Error('词汇验收必须覆盖实际启用的每一个词');
for(const [activity,words]of Object.entries(groups))for(const word of words)if(content.vocabulary.find((v:{id:string})=>v.id===word)?.activityId!==activity)throw Error(`词汇画面所属活动不一致：${word}`);
async function open(page:Page,id:string){await page.goto(`/#/play/${id}`);await expect(page.locator('.play-surface,.discovery-surface')).toBeVisible();const sound=page.getByRole('button',{name:'开启声音',exact:true});if(await sound.count())await sound.click();}
async function hear(page:Page,ids:string[],action:()=>Promise<unknown>){
 const requests=ids.map(id=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith(`/${id}.mp3`),{timeout:15000}));
 await action();for(const response of await Promise.all(requests))expect(response.status()).toBe(200);
}
async function seeded(browser:Browser,value:number,work:(page:Page)=>Promise<void>){const context=await browser.newContext({baseURL:String(test.info().project.use.baseURL)});try{await context.addInitScript(seed=>{Math.random=()=>seed;},value);await work(await context.newPage());}finally{await context.close();}}

test('词汇实景 C01：汽车、车窗、后视镜、车顶及Look短句',async({page})=>{
 await open(page,'C01');
 for(const [id,zh]of [['car','汽车'],['window','车窗'],['mirror','后视镜'],['roof','车顶']])await hear(page,[id],()=>page.getByRole('button',{name:`${zh} · ${id}`,exact:true}).click());
 await hear(page,['phrase-look'],()=>page.getByRole('button',{name:'听一句英语',exact:true}).click());
});
test('词汇实景 E02：可见的车轮、车门、车灯及Touch短句',async({page})=>{
 await open(page,'E02');
 for(const [id,zh]of [['wheel','车轮'],['door','车门'],['light','车灯']])await hear(page,[id],()=>page.getByRole('button',{name:`${zh} ${id}`,exact:true}).click());
 await hear(page,['phrase-wheel'],()=>page.getByRole('button',{name:'重听',exact:true}).click());
});
test('词汇实景 E01：三种目标颜色与对应车图、Find短句',async({browser})=>{
 test.setTimeout(60000);
 for(const [seed,id,zh]of [[.01,'red','红色'],[.4,'blue','蓝色'],[.85,'white','白色']]as const)await seeded(browser,seed,async page=>{await open(page,'E01');await expect(page.getByRole('heading',{level:1})).toContainText(zh);await expect(page.locator('.color-option').filter({has:page.getByRole('button',{name:`${zh}的车`,exact:true})}).locator('img')).toHaveAttribute('src',new RegExp(`/revuelto-${id}[.]webp(?:[?]|$)`));await hear(page,[id,...(id==='red'?['phrase-red']:[])],()=>page.getByRole('button',{name:'重听',exact:true}).click());});
});
test('词汇实景 A02：黄色、绿色和黑色有实际色块与词音',async({page})=>{
 await open(page,'A02');for(const [id,zh]of [['yellow','黄色'],['green','绿色'],['black','黑色']]){const button=page.getByRole('button',{name:zh,exact:true});await hear(page,[id],()=>button.click());await expect(button).toHaveAttribute('aria-pressed','true');}
});
test('词汇实景 M01：一车一位的one/two及Park短句',async({page})=>{
 await page.goto('/#/parent');await page.getByLabel('优先点选停车').check();await open(page,'M01');
 await hear(page,['phrase-park'],()=>page.getByRole('button',{name:'重听',exact:true}).click());
 for(const [id,color,index]of [['one','白色',1],['two','蓝色',2]]as const){await page.getByRole('button',{name:`选择${color}小车`,exact:true}).click();await hear(page,[id],()=>page.getByRole('button',{name:`车位 ${index}，空位`,exact:true}).click());}
 await expect(page.getByRole('heading',{level:1})).toHaveText('每辆车都有自己的位置了！');
});
test('词汇实景 M02：three/four/five与程序生成的真实数量对应',async({browser})=>{
 for(const [seed,id,count]of [[.01,'three',3],[.4,'four',4],[.85,'five',5]]as const)await seeded(browser,seed,async page=>{await open(page,'M02');await expect(page.locator('.car-tokens .mini-car')).toHaveCount(count);await hear(page,[id],()=>page.getByRole('button',{name:'听数量',exact:true}).click());});
});
test('词汇实景 E03：Go/Stop与动作和两句短句对应',async({page})=>{
 await open(page,'E03');await hear(page,['go','phrase-go'],()=>page.getByRole('button',{name:'出发 Go',exact:true}).click());await expect(page.locator('.traffic-lamp')).toHaveAttribute('aria-label','红灯');await hear(page,['stop','phrase-stop'],()=>page.getByRole('button',{name:'停止 Stop',exact:true}).click());
});
test('词汇实景 T01：开/关示意、座椅实拍与词句对应',async({page})=>{
 await open(page,'T01');await hear(page,['open','phrase-open'],()=>page.getByRole('button',{name:'打开 Open',exact:true}).click());await expect(page.locator('.door-panel')).toHaveClass(/is-open/);await hear(page,['close','phrase-close'],()=>page.getByRole('button',{name:'关闭 Close',exact:true}).click());await hear(page,['seat'],()=>page.getByRole('button',{name:'座椅 seat',exact:true}).click());await expect(page.locator('.photo-spoken-word')).toHaveText('座椅 seat');
});
test('词汇实景 M03：大/小只改变图形大小而保留数量',async({page})=>{
 await open(page,'M03');const count=await page.locator('.count-space').count();await hear(page,['small'],()=>page.getByRole('button',{name:/图形换小一点/}).click());await expect(page.locator('.number-spaces')).toHaveClass(/small/);await hear(page,['big'],()=>page.getByRole('button',{name:/图形换大一点/}).click());await expect(page.locator('.count-space')).toHaveCount(count);
});
test('词汇实景 S01：演示快/慢有运动对象和状态',async({page})=>{
 await open(page,'S01');await hear(page,['fast'],()=>page.getByRole('button',{name:/演示速度：慢/}).click());await expect(page.locator('.rolling-object')).toHaveClass(/fast/);await hear(page,['slow'],()=>page.getByRole('button',{name:/演示速度：快/}).click());
});
test('词汇实景 L01：晴/雨与水壶有画面和词音',async({page})=>{
 await open(page,'L01');await hear(page,['sun'],()=>page.getByRole('button',{name:'晴天 Sun',exact:true}).click());await expect(page.locator('.weather-scene')).toHaveClass(/sun/);await hear(page,['rain'],()=>page.getByRole('button',{name:'雨天 Rain',exact:true}).click());await expect(page.locator('.weather-scene')).toHaveClass(/rain/);await hear(page,['water'],()=>page.getByRole('button',{name:'水壶',exact:true}).click());
});
test('词汇实景 H01：公园树木和树叶与词音对应',async({page})=>{
 await open(page,'H01');await page.getByRole('button',{name:'去公园看看',exact:true}).click();await hear(page,['tree'],()=>page.getByRole('button',{name:'我看到了树',exact:true}).click());await hear(page,['leaf'],()=>page.getByRole('button',{name:'我发现了叶子',exact:true}).click());
});
