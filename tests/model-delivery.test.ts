import {afterEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {loadModelBytes} from '../src/three/model-bytes';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const bytes=Uint8Array.from({length:512*1024+17},(_,n)=>n%251),expected={bytes:bytes.length,sha256:hash(bytes)};
function fixture(change?:'corrupt'|'unsafe'|'unavailable'){
 const bodies=new Map<string,Uint8Array<ArrayBuffer>>(),parts:{path:string;bytes:number;sha256:string}[]=[];
 for(let offset=0,index=0;offset<bytes.length;offset+=256*1024,index++){const body=bytes.slice(offset,offset+256*1024),path=`car01.glb.part-${String(index).padStart(3,'0')}.bin`;parts.push({path,bytes:body.length,sha256:hash(body)});bodies.set(path,body);}
 if(change==='corrupt')bodies.get(parts[0].path)![0]^=1;
 if(change==='unsafe')parts[0].path='../other.bin';
 const fetcher=vi.fn(async(input:RequestInfo|URL)=>{const name=String(input).split('/').at(-1)!;return name.endsWith('.parts.json')?Response.json({...expected,format:'model-parts-v1',parts}):new Response(change==='unavailable'?null:bodies.get(name)!.buffer,{status:change==='unavailable'?503:200});});
 vi.stubGlobal('fetch',fetcher);return fetcher;
}
afterEach(()=>vi.unstubAllGlobals());
describe('verified model delivery',()=>{
 it('reassembles exactly the credited model bytes in part order',async()=>{const fetcher=fixture(),result=await loadModelBytes('https://example.test/models/car01.glb',expected,new AbortController().signal,true);expect(new Uint8Array(result)).toEqual(bytes);expect(fetcher).toHaveBeenCalledTimes(4);});
 it('rejects changed bytes even when the chunk size is unchanged',async()=>{fixture('corrupt');await expect(loadModelBytes('https://example.test/models/car01.glb',expected,new AbortController().signal,true)).rejects.toThrow('校验失败');});
 it('rejects paths outside the declared model before requesting any part',async()=>{const fetcher=fixture('unsafe');await expect(loadModelBytes('https://example.test/models/car01.glb',expected,new AbortController().signal,true)).rejects.toThrow('清单无效');expect(fetcher).toHaveBeenCalledTimes(1);});
 it('propagates cancellation without making a request',async()=>{const fetcher=fixture(),abort=new AbortController();abort.abort();await expect(loadModelBytes('https://example.test/models/car01.glb',expected,abort.signal,true)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();});
 it('rejects missing parts so the viewer can recover to same-car images',async()=>{fixture('unavailable');await expect(loadModelBytes('https://example.test/models/car01.glb',expected,new AbortController().signal,true)).rejects.toThrow('暂时无法打开');});
});
