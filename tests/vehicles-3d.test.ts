import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {fitModel,disposeModel,frameModel} from '../src/three/model';
import {vehicleModel,vehicleModels} from '../src/domain/vehicle-models';
import {isWheelMesh,separateWheelMeshes} from '../src/three/wheel-meshes';

describe('independent vehicle models',()=>{
 it('ships the exact credited self-contained mesh for each enabled vehicle',()=>{
  expect(vehicleModels.length).toBeGreaterThanOrEqual(100);expect(new Set(vehicleModels.map(m=>m.source.url)).size).toBe(vehicleModels.length);expect(new Set(vehicleModels.map(m=>m.sha256)).size).toBe(vehicleModels.length);
  for(const model of vehicleModels){
   const bytes=fs.readFileSync('public/'+model.file);expect(bytes.length).toBe(model.bytes);expect(bytes.length).toBeLessThan(8*1024*1024);
   expect(createHash('sha256').update(bytes).digest('hex')).toBe(model.sha256);expect(bytes.toString('ascii',0,4)).toBe('glTF');expect(bytes.readUInt32LE(8)).toBe(bytes.length);
   const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
   expect(doc.meshes.length).toBeGreaterThan(0);expect(doc.meshes.reduce((sum:number,m:{primitives:{indices:number}[]})=>sum+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count,0),0)).toBeGreaterThan(900);
   expect((doc.images||[]).every((image:{bufferView?:number;uri?:string})=>image.bufferView!==undefined&&!image.uri)).toBe(true);
   expect((doc.buffers||[]).some((buffer:{uri?:string})=>buffer.uri)).toBe(false);
   expect(model.source.author.length).toBeGreaterThan(0);expect(['CC BY 4.0','CC BY-SA 4.0','CC0 1.0']).toContain(model.source.license);expect(model.source.url).toMatch(/^https:\/\/sketchfab.com\/3d-models\//);
   for(const name of [...model.paintMaterials,...model.lampMaterials])expect(doc.materials.some((m:{name:string})=>m.name===name),`${model.id}: ${name}`).toBe(true);
   for(const name of model.excludedNodes)expect(doc.nodes.some((n:{name:string})=>n.name===name)).toBe(true);
  }
  expect(vehicleModel('CAR02')).toBeUndefined();expect(vehicleModel('unknown')).toBeUndefined();
 },20000);
 it('normalizes units and origin without distorting the authored body proportions',()=>{
  const root=new T.Group(),body=new T.Mesh(new T.BoxGeometry(480,130,200),new T.MeshStandardMaterial());body.position.set(25,95,-31);root.add(body);
  const bounds=fitModel(root,Math.PI/2),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  expect(size.z).toBeCloseTo(4.65);expect(size.x/size.z).toBeCloseTo(200/480);expect(size.y/size.z).toBeCloseTo(130/480);expect(bounds.min.y).toBeCloseTo(0);expect(center.x).toBeCloseTo(0);expect(center.z).toBeCloseTo(0);disposeModel(root);
 });
 it('rejects missing geometry rather than producing a tiny or non-finite car',()=>{
  expect(()=>fitModel(new T.Group(),0)).toThrow('Invalid vehicle bounds');
 });
 it('releases wire overlays and points when switching source models',()=>{
  const root=new T.Group(),geometry=new T.BufferGeometry(),material=new T.MeshBasicMaterial(),texture=new T.Texture();material.map=texture;
  root.add(new T.Mesh(geometry,material),new T.LineSegments(geometry,material),new T.Points(geometry,material));
  const disposed={geometry:0,material:0,texture:0};
  geometry.addEventListener('dispose',()=>disposed.geometry++);material.addEventListener('dispose',()=>disposed.material++);texture.addEventListener('dispose',()=>disposed.texture++);
  disposeModel(root);expect(disposed).toEqual({geometry:1,material:1,texture:1});
 });
 it('keeps body panels intact even when their exporter material is named wheels',()=>{
  const root=new T.Group(),paint=new T.MeshStandardMaterial();paint.name='wheels.3';
  const body=new T.Mesh(new T.BoxGeometry(3.9,.9,1.6),paint);body.position.y=.8;root.add(body);
  const tires:T.Mesh[]=[];
  for(const x of [-1.4,1.4])for(const z of [-.8,.8]){const tire=new T.Mesh(new T.CylinderGeometry(.35,.35,.18,20).rotateX(Math.PI/2),new T.MeshStandardMaterial());tire.position.set(x,.35,z);root.add(tire);tires.push(tire);}
  root.updateMatrixWorld(true);separateWheelMeshes(root);
  expect(isWheelMesh(body)).toBe(false);expect(body.parent).toBe(root);
  for(const tire of tires)expect(isWheelMesh(tire)).toBe(true);
  disposeModel(root);
 });
 it('grounds rotated exporter meshes using actual vertices rather than inflated transformed boxes',()=>{
  const root=new T.Group(),g=new T.BoxGeometry(4.65,.8,1.8);g.rotateX(-Math.PI/4);
  const body=new T.Mesh(g,new T.MeshStandardMaterial());body.rotation.x=Math.PI/4;body.position.y=5;root.add(body);
  const bounds=fitModel(root,0),size=bounds.getSize(new T.Vector3());expect(size.y).toBeCloseTo(.8);expect(bounds.min.y).toBeCloseTo(0);
  const actual=new T.Box3().setFromObject(root,true);expect(actual.min.y).toBeCloseTo(0);expect(actual.max.y).toBeCloseTo(.8);disposeModel(root);
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
