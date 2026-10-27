import { z } from 'zod';
import releaseData from '../../content/r3.json';
import packageInfo from '../../package.json';
import identities from '../../content/vehicle-identities.json';
import retiredPreviews from '../../content/retired-car-previews.json';
export const activityIds = ['E01','E02','E03','M01','M02','M03','M04','C01','C02','C03','S01','S02','S03','T01','T02','T03','H01','H02','H03','A01','A02','L01','L02','L03','P01','T04'] as const;
export type ActivityId = typeof activityIds[number];
export type CoreActivityId = 'E01' | 'E02' | 'M01';
export const sceneIds = ['showroom','parking','workshop','travel'] as const;
export type SceneId = typeof sceneIds[number];
export const domains = ['英语','数学','中文表达','科学','动手思考','社会与人文','艺术创作','生活习惯'] as const;
export type Domain = typeof domains[number];
export const assetSchema = z.object({id:z.string(),kind:z.enum(['image','audio','model']),path:z.string().regex(/^media\/[\w./-]+$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),status:z.literal('approved'),width:z.number().positive().optional(),height:z.number().positive().optional(),duration:z.number().positive().optional(),source:z.string()});
const hotspotSchema = z.object({id:z.enum(['wheel','door','light']),zh:z.string(),x:z.number().min(0).max(1),y:z.number().min(0).max(1)});
const photoViewSchema=z.object({id:z.string(),image:z.string(),label:z.string(),caption:z.string(),credit:z.object({author:z.string(),license:z.string(),licenseUrl:z.string().url(),sourceUrl:z.string().url()}),hotspots:z.array(z.object({word:z.literal('seat'),x:z.number().min(0).max(1),y:z.number().min(0).max(1)})).optional()});
export const carSchema=z.object({id:z.string().regex(/^CAR(?:0[1-9]|[1-9][0-9]{1,2})$/),name:z.string(),zhBrand:z.string(),brand:z.string(),model:z.string().min(1),catalogKey:z.string().min(3),productionStatus:z.literal('production'),edition:z.string(),color:z.string(),reference:z.string().url(),status:z.literal('reviewed'),image:z.string(),displayImage:z.string().optional(),showcaseImage:z.string(),game:z.object({side:z.string(),top:z.string(),orbit:z.array(z.object({id:z.enum(['front-left','front','front-right','left','rear','right']),image:z.string()})).length(6).optional(),wheels:z.array(z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),r:z.number().positive().max(.2)})).length(2)}).optional(),showcaseObservationPoints:z.record(z.enum(['window','mirror','roof']),z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)})).optional(),showcaseHotspots:z.array(hotspotSchema).min(1).max(3),audio:z.string(),observation:z.string(),hotspots:z.array(hotspotSchema).min(1).max(3),views:z.array(photoViewSchema).min(2)});
export const activitySchema=z.object({id:z.enum(activityIds),version:z.number().int().positive(),title:z.string(),subtitle:z.string(),domain:z.enum(domains),scene:z.enum(sceneIds),mode:z.enum(['closed','open']),instruction:z.string(),hint:z.string(),goal:z.string(),extension:z.string(),instructionAudio:z.string(),hintAudio:z.string(),completeAudio:z.string(),carIds:z.array(z.string()).min(1)});
export const releaseSchema=z.object({id:z.string(),schemaVersion:z.literal(2),appVersion:z.literal(packageInfo.version),car:z.object({id:z.literal('CAR01'),name:z.string(),brand:z.string(),model:z.string(),status:z.literal('reviewed'),reference:z.string().url(),images:z.object({white:z.string(),red:z.string(),blue:z.string()}),hotspots:z.array(hotspotSchema).length(3)}),cars:z.array(carSchema).min(1).max(250),scenes:z.array(z.object({id:z.enum(sceneIds),name:z.string(),subtitle:z.string(),icon:z.string(),color:z.string()})).length(4),activities:z.array(activitySchema).length(26),stories:z.array(z.object({id:z.string(),title:z.string(),version:z.number().int(),scene:z.enum(sceneIds),frames:z.array(z.object({title:z.string(),text:z.string(),activityId:z.enum(activityIds),audio:z.string()})).length(4)})).length(3),phrases:z.array(z.object({id:z.string(),text:z.string(),audio:z.string(),activityId:z.enum(activityIds)})).length(8),vocabulary:z.array(z.object({id:z.string(),zh:z.string(),audio:z.string(),activityId:z.enum(activityIds)})),speech:z.record(z.string(),z.object({text:z.string(),locale:z.enum(['zh-CN','en-US'])})),assets:z.array(assetSchema).min(10)}).superRefine((release,ctx)=>{
 const issue=(message:string)=>ctx.addIssue({code:'custom',message});
 const unique=(values:string[],label:string)=>{if(new Set(values).size!==values.length)issue(`${label}重复`);};
 unique(release.cars.map(c=>c.catalogKey),'量产车型系列');unique(release.cars.map(c=>(c.brand+'/'+c.model).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'')),'车型名称');
 for(const car of release.cars){const identity=identities.cars.find(row=>row.id===car.id);if(!identity||(['brand','model','catalogKey','productionStatus','reference'] as const).some(key=>identity[key]!==car[key]))issue('车型身份与独立审核记录不一致 '+car.id);}
 if(release.cars.length!==identities.cars.length)issue('车型身份清单与车库不一致');
 unique(release.assets.map(a=>a.id),'素材');unique(release.cars.map(a=>a.id),'车型');unique(release.activities.map(a=>a.id),'活动');unique(release.scenes.map(a=>a.id),'场景');unique(release.stories.map(a=>a.id),'故事');unique(release.car.hotspots.map(p=>p.id),'热点');
 for(const asset of release.assets){if(asset.kind==='image'&&(!asset.width||!asset.height))issue(`图片缺尺寸 ${asset.id}`);if(asset.kind==='audio'&&!asset.duration)issue(`声音缺时长 ${asset.id}`);}
 for(const id of [...release.scenes.map(s=>'scene-'+s.id),'scene-world','scene-driving'])if(!release.assets.some(a=>a.id===id&&a.kind==='image'))issue(`场景图片断链 ${id}`);
 const refs:[string,'image'|'audio'][]=[...Object.values(release.car.images).map(id=>[id,'image'] as [string,'image']),...release.cars.flatMap(c=>[[c.image,'image'],[c.showcaseImage,'image'],...(c.displayImage?[[c.displayImage,'image']]:[]),...(c.audio==='car-name-local'?[]:[[c.audio,'audio']])] as [string,'image'|'audio'][]),...Object.keys(release.speech).map(id=>[id,'audio'] as [string,'audio']),...release.activities.flatMap(a=>[a.instructionAudio,a.hintAudio,a.completeAudio].map(id=>[id,'audio'] as [string,'audio'])),...release.stories.map(s=>[s.scene==='showroom'?'showcase-CAR01':`story-${s.scene}`,'image'] as [string,'image']),...release.stories.flatMap(s=>s.frames.map(f=>[f.audio,'audio'] as [string,'audio']))];
 for(const [id,kind]of refs)if(!release.assets.some(a=>a.id===id&&a.kind===kind))issue(`缺少 ${kind} 引用 ${id}`);
 for(const a of release.activities)for(const carId of a.carIds)if(!release.cars.some(c=>c.id===carId))issue(`活动 ${a.id} 车型断链`);
 unique(release.vocabulary.map(v=>v.id),'词汇');unique(release.phrases.map(v=>v.id),'短句');
 for(const car of release.cars){if(car.game?.orbit){unique(car.game.orbit.map(v=>v.id),`${car.id}环绕视图`);for(const v of car.game.orbit)if(!release.assets.some(a=>a.id===v.image&&a.kind==='image'))issue(`环绕图片断链 ${car.id}/${v.id}`);}unique(car.hotspots.map(p=>p.id),`${car.id}部件热点`);unique(car.showcaseHotspots.map(p=>p.id),`${car.id}展厅部件热点`);unique(car.views.map(v=>v.id),`${car.id}视角`);for(const view of car.views){if(!release.assets.some(a=>a.id===view.image&&a.kind==='image'))issue(`视角图片断链 ${car.id}/${view.id}`);for(const point of view.hotspots||[])for(const id of [point.word,'zh-'+point.word])if(!release.assets.some(a=>a.id===id&&a.kind==='audio'))issue(`视角声音断链 ${id}`);}}
 for(const item of [...release.vocabulary,...release.phrases]){if(!release.assets.some(a=>a.id===item.audio&&a.kind==='audio'))issue(`词句声音断链 ${item.id}`);if(!release.activities.some(a=>a.id===item.activityId))issue(`词句活动断链 ${item.id}`);}
});
export const content=releaseSchema.parse(releaseData);
export type Car=typeof content.cars[number];
export type ActivityDefinition=typeof content.activities[number];
export type Color='red'|'blue'|'white';
export type Part='wheel'|'door'|'light';
export const colors:Color[]=['red','blue','white'];
export const colorNames:Record<Color,string>={red:'红色',blue:'蓝色',white:'白色'};
export const getActivity=(id:string)=>content.activities.find(a=>a.id===id);
export const retiredCars=identities.retired;
export const historicalCarIds=[...content.cars.map(c=>c.id),...retiredCars.map(c=>c.id)];
export function resolveCarId(id:string){return retiredCars.find(c=>c.id===id)?.replacement||id;}
export const getCar=(id:string)=>content.cars.find(c=>c.id===resolveCarId(id));
export const selectableCarIds=(ids:string[])=>[...new Set(ids.flatMap(id=>{const car=getCar(id);return car?[car.id]:[];}))];
export function assetUrl(id:string){const asset=content.assets.find(a=>a.id===id);if(!asset)throw new Error(`素材不存在：${id}`);const mediaBase=import.meta.env?.VITE_MEDIA_BASE_URL;if(mediaBase)return `${mediaBase.replace(/\/?$/,'/')}${asset.path.replace(/^media\//,'')}`;const base=import.meta.env?.VITE_ASSET_BASE_URL||import.meta.env?.BASE_URL||'./';return `${base.replace(/\/?$/,'/')}${asset.path}`;}

// Historical artwork keeps its original picture without re-entering the selectable catalogue.
type CarPreview=Pick<Car,'id'|'name'|'brand'|'edition'|'image'|'displayImage'|'showcaseImage'|'game'|'hotspots'|'showcaseHotspots'>&{modelCredit?:{author:string;license:string;url:string}};
export const getDisplayCar=(id:string):CarPreview|undefined=>content.cars.find(c=>c.id===id)||(retiredPreviews as CarPreview[]).find(c=>c.id===id);
