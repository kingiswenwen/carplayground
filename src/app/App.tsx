import { RouteArrival, useTownNavigation, type BeforeTownLeave, type TownLeaveGuard } from '../hooks/useTownNavigation';
import {activityPlace,townIds} from '../domain/town';
import {PageRecovery} from '../components/PageRecovery';
import {PlayPicture} from '../components/PlayPicture';
import {PlaySymbol} from '../components/PlaySymbol';
import {activeCar,rememberCar} from '../domain/active-car';
import { ParentGate } from '../components/ParentGate';
import{lazy,Suspense,useCallback,useEffect,useRef,useState,useSyncExternalStore,type CSSProperties}from'react';import{Users,Volume2,VolumeX}from'../components/TownIcons';import{content,getActivity,getCar,selectableCarIds,historicalCarIds}from'../domain/content';import{audio}from'../services/audio';import{db,defaultSettings,safely,storageStatus,type Settings}from'../services/storage';
import {symbolPreview} from '../visual/play-symbols';
const World=lazy(()=>import('../pages/World').then(m=>({default:m.World})));
const Detail=lazy(()=>import('../pages/Browse').then(m=>({default:m.Detail})));
const Garage=lazy(()=>import('../pages/Browse').then(m=>({default:m.Garage})));
const Showroom=lazy(()=>import('../pages/Browse').then(m=>({default:m.Showroom})));
const TouchPlay=lazy(()=>import('../pages/TouchPlay').then(m=>({default:m.TouchPlay})));
const Parent=lazy(()=>import('../pages/Parent').then(m=>({default:m.Parent})));
const Story=lazy(()=>import('../pages/Stories').then(m=>({default:m.Story})));
const controlArtwork={
 '--town-chevron':`url("${symbolPreview('chevron')}")`,
 '--town-check':`url("${symbolPreview('check')}")`,
} as CSSProperties;
export default function App(){const[parentGate,setParentGate]=useState(false);const[restart,setRestart]=useState(0);const[settings,setSettings]=useState<Settings>(defaultSettings);const[favorites,setFavorites]=useState<string[]>([]);const[favoritesUnavailable,setFavoritesUnavailable]=useState(false);const[favoritePending,setFavoritePending]=useState<string[]>([]);const[favoriteErrors,setFavoriteErrors]=useState<Record<string,string>>({});const favoriteLocks=useRef(new Set<string>());const[loaded,setLoaded]=useState(false);const holdTimer=useRef<ReturnType<typeof setTimeout>>(undefined);const audioError=useSyncExternalStore(audio.subscribe,audio.getError);const storageFailed=useSyncExternalStore(storageStatus.subscribe,storageStatus.get);
 const reloadFavorites=useCallback(async()=>{
  const rows=await safely(()=>db.favorites.toArray(),undefined,'favorites:read');
  if(rows)setFavorites(selectableCarIds(rows.map(row=>row.carId)));
  setFavoritesUnavailable(!rows);
 },[]);
 const loadLocal=useCallback(async()=>{
  const [saved]=await Promise.all([safely(()=>db.settings.get('default'),undefined,'settings:read'),reloadFavorites()]);
  const next=saved||defaultSettings;
  setSettings(next);audio.setEnabled(next.sound);setLoaded(true);
 },[reloadFavorites]);
 const onNavigate=useCallback(()=>{audio.stop();clearTimeout(holdTimer.current);setParentGate(false);},[]);
 const beforeLeave=useRef<TownLeaveGuard|null>(null);
 const registerBeforeLeave=useCallback((handler:BeforeTownLeave,dismiss?:()=>void)=>{
   const guard={request:handler,dismiss};
   beforeLeave.current=guard;
   return ()=>{if(beforeLeave.current===guard)beforeLeave.current=null;};
 },[]);
 const {route,arrival,from}=useTownNavigation(onNavigate,beforeLeave);
 useEffect(()=>{void loadLocal();const reset=()=>{audio.stop();setRestart(n=>n+1);};const hide=()=>{if(document.hidden)audio.stop();};window.addEventListener('restart-activity',reset);document.addEventListener('visibilitychange',hide);return()=>{clearTimeout(holdTimer.current);window.removeEventListener('restart-activity',reset);document.removeEventListener('visibilitychange',hide);audio.stop();};},[loadLocal]);
 const updateSettings=(patch:Partial<Settings>)=>{const next={...settings,...patch};setSettings(next);audio.setEnabled(next.sound,true);void safely(()=>db.settings.put(next),undefined,'settings:write');};
 const toggleFavorite=async(carId:string)=>{
  if(favoriteLocks.current.has(carId))return;
  favoriteLocks.current.add(carId);setFavoritePending(current=>[...current,carId]);
  const exists=favorites.includes(carId);
  const saved=await safely(async()=>{if(exists)await db.favorites.bulkDelete(historicalCarIds.filter(id=>getCar(id)?.id===carId));else await db.favorites.put({carId,at:new Date().toISOString()});return true;},false,`favorite:${carId}`);
  if(saved){setFavorites(current=>exists?current.filter(id=>id!==carId):[...new Set([...current,carId])]);setFavoriteErrors(current=>{const next={...current};delete next[carId];return next;});}
  else setFavoriteErrors(current=>({...current,[carId]:exists?'这次取消收藏没有保存，原收藏还在。请再点一次重试。':'这次收藏没有保存。请再点一次重试。'}));
  favoriteLocks.current.delete(carId);setFavoritePending(current=>current.filter(id=>id!==carId));
 };
 const[path,query='']=route.split('?');const params=new URLSearchParams(query);const parts=path.split('/');const activity=parts[1]==='play'?getActivity(parts[2]):undefined;const requestedCar=getCar(params.get('car')||activeCar());const activityCar=activity&&requestedCar&&activity.carIds.includes(requestedCar.id)?requestedCar.id:activity?.carIds[0]||'CAR01';const detailCar=parts[1]==='cars'?getCar(parts[2]):undefined;
 useEffect(()=>{const id=detailCar?.id||requestedCar?.id;if(id)rememberCar(id);},[detailCar?.id,requestedCar?.id]);
 const storyContext=content.stories.find(s=>s.id===params.get('story'));const rawStep=Number(params.get('step')||0);const step=Number.isInteger(rawStep)?Math.max(0,Math.min(3,rawStep)):0;const backStory=storyContext?`#/stories/${storyContext.id}?step=${step}`:undefined;const continueStory=storyContext?`#/stories/${storyContext.id}?step=${Math.min(3,step+1)}`:undefined;
 const fromCars=from==='/cars'||from==='/welcome'||from?.startsWith('/cars/');
 const backHref=backStory||(fromCars?`#${from}`:from==='/garage'?'#/garage':activity?`#/explore/${activityPlace(activity.id).id}`:'#/explore');
 const backLabel=backStory?'回到故事':fromCars?'回到选车':from==='/garage'?'回车库':undefined;
 const activeNav=path==='/garage'?'garage':parts[1]==='explore'||parts[1]==='play'||parts[1]==='stories'?'explore':parts[1]==='cars'||path==='/welcome'?'cars':undefined;const stopHold=()=>clearTimeout(holdTimer.current);
 return <div className={`app-shell child-shell town-shell ${path==='/parent'?'adult-route':''}`} style={controlArtwork}><header className="site-header child-dock">
 <a className="brand picture-home" href="#/explore" aria-label="汽车小镇首页"><PlaySymbol name="car"/><span className="town-brand-name">汽车小镇</span></a>
 <nav className="main-nav" aria-label="主要导航">{[{id:'explore',href:'#/explore',title:'去探索',picture:'world'},{id:'cars',href:'#/cars',title:'看车',picture:'cars'},{id:'garage',href:'#/garage',title:'我的车库',picture:'garage'}].map(item=><a key={item.id} href={item.href} className={activeNav===item.id?'active':''} aria-label={item.title} aria-current={activeNav===item.id?'page':undefined}><PlayPicture id={item.picture}/><span className="town-nav-label">{item.title}</span></a>)}</nav>
 <div className="header-tools"><button className="picture-button" aria-label={settings.sound?'关闭声音':'开启声音'} aria-pressed={settings.sound} disabled={!loaded} onClick={()=>updateSettings({sound:!settings.sound})}>{settings.sound?<Volume2/>:<VolumeX/>}</button><button className="picture-button parent-entry" aria-current={path==='/parent'?'page':undefined} aria-label="家长设置，长按两秒或按回车进入" onPointerDown={()=>{stopHold();holdTimer.current=setTimeout(()=>{window.location.hash='/parent';},2000);}} onPointerUp={stopHold} onPointerCancel={stopHold} onPointerLeave={stopHold} onContextMenu={e=>e.preventDefault()} onClick={e=>{if(window.location.hash==='#/parent')return;if(e.detail===0)window.location.hash='/parent';else setParentGate(true);}}><Users/></button></div></header>
 <main id="main-content" tabIndex={-1} className={activity?'activity-main':''}><PageRecovery key={route}><Suspense key={route} fallback={<div className="empty-state pictorial-loading" role="status" aria-label="正在准备"><PlaySymbol name="wheel"/><p>正在打开…</p></div>}>{(path==='/welcome'||path==='/cars')?<Showroom favorites={favorites} favoritePending={favoritePending} favoriteErrors={favoriteErrors} favoritesUnavailable={favoritesUnavailable} reloadFavorites={reloadFavorites} toggleFavorite={toggleFavorite} loaded={loaded}/>:detailCar?loaded&&<Detail key={detailCar.id} carId={detailCar.id} favorite={favorites.includes(detailCar.id)} favoriteBusy={favoritePending.includes(detailCar.id)} favoriteError={favoriteErrors[detailCar.id]} favoritesUnavailable={favoritesUnavailable} reloadFavorites={reloadFavorites} toggleFavorite={()=>void toggleFavorite(detailCar.id)}/>:path==='/garage'?<Garage favorites={favorites} loaded={loaded} favoritesUnavailable={favoritesUnavailable} reloadFavorites={reloadFavorites}/>:parts[1]==='explore'&&(!parts[2]||[...townIds,'travel'].includes(parts[2]))?<World key={parts[2]||'all'} sceneId={parts[2]}/>:path==='/parent'?<Parent settings={settings} update={updateSettings} storageFailed={storageFailed} reload={loadLocal}/>:parts[1]==='stories'&&content.stories.some(s=>s.id===parts[2])?<Story key={`${parts[2]}-${params.get('step')||'resume'}`} storyId={parts[2]} initialFrame={params.has('step')?step:undefined}/>:activity?loaded&&<TouchPlay key={`${activity.id}-${restart}-${route}`} id={activity.id} carId={activityCar} settings={settings} registerBeforeLeave={registerBeforeLeave} backLabel={backLabel} backHref={backHref} continueHref={continueStory}/>:<section className="empty-state page-recovery"><PlaySymbol name="home"/><h1>这个地方暂时找不到</h1><p>从小镇地图选一个地方接着玩。</p><a className="town-primary-link" aria-label="回到乐园" href="#/explore">回到小镇</a></section>}{(loaded||(!activity&&!detailCar))&&<RouteArrival arrival={arrival}/>}</Suspense></PageRecovery></main>
 {audioError&&<div className="audio-notice" role="status"><VolumeX/><span>{audioError}</span></div>}{parentGate&&<ParentGate close={()=>setParentGate(false)}/>}</div>;
}
