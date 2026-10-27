import * as T from 'three';

// Some exporters call every object Object_1 and every material Material.001.
// Recognize only geometry wholly confined to small, round wheel volumes at
// the lower outer corners of the normalized 4.65-unit vehicle. Body/chassis
// meshes crossing the center or extending above those volumes are excluded.
function isUnnamedWheel(mesh:T.Mesh){
 const position=mesh.geometry.getAttribute('position');if(!position)return false;
 const boxes=Array.from({length:4},()=>new T.Box3()),counts=[0,0,0,0],p=new T.Vector3();
 for(let i=0;i<position.count;i++){p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);const q=(p.x>0?2:0)+(p.z>0?1:0);boxes[q].expandByPoint(p);counts[q]++;}
 return boxes.filter((_,i)=>counts[i]>0).every(box=>{const size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());return size.x>.22&&size.x<1.05&&size.y>.22&&size.y<1.05&&size.z<.7&&size.x/size.y>.7&&size.x/size.y<1.4&&box.min.y>-.04&&box.max.y<.95&&Math.abs(center.x)-size.x/2>.45&&Math.abs(center.z)-size.z/2>.35;});
}

/** Some authored cars combine all four tires into one mesh. Split named or
 * conservatively recognized wheel geometry into quadrants, preserving vertices and
 * materials, so assembly and rolling act on actual parts of that car. */
export function separateWheelMeshes(root:T.Group){
 root.updateMatrixWorld(true);const candidates:T.Mesh[]=[];
 root.traverse(object=>{if(!(object instanceof T.Mesh)||object instanceof T.SkinnedMesh||Array.isArray(object.material))return;const mats=Array.isArray(object.material)?object.material:[object.material];
  if(!/wheel|tire|tyre|pneu|rim/i.test(object.name+' '+mats.map(m=>m.name).join(' '))){if(!isUnnamedWheel(object))return;object.name+='_wheel';}
  const size=new T.Box3().setFromObject(object,true).getSize(new T.Vector3());if(size.x>1.65&&size.y<1.5)candidates.push(object);
 });
 for(const mesh of candidates){const geometry=mesh.geometry,index=geometry.index,position=geometry.getAttribute('position'),groups=[[],[],[],[]] as number[][],point=new T.Vector3();
  for(let i=0;i<(index?.count||position.count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);let x=0,z=0;for(const id of ids){point.fromBufferAttribute(position,id).applyMatrix4(mesh.matrixWorld);x+=point.x;z+=point.z;}groups[(x>0?2:0)+(z>0?1:0)].push(...ids);}
  if(groups.filter(g=>g.length).length<2)continue;
  for(const[quadrant,ids]of groups.entries()){if(!ids.length)continue;const part=new T.BufferGeometry();for(const[name,attribute]of Object.entries(geometry.attributes)){const values:number[]=[];for(const id of ids)for(let j=0;j<attribute.itemSize;j++)values.push(attribute.getComponent(id,j));part.setAttribute(name,new T.Float32BufferAttribute(values,attribute.itemSize));}
   const object=new T.Mesh(part,mesh.material);object.name=`${mesh.name}_wheel_${quadrant}`;object.position.copy(mesh.position);object.quaternion.copy(mesh.quaternion);object.scale.copy(mesh.scale);mesh.parent?.add(object);
  }
  mesh.removeFromParent();geometry.dispose();
 }
 root.updateMatrixWorld(true);
}
