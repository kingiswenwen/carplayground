const PART_BYTES=256*1024;
type Integrity={bytes:number;sha256:string};
type ModelParts=Integrity&{format:'model-parts-v1';parts:({path:string}&Integrity)[]};
async function digest(bytes:ArrayBuffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
async function checked(bytes:ArrayBuffer,expected:Integrity){if(bytes.byteLength!==expected.bytes||await digest(bytes)!==expected.sha256)throw Error('模型文件校验失败');return bytes;}

/** Reassemble the exact authored GLB; delivery parts never alter geometry or textures. */
export async function loadModelBytes(url:string,expected:Integrity,signal:AbortSignal,useParts=import.meta.env.VITE_MODEL_PARTS==='1'){
 signal.throwIfAborted();
 if(!useParts||expected.bytes<=512*1024){const response=await fetch(url,{signal});if(!response.ok)throw Error('模型暂时无法打开');return checked(await response.arrayBuffer(),expected);}
 const manifestURL=new URL(url+'.parts.json',globalThis.location?.href??'http://localhost/'),response=await fetch(manifestURL,{signal});if(!response.ok)throw Error('模型分块暂时无法打开');
 const manifest=await response.json() as ModelParts,stem=manifestURL.pathname.split('/').at(-1)!.replace(/\.parts\.json$/,'');
 if(manifest.format!=='model-parts-v1'||manifest.bytes!==expected.bytes||manifest.sha256!==expected.sha256||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<=0||manifest.bytes>64*1024*1024||!Array.isArray(manifest.parts)||!manifest.parts.length||manifest.parts.length>256||manifest.parts.some((part,index)=>part.path!==`${stem}.part-${String(index).padStart(3,'0')}.bin`||!Number.isSafeInteger(part.bytes)||part.bytes<=0||part.bytes>PART_BYTES||!/^[a-f0-9]{64}$/.test(part.sha256))||manifest.parts.reduce((sum,part)=>sum+part.bytes,0)!==manifest.bytes)throw Error('模型分块清单无效');
 const abort=new AbortController(),cancel=()=>abort.abort(signal.reason);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 let next=0;const parts:ArrayBuffer[]=new Array(manifest.parts.length);
 try{
  await Promise.all(Array.from({length:Math.min(4,parts.length)},async()=>{while(next<parts.length){const index=next++,part=manifest.parts[index],result=await fetch(new URL(part.path,manifestURL),{signal:abort.signal});if(!result.ok)throw Error('模型分块暂时无法打开');parts[index]=await checked(await result.arrayBuffer(),part);}}));
  signal.throwIfAborted();const bytes=new Uint8Array(manifest.bytes);let offset=0;for(const part of parts){bytes.set(new Uint8Array(part),offset);offset+=part.byteLength;}return await checked(bytes.buffer,expected);
 }finally{signal.removeEventListener('abort',cancel);abort.abort();}
}
