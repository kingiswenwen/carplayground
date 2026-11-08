import * as T from 'three';
import selections from '../../content/viewer-paints.json';
import type {VehicleModelSpec} from '../domain/vehicle-models';
import {getCar} from '../domain/content';

type PaintSelection={materials:string[];mode:'body'|'masked';mesh?:string;source?:number[];protectedUV?:Record<string,number[][][]>};
type PaintMaterial=T.MeshStandardMaterial|T.MeshBasicMaterial;
export function viewerPaintSelection(spec:VehicleModelSpec):PaintSelection{
 return (selections as Record<string,PaintSelection>)[spec.id]||{materials:spec.paintMaterials,mode:'body'};
}

/** Viewer-only paint: keep original maps, glass, tires and gameplay color rules. */
export class ViewerPaint{
 private enabled=new T.Uniform(0);
 private color=new T.Uniform(new T.Color());
 private materials:{material:PaintMaterial;roughness?:number;metalness?:number}[]=[];
 private masks:T.CanvasTexture[]=[];
 readonly materialCount:number;
 constructor(root:T.Group,spec:VehicleModelSpec,bounds:T.Box3){
  const rule=viewerPaintSelection(spec),source=new T.Color(...((rule.source||[1,1,1]) as [number,number,number])).convertSRGBToLinear();
  const hi=Math.max(source.r,source.g,source.b),lo=Math.min(source.r,source.g,source.b);
  const sourceHue=new T.Vector3(source.r,source.g,source.b).divideScalar(hi||1);
  const masked=rule.mode==='masked',neutral=hi-lo<.15,size=bounds.getSize(new T.Vector3());
  const wheelPositions=getCar(spec.id)?.game?.wheels.map(wheel=>wheel.x*1.1-.05)||[.23,.78];
  const clones=new Map<PaintMaterial,PaintMaterial>();
  root.traverse(object=>{
   if(!(object instanceof T.Mesh)||rule.mesh&&!new RegExp(rule.mesh).test(object.name))return;
   const paint=(original:T.Material)=>{
    if(!(original instanceof T.MeshStandardMaterial||original instanceof T.MeshBasicMaterial)||!rule.materials.includes(original.name))return original;
    let material=clones.get(original);if(material)return material;
    material=original.clone();clones.set(original,material);
    // Photogrammetry can bake gray glass and gray paint into the same atlas.
    // Registered UV polygons protect that glass without replacing the source map.
    const polygons=rule.protectedUV?.[original.name];let mask:T.CanvasTexture|undefined;
    if(polygons&&original.map){
     const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const context=canvas.getContext('2d')!;
     context.fillStyle='white';context.fillRect(0,0,256,256);context.fillStyle='black';
     for(const polygon of polygons){context.beginPath();polygon.forEach(([x,y],index)=>index?context.lineTo(x*256,y*256):context.moveTo(x*256,y*256));context.closePath();context.fill();}
     mask=new T.CanvasTexture(canvas);mask.flipY=original.map.flipY;this.masks.push(mask);
    }
    material.onBeforeCompile=shader=>{
     if(mask)shader.uniforms.viewerPaintMask=new T.Uniform(mask);
     Object.assign(shader.uniforms,{viewerPaintEnabled:this.enabled,viewerPaintColor:this.color,
      viewerPaintMode:new T.Uniform(masked?(neutral?2:1):0),viewerPaintSource:new T.Uniform(sourceHue),
      viewerPaintMin:new T.Uniform(bounds.min),viewerPaintSize:new T.Uniform(size),viewerPaintAlongZ:new T.Uniform(size.z>size.x?1:0),
      viewerPaintAspect:new T.Uniform(Math.max(size.x,size.z)/Math.max(size.y,.001)),viewerPaintWheels:new T.Uniform(new T.Vector2(wheelPositions[0],wheelPositions[1]))});
     shader.vertexShader='varying vec3 vViewerPaintPosition;\nuniform vec3 viewerPaintMin;\nuniform vec3 viewerPaintSize;\n'+shader.vertexShader;
     shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvViewerPaintPosition=((modelMatrix*vec4(transformed,1.0)).xyz-viewerPaintMin)/max(viewerPaintSize,vec3(0.001));');
     shader.fragmentShader=(mask?'uniform sampler2D viewerPaintMask;\n':'')+'varying vec3 vViewerPaintPosition;\nuniform float viewerPaintEnabled;\nuniform vec3 viewerPaintColor;\nuniform float viewerPaintMode;\nuniform vec3 viewerPaintSource;\nuniform float viewerPaintAlongZ;\nuniform float viewerPaintAspect;\nuniform vec2 viewerPaintWheels;\n'+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      if(viewerPaintEnabled>0.5){
       vec3 originalPaint=diffuseColor.rgb;
       float highPaint=max(max(originalPaint.r,originalPaint.g),originalPaint.b);
       float lowPaint=min(min(originalPaint.r,originalPaint.g),originalPaint.b);
       float paintMask=1.0;
       if(viewerPaintMode>1.5){
        float saturationPaint=(highPaint-lowPaint)/max(highPaint,0.0001);
        paintMask=(1.0-smoothstep(0.15,0.4,saturationPaint))*smoothstep(0.0005,0.025,highPaint);
       }else if(viewerPaintMode>0.5){
        vec3 huePaint=originalPaint/max(highPaint,0.0001);
        paintMask=(1.0-smoothstep(0.3,0.8,length(huePaint-viewerPaintSource)))*smoothstep(0.01,0.05,highPaint);
       }
       if(viewerPaintMode>0.5){
        float longPaint=mix(vViewerPaintPosition.x,vViewerPaintPosition.z,viewerPaintAlongZ);
        float sidePaint=abs(mix(vViewerPaintPosition.z,vViewerPaintPosition.x,viewerPaintAlongZ)*2.0-1.0);
        float axlePaint=min(length(vec2((longPaint-viewerPaintWheels.x)*viewerPaintAspect,vViewerPaintPosition.y-0.25)),length(vec2((longPaint-viewerPaintWheels.y)*viewerPaintAspect,vViewerPaintPosition.y-0.25)));
        paintMask*=mix(1.0,smoothstep(0.28,0.35,axlePaint),smoothstep(0.45,0.75,sidePaint));
       }
       ${mask?'paintMask*=texture2D(viewerPaintMask,vMapUv).r;':''}
       float paintDetail=0.55+0.45*clamp(highPaint,0.0,1.0);
       diffuseColor.rgb=mix(originalPaint,viewerPaintColor*paintDetail,paintMask);
      }`);
    };
    material.customProgramCacheKey=()=> 'viewer-body-paint-v2'+(mask?'-atlas-mask':'');
    return material;
   };
   object.material=Array.isArray(object.material)?object.material.map(paint):paint(object.material);
  });
  this.materialCount=clones.size;
  this.materials=[...clones.values()].map(material=>({material,...(material instanceof T.MeshStandardMaterial?{roughness:material.roughness,metalness:material.metalness}:{})}));
 }
 dispose(){for(const mask of this.masks)mask.dispose();this.masks=[];}
 setColor(color:string|null){
  this.enabled.value=color?1:0;if(color)this.color.value.set(color);
  for(const {material,roughness,metalness} of this.materials){
   if(material instanceof T.MeshStandardMaterial){
    material.roughness=color?Math.max(.3,roughness!):roughness!;
    material.metalness=color?Math.max(.4,metalness!):metalness!;
   }
   // Refresh custom uniforms even when every mesh shares one cached program.
   material.needsUpdate=true;
  }
 }
}
