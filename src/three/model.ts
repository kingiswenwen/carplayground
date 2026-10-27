import * as T from 'three';

export function disposeModel(root:T.Object3D){
 const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
 root.traverse(object=>{if(object instanceof T.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof T.Texture)textures.add(value);}}});
 textures.forEach(t=>{t.dispose();const image=t.image;if(typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap)image.close();});materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
}

/** Preserve authored proportions: change orientation, uniform scale and origin only. */
export function fitModel(root:T.Object3D,rotationY:number){
 root.rotation.y+=rotationY;root.updateMatrixWorld(true);
 // Imported accessor bounds may include unused exporter extents. Recompute from
 // actual vertex data before fitting so a valid small car is not framed as a speck.
 root.traverse(object=>{if(object instanceof T.Mesh)object.geometry.computeBoundingBox();});
 let bounds=new T.Box3().setFromObject(root,true),size=bounds.getSize(new T.Vector3());
 if(![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid vehicle bounds');
 root.scale.multiplyScalar(4.65/Math.max(size.x,size.z));root.updateMatrixWorld(true);
 bounds=new T.Box3().setFromObject(root,true);const center=bounds.getCenter(new T.Vector3());
 root.position.sub(new T.Vector3(center.x,bounds.min.y,center.z));root.updateMatrixWorld(true);
 return new T.Box3().setFromObject(root,true);
}

export function frameModel(camera:T.OrthographicCamera,bounds:T.Box3,aspect:number){
 // Fit the whole horizontal orbit, so a side view cannot clip the tires or nose.
 const size=bounds.getSize(new T.Vector3()),offset=camera.position.clone().sub(bounds.getCenter(new T.Vector3()));
 const elevation=Math.atan2(Math.abs(offset.y),Math.hypot(offset.x,offset.z)),diagonal=Math.hypot(size.x,size.z);
 const height=size.y*Math.cos(elevation)+diagonal*Math.sin(elevation),half=Math.max(height/2,diagonal/(2*aspect))*1.12;
 camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
}

/** glTF node names are sanitized by Three during import. */
export function removeModelNodes(root:T.Object3D,names:string[]){for(const name of names){const clean=name.replace(/\s/g,'_').replace(/[\[\]\.:\/]/g,'');(root.getObjectByName(name)||root.getObjectByName(clean))?.removeFromParent();}}
