import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createVehicle,vehicleProfiles} from '../src/three/vehicle';
class ExportReader {
 result:ArrayBuffer|string|null=null;onloadend:(()=>void)|null=null;
 readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}
 readAsDataURL(blob:Blob){void blob.arrayBuffer().then(result=>{this.result=`data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;this.onloadend?.();});}
}
Object.assign(globalThis,{FileReader:ExportReader});
await fs.mkdir('public/media/models',{recursive:true});
const factorySha256=createHash('sha256').update(await fs.readFile('src/three/vehicle.ts')).digest('hex');
const records=[];
for(const profile of vehicleProfiles){
 // Ship the complete lower-density mesh; the interactive renderer uses full detail.
 const model=createVehicle(profile.id,'low');const data=await new GLTFExporter().parseAsync(model.root,{binary:true});
 if(!(data instanceof ArrayBuffer))throw Error('Expected binary model');const bytes=Buffer.from(data),file=`media/models/${profile.id.toLowerCase()}.glb`;
 await fs.writeFile(path.join('public',file),bytes);records.push({...profile,file,exportDetail:'low',factorySha256,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,source:'Original GPT-authored parametric 3D game geometry; no downloaded manufacturer mesh or image-to-3D claim',views:'shared mesh: front, rear, left, right, top and arbitrary intermediate angles'});model.dispose();
}
await fs.writeFile('content/vehicle-models.json',JSON.stringify(records,null,2)+'\n');console.log(`Exported ${records.length} complete 3D game models.`);

const content=JSON.parse(await fs.readFile('content/r3.json','utf8'));
content.assets=content.assets.filter((a:{kind:string})=>a.kind!=='model');
for(const model of records)content.assets.push({id:'model-'+model.id,kind:'model',path:model.file,sha256:model.sha256,status:'approved',source:model.source});
await fs.writeFile('content/r3.json',JSON.stringify(content,null,2)+'\n');
