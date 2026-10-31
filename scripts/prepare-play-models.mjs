import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {flatten,join,weld,simplify,prune,textureCompress,meshopt,getSceneVertexCount,VertexCountMethod} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const models=JSON.parse(await fs.readFile('content/vehicle-models.json','utf8'));
const release=JSON.parse(await fs.readFile('content/r3.json','utf8'));
const selected=process.argv.slice(2);
const statistics=[];
const gameSimplifier={...MeshoptSimplifier,simplify:(indices,positions,stride,target,error,flags)=>MeshoptSimplifier.simplify(indices,positions,stride,target,error,[...flags,'Permissive','Prune'])};
for(const model of models){
 if(selected.length&&!selected.includes(model.id))continue;
 const document=await io.read(path.join('public',model.file));
 // Exported wire overlays can contain more edges than the solid car has faces.
 for(const mesh of document.getRoot().listMeshes())for(const primitive of mesh.listPrimitives())if(![4,5,6].includes(primitive.getMode()))mesh.removePrimitive(primitive);
 const triangles=document.getRoot().listScenes().reduce((sum,scene)=>sum+getSceneVertexCount(scene,VertexCountMethod.RENDER)/3,0);
 // Budget the actual scene, including repeated wheels and other mesh instances.
 // Locking every UV border can leave a 300k-triangle source almost unchanged.
 await document.transform(flatten(),join(),weld(),simplify({simplifier:gameSimplifier,ratio:Math.min(.3,35000/Math.max(1,triangles)),error:.005,lockBorder:false}),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512]}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
 const output=`media/models/play/${model.id.toLowerCase()}.glb`;await fs.mkdir(path.dirname(path.join('public',output)),{recursive:true});
 await io.write(path.join('public',output),document);const bytes=await fs.readFile(path.join('public',output));const hash=createHash('sha256').update(bytes).digest('hex');
 model.playFile=output;model.playBytes=bytes.length;model.playSha256=hash;
 const asset={id:'model-play-'+model.id,kind:'model',path:output,sha256:hash,status:'approved',source:`Gameplay LOD derived from ${model.source.url}; solid surfaces retained, exporter wire overlays removed, compatible static meshes batched, bounded-error simplification, 512px WebP textures and meshopt compression. ${model.source.license}; ${model.source.author}.`};
 const index=release.assets.findIndex(a=>a.id===asset.id);if(index>=0)release.assets[index]=asset;else release.assets.push(asset);
 const after=document.getRoot().listScenes().reduce((sum,scene)=>sum+getSceneVertexCount(scene,VertexCountMethod.RENDER)/3,0);
 statistics.push({id:model.id,sourceModelSha256:model.sha256,playSha256:hash,inputTriangles:Math.round(triangles),outputTriangles:Math.round(after),bytes:bytes.length,targetTriangles:35000,maxRelativeError:.005});
 console.log(`${model.id}: ${model.bytes} -> ${bytes.length} bytes; ${Math.round(triangles)} -> ${Math.round(after)} rendered triangles`);
}
await fs.writeFile('content/vehicle-models.json',JSON.stringify(models,null,2)+'\n');
await fs.writeFile('content/r3.json',JSON.stringify(release,null,2)+'\n');
let previous=[];try{previous=JSON.parse(await fs.readFile('content/model-lods.json','utf8'));}catch{}
await fs.writeFile('content/model-lods.json',JSON.stringify([...previous.filter(row=>!statistics.some(current=>current.id===row.id)),...statistics],null,2)+'\n');
