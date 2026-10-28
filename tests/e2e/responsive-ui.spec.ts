import {test,expect} from '@playwright/test';

test('三段故事和控件适配窄屏、平板与桌面 @smoke',async({page},info)=>{
 test.setTimeout(90000);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const id of ['ST01','ST02','ST03']){
   await page.goto(`/#/stories/${id}`);
   const story=page.locator('.picture-story');await expect(story).toHaveAttribute('data-save','saved');
   for(let frame=0;frame<4;frame++){
    await story.locator('.story-dot').nth(frame).click();
    await expect(story).toHaveAttribute('data-frame',String(frame));
    const layout=await story.evaluate(root=>({
     viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
     elements:[...root.querySelectorAll('.story-picture,.picture-button,.story-dot')].map(el=>{
      const r=el.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width,height:r.height};
     }),
    }));
    expect(layout.scrollWidth,`${id} frame ${frame} at ${width}px`).toBeLessThanOrEqual(layout.viewport);
    for(const rect of layout.elements){expect(rect.left).toBeGreaterThanOrEqual(0);expect(rect.right).toBeLessThanOrEqual(width);expect(rect.width).toBeGreaterThanOrEqual(44);expect(rect.height).toBeGreaterThanOrEqual(44);}
   }
   if(id==='ST01')await page.screenshot({path:info.outputPath(`story-${width}.png`),fullPage:true});
  }
 }
});

for(const [route,selectors] of [
  ['cars','.garage-pager>span'],
  ['parent','.parent-page-title p,.parent-page-title .eyebrow,.parent-card p,.parent-card>small,.setting-row small,.record-numbers span,.domain-summary>div'],
 ] as const)test(`车型分页和家长说明文字保持可读对比度 ${route} @smoke`,async({page})=>{
  await page.goto(`/#/${route}`);await expect(page.locator(selectors).first()).toBeVisible();
  const contrasts=await page.locator(selectors).evaluateAll(elements=>{
   const rgba=(color:string)=>color.match(/[\d.]+/g)!.map(Number);
   const luminance=(rgb:number[])=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   return elements.filter(el=>el.getBoundingClientRect().height>0).map(el=>{
    const ancestors:Element[]=[];for(let node:Element|null=el;node;node=node.parentElement)ancestors.unshift(node);
    let bg=[255,255,255];for(const node of ancestors){const c=rgba(getComputedStyle(node).backgroundColor),alpha=c[3]??1;bg=bg.map((v,i)=>c[i]*alpha+v*(1-alpha));}
    const fg=rgba(getComputedStyle(el).color),alpha=fg[3]??1,text=bg.map((v,i)=>fg[i]*alpha+v*(1-alpha));
    const a=luminance(text),b=luminance(bg);return{text:el.textContent?.slice(0,70),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
   });
  });
  expect(contrasts.length).toBeGreaterThan(0);
  for(const item of contrasts)expect(item.ratio,`${route}: ${item.text}`).toBeGreaterThanOrEqual(4.5);
});
