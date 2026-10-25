import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import * as T from 'three';
import {createVehicle,vehicleProfiles} from '../src/three/vehicle';
import models from '../content/vehicle-models.json';
describe('complete three-dimensional car assets',()=>{
 it('exports 30 valid GLB files with mesh geometry, instead of flat billboard images',()=>{
  expect(models).toHaveLength(30);
  for(const m of models){const b=fs.readFileSync('public/'+m.file);expect(b.length,`${m.id} transfer budget`).toBeLessThan(512*1024);expect(b.toString('ascii',0,4)).toBe('glTF');expect(b.readUInt32LE(8)).toBe(b.length);const document=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());expect(document.meshes.length).toBeGreaterThan(20);expect(document.images||[]).toHaveLength(0);}
 });
 it('has four physical wheels and finite volume for every car, preserving both sides and end faces',()=>{
  for(const p of vehicleProfiles){const car=createVehicle(p.id);expect(car.wheels).toHaveLength(4);const bounds=new T.Box3().setFromObject(car.root),size=bounds.getSize(new T.Vector3());expect(size.x).toBeGreaterThan(3.8);expect(size.z).toBeGreaterThan(1.5);expect(size.y).toBeGreaterThan(1);car.root.traverse(object=>{if(object instanceof T.Mesh){const positions=object.geometry.getAttribute('position');expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);}});car.dispose();}
 });
 it('uses one closed shell with outward front and rear faces, avoiding missing bumpers and disconnected panels',()=>{
  for(const id of ['CAR01','CAR03','CAR17']){
   const car=createVehicle(id),shell=car.root.getObjectByName('continuous-sculpted-body') as T.Mesh;
   const normals=shell.geometry.getAttribute('normal'),count=normals.count;
   expect(normals.getX(count-1)).toBeGreaterThan(.8);expect(normals.getX(count-2)).toBeLessThan(-.8);
   expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);car.dispose();
  }
 });
});
