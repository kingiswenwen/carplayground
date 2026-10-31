/** Install independently reviewed identities, imported meshes and their actual renders.
 * Inputs stay outside public source; attribution and verified asset hashes are published. */
import fs from 'node:fs/promises';
const [importedFile,rendersFile,identitiesFile]=process.argv.slice(2);
if(!identitiesFile)throw Error('Usage: install-catalog <imported models> <renders> <reviewed identities>');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const write=async(file,data)=>fs.writeFile(file,JSON.stringify(data,null,2)+'\n');
const imported=await read(importedFile),renders=await read(rendersFile),reviewed=await read(identitiesFile);
const release=await read('content/r3.json'),identities=await read('content/vehicle-identities.json');
const models=await read('content/vehicle-models.json'),previousRenders=await read('content/model-renders.json');
const upsert=(list,row)=>{const index=list.findIndex(item=>item.id===row.id);if(index<0)list.push(row);else list[index]=row;};
for(const row of imported){
 const spec=row.spec,existing=release.cars.find(car=>car.id===spec.id),identity=existing||reviewed.find(car=>car.id===spec.id);
 if(!identity)throw Error('Missing reviewed identity '+spec.id);
 if(!['by','by-sa','cc0'].includes(row.verifiedSource?.license?.slug))throw Error('Unsupported source license '+spec.id);
 const render=renders.find(r=>r.id===spec.id);
 if(!render||render.sourceModelSha256!==spec.sha256)throw Error('Missing matching render '+spec.id);
 if(models.some(model=>model.id!==spec.id&&(model.catalogKey===identity.catalogKey||model.sha256===spec.sha256)))throw Error('Duplicate family or mesh '+spec.id);
 upsert(models,{...spec,catalogKey:identity.catalogKey});
 upsert(release.assets,{id:'model-'+spec.id,kind:'model',path:spec.file,sha256:spec.sha256,status:'approved',source:`${spec.source.title}; ${spec.source.author}; ${spec.source.license}. ${spec.source.url}. ${spec.source.modifications}`});
 for(const asset of render.assets)upsert(release.assets,asset);
 upsert(previousRenders,render);
 if(existing&&!existing.game?.side.startsWith('render-'))continue;
 const credit={author:spec.source.author,license:spec.source.license,licenseUrl:spec.source.licenseUrl,sourceUrl:spec.source.url};
 const hotspots=[{id:'wheel',zh:'车轮',...render.points.wheel},{id:'door',zh:'车门',...render.points.door},{id:'light',zh:'车灯',...render.points.light}];
 const car={...existing,id:identity.id,name:`${identity.zhBrand} ${identity.model}`,zhBrand:identity.zhBrand,brand:identity.brand,model:identity.model,catalogKey:identity.catalogKey,productionStatus:'production',
  edition:'真实量产车型的游戏外观',color:spec.color,reference:identity.reference,status:'reviewed',audio:'car-name-local',observation:'转动看看真实车型的游戏模型，再带它去洗车、停车和装配。',
  image:`render-${spec.id}-side`,showcaseImage:`render-${spec.id}-side`,hotspots,showcaseHotspots:hotspots,
  game:{side:`render-${spec.id}-side`,top:`render-${spec.id}-top`,wheels:render.wheels},
  views:render.assets.map(asset=>({id:asset.id.replace(`render-${spec.id}-`,''),image:asset.id,label:asset.id.endsWith('-top')?'俯视模型':'模型外观',caption:'由这辆车的独立模型渲染；作者版本，非厂商精密数据。',credit}))};
 upsert(release.cars,car);
 const {id,brand,model,catalogKey,productionStatus,reference}=car;
 upsert(identities.cars,{id,brand,model,catalogKey,productionStatus,reference});
}
for(const activity of release.activities){activity.carIds=release.cars.map(car=>car.id);}
await write('content/r3.json',release);await write('content/vehicle-identities.json',identities);
await write('content/vehicle-models.json',models);await write('content/model-renders.json',previousRenders);
const credits=['# 立体车型来源与许可','',`${models.length} 个独立模型，按真实车型系列去重。模型是作者制作的游戏外观，不是厂商工程数据；图片生成记录另见 catalog-illustrations.json。`,'',...models.flatMap(model=>[`## ${model.id} · ${release.cars.find(car=>car.id===model.id).name}`,'',`[${model.source.title}](${model.source.url}) · [${model.source.author}](${model.source.authorUrl}) · [${model.source.license}](${model.source.licenseUrl})。`,model.source.modifications,''])];
await fs.writeFile('content/VEHICLE_MODEL_CREDITS.md',credits.join('\n'));
console.log(`${release.cars.length} real model families, ${models.length} independent meshes installed.`);
