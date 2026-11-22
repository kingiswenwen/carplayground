import {releaseSchema} from '../src/domain/content-schema';
import {describe,it,expect} from 'vitest';
import {content,getCar,historicalCarIds,selectableCarIds,getDisplayCar} from '../src/domain/content';
import identities from '../content/vehicle-identities.json';
import {vehicleModels} from '../src/domain/vehicle-models';
describe('production model catalogue identity',()=>{
 it('retains only independently modeled vehicles and excludes retired families from every selectable activity',()=>{
  const removed = new Set([
   'CAR02','CAR04','CAR16','CAR17','CAR20','CAR25','CAR70','CAR83','CAR130','CAR131',
   'CAR42','CAR164','CAR166','CAR176','CAR195','CAR78',
   ...identities.retired.filter(row=>row.reason.startsWith('quality-')).map(row=>row.id)
  ]);
  expect(content.cars).toHaveLength(68);
  expect(new Set(content.cars.map(c=>c.id))).toEqual(new Set(vehicleModels.map(m=>m.id)));
  for(const id of removed){
   expect(historicalCarIds).toContain(id);
   expect(getCar(id)).toBeUndefined();expect(getDisplayCar(id)).toBeUndefined();
   expect(selectableCarIds([id])).toEqual([]);
   expect(content.activities.every(a=>!a.carIds.includes(id))).toBe(true);
   expect(content.assets.some(a=>new RegExp(id+'(?![0-9])','i').test(a.id))).toBe(false);
  }
 });
 it('counts production families once, independently of mesh, trim, generation and paint',()=>{
  expect(content.cars).toHaveLength(identities.cars.length);expect(new Set(content.cars.map(c=>c.catalogKey)).size).toBe(content.cars.length);
  for(const row of content.cars){expect(row.productionStatus).toBe('production');expect(row.reference).not.toContain('openai.com');}
  for(const model of vehicleModels)expect(content.cars.some(c=>c.id===model.id)).toBe(true);
 });
 it('rejects renamed copies with another id and prevents model family reclassification',()=>{
  for(const field of ['id','model','catalogKey','productionStatus','reference'] as const){const changed=structuredClone(content);Reflect.set(changed.cars[1],field,field==='id'?'CAR999':field==='productionStatus'?'concept':changed.cars[0][field]);expect(releaseSchema.safeParse(changed).success,field).toBe(false);}
 });
 it('collapses active favorite aliases and skips retired families',()=>{expect(selectableCarIds(['CAR32','CAR33','CAR35','CAR72','CAR78','CAR103'])).toEqual(['CAR32','CAR108']);});
 it('retires the 720S and 750S without assigning their identities to another vehicle',()=>{for(const id of ['CAR04','CAR46']){expect(vehicleModels.some(m=>m.id===id)).toBe(false);expect(getCar(id)).toBeUndefined();}});
 it('keeps old duplicate links in the original family while removing concepts from selection',()=>{
  expect(getCar('CAR33')?.id).toBe('CAR32');expect(getCar('CAR103')?.id).toBe('CAR108');expect(getCar('CAR78')).toBeUndefined();expect(getCar('CAR35')).toBeUndefined();expect(getCar('CAR134')).toBeUndefined();
  for(const row of identities.retired){expect(historicalCarIds).toContain(row.id);expect(content.cars.some(c=>c.id===row.id)).toBe(false);if(row.replacement)expect(getCar(row.id)?.id).toBe(row.replacement);}
 });
});
