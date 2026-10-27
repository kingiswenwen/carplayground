import {describe,it,expect} from 'vitest';
import {content,releaseSchema,getCar,historicalCarIds,selectableCarIds} from '../src/domain/content';
import identities from '../content/vehicle-identities.json';
import {vehicleModels} from '../src/domain/vehicle-models';
describe('production model catalogue identity',()=>{
 it('counts production families once, independently of mesh, trim, generation and paint',()=>{
  expect(content.cars).toHaveLength(identities.cars.length);expect(new Set(content.cars.map(c=>c.catalogKey)).size).toBe(content.cars.length);
  for(const row of content.cars){expect(row.productionStatus).toBe('production');expect(row.reference).not.toContain('openai.com');}
  for(const model of vehicleModels)expect(content.cars.some(c=>c.id===model.id)).toBe(true);
 });
 it('rejects renamed copies with another id and prevents model family reclassification',()=>{
  for(const field of ['id','model','catalogKey','productionStatus','reference'] as const){const changed=structuredClone(content);Reflect.set(changed.cars[1],field,field==='id'?'CAR999':field==='productionStatus'?'concept':changed.cars[0][field]);expect(releaseSchema.safeParse(changed).success,field).toBe(false);}
 });
 it('collapses old favorite aliases and excludes removed concepts',()=>{expect(selectableCarIds(['CAR32','CAR33','CAR35','CAR72','CAR78'])).toEqual(['CAR32','CAR72']);});
 it('does not label the internal 720S mesh as a second 750S or count M635CSi as another M6',()=>{expect(vehicleModels.find(m=>m.id==='CAR04')).toBeUndefined();expect(vehicleModels.find(m=>m.id==='CAR46')).toBeDefined();expect(content.cars.find(c=>c.id==='CAR04')?.model).toBe('750S');expect(getCar('CAR103')?.id).toBe('CAR108');});
 it('keeps old duplicate links in the original family while removing concepts from selection',()=>{
  expect(getCar('CAR33')?.id).toBe('CAR32');expect(getCar('CAR78')?.id).toBe('CAR72');expect(getCar('CAR35')).toBeUndefined();expect(getCar('CAR134')).toBeUndefined();
  for(const row of identities.retired){expect(historicalCarIds).toContain(row.id);expect(content.cars.some(c=>c.id===row.id)).toBe(false);if(row.replacement)expect(getCar(row.id)?.id).toBe(row.replacement);}
 });
});
