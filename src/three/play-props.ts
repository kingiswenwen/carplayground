import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Purpose-built toy objects. These are presentation meshes, never task geometry.
// Keep a cheap single-pass surface on software GL while retaining real silhouettes.
const C={teal:'#608f91',cream:'#fff1d5',coral:'#cf8065',honey:'#e9b953',metal:'#bac7c6',ink:'#354b4d',wood:'#b88b5e'};
export const toyMaterial=(color:string,roughness=.65)=>new T.MeshPhongMaterial({color,specular:'#65716a',shininess:Math.max(8,(1-roughness)*65)});
export function toyBox(w:number,h:number,d:number,color:string,radius=.08){const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/4,h/4,d/4)),toyMaterial(color));mesh.castShadow=true;mesh.receiveShadow=true;return mesh;}
function sphere(radius:number,color:string){const mesh=new T.Mesh(new T.SphereGeometry(radius,20,12),toyMaterial(color));mesh.castShadow=true;return mesh;}
function cylinder(top:number,bottom:number,height:number,color:string){const mesh=new T.Mesh(new T.CylinderGeometry(top,bottom,height,24),toyMaterial(color,.4));mesh.castShadow=true;return mesh;}
function ring(radius:number,tube:number,color:string,arc=Math.PI*2){return new T.Mesh(new T.TorusGeometry(radius,tube,8,32,arc),toyMaterial(color,.3));}
function add(parent:T.Object3D,object:T.Object3D,x=0,y=0,z=0){object.position.set(x,y,z);parent.add(object);return object;}
function line(parent:T.Object3D,points:number[][],color:string,radius=.025){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));const mesh=new T.Mesh(new T.TubeGeometry(curve,16,radius,5,false),toyMaterial(color));parent.add(mesh);return mesh;}
function dot(parent:T.Object3D,x:number,y:number,z:number,radius:number,color:string){return add(parent,sphere(radius,color),x,y,z);}

export function makePlayProp(name:string):T.Group|undefined{
 const group=new T.Group();group.name=`toy-${name}`;
 switch(name){
  case 'bag':{
   add(group,toyBox(1.35,1.65,.6,C.coral,.16),0,.88);
   add(group,toyBox(1,.63,.18,'#e5a080',.12),0,.55,.34);
   add(group,toyBox(.035,.52,.04,C.cream),.42,.56,.45);
   add(group,toyBox(.1,.17,.055,C.teal),.42,.48,.49);
   add(group,ring(.24,.065,C.cream,Math.PI),0,1.73);
   for(const x of [-.43,.43])line(group,[[x,1.5,-.25],[x,1.1,-.68],[x,.25,-.3]],C.cream,.075);
   for(const x of [-.55,.55])line(group,[[x,.35,.31],[x,1.35,.31],[x*.6,1.59,.31]],'#f1c9aa',.017);
   break;
  }
  case 'coat':{
   add(group,toyBox(1.1,1.3,.38,C.honey,.12),0,.78);
   for(const sign of [-1,1]){const sleeve=toyBox(.43,.95,.36,C.honey,.1);sleeve.rotation.z=sign*.48;add(group,sleeve,sign*.69,1.02);add(group,toyBox(.33,.32,.06,'#f2cf78'),sign*.29,.57,.22);}
   dot(group,0,1.55,0,.44,C.honey);const opening=dot(group,0,1.55,.2,.31,'#d5b174');opening.scale.z=.35;
   add(group,toyBox(.035,1.12,.035,C.cream),0,.78,.23);
   for(const y of [.4,.74,1.08])dot(group,.12,y,.24,.045,C.teal);
   break;
  }
  case 'cap':{
   const dome=new T.Mesh(new T.SphereGeometry(.7,24,14,0,Math.PI*2,0,Math.PI/2),toyMaterial(C.teal));add(group,dome,0,.17);
   const brim=sphere(.8,'#548285');brim.scale.set(1,.09,.8);add(group,brim,.03,.16,.56);
   dot(group,0,.9,0,.075,C.teal);
   for(const x of [-.38,.38])line(group,[[0,.87,.04],[x*.7,.67,.42],[x,.23,.6]],'#c5d4ba',.015);
   line(group,[[-.66,.19,.9],[0,.2,1.22],[.7,.19,.9]],'#e8debd',.016);
   break;
  }
  case 'water':{
   add(group,cylinder(.34,.3,1.2,'#9bc8cb'),0,.68);
   add(group,cylinder(.345,.32,.06,C.teal),0,.11);
   add(group,cylinder(.37,.37,.24,C.cream),0,1.35);
   add(group,toyBox(.4,.31,.035,'#dce8d9'),0,.72,.325);
   add(group,ring(.2,.06,C.coral),.38,1.42);
   line(group,[[-.17,.38,.3],[-.22,.9,.25],[-.16,1.11,.28]],'#eaf7ec',.035);
   break;
  }
  case 'shower':{
   line(group,[[-.7,.07,0],[-.5,.4,0],[-.3,.7,0],[.13,1.12,0]],C.teal,.11);
   const head=cylinder(.42,.36,.18,C.metal);head.rotation.x=Math.PI/2;add(group,head,.13,1.2,.05);
   const face=cylinder(.34,.34,.035,'#dbe2d7');face.rotation.x=Math.PI/2;add(group,face,.13,1.2,.16);
   for(let i=0;i<7;i++){const a=i*Math.PI*2/7;dot(group,.13+Math.cos(a)*.22,1.2+Math.sin(a)*.22,.19,.032,C.ink);}
   for(let i=0;i<3;i++){const drop=dot(group,-.15+i*.23,.5-i*.1,.15,.085,'#8fcbd5');drop.scale.y=1.8;}
   break;
  }
  case 'sponge':{
   add(group,toyBox(1.55,.5,1,'#dca33f',.13),0,.3);
   add(group,toyBox(1.54,.17,1,'#f2cb65',.12),0,.6);
   for(let i=0;i<12;i++){const pore=sphere(.045+(i%3)*.012,'#ca9740');pore.scale.y=.3;add(group,pore,(i%4-1.5)*.32,.697,(Math.floor(i/4)-1)*.3);}
   for(const [x,y,z,r]of [[-.45,.8,-.2,.2],[.12,.81,-.25,.25],[.5,.79,.05,.16]])dot(group,x,y,z,r,'#f6fcf0');
   break;
  }
  case 'wheel':{
   add(group,ring(.6,.19,'#354044'),0,.8);
   const rim=cylinder(.43,.43,.17,C.metal);rim.rotation.x=Math.PI/2;add(group,rim,0,.8);
   const dark=cylinder(.35,.35,.19,'#5b6b6a');dark.rotation.x=Math.PI/2;add(group,dark,0,.8);
   for(let i=0;i<5;i++){const a=i*Math.PI*2/5,spoke=toyBox(.1,.65,.11,'#dfe5dc',.025);spoke.rotation.z=a;add(group,spoke,0,.8,.13);}
   dot(group,0,.8,.2,.13,C.metal);
   for(let i=0;i<16;i++){const a=i*Math.PI/8,tread=toyBox(.11,.05,.25,'#435054',.015);tread.rotation.z=a;add(group,tread,Math.sin(a)*.78,.8+Math.cos(a)*.78);}
   break;
  }
  case 'tool':{
   add(group,toyBox(.26,1.25,.14,C.metal,.08),0,.77);
   add(group,toyBox(.32,.63,.16,C.coral,.07),0,.7,.015);
   add(group,ring(.22,.09,C.metal),0,.09);
   for(const sign of [-1,1]){const jaw=toyBox(.2,.64,.18,C.metal,.06);jaw.rotation.z=sign*.48;add(group,jaw,sign*.21,1.6);}
   add(group,toyBox(.54,.22,.18,C.metal),0,1.33);
   break;
  }
  case 'lamp':{
   add(group,cylinder(.27,.28,1.1,C.honey),0,.65);
   add(group,cylinder(.3,.3,.16,C.teal),0,.12);
   add(group,cylinder(.42,.31,.32,C.teal),0,1.31);
   add(group,cylinder(.43,.43,.08,C.metal),0,1.5);
   add(group,cylinder(.35,.35,.045,'#fff0bf'),0,1.55);
   add(group,toyBox(.17,.3,.065,C.teal),0,.9,.27);
   group.rotation.z=-.42;
   break;
  }
  case 'umbrella':{
   for(let i=0;i<8;i++){const panel=new T.Mesh(new T.SphereGeometry(1,6,8,i*Math.PI/4,Math.PI/4,0,Math.PI/2),toyMaterial(i%2?'#dfa187':C.coral));panel.scale.y=.44;add(group,panel,0,1.55);}
   for(let i=0;i<8;i++){const a=i*Math.PI/4;line(group,[[0,2,0],[Math.cos(a)*.7,1.87,Math.sin(a)*.7],[Math.cos(a),1.55,Math.sin(a)]],'#f0c6a4',.018);}
   add(group,cylinder(.035,.035,1.55,C.metal),0,.78);
   const hook=ring(.18,.047,C.teal,Math.PI);hook.rotation.z=Math.PI;add(group,hook,-.18,.13);
   dot(group,0,2.02,0,.055,C.teal);
   break;
  }
  case 'belt':{
   const diagonal=toyBox(.19,1.9,.1,C.teal,.04);diagonal.rotation.z=-.62;add(group,diagonal,0,.9);
   add(group,toyBox(1.5,.18,.1,C.teal),0,.33);
   for(const x of [-.28,.28])add(group,toyBox(.09,.6,.17,C.metal),x,.65,.08);
   for(const y of [.39,.91])add(group,toyBox(.6,.09,.17,C.metal),0,y,.08);
   add(group,toyBox(.26,.2,.08,C.coral),0,.65,.19);
   break;
  }
  case 'seat':{
   add(group,toyBox(1.25,.25,1.15,'#7fa4a1',.12),0,.65,.15);
   add(group,toyBox(1.25,1.35,.3,C.teal,.18),0,1.25,-.4);
   add(group,toyBox(.8,.42,.22,'#a9c2b7',.1),0,1.78,-.2);
   for(const x of [-.45,.45])for(const z of [-.3,.5])add(group,toyBox(.1,.6,.1,C.metal),x,.3,z);
   break;
  }
  case 'hand':{
   add(group,toyBox(.8,.8,.3,'#e8b889',.15),0,.69);
   add(group,toyBox(.24,.92,.27,'#efc99e',.11),-.26,1.43);
   for(let i=0;i<3;i++)add(group,toyBox(.23,.43,.3,'#eac091',.1),-.01+i*.23,1.13-i*.055,.08);
   const thumb=toyBox(.28,.65,.29,'#efc99e',.1);thumb.rotation.z=.7;add(group,thumb,-.46,.87,.13);
   add(group,toyBox(.76,.22,.36,'#97aa86',.07),0,.2);
   break;
  }
  case 'box':{
   add(group,toyBox(1.45,1.15,1.05,'#c49a6a',.08),0,.6);
   add(group,toyBox(1.53,.15,1.12,'#dfb77d'),0,1.2);
   add(group,toyBox(.24,1.08,.035,'#f0d4a0'),0,.63,.54);
   add(group,toyBox(.24,.035,1.13,'#f0d4a0'),0,1.29);
   for(const x of [-.61,.61])add(group,toyBox(.06,.75,.035,'#e5c28d'),x,.6,.55);
   break;
  }
  case 'cart':{
   add(group,toyBox(1.55,.2,1.1,'#d7b17b',.08),0,.51);
   for(const x of [-.5,.5])for(const z of [-.53,.53]){add(group,ring(.15,.07,'#3f4c4b'),x,.23,z);const hub=cylinder(.11,.11,.08,C.metal);hub.rotation.x=Math.PI/2;add(group,hub,x,.23,z);}
   line(group,[[-.68,.5,-.45],[-.82,1.45,-.45],[-.82,1.6,0],[-.82,1.45,.45],[-.68,.5,.45]],C.teal,.065);
   for(const z of [-.25,.25])add(group,toyBox(1.45,.015,.025,'#bb925f'),0,.62,z);
   break;
  }
  case 'flag':{
   add(group,cylinder(.045,.045,1.8,C.wood),0,.95);
   const cloth=toyBox(.98,.62,.065,C.coral,.035);add(group,cloth,.5,1.5);
   dot(group,0,1.92,0,.085,C.honey);
   add(group,cylinder(.4,.48,.16,'#9aaf85'),0,.08);
   break;
  }
  case 'arrow':{
   const shape=new T.Shape();shape.moveTo(-.8,-.2);shape.lineTo(.15,-.2);shape.lineTo(.15,-.5);shape.lineTo(.85,0);shape.lineTo(.15,.5);shape.lineTo(.15,.2);shape.lineTo(-.8,.2);shape.closePath();
   const arrow=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:2,steps:1}),toyMaterial(C.teal));arrow.rotation.x=-Math.PI/2;arrow.castShadow=true;group.add(arrow);
   break;
  }
  case 'paper':{
   add(group,toyBox(1.32,.055,1.45,'#d1c7a9',.02),-.035,.035,-.035);
   const sheet=toyBox(1.32,.045,1.45,'#eef1d6',.02);sheet.material.name='paper-sheet';add(group,sheet,0,.1);
   add(group,toyBox(.25,.015,.25,C.cream,.02),.5,.13,-.55);
   break;
  }
  case 'friend':{
   for(const x of [-.18,.18]){add(group,toyBox(.23,.48,.3,'#668d75'),x,.3);add(group,toyBox(.28,.15,.42,C.wood),x,.08,.07);}
   add(group,toyBox(.65,.73,.4,'#7d9b7c',.12),0,.86);
   for(const sign of [-1,1]){const arm=toyBox(.2,.65,.23,C.cream);arm.rotation.z=sign*.25;add(group,arm,sign*.45,.92);dot(group,sign*.49,.58,.02,.115,'#dca878');}
   dot(group,0,1.53,.01,.35,'#e8b787');
   const cap=new T.Mesh(new T.SphereGeometry(.36,20,10,0,Math.PI*2,0,Math.PI/2),toyMaterial(C.coral));add(group,cap,0,1.65);
   add(group,toyBox(.55,.05,.32,C.coral),0,1.67,.19);
   for(const x of [-.12,.12])dot(group,x,1.55,.34,.025,C.ink);
   line(group,[[-.09,1.4,.33],[0,1.37,.35],[.09,1.4,.33]],C.wood,.015);
   add(group,toyBox(.26,.24,.035,C.cream),0,.91,.22);
   break;
  }
  case 'tree':{
   add(group,cylinder(.1,.17,1.1,C.wood),0,.55);
   for(const [x,y,z,r,color]of [[0,1.7,0,.7,'#87a96f'],[-.47,1.4,.1,.48,'#9ab981'],[.45,1.55,.1,.53,'#a9be85']]as const){const leaf=dot(group,x,y,z,r,color);leaf.scale.y=1.12;}
   break;
  }
  case 'sun':{
   dot(group,0,1,0,.6,C.honey);
   for(let i=0;i<8;i++){const a=i*Math.PI/4,ray=toyBox(.13,.36,.13,C.honey);ray.rotation.z=-a;add(group,ray,Math.sin(a)*.94,1+Math.cos(a)*.94);}
   break;
  }
  case 'book':{
   add(group,toyBox(1.65,.12,1.16,C.teal),0,.11);
   for(const sign of [-1,1]){const pages=toyBox(.78,.23,1.06,C.cream,.05);pages.rotation.z=-sign*.08;add(group,pages,sign*.39,.28);for(let i=0;i<3;i++)add(group,toyBox(.73,.012,1.07,'#e4d3b4'),sign*.4,.18+i*.035);}
   add(group,toyBox(.14,.025,.38,C.coral),.2,.11,.69);
   break;
  }
  case 'garage':case 'home':{
   add(group,toyBox(1.5,1.2,1.1,'#a7b49a',.07),0,.6);
   const shape=new T.Shape();shape.moveTo(-.9,0);shape.lineTo(0,.6);shape.lineTo(.9,0);shape.closePath();
   add(group,new T.Mesh(new T.ExtrudeGeometry(shape,{depth:1.3,bevelEnabled:true,bevelSize:.035,bevelThickness:.03,bevelSegments:2,steps:1}),toyMaterial(C.coral)),0,1.2,-.65);
   add(group,toyBox(name==='garage'?1.05:.48,.88,.07,C.cream),0,.45,.59);
   add(group,toyBox(name==='garage'?.88:.34,.75,.08,C.teal),0,.4,.64);
   if(name==='garage')for(let i=0;i<4;i++)add(group,toyBox(.83,.025,.035,'#a7c4ba'),0,.15+i*.17,.69);
   break;
  }
  case 'rain':case 'cloud':{
   for(const [x,y,r]of [[-.5,1.1,.4],[0,1.35,.5],[.48,1.1,.36]])dot(group,x,y,0,r,name==='rain'?'#a9c4cc':'#e4eddd');
   if(name==='rain')for(let i=0;i<4;i++){const drop=dot(group,-.55+i*.36,.43-i%2*.15,.08,.09,'#6daec5');drop.scale.y=1.8;}
   break;
  }
  default:return undefined;
 }
 return group;
}
