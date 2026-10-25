import * as T from 'three';

export type VehicleProfile={id:string;color:string;length:number;width:number;roof:number;cab:number;family:'wedge'|'round'|'gt'|'roadster'|'muscle';wing:boolean;lamps:'slash'|'round'|'bar';spokes:number};
const specs:[VehicleProfile['family'],string,number,number,number,number,boolean,VehicleProfile['lamps']][]=[
 ['wedge','#ffc928',4.65,1.96,1.20,.1,false,'slash'],['wedge','#e52c36',4.52,1.90,1.26,.05,false,'slash'],['round','#62bd91',4.52,1.86,1.40,-.3,true,'round'],['wedge','#f18b32',4.55,1.92,1.22,.02,false,'slash'],['round','#2766cf',4.60,2,1.28,-.04,false,'bar'],
 ['wedge','#d5d9d9',4.72,1.99,1.20,-.1,true,'round'],['wedge','#b4df38',4.72,2.02,1.18,.06,true,'slash'],['gt','#266a4e',4.48,1.9,1.3,-.25,false,'slash'],['wedge','#f9cc27',4.58,1.92,1.22,.08,true,'slash'],['gt','#bc293c',4.72,1.92,1.28,-.3,false,'slash'],
 ['wedge','#3798e8',4.42,1.9,1.25,.04,false,'slash'],['gt','#e6af35',4.72,1.9,1.3,-.25,false,'slash'],['muscle','#3771cf',4.80,1.90,1.40,-.25,false,'bar'],['gt','#d92e34',4.40,1.84,1.28,-.25,false,'slash'],['gt','#e9ece8',4.32,1.78,1.34,-.15,false,'slash'],
 ['gt','#f7c938',4.38,1.82,1.28,-.3,false,'slash'],['roadster','#e58b3b',4.00,1.74,1.25,-.2,false,'round'],['muscle','#438be2',4.38,1.86,1.38,-.1,false,'bar'],['wedge','#a654db',4.42,1.94,1.18,.15,true,'slash'],['wedge','#de2934',4.58,1.94,1.22,.04,false,'slash'],
 ['round','#36b7bb',4.35,1.82,1.32,-.15,false,'round'],['wedge','#7b51d5',4.45,1.89,1.22,.12,false,'slash'],['wedge','#347ecb',4.62,1.94,1.20,.05,false,'slash'],['gt','#37945b',4.32,1.85,1.24,-.1,false,'slash'],['round','#488fde',4.10,1.78,1.25,-.12,false,'round'],
 ['gt','#225e41',4.46,1.84,1.28,-.3,false,'slash'],['wedge','#d9dfe1',4.55,1.9,1.24,.05,false,'slash'],['muscle','#e8792d',4.8,1.94,1.36,-.25,false,'slash'],['gt','#356ccc',4.62,1.94,1.22,-.35,true,'round'],['wedge','#e8ecea',4.60,1.88,1.26,.12,false,'slash']
];
export const vehicleProfiles:VehicleProfile[]=specs.map(([family,color,length,width,roof,cab,wing,lamps],i)=>({id:`CAR${String(i+1).padStart(2,'0')}`,family,color,length,width,roof,cab,wing,lamps,spokes:i%3===0?5:i%3===1?6:10}));
export type VehicleModel={root:T.Group;wheels:T.Group[];body:T.Group;lamps:T.Mesh[];profile:VehicleProfile;dispose:()=>void};
function mesh(g:T.BufferGeometry,m:T.Material,parent:T.Object3D,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function surface(vertices:number[],indices:number[],m:T.Material,parent:T.Object3D){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,m,parent);}
function tube(points:T.Vector3[],radius:number,m:T.Material,parent:T.Object3D){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),Math.max(10,points.length*6),radius,6,false),m,parent);}
const gauss=(x:number,c:number,w:number)=>Math.exp(-(((x-c)/w)**2));

/** Original sculpted toy geometry. Each view uses the same shell, never a picture billboard. */
export function createVehicle(id:string,detail:'full'|'low'='full'):VehicleModel{
 const p=vehicleProfiles.find(v=>v.id===id)||vehicleProfiles[0],root=new T.Group(),body=new T.Group(),wheels:T.Group[]=[],lamps:T.Mesh[]=[];
 root.name=p.id;root.add(body);
 const paint=new T.MeshPhysicalMaterial({color:p.color,metalness:.03,roughness:.62,clearcoat:.12,clearcoatRoughness:.45,envMapIntensity:.38});
 const trim=new T.MeshStandardMaterial({color:'#233039',metalness:.15,roughness:.4});
 const carbon=new T.MeshPhysicalMaterial({color:'#25313a',roughness:.26,metalness:.22,clearcoat:.65});
 const glass=new T.MeshPhysicalMaterial({color:'#172e3e',metalness:.18,roughness:.21,clearcoat:.8,clearcoatRoughness:.16,envMapIntensity:1.0});
 const rubber=new T.MeshStandardMaterial({color:'#22282c',roughness:.85});
 const silver=new T.MeshStandardMaterial({color:'#aebcc5',metalness:.72,roughness:.32});
 const brake=new T.MeshStandardMaterial({color:'#70777a',metalness:.75,roughness:.55});
 const red=new T.MeshStandardMaterial({color:'#d7443e',roughness:.35,metalness:.12});
 const tail=new T.MeshStandardMaterial({color:'#f35349',emissive:'#b52515',emissiveIntensity:.45,roughness:.25});
 const white=new T.MeshStandardMaterial({color:'#fffaf0',emissive:'#ffedc7',emissiveIntensity:.65,roughness:.18});
 const L=p.length,W=p.width,axle=L*.30,r=.43,wy=.44,wedge=p.family==='wedge';
 const hood=(x:number)=> (p.family==='muscle'?.83:.73)+.075*gauss(x,-L*.28,.6)-(wedge?.25:.12)*gauss(x,L*.51,.43);
 const widthAt=(x:number)=>W/2*(.78+.13*Math.sin(Math.PI*(x/L+.5))+.09*(gauss(x,axle,.46)+gauss(x,-axle,.46)));
 const fender=(x:number)=>.22*(gauss(x,axle,.48)+gauss(x,-axle,.48));
 const shellX=(x:number,z:number)=>x-.18*(Math.abs(z)/widthAt(x))**3*gauss(x,L/2,.34);
 const topY=(x:number,z:number)=>hood(x)+fender(x)*(z/widthAt(x))**2+.035*(1-(z/widthAt(x))**2);
 const nx=detail==='low'?40:100,nz=detail==='low'?12:30,vertices:number[]=[],indices:number[]=[];
 const count=nz+8;
 // One closed longitudinal loft shares its shoulder vertices and normals.
 // Elliptical openings meet the sill continuously, rather than leaving vertical cuts beside tires.
 for(let i=0;i<=nx;i++){
  const x=-L/2+L*i/nx,w=widthAt(x),high=topY(x,w);let low=.23;
  for(const center of [-axle,axle])if(Math.abs(x-center)<.51)low=Math.max(low,.23+.71*Math.sqrt(1-((x-center)/.51)**2));
  low=Math.min(low,high-.028);
  const ring:[number,number][]=[];
  for(let j=0;j<=nz;j++){const z=w*(-1+2*j/nz);ring.push([topY(x,z),z]);}
  ring.push([(high+low)/2,w*1.015],[low,w*.89],[.23,w*.60],[.22,0],[.23,-w*.60],[low,-w*.89],[(high+low)/2,-w*1.015]);
  for(const [y,z]of ring)vertices.push(shellX(x,z),y,z);
 }
 for(let i=0;i<nx;i++)for(let j=0;j<count;j++){const a=i*count+j,b=(i+1)*count+j,next=(j+1)%count;indices.push(a,i*count+next,b,b,i*count+next,(i+1)*count+next);}
 for(const end of [0,nx]){const center=vertices.length/3;vertices.push(end===0?-L/2:L/2,.46,0);for(let j=0;j<count;j++){const a=end*count+j,b=end*count+(j+1)%count;indices.push(...(end===0?[center,b,a]:[center,a,b]));}}
 surface(vertices,indices,paint,body).name='continuous-sculpted-body';
 for(const side of [-1,1])tube([new T.Vector3(-L*.43,.235,side*W*.39),new T.Vector3(-.5,.22,side*W*.46),new T.Vector3(.8,.22,side*W*.46),new T.Vector3(L*.43,.23,side*W*.39)],.027,carbon,body);
 mesh(new T.BoxGeometry(L*.82,.07,W*.75),carbon,body,0,.23,0);
 // A smooth canopy follows four longitudinal sections, with a separate roof and window pillars.
 const cab=p.cab,roof=Math.max(p.roof,1.25),back=cab-(p.family==='round'?1.15:1.0),front=cab+(p.family==='gt'||p.family==='muscle'?.92:.79);
 const curve=new T.CatmullRomCurve3([new T.Vector3(back,.83,W*.35),new T.Vector3(cab-.48,roof,W*.32),new T.Vector3(cab+.10,roof-.025,W*.31),new T.Vector3(front,.81,W*.37)],false,'catmullrom',.25);
 const canopy=(u:number,t:number)=>{const s=curve.getPoint(u);return new T.Vector3(s.x,.81+(s.y-.81)*(1-Math.abs(t)**3.2),s.z*t);};
 const cv:number[]=[],ci:number[]=[],cx=detail==='low'?16:40,cz=detail==='low'?12:28;
 for(let i=0;i<=cx;i++)for(let j=0;j<=cz;j++){const u=p.family==='roadster'?.70+i/cx*.30:i/cx,v=canopy(u,-1+2*j/cz);cv.push(v.x,v.y,v.z);}
 for(let i=0;i<cx;i++)for(let j=0;j<cz;j++){const a=i*(cz+1)+j,b=a+cz+1;ci.push(a,a+1,b,b,a+1,b+1);}
 surface(cv,ci,glass,body).name='curved-windows';
 if(p.family!=='roadster'){
  const rv:number[]=[],ri:number[]=[];for(let i=0;i<=14;i++)for(let j=0;j<=16;j++){const v=canopy(.30+i/14*.36,(-1+j/8)*.72);rv.push(v.x,v.y+.008,v.z);}
  for(let i=0;i<14;i++)for(let j=0;j<16;j++){const a=i*17+j;ri.push(a,a+1,a+17,a+17,a+1,a+18);}
  surface(rv,ri,wedge?carbon:paint,body).name='roof-panel';
 }else{mesh(new T.BoxGeometry(.85,.10,1.10),carbon,body,cab-.25,.99);for(const side of [-1,1]){const seat=mesh(new T.SphereGeometry(1,12,8),trim,body,cab-.36,1.03,side*.3);seat.scale.set(.18,.22,.20);}}
 for(const side of [-1,1]){
  const rail=[];for(let i=0;i<=24;i++){const u=p.family==='roadster'?.7+i/24*.3:i/24;rail.push(canopy(u,side*.91).add(new T.Vector3(0,.012,0)));}tube(rail,.025,paint,body);
  const windshield=[];for(let j=0;j<=20;j++)windshield.push(canopy(.70,(-1+j/10)*.91).add(new T.Vector3(0,.012,0)));tube(windshield,.019,paint,body);
  if(p.family!=='roadster'){const pillar=[canopy(.3,side*.95),canopy(.3,side*.68)];tube(pillar,.025,carbon,body);}
  tube([new T.Vector3(cab-.75,.79,side*widthAt(cab-.75)*1.008),new T.Vector3(cab-.67,.35,side*widthAt(cab-.67)*1.008),new T.Vector3(cab+.48,.34,side*widthAt(cab+.48)*1.008),new T.Vector3(cab+.65,.76,side*widthAt(cab+.65)*1.008)],.005,trim,body);
  mesh(new T.BoxGeometry(.13,.018,.025),silver,body,cab-.39,.75,side*(widthAt(cab-.39)+.004));
  tube([new T.Vector3(front-.14,.86,side*.72),new T.Vector3(front-.09,.94,side*1.01)],.018,carbon,body);
  const mirror=mesh(new T.SphereGeometry(1,18,12),paint,body,front-.04,.95,side*1.02);mirror.scale.set(.14,.066,.09);
  if(wedge){const a=-axle+.32,b=-axle+.90;surface([a,.38,side*widthAt(a)*1.013,b,.47,side*widthAt(b)*1.013,b-.08,.77,side*widthAt(b-.08)*1.013,a+.09,.81,side*widthAt(a+.09)*1.013],side>0?[0,1,2,0,2,3]:[0,2,1,0,3,2],carbon,body);}
 }
 // Four detailed wheels use tire sidewalls, metal rim lips, discs, calipers and split spokes.
 for(const x of [-axle,axle])for(const side of [-1,1]){
  const wheel=new T.Group();wheel.position.set(x,wy,side*(W/2-.04));root.add(wheel);wheels.push(wheel);
  mesh(new T.TorusGeometry(r-.09,.09,detail==='low'?8:14,detail==='low'?24:56),rubber,wheel);
  for(const face of [-1,1]){
   mesh(new T.TorusGeometry(.326,.019,6,40),silver,wheel,0,0,face*.081);
   mesh(new T.TorusGeometry(.395,.005,4,40),trim,wheel,0,0,face*.055);
   const disc=mesh(new T.CylinderGeometry(.27,.27,.02,32),brake,wheel,0,0,face*.048);disc.rotation.x=Math.PI/2;
   mesh(new T.BoxGeometry(.075,.21,.07),red,wheel,.19,0,face*.06);
   for(let i=0;i<p.spokes;i++)for(const split of [-1,1]){const a=i/p.spokes*Math.PI*2+split*.075;const spoke=mesh(new T.BoxGeometry(.285,.024,.025),silver,wheel,Math.cos(a)*.175,Math.sin(a)*.175,face*.087);spoke.rotation.z=a;}
   const hub=mesh(new T.CylinderGeometry(.065,.065,.018,20),carbon,wheel,0,0,face*.105);hub.rotation.x=Math.PI/2;
  }
 }
 // Low sculpted front: separate corner intakes and splitter, rather than one rectangular mouth.
 for(const side of [-1,1]){
  const z=side*W*.30,h=hood(L/2);
  const intakePoints=[z-side*.20,z+side*.18,z+side*.23,z-side*.12];
  surface(intakePoints.flatMap((zi,i)=>[shellX(L/2,zi)+.012,[.28,.26,h-.045,h-.035][i],zi]),side>0?[0,2,1,0,3,2]:[0,1,2,0,2,3],carbon,body);
  const lightX=L*.405,lightZ=side*W*.33,lightY=topY(lightX,lightZ)+.018;
  if(p.lamps==='round'){
   const socket=mesh(new T.SphereGeometry(1,24,12),carbon,body,lightX,lightY,lightZ);socket.scale.set(.20,.045,.15);
   const light=mesh(new T.SphereGeometry(1,24,12),white,body,lightX+.01,lightY+.028,lightZ);light.scale.set(.15,.025,.105);lamps.push(light);
  }else{
   const x0=L*.38,x1=L*.468,z0=side*W*.38,z1=side*W*.25;
   surface([x0,topY(x0,z0)+.012,z0,x1,topY(x1,z0)+.012,z0,x1,topY(x1,z1)+.012,z1,x0+.12,topY(x0+.12,z1)+.012,z1],side>0?[0,1,2,0,2,3]:[0,2,1,0,3,2],carbon,body).material.side=T.DoubleSide;
   const light=tube([new T.Vector3(x0+.035,topY(x0+.035,z0)+.035,z0),new T.Vector3(x1-.08,topY(x1-.08,side*W*.33)+.035,side*W*.33),new T.Vector3(x1-.015,topY(x1-.015,z1)+.035,z1)],.016,white,body);lamps.push(light);
   if(p.lamps==='slash')tube([new T.Vector3(x1-.08,topY(x1-.08,side*W*.33)+.035,side*W*.33),new T.Vector3(x0+.12,topY(x0+.12,side*W*.28)+.035,side*W*.28)],.012,white,body);
  }
  tube([new T.Vector3(L*.15,topY(L*.15,side*.28)+.012,side*.28),new T.Vector3(L*.34,topY(L*.34,side*.35)+.012,side*.35)],.006,trim,body);
  tube([new T.Vector3(-L/2-.012,.66,side*W*.12),new T.Vector3(-L/2-.016,.66,side*W*.39)],.022,tail,body);
  const pipe=mesh(new T.CylinderGeometry(.066,.066,.12,20,1,true),silver,body,-L/2-.03,.35,side*.46);pipe.rotation.z=Math.PI/2;
 }
 tube([new T.Vector3(shellX(L/2,W*.40)+.025,.23,-W*.40),new T.Vector3(L/2+.025,.20,0),new T.Vector3(shellX(L/2,W*.40)+.025,.23,W*.40)],.025,carbon,body);
 // Recognizable family details complement the silhouette and independent proportions.
 const frontPanel=(points:[number,number][],m:T.Material)=>{const v=points.flatMap(([y,z])=>[shellX(L/2,z)+.014,y,z]),f=[];for(let i=1;i<points.length-1;i++)f.push(0,i,i+1);const panel=surface(v,f,m,body);m.side=T.DoubleSide;return panel;};
 if(['gt','muscle'].includes(p.family))frontPanel([[.27,-W*.27],[.27,W*.27],[.59,W*.34],[.59,-W*.34]],carbon);
 if(p.id==='CAR05'){
  frontPanel([[.24,-.20],[.24,.20],[.68,.20],[.75,0],[.68,-.20]],carbon);
  tube([new T.Vector3(L/2+.028,.24,-.20),new T.Vector3(L/2+.028,.66,-.20),new T.Vector3(L/2+.028,.75,0),new T.Vector3(L/2+.028,.66,.20),new T.Vector3(L/2+.028,.24,.20)],.022,silver,body);
 }
 if(p.id==='CAR10')for(let i=-4;i<=4;i++)tube([new T.Vector3(L/2+.035,.29,i*.11),new T.Vector3(L/2+.035,.56,i*.11)],.012,silver,body);
 if(['CAR18','CAR30'].includes(p.id))for(const side of [-1,1])frontPanel([[.35,side*.07],[.35,side*.33],[.59,side*.33],[.63,side*.07]],trim);
 if(p.id==='CAR11'){
  frontPanel([[.26,-.48],[.26,.48],[.53,.64],[.63,.48],[.63,-.48],[.53,-.64]],carbon);
  for(const side of [-1,1]){const x=-axle+.64;mesh(new T.BoxGeometry(.12,.43,.02),carbon,body,x,.60,side*widthAt(x)*1.012);}
 }
 if(p.id==='CAR12')frontPanel([[.25,-.56],[.25,.56],[.43,.33],[.65,.53],[.65,-.53],[.43,-.33]],trim);
 if(p.id==='CAR13')for(const side of [-1,1])for(let i=0;i<3;i++)tube([new T.Vector3(-L/2-.025,.53,side*(.44+i*.09)),new T.Vector3(-L/2-.025,.73,side*(.44+i*.09))],.023,tail,body);
 if(['CAR06','CAR25'].includes(p.id))for(const side of [-1,1]){const x=L*.38,z=side*W*.19;const light=mesh(new T.SphereGeometry(1,20,10),white,body,x,topY(x,z)+.025,z);light.scale.set(.10,.03,.08);lamps.push(light);}
 if(p.id==='CAR30'){const strip=tube([new T.Vector3(L/2+.04,.29,-W*.30),new T.Vector3(L/2+.06,.25,0),new T.Vector3(L/2+.04,.29,W*.30)],.016,new T.MeshStandardMaterial({color:'#338dc4',roughness:.4}),body);strip.name='blue-trim';}
 mesh(new T.BoxGeometry(.026,.13,W*.62),carbon,body,-L/2-.014,.46);
 for(let i=-2;i<=2;i++)mesh(new T.BoxGeometry(.28,.09,.026),carbon,body,-L/2+.05,.26,i*.22);
 for(let i=0;i<4;i++)mesh(new T.BoxGeometry(.032,.012,W*.39),trim,body,-L*.39+i*.065,hood(-L*.39+i*.065)+.028,0);
 if(p.wing){for(const side of [-1,1])mesh(new T.BoxGeometry(.036,.21,.04),carbon,body,-L*.38,1.02,side*.50);const wing=mesh(new T.BoxGeometry(.28,.045,W*.88),carbon,body,-L*.38,1.15);wing.rotation.z=-.08;}
 const materials=new Set<T.Material>(),geometries=new Set<T.BufferGeometry>();root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
 return{root,wheels,body,lamps,profile:p,dispose:()=>{geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
