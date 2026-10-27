import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,simplify,prune,textureCompress,meshopt} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const models=JSON.parse(await fs.readFile('content/vehicle-models.json','utf8'));
const release=JSON.parse(await fs.readFile('content/r3.json','utf8'));
const selected=process.argv.slice(2);
for(const model of models){
 if(selected.length&&!selected.includes(model.id))continue;
 const document=await io.read(path.join('public',model.file));
 await document.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.22,error:.0008,lockBorder:true}),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512]}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
 const output=`media/models/play/${model.id.toLowerCase()}.glb`;await fs.mkdir(path.dirname(path.join('public',output)),{recursive:true});
 await io.write(path.join('public',output),document);const bytes=await fs.readFile(path.join('public',output));const hash=createHash('sha256').update(bytes).digest('hex');
 model.playFile=output;model.playBytes=bytes.length;model.playSha256=hash;
 const asset={id:'model-play-'+model.id,kind:'model',path:output,sha256:hash,status:'approved',source:`Gameplay LOD derived from ${model.source.url}; bounded-error simplification, 512px WebP textures and meshopt compression. ${model.source.license}; ${model.source.author}.`};
 const index=release.assets.findIndex(a=>a.id===asset.id);if(index>=0)release.assets[index]=asset;else release.assets.push(asset);
 console.log(`${model.id}: ${model.bytes} -> ${bytes.length}`);
}
await fs.writeFile('content/vehicle-models.json',JSON.stringify(models,null,2)+'\n');
await fs.writeFile('content/r3.json',JSON.stringify(release,null,2)+'\n');
