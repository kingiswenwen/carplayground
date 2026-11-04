import type {Plugin} from 'vite';

/** Start only the current route's static imports together, without modulepreload's
 * failed-resource cache on WebKit. Native import failures retain the normal
 * page/entry recovery; optional pages and the 3D engine remain lazy. */
export function startupImports():Plugin {
 let base='./';
 return {
  name:'native-route-startup',
  configResolved(config){base=config.base;},
  transformIndexHtml:{order:'post',handler(_html,context){
   if(!context.bundle)return;
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
   return _html.replace(/(<meta\s+charset=["'][^"']+["']\s*\/?>)/i,tag=>`${tag}\n<script type="module">${startup}</script>`);
  }},
 };
}
