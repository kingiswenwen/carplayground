import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {fitModel,disposeModel,removeModelNodes} from '../src/three/model';
import type {VehicleModelSpec} from '../src/domain/vehicle-models';
const renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;document.body.append(renderer.domElement);
const scene=new T.Scene();scene.add(new T.HemisphereLight('#e8f6ff','#b8ab91',2.1));
for(const [x,y,z,intensity]of [[-3,7,5,2.5],[4,3,-4,1.1]]){const l=new T.DirectionalLight('#fff7e7',intensity);l.position.set(x,y,z);scene.add(l);}
const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04,.1,60,{size:32});scene.environment=environment.texture;scene.environmentIntensity=.6;room.dispose();pmrem.dispose();
let root:T.Group|undefined;
async function bake(spec:VehicleModelSpec&{absoluteFile?:string}){
 if(root){scene.remove(root);disposeModel(root);}renderer.info.reset();
 const response=await fetch(spec.absoluteFile?'/@fs'+spec.absoluteFile:'/'+spec.file);if(!response.ok)throw Error('GLB unavailable '+spec.id);
 root=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(await response.arrayBuffer(),'')).scene;
 removeModelNodes(root,spec.excludedNodes);
 let box=fitModel(root,spec.rotationY);if(box.getSize(new T.Vector3()).z>box.getSize(new T.Vector3()).x)box=fitModel(root,Math.PI/2);
 root.traverse(o=>{if(o instanceof T.Mesh){if(!o.geometry.getAttribute('normal'))o.geometry.computeVertexNormals();for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m instanceof T.MeshStandardMaterial&&spec.paintMaterials.includes(m.name)&&!spec.preservePaint){m.color.set(spec.color);m.metalness=.55;m.roughness=.3;}if(m instanceof T.MeshPhysicalMaterial){m.transmission=0;m.clearcoat=0;}}}});
 scene.add(root);const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
 const camera=new T.OrthographicCamera(-3,3,2,-2,.1,60);
 const views:Record<string,string>={},points:Record<string,{x:number;y:number}>={};
 const wheelCandidates:{x:number;y:number;r:number}[]=[];
 for(const [id,offset,w,h]of [['side',[0,.8,10],1000,450],['top',[0,10,.001],1000,450],['front-left',[8,4,9],800,480],['front',[10,2,0],800,480],['front-right',[8,4,-9],800,480],['left',[0,2,10],800,480],['rear',[-10,2,0],800,480],['right',[0,2,-10],800,480]] as [string,number[],number,number][]){
  if(new URLSearchParams(location.search).has('basic')&&!['side','top','front-left'].includes(id))continue;
  renderer.setSize(w,h);camera.up.set(0,1,0);if(id==='top')camera.up.set(0,0,-1);
  camera.position.copy(center).add(new T.Vector3(...offset));camera.lookAt(center);
  const projected:T.Vector3[]=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])projected.push(new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  // Update matrices before fitting, including after switching the camera's up axis.
  camera.updateMatrixWorld(true);const corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  const bound=new T.Box3().setFromPoints(corners),extent=bound.getSize(new T.Vector3()),half=Math.max(extent.y/2,extent.x/(w/h)/2)*1.1;
  camera.left=-half*w/h;camera.right=half*w/h;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.render(scene,camera);views[id]=renderer.domElement.toDataURL('image/png');
  if(id==='side'){
   const project=(p:T.Vector3)=>{p.project(camera);return{x:(p.x+1)/2,y:(1-p.y)/2};};
   root.traverse(o=>{if(!(o instanceof T.Mesh))return;const names=o.name+' '+(Array.isArray(o.material)?o.material:[o.material]).map(m=>m.name).join(' ');if(!/wheel|tire|tyre|rim|pneu/i.test(names))return;const b=new T.Box3().setFromObject(o),s=b.getSize(new T.Vector3()),p=b.getCenter(new T.Vector3());if(s.y>.2&&s.y<1&&s.x<1.5&&p.y<1){const q=project(p.clone());wheelCandidates.push({...q,r:Math.min(.12,Math.max(.065,s.y/(half*2)*.5))});}});
   points.door=project(new T.Vector3(center.x,box.min.y+size.y*.48,box.max.z));points.light=project(new T.Vector3(box.max.x*.95,box.min.y+size.y*.35,box.max.z*.8));
  }
 }
 const wheels=[...wheelCandidates].sort((a,b)=>a.x-b.x);const wheelPoints=wheels.length>=2?[wheels[0],wheels.at(-1)!]:[{x:.25,y:.77,r:.09},{x:.75,y:.77,r:.09}];points.wheel={x:wheelPoints[0].x,y:wheelPoints[0].y};
 return{views,wheels:wheelPoints,points,bounds:size.toArray(),triangles:renderer.info.render.triangles};
}
(window as unknown as {modelBaker:typeof bake}).modelBaker=bake;
