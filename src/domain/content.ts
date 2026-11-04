import type {z} from 'zod';
import type {releaseSchema} from './content-schema';
import releaseData from '../../content/r3.json';
import identities from '../../content/vehicle-identities.json';
import retiredPreviews from '../../content/retired-car-previews.json';
export * from './content-ids';
// This immutable bundled release is schema/hash checked by npm run validate
// before every build. Do not ship the build validator on the children's path.
export const content=releaseData as z.infer<typeof releaseSchema>;
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
type CarPreview=Pick<Car,'id'|'name'|'brand'|'edition'|'image'|'displayImage'|'illustrationImage'|'showcaseImage'|'game'|'hotspots'|'showcaseHotspots'>&{modelCredit?:{author:string;license:string;url:string}};
export const getDisplayCar=(id:string):CarPreview|undefined=>content.cars.find(c=>c.id===id)||(retiredPreviews as CarPreview[]).find(c=>c.id===id);
