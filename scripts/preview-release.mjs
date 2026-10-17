import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { verifyPackage } from './release-lib.mjs';
const directory=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('用法：npm run release:preview -- <发布包目录> [端口]');
const port=Number(process.argv[3]||5180);
const manifest=await verifyPackage(directory);
const files=new Map(manifest.files.map(f=>['/'+f.path,f]));
const server=http.createServer(async(request,response)=>{
  try {
    if(!['GET','HEAD'].includes(request.method)){response.writeHead(405,{'Allow':'GET, HEAD','Cache-Control':'no-store'}).end();return;}
    let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400,{'Cache-Control':'no-store'}).end();return;}
    if(pathname==='/')pathname='/index.html';
    const file=files.get(pathname);
    if(!file){response.writeHead(404,{'Cache-Control':'no-store'}).end('Not found');return;}
    const headers={...file.headers,'ETag':`"${file.sha256}"`};
    if(request.headers['if-none-match']===headers.ETag){response.writeHead(304,headers).end();return;}
    const absolute=path.join(directory,'site',file.path);
    const stat=await fs.stat(absolute);
    let start=0,end=stat.size-1,status=200;
    if(request.headers.range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if(!match||(!match[1]&&!match[2])){response.writeHead(416,{...headers,'Content-Range':`bytes */${stat.size}`}).end();return;}
      if(!match[1])start=Math.max(0,stat.size-Number(match[2]));
      else {start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){response.writeHead(416,{...headers,'Content-Range':`bytes */${stat.size}`}).end();return;}
      status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length']=String(end-start+1);
    response.writeHead(status,headers);
    if(request.method==='HEAD'){response.end();return;}
    const stream=createReadStream(absolute,{start,end});stream.on('error',()=>response.destroy());stream.pipe(response);
  }catch{if(!response.headersSent)response.writeHead(500,{'Cache-Control':'no-store'});response.end();}
});
server.listen(port,'127.0.0.1',()=>console.log(`已校验 ${manifest.appReleaseId}；发布包本地预览 http://127.0.0.1:${server.address().port}/`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
