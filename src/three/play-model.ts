import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {separateWheelMeshes} from './wheel-meshes';
import {assetUrl} from '../domain/content';
import {vehicleModel} from '../domain/vehicle-models';
import {fitModel,disposeModel,removeModelNodes} from './model';

export type PlayVehicle={root:T.Group;wheels:T.Object3D[];paint:T.MeshStandardMaterial[];lights:T.MeshStandardMaterial[];bounds:T.Box3};
export async function loadPlayVehicle(carId:string,signal:AbortSignal):Promise<PlayVehicle>{
 const spec=vehicleModel(carId);if(!spec)throw Error('该车型独立模型尚未接入');
 const response=await fetch(assetUrl((spec.playFile?'model-play-':'model-')+carId),{signal});if(!response.ok)throw Error('模型暂时无法打开');
 const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(await response.arrayBuffer(),'');
 if(signal.aborted){disposeModel(gltf.scene);throw Error('模型已取消');}
 const root=gltf.scene;
 removeModelNodes(root,spec.excludedNodes);
 let bounds=fitModel(root,spec.rotationY),size=bounds.getSize(new T.Vector3());
 if(size.z>size.x)bounds=fitModel(root,Math.PI/2);
 separateWheelMeshes(root);
 const wheels:T.Object3D[]=[],paint:T.MeshStandardMaterial[]=[],lights:T.MeshStandardMaterial[]=[];
 root.traverse(object=>{if(!(object instanceof T.Mesh))return;object.castShadow=true;object.receiveShadow=true;
  // Transmission / clearcoat require costly extra scene passes. Gameplay uses the
  // same authored color, textures and mesh with a standard PBR surface.
  const standard=(m:T.Material)=>{if(!(m instanceof T.MeshPhysicalMaterial))return m;const out=new T.MeshStandardMaterial();T.MeshStandardMaterial.prototype.copy.call(out,m);out.name=m.name;m.dispose();return out;};
  object.material=Array.isArray(object.material)?object.material.map(standard):standard(object.material);
  const materials=Array.isArray(object.material)?object.material:[object.material];
  for(const material of materials){if(!(material instanceof T.MeshStandardMaterial))continue;
   if(spec.paintMaterials.includes(material.name)){if(!spec.preservePaint)material.color.set(spec.color);material.roughness=Math.max(.25,material.roughness);material.metalness=Math.min(.6,material.metalness);paint.push(material);}
   if(spec.lampMaterials.includes(material.name)||/head.?light|head.?lamp/i.test(material.name))lights.push(material);
  }
  const box=new T.Box3().setFromObject(object,true),s=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
  if(/wheel|tire|tyre|pneu|rim/i.test(object.name+' '+materials.map(m=>m.name).join(' '))&&s.x<1.65&&s.y<1.65&&s.y>.15&&center.y<1)wheels.push(object);
 });
 return{root,wheels,paint:[...new Set(paint)],lights:[...new Set(lights)],bounds};
}
