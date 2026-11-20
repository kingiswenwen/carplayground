import type {Plugin} from 'vite';
import iconPreviews from '../src/visual/play-icon-previews.ts';

/** Start only the current route's static imports together, without modulepreload's
 * failed-resource cache on WebKit. Native import failures retain the normal
 * page/entry recovery; optional pages and the 3D engine remain lazy. */
export function startupImports():Plugin {
 let base='./';
 let entryArt='';
 return {
  name:'native-route-startup',
  configResolved(config){
   base=config.base;
   const assetBase=(config.env.VITE_ASSET_BASE_URL||base).replace(/\/?$/,'/');
   const media=config.env.VITE_MEDIA_BASE_URL||assetBase+'media/';
   entryArt=(media.replace(/\/?$/,'/')+'play-icons/car.webp').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  },
  transformIndexHtml:{order:'post',handler(source,context){
   const html=source.replaceAll('data:application/x-town-car,',entryArt)
    .replaceAll('data:application/x-town-car-preview,','data:image/webp;base64,'+iconPreviews.car);
   if(!context.bundle)return html;
   const bundle=context.bundle;
   const routes:Record<string,string[]>={};
   for(const name of ['Browse','TouchPlay','World','Stories','Parent']){
    const entry=Object.values(bundle).find(chunk=>chunk.type==='chunk'&&chunk.facadeModuleId?.replaceAll('\\','/').endsWith(`/src/pages/${name}.tsx`));
    if(!entry||entry.type!=='chunk')continue;
    const seen=new Set<string>();
    const visit=(file:string)=>{if(seen.has(file))return;const chunk=bundle[file];if(chunk?.type!=='chunk')return;seen.add(file);chunk.imports.forEach(visit);};
    visit(entry.fileName);routes[name]=[...seen].map(file=>base+file);
   }
   const startup=`const routes=${JSON.stringify(routes)};
const path=(location.hash.slice(1).split('?')[0]||'/welcome').replace(/\\/+$/,'')||'/welcome';
const route=path==='/welcome'||path.startsWith('/cars')||path==='/garage'?'Browse':path.startsWith('/play/')?'TouchPlay':path.startsWith('/explore')?'World':path.startsWith('/stories/')?'Stories':path==='/parent'?'Parent':'';
for(const url of routes[route]||[])import(url).catch(()=>{});`;
   // Run before the entry module, while keeping the encoding declaration first.
   return html.replace(/(<meta\s+charset=["'][^"']+["']\s*\/?>)/i,tag=>`${tag}\n<script type="module">${startup}</script>`);
  }},
 };
}
