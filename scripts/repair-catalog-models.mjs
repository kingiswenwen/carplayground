/** Reproducible repairs for reviewed exporter defects, retaining each car's body. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO,Accessor} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds,prune,meshopt} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import * as T from 'three';
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const models=JSON.parse(await fs.readFile('content/vehicle-models.json','utf8')),release=JSON.parse(await fs.readFile('content/r3.json','utf8'));
const operations={
 CAR146:'Remove authored presentation ground, which otherwise reduces the car to a speck.',
 CAR18:'Remove the separate pPlane23 presentation ground; retain the complete BMW M2.',
 CAR155:'Keep the assembled Giulia at the scene origin; remove the second exploded presentation copy.',
 CAR187:'Reset the exporter presentation quaternion so the original BMW body stands upright.',
 CAR164:'Use alpha cutout for the combined body atlas instead of sorting overlapping translucent body panels.',
 CAR170:'Remove source wire edges (line primitives); retain the original solid road-car surfaces.',
 CAR176:'Retain the RS3 body; add four original simplified game wheels to the source that omits wheel geometry. Wheels are teaching geometry, not scanned OEM rims.',
};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let previous=[];try{previous=JSON.parse(await fs.readFile('content/model-preparation.json','utf8'));}catch{}
const evidence=[];
for(const model of models){
 if(!operations[model.id])continue;
 const filename='public/'+model.file,before=await fs.readFile(filename),doc=await io.read(filename),root=doc.getRoot(),scene=root.listScenes()[0];
 const prepared=previous.find(row=>row.id===model.id&&row.outputSha256===hash(before));
 if(prepared){evidence.push(prepared);continue;}
 const expected=previous.find(row=>row.id===model.id);
 if(expected&&(expected.inputSha256!==hash(before)||expected.sourceUrl!==model.source.url))throw Error('Review changed source before applying exporter repairs: '+model.id);
 if(model.id==='CAR146')root.listNodes().find(n=>n.getName()==='ground')?.dispose();
 if(model.id==='CAR18')root.listNodes().find(n=>n.getName()==='pPlane23')?.dispose();
 if(model.id==='CAR155')for(const node of root.listNodes().filter(n=>n.getMesh())){
  const box=getBounds(node),x=(box.min[0]+box.max[0])/2;
  if(x>2)node.dispose();
 }
 if(model.id==='CAR187')scene.listChildren()[0].setRotation([0,0,0,1]);
 if(model.id==='CAR164')for(const mat of root.listMaterials())if(mat.getAlphaMode()==='BLEND')mat.setAlphaMode('MASK').setAlphaCutoff(.5);
 if(model.id==='CAR170')for(const mesh of root.listMeshes())for(const primitive of mesh.listPrimitives())if(primitive.getMode()!==4)mesh.removePrimitive(primitive);
 if(model.id==='CAR176'&&!root.listNodes().some(n=>n.getName().startsWith('game_wheel_'))){
  const buffer=root.listBuffers()[0],tire=doc.createMaterial('CarPlayground_game_tire').setBaseColorFactor([.018,.018,.021,1]).setRoughnessFactor(.9).setMetallicFactor(0);
  const alloy=doc.createMaterial('CarPlayground_game_rim').setBaseColorFactor([.5,.54,.58,1]).setRoughnessFactor(.3).setMetallicFactor(.65);
  const primitive=(geometry,material)=>{const p=doc.createPrimitive().setMaterial(material);for(const [name,type]of [['position',Accessor.Type.VEC3],['normal',Accessor.Type.VEC3],['uv',Accessor.Type.VEC2]]){const attr=geometry.getAttribute(name);if(attr)p.setAttribute({position:'POSITION',normal:'NORMAL',uv:'TEXCOORD_0'}[name],doc.createAccessor().setType(type).setArray(new Float32Array(attr.array)).setBuffer(buffer));}if(geometry.index)p.setIndices(doc.createAccessor().setType(Accessor.Type.SCALAR).setArray(new Uint32Array(geometry.index.array)).setBuffer(buffer));geometry.dispose();return p;};
  const rubber=new T.CylinderGeometry(325,325,210,28).rotateZ(Math.PI/2),rim=new T.CylinderGeometry(220,220,218,20).rotateZ(Math.PI/2);
  const mesh=doc.createMesh('Original game wheel').addPrimitive(primitive(rubber,tire)).addPrimitive(primitive(rim,alloy));
  for(const x of [-870,870])for(const z of [-1320,1320])scene.addChild(doc.createNode(`game_wheel_${x}_${z}`).setMesh(mesh).setTranslation([x,220,z]));
 }
 await doc.transform(prune(),meshopt({encoder:MeshoptEncoder,level:'medium'}));await io.write(filename,doc);
 const bytes=await fs.readFile(filename);model.bytes=bytes.length;model.sha256=hash(bytes);
 model.source.modifications+=' '+operations[model.id];
 const asset=release.assets.find(a=>a.id==='model-'+model.id);asset.sha256=model.sha256;asset.source+=' '+operations[model.id];
 evidence.push({id:model.id,sourceUrl:model.source.url,inputSha256:hash(before),outputSha256:model.sha256,operation:operations[model.id]});
 console.log(model.id,operations[model.id]);
}
await fs.writeFile('content/vehicle-models.json',JSON.stringify(models,null,2)+'\n');
await fs.writeFile('content/r3.json',JSON.stringify(release,null,2)+'\n');
await fs.writeFile('content/model-preparation.json',JSON.stringify(evidence,null,2)+'\n');
