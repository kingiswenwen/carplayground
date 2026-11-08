import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {content} from '../src/domain/content';
import {vehicleModels} from '../src/domain/vehicle-models';
import {vehiclePreview} from '../src/domain/vehicle-preview';
import {viewerPaintSelection} from '../src/three/ViewerPaint';

describe('every catalogue car has a matching cover and usable viewer paint surfaces',()=>{
 it('uses registered previews derived from each actual model',()=>{
  for(const car of content.cars){
   expect(vehiclePreview(car.id),car.id).toBe(`render-${car.id}-front-left`);
   expect(content.assets.some(asset=>asset.id===vehiclePreview(car.id)&&asset.kind==='image'),car.id).toBe(true);
  }
  expect(vehiclePreview('CAR02')).toBeUndefined();
 });
 it('registers existing body materials for all models without changing gameplay paint eligibility',()=>{
  for(const spec of vehicleModels){
   const bytes=fs.readFileSync('public/'+spec.file),gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
   const names=new Set(gltf.materials.map((material:{name:string})=>material.name));
   const rule=viewerPaintSelection(spec);
   expect(rule.materials.length,spec.id).toBeGreaterThan(0);
   for(const name of rule.materials)expect(names.has(name),spec.id+'/'+name).toBe(true);
   expect(rule.materials.some(name=>/tire|tyre|glass|window|brake|call?iper|interior/i.test(name)),spec.id).toBe(false);
   for(const [name,polygons] of Object.entries(rule.protectedUV||{})){
    expect(rule.materials,spec.id).toContain(name);
    expect(gltf.materials.find((material:{name:string})=>material.name===name).pbrMetallicRoughness.baseColorTexture,spec.id).toBeDefined();
    for(const polygon of polygons){expect(polygon.length,spec.id).toBeGreaterThanOrEqual(3);for(const point of polygon){expect(point).toHaveLength(2);for(const coordinate of point){expect(coordinate).toBeGreaterThanOrEqual(0);expect(coordinate).toBeLessThanOrEqual(1);}}}
   }
  }
  expect(vehicleModels.filter(spec=>!spec.paintMaterials.length)).toHaveLength(53);
 });
});
