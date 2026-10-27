/** Import a reviewed source manifest. Raw downloads and metadata live outside public source. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,simplify,prune,textureCompress,meshopt} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
const [manifest,rawRoot,output]=process.argv.slice(2);
if(!manifest||!rawRoot||!output)throw Error('Usage: import-vehicle-models <reviewed manifest> <raw directory> <output manifest>');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const rows=JSON.parse(await fs.readFile(manifest,'utf8')),existing=JSON.parse(await fs.readFile('content/vehicle-models.json','utf8')),results=[];
const reuse={'lamborghini-revuelto':'CAR01','porsche-gt3-rs':'CAR03','mercedes-benz-amg-gt':'CAR10','audi-r8':'CAR11','bugatti-chiron':'CAR05','pagani-huayra':'CAR06','lexus-lc-500':'CAR12','dodge-viper':'CAR29'};
let next=31;
for(const row of rows){
 const id=row.appId||reuse[row.id]||`CAR${String(next++).padStart(2,'0')}`,previous=existing.find(x=>x.id===id);
 if(previous){results.push({...row,spec:previous});continue;}
 const file=`media/models/${id.toLowerCase()}.glb`,target=path.join('public',file);
 let bytes;try{bytes=await fs.readFile(target);}catch{
 const raw=path.join(rawRoot,row.file);for(let wait=0;wait<600;wait++){try{await fs.access(raw);break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 const doc=await io.read(raw);
 const root=doc.getRoot();const triangles=root.listMeshes().reduce((sum,m)=>sum+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION')?.getCount()||0)/3,0),0);
 await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:Math.min(1,70000/Math.max(1,triangles)),error:.001,lockBorder:true}),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[768,768]}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
 await fs.mkdir(path.dirname(target),{recursive:true});await io.write(target,doc);bytes=await fs.readFile(target);
 }
 const license=row.verifiedSource.license.slug,lic=license==='by-sa'?'CC BY-SA 4.0':license==='cc0'?'CC0 1.0':'CC BY 4.0';
 const spec={id,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),preservePaint:true,color:'#d8b764',rotationY:0,paintMaterials:row.paint?.materials||[],lampMaterials:[],excludedNodes:[],recalculateNormals:false,source:{title:row.verifiedSource.name,author:row.credit.author,authorUrl:row.credit.authorUrl,url:row.credit.sourceUrl,license:lic,licenseUrl:license==='cc0'?'https://creativecommons.org/publicdomain/zero/1.0/':`https://creativecommons.org/licenses/${license}/4.0/`,mirror:row.mirror||`https://github.com/pedrosoandre/carros/blob/2d18dfd9db96bbf0d9cffa949deaf7f571388cbf/assets/${row.file}`,modifications:'Authored proportions and textures retained; bounded-error mesh simplification, WebP texture resizing and meshopt compression. App uses uniform fitting and camera controls.'}};
 results.push({...row,spec});console.log(`${id} ${row.id}: ${bytes.length}`);
 await fs.writeFile(output,JSON.stringify(results,null,2)+'\n');
}
await fs.writeFile(output,JSON.stringify(results,null,2)+'\n');
