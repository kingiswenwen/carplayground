import * as T from 'three';

export type VehicleProfile={id:string;color:string;length:number;width:number;roof:number;cab:number;family:'wedge'|'round'|'gt'|'roadster'|'muscle';wing:boolean;lamps:'slash'|'round'|'bar';spokes:number};
const specs:[VehicleProfile['family'],string,number,number,number,number,boolean,VehicleProfile['lamps']][]=[
 ['wedge','#ffc928',4.65,1.96,1.20,.1,true,'slash'],['wedge','#e52c36',4.52,1.90,1.26,.05,false,'slash'],['round','#62bd91',4.52,1.86,1.40,-.3,true,'round'],['wedge','#f18b32',4.55,1.92,1.22,.02,false,'slash'],['round','#2766cf',4.60,2,1.28,-.04,false,'bar'],
 ['wedge','#d5d9d9',4.72,1.99,1.20,-.1,true,'round'],['wedge','#b4df38',4.72,2.02,1.18,.06,true,'slash'],['gt','#266a4e',4.48,1.9,1.3,-.25,false,'slash'],['wedge','#f9cc27',4.58,1.92,1.22,.08,true,'slash'],['gt','#bc293c',4.72,1.92,1.28,-.3,false,'slash'],
 ['wedge','#3798e8',4.42,1.9,1.25,.04,false,'slash'],['gt','#e6af35',4.72,1.9,1.3,-.25,false,'slash'],['muscle','#3771cf',4.80,1.90,1.40,-.25,false,'bar'],['gt','#d92e34',4.40,1.84,1.28,-.25,false,'slash'],['gt','#e9ece8',4.32,1.78,1.34,-.15,false,'slash'],
 ['gt','#f7c938',4.38,1.82,1.28,-.3,false,'slash'],['roadster','#e58b3b',4.00,1.74,1.25,-.2,false,'round'],['muscle','#438be2',4.38,1.86,1.38,-.1,false,'bar'],['wedge','#a654db',4.42,1.94,1.18,.15,true,'slash'],['wedge','#de2934',4.58,1.94,1.22,.04,false,'slash'],
 ['round','#36b7bb',4.35,1.82,1.32,-.15,false,'round'],['wedge','#7b51d5',4.45,1.89,1.22,.12,false,'slash'],['wedge','#347ecb',4.62,1.94,1.20,.05,false,'slash'],['gt','#37945b',4.32,1.85,1.24,-.1,false,'slash'],['round','#488fde',4.10,1.78,1.25,-.12,false,'round'],
 ['gt','#225e41',4.46,1.84,1.28,-.3,false,'slash'],['wedge','#d9dfe1',4.55,1.9,1.24,.05,false,'slash'],['muscle','#e8792d',4.8,1.94,1.36,-.25,false,'slash'],['gt','#356ccc',4.62,1.94,1.22,-.35,true,'round'],['wedge','#e8ecea',4.60,1.88,1.26,.12,false,'slash']
];
export const vehicleProfiles:VehicleProfile[]=specs.map(([family,color,length,width,roof,cab,wing,lamps],i)=>({id:`CAR${String(i+1).padStart(2,'0')}`,family,color,length,width,roof,cab,wing,lamps,spokes:i%3===0?5:i%3===1?6:10}));
export type VehicleModel={root:T.Group;wheels:T.Group[];body:T.Group;lamps:T.Mesh[];profile:VehicleProfile;dispose:()=>void};
const material=(color:string,metalness=.15,roughness=.32)=>new T.MeshStandardMaterial({color,metalness,roughness});
function mesh(geometry:T.BufferGeometry,mat:T.Material,parent:T.Object3D,x=0,y=0,z=0){const m=new T.Mesh(geometry,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function surface(points:number[],indices:number[],mat:T.Material,parent:T.Object3D){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,mat,parent);}
function tube(points:T.Vector3[],radius:number,mat:T.Material,parent:T.Object3D){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),Math.max(8,points.length*5),radius,5,false),mat,parent);}
const gauss=(x:number,c:number,w:number)=>Math.exp(-(((x-c)/w)**2));
export function createVehicle(id:string,detail:'full'|'low'='full'):VehicleModel{
 const p=vehicleProfiles.find(v=>v.id===id)||vehicleProfiles[0],root=new T.Group(),body=new T.Group(),wheels:T.Group[]=[],lamps:T.Mesh[]=[];root.add(body);root.name=p.id;
 const paint=new T.MeshPhysicalMaterial({color:p.color,metalness:.48,roughness:.24,clearcoat:.8,clearcoatRoughness:.17}),dark=material('#17232c',.25,.29),rubber=material('#171b20',.03,.78),rim=material('#d1dae0',.9,.23),brake=material('#62676d',.8,.43),glass=new T.MeshPhysicalMaterial({color:'#203643',metalness:.45,roughness:.14,clearcoat:1}),red=material('#e62834',.3,.25),white=new T.MeshStandardMaterial({color:'#edfbff',emissive:'#c0eaff',emissiveIntensity:.9});
 const L=p.length,W=p.width,axle=L*.305,r=.365,wy=.40;
 const widthAt=(x:number)=>W/2*(.76+.24*Math.sin(Math.PI*(x/L+.5)));
 const hood=(x:number)=>.73+.09*gauss(x,-L*.27,.55)-.12*gauss(x,L*.49,.34)+(p.family==='muscle'?.09:0);
 // A single closed shell, with real wheel openings on both sides. Both sides and all views share these vertices.
 const verts:number[]=[],idx:number[]=[],nx=detail==='low'?36:100,nz=detail==='low'?8:24;
 for(let i=0;i<=nx;i++){const x=-L/2+L*i/nx,fw=.18*(gauss(x,axle,.43)+gauss(x,-axle,.43));for(let j=0;j<=nz;j++){const t=-1+2*j/nz;verts.push(x,hood(x)+fw*Math.abs(t)**3+.065*(1-t*t),widthAt(x)*t);}}
 for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const a=i*(nz+1)+j,b=a+nz+1;idx.push(a,a+1,b,b,a+1,b+1);}surface(verts,idx,paint,body);
 for(const side of [-1,1]){
  const v:number[]=[],faces:number[]=[];
  for(let i=0;i<=nx;i++){const x=-L/2+L*i/nx,w=widthAt(x),fw=.18*(gauss(x,axle,.43)+gauss(x,-axle,.43));let low=.22;for(const center of [-axle,axle]){const dx=x-center;if(Math.abs(dx)<r+.07)low=Math.max(low,wy+Math.sqrt(Math.max(0,(r+.07)**2-dx*dx)));}const high=hood(x)+fw;v.push(x,Math.min(low,high-.025),side*w*.97,x,high,side*w);if(i<nx){const a=i*2;faces.push(...(side>0?[a,a+3,a+1,a,a+2,a+3]:[a,a+1,a+3,a,a+3,a+2]));}}
  surface(v,faces,paint,body);
  tube([new T.Vector3(-L*.44,.22,side*W*.40),new T.Vector3(0,.19,side*W*.49),new T.Vector3(L*.43,.22,side*W*.39)],.05,dark,body);
 }
 // Hood end caps and undertray.
 for(const end of [-1,1]){const x=end*L/2,w=widthAt(x),h=hood(x);surface([x,.22,-w*.97,x,.22,w*.97,x,h,w,x,h,-w],end>0?[0,2,1,0,3,2]:[0,1,2,0,2,3],paint,body);}
 mesh(new T.BoxGeometry(L*.84,.08,W*.79),dark,body,0,.22,0);
 const cab=p.cab,roof=p.roof,front=cab+.78,back=cab-1.0;
 // Panoramic canopy, solid painted roof, distinct windshield, rear glass and two side windows.
 const stations:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[[back,.85,.68],[cab-.48,roof,.59],[cab+.13,roof,.57],[front,.86,.73]];
 const cv:number[]=[],ci:number[]=[],rings=detail==='low'?10:24;
 for(const [x,h,w]of stations)for(let j=0;j<=rings;j++){const t=-1+2*j/rings;cv.push(x,.82+(h-.82)*Math.sqrt(Math.max(0,1-t*t*.94)),t*w);}
 for(let i=0;i<3;i++)for(let j=0;j<rings;j++){const a=i*(rings+1)+j,b=a+rings+1;ci.push(a,a+1,b,b,a+1,b+1);}surface(cv,ci,glass,body);
 if(p.family!=='roadster'){
  const rv:number[]=[],ri:number[]=[];for(let i=0;i<=10;i++){const x=cab-.49+.64*i/10;for(let j=0;j<=12;j++){const z=-.47+.94*j/12;rv.push(x,roof+.018-.115*(z/.6)**2,z);}}
  for(let i=0;i<10;i++)for(let j=0;j<12;j++){const a=i*13+j;ri.push(a,a+1,a+13,a+13,a+1,a+14);}surface(rv,ri,paint,body);
 }else{mesh(new T.BoxGeometry(1.05,.15,1.25),dark,body,cab-.2,.91,0);for(const s of [-1,1]){mesh(new T.BoxGeometry(.24,.31,.37),rubber,body,cab-.36,1.06,s*.32);}}
 for(const side of [-1,1]){
  tube([new T.Vector3(back,.84,side*.68),new T.Vector3(cab-.48,roof-.04,side*.25),new T.Vector3(cab+.13,roof-.04,side*.23),new T.Vector3(front,.86,side*.73)],.026,paint,body);
  tube([new T.Vector3(cab-.72,.80,side*widthAt(cab-.72)*1.008),new T.Vector3(cab-.67,.38,side*widthAt(cab-.67)*1.008),new T.Vector3(cab+.53,.38,side*widthAt(cab+.53)*1.008),new T.Vector3(cab+.68,.8,side*widthAt(cab+.68)*1.008)],.008,dark,body);
  mesh(new T.BoxGeometry(.14,.022,.027),rim,body,cab-.42,.77,side*(widthAt(cab-.42)+.005));
  tube([new T.Vector3(front-.1,.88,side*.69),new T.Vector3(front-.03,.96,side*1.03)],.025,dark,body);
  const mirror=mesh(new T.SphereGeometry(1,14,10),paint,body,front+.01,.98,side*1.03);mirror.scale.set(.16,.075,.10);
  const intake=mesh(new T.SphereGeometry(1,18,10),dark,body,-axle+.55,.61,side*widthAt(-axle+.55));intake.scale.set(.31,.115,.022);intake.rotation.z=.3;
 }
 // Four genuine wheels: tires, brake discs, calipers, radial spokes and hubs.
 for(const x of [-axle,axle])for(const side of [-1,1]){
  const wheel=new T.Group();wheel.position.set(x,wy,side*(W/2-.05));root.add(wheel);wheels.push(wheel);
  mesh(new T.TorusGeometry(.278,.091,detail==='low'?6:12,detail==='low'?16:40),rubber,wheel);
  const disc=mesh(new T.CylinderGeometry(.235,.235,.13,detail==='low'?12:32),brake,wheel);disc.rotation.x=Math.PI/2;
  mesh(new T.BoxGeometry(.07,.19,.17),red,wheel,.17,0,0);
  for(const face of [-1,1]){
   const ring=mesh(new T.TorusGeometry(.25,.018,4,detail==='low'?12:36),rim,wheel,0,0,face*.075);
   ring.name='rim';for(let i=0;i<p.spokes;i++){const a=i/p.spokes*Math.PI*2;const spoke=mesh(new T.BoxGeometry(.24,.027,.018),rim,wheel,Math.cos(a)*.115,Math.sin(a)*.115,face*.079);spoke.rotation.z=a;}
   const hub=mesh(new T.CylinderGeometry(.052,.052,.022,16),dark,wheel,0,0,face*.09);hub.rotation.x=Math.PI/2;
  }
 }
 // Front fascia is separate from the rear: grille, headlights, splitter versus tail lights, exhausts and diffuser.
 const grille=mesh(new T.BoxGeometry(.025,.20,W*.59),dark,body,L/2+.011,.43);grille.name='front-grille';
 if(p.family==='wedge')for(const s of [-1,1]){
  const x=L/2;const panel=[x-.48,hood(x-.48)+.06,s*W*.33,x-.06,hood(x-.06)+.018,s*W*.39,x-.04,hood(x-.04)+.02,s*W*.22];
  surface(panel,s>0?[0,2,1]:[0,1,2],dark,body);
  tube([new T.Vector3(x-.39,hood(x-.39)+.08,s*W*.33),new T.Vector3(x-.10,hood(x-.10)+.05,s*W*.30),new T.Vector3(x-.06,hood(x-.06)+.04,s*W*.23)],.018,white,body);
 }
 for(const s of [-1,1])tube([new T.Vector3(L*.38,hood(L*.38)+.024,s*.32),new T.Vector3(L*.18,hood(L*.18)+.04,s*.33),new T.Vector3(.8,hood(.8)+.04,s*.38)],.007,dark,body);

 for(const s of [-1,1]){
  if(p.lamps==='round') {const light=mesh(new T.CylinderGeometry(.105,.105,.027,24),white,body,L/2-.055,.72,s*W*.32);light.rotation.z=Math.PI/2;lamps.push(light);}
  else {const light=tube([new T.Vector3(L/2-.05,.68,s*W*.40),new T.Vector3(L/2+.02,.66,s*W*.30),new T.Vector3(L/2+.025,.63,s*W*.24)],.025,white,body);lamps.push(light);}
  tube([new T.Vector3(-L/2-.014,.67,s*W*.13),new T.Vector3(-L/2-.019,.67,s*W*.40)],.027,red,body);
  const exhaust=mesh(new T.CylinderGeometry(.065,.065,.13,16,1,true),rim,body,-L/2-.03,.33,s*.55);exhaust.rotation.z=Math.PI/2;
 }
 mesh(new T.BoxGeometry(.035,.13,W*.62),dark,body,-L/2-.012,.48);
 for(let i=-2;i<=2;i++)mesh(new T.BoxGeometry(.27,.11,.035),dark,body,-L/2+.05,.24,i*.22);
 if(p.wing){for(const s of [-1,1])mesh(new T.BoxGeometry(.045,.24,.045),dark,body,-L*.38,1.0,s*.51);const wing=mesh(new T.BoxGeometry(.31,.055,W*.88),dark,body,-L*.38,1.13);wing.rotation.z=-.08;}
 const used=new Set<T.Material>(),geometries=new Set<T.BufferGeometry>();root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])used.add(m);}});
 return {root,wheels,body,lamps,profile:p,dispose:()=>{geometries.forEach(g=>g.dispose());used.forEach(m=>m.dispose());}};
}
