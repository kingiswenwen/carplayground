import {paintMark} from '../visual/paint-mark';
import{vehicleModel}from'../domain/vehicle-models';
import{assetUrl,getDisplayCar,content}from'../domain/content';import type{Creation}from'./storage';import{download}from'./download';import sources from'../../content/photo-sources.json';
export async function exportArtwork(creation:Creation){
 const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('这台浏览器暂时不能导出图片，作品仍保存在车库。');
 ctx.fillStyle=creation.background;ctx.fillRect(0,0,1200,800);
 const car=getDisplayCar(creation.carId);
 if(creation.kind==='poster'){
  if(car){
   const image=new Image();image.crossOrigin='anonymous';image.src=assetUrl(car.game?.side||car.displayImage||car.image);await image.decode();
   const ratio=Math.min(1050/image.naturalWidth,480/image.naturalHeight),w=image.naturalWidth*ratio,h=image.naturalHeight*ratio;
   ctx.drawImage(image,(1200-w)/2,170+(480-h)/2,w,h);
  }else{
   ctx.fillStyle='#293b2e';ctx.font='28px sans-serif';ctx.textAlign='center';ctx.fillText('这辆车已下架，作品的文字与图案仍保留。',600,400,1060);
  }
  ctx.fillStyle='#293b2e';ctx.font='bold 48px sans-serif';ctx.textAlign='center';if(creation.caption)ctx.fillText(creation.caption,600,100,1060);
  ctx.font='20px sans-serif';if(car&&!car.game)ctx.fillText(car.brand+' · '+car.edition,600,700,1100);
 }
 for(const mark of creation.marks)paintMark(ctx,mark,1200,800);
 const source=car?sources.find(s=>s.id===car.id):undefined,modelCredit=car?(vehicleModel(car.id)?.source||car.modelCredit):undefined,generated=!!car?.game;
 const rendered=car&&content.assets.find(a=>a.id===(car.game?.side||car.displayImage||car.image))?.source?.startsWith('Rendered from');
 ctx.textAlign='left';ctx.fillStyle='#394637';ctx.font='12px sans-serif';
 ctx.fillText(creation.kind==='poster'&&!car?'CarPlayground · 原作品文字与图案':creation.kind==='poster'&&rendered?`3D reference: ${modelCredit?.author||'See source credits'} · ${modelCredit?.license||'See source license'} · game rendering / resize`:creation.kind==='poster'&&generated?'CarPlayground · Original GPT-generated game car; stylized interpretation':creation.kind==='poster'?`Photo reference: ${source?.author||'Calreyn88'} · ${source?.license||'CC BY 4.0'} · GPT Image cutout / composed; derivative retains source license`:'CarPlayground · 自由轮印创作',18,760,1160);
 if(creation.kind==='poster'&&rendered&&modelCredit)ctx.fillText(modelCredit.url,18,781,1160);
 if(creation.kind==='poster'&&car&&!generated)ctx.fillText(source?.page||'https://commons.wikimedia.org/wiki/File:2023_Lamborghini_Revuelto_1.jpg',18,781,1160);
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('图片没有生成，请再试一次。')),'image/png'));
 download(blob,`carplayground-${creation.kind}-${creation.id.slice(-8)}.png`);
}
