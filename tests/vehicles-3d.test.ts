import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {fitModel,disposeModel,frameModel} from '../src/three/model';
import {vehicleModel,vehicleModels} from '../src/domain/vehicle-models';

describe('independent vehicle models',()=>{
 it('ships the exact credited self-contained mesh for each enabled vehicle',()=>{
  expect(vehicleModels.map(m=>m.id)).toEqual(['CAR01','CAR03','CAR10','CAR11']);
  for(const model of vehicleModels){
   const bytes=fs.readFileSync('public/'+model.file);expect(bytes.length).toBe(model.bytes);expect(bytes.length).toBeLessThan(8*1024*1024);
   expect(createHash('sha256').update(bytes).digest('hex')).toBe(model.sha256);expect(bytes.toString('ascii',0,4)).toBe('glTF');expect(bytes.readUInt32LE(8)).toBe(bytes.length);
   const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
   expect(doc.meshes.length).toBeGreaterThan(5);expect(doc.meshes.reduce((sum:number,m:{primitives:{indices:number}[]})=>sum+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count,0),0)).toBeGreaterThan(30000);
   expect((doc.images||[]).every((image:{bufferView?:number;uri?:string})=>image.bufferView!==undefined&&!image.uri)).toBe(true);
   expect((doc.buffers||[]).some((buffer:{uri?:string})=>buffer.uri)).toBe(false);
   expect(model.source.author.length).toBeGreaterThan(0);expect(model.source.license).toBe('CC BY 4.0');expect(model.source.url).toMatch(/^https:\/\/sketchfab.com\/3d-models\//);
   for(const name of [...model.paintMaterials,...model.lampMaterials])expect(doc.materials.some((m:{name:string})=>m.name===name),`${model.id}: ${name}`).toBe(true);
   for(const name of model.excludedNodes)expect(doc.nodes.some((n:{name:string})=>n.name===name)).toBe(true);
  }
  expect(vehicleModel('CAR02')).toBeUndefined();expect(vehicleModel('unknown')).toBeUndefined();
 });
 it('normalizes units and origin without distorting the authored body proportions',()=>{
  const root=new T.Group(),body=new T.Mesh(new T.BoxGeometry(480,130,200),new T.MeshStandardMaterial());body.position.set(25,95,-31);root.add(body);
  const bounds=fitModel(root,Math.PI/2),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  expect(size.z).toBeCloseTo(4.65);expect(size.x/size.z).toBeCloseTo(200/480);expect(size.y/size.z).toBeCloseTo(130/480);expect(bounds.min.y).toBeCloseTo(0);expect(center.x).toBeCloseTo(0);expect(center.z).toBeCloseTo(0);disposeModel(root);
 });
 it('rejects missing geometry rather than producing a tiny or non-finite car',()=>{
  expect(()=>fitModel(new T.Group(),0)).toThrow('Invalid vehicle bounds');
 });
 it('keeps the full car inside desktop and phone frames throughout a horizontal orbit',()=>{
  const bounds=new T.Box3(new T.Vector3(-2.325,0,-1),new T.Vector3(2.325,1.3,1)),center=bounds.getCenter(new T.Vector3());
  for(const aspect of [.45,3.2])for(let step=0;step<16;step++){
   const camera=new T.OrthographicCamera(-3,3,2,-2,.1,60),angle=step*Math.PI/8;
   camera.position.set(Math.cos(angle)*8,3,Math.sin(angle)*8);camera.lookAt(center);frameModel(camera,bounds,aspect);camera.updateMatrixWorld(true);
   for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const projected=new T.Vector3(x,y,z).project(camera);expect(Math.abs(projected.x)).toBeLessThan(.9);expect(Math.abs(projected.y)).toBeLessThan(.9);
   }
  }
 });
});
