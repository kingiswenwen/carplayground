import{it,expect}from'vitest';
import * as T from'three';
import{mergeGeometries}from'three/addons/utils/BufferGeometryUtils.js';
import{separateWheelMeshes}from'../src/three/wheel-meshes';
import{disposeModel}from'../src/three/model';
it('separates combined authored tire geometry into four physical parts without adding vertices',()=>{
 const root=new T.Group(),parts=[];
 for(const x of [-1.5,1.5])for(const z of [-.8,.8]){const g=new T.CylinderGeometry(.35,.35,.2,12);g.rotateX(Math.PI/2);g.translate(x,.35,z);parts.push(g);}
 const geometry=mergeGeometries(parts),count=geometry.index!.count,mesh=new T.Mesh(geometry,new T.MeshStandardMaterial());mesh.name='Tires';root.add(mesh);separateWheelMeshes(root);
 expect(root.children).toHaveLength(4);expect(root.children.reduce((sum,m)=>sum+(m as T.Mesh).geometry.getAttribute('position').count,0)).toBe(count);
 for(const part of root.children){const box=new T.Box3().setFromObject(part),size=box.getSize(new T.Vector3());expect(size.x).toBeCloseTo(.7);expect(size.y).toBeCloseTo(.7);expect(size.z).toBeCloseTo(.2);}
 disposeModel(root);parts.forEach(p=>p.dispose());geometry.dispose();
});
it('recognizes unnamed corner wheel meshes without treating the low body as a wheel',()=>{
 const root=new T.Group(),parts=[];
 for(const x of [-1.4,1.4])for(const z of [-.8,.8]){const g=new T.CylinderGeometry(.35,.35,.2,12);g.rotateX(Math.PI/2);g.translate(x,.35,z);parts.push(g);}
 const wheels=new T.Mesh(mergeGeometries(parts),new T.MeshStandardMaterial());wheels.name='Object_27';root.add(wheels);
 const body=new T.Mesh(new T.BoxGeometry(4.65,.5,1.8),new T.MeshStandardMaterial());body.position.y=.65;body.name='Object_4';root.add(body);
 separateWheelMeshes(root);expect(root.children.filter(m=>m.name.includes('_wheel_'))).toHaveLength(4);expect(root.children).toContain(body);expect(body.name).toBe('Object_4');
 disposeModel(root);parts.forEach(p=>p.dispose());
});
