import {activeCar,rememberCar} from '../domain/active-car';
import {useEffect,useState} from 'react';
import {VehicleViews} from '../components/VehicleViews';
import {ArrowLeft,ArrowRight,Box,Camera,Heart,Volume2,Download,RotateCcw,Search} from 'lucide-react';
import {CarImage} from '../components/CarImage';
import {PlayPicture} from '../components/PlayPicture';
import {PlaySymbol} from '../components/PlaySymbol';
import {vehicleModel,vehicleModels} from '../domain/vehicle-models';
import {content,getCar,selectableCarIds} from '../domain/content';
import {brandOrigin,filterCatalogue} from '../domain/catalog';
import {audio} from '../services/audio';
import {db,safely,type Creation} from '../services/storage';
import {ArtworkView} from './Studio';
import {exportArtwork} from '../services/artwork';
export function ActivityLinks({ids,carId,domain,scene}:{ids?:string[];carId?:string;domain?:string;scene?:string}){
 const chosen=carId||activeCar();const list=content.activities.filter(a=>(!ids||ids.includes(a.id))&&(!domain||a.domain===domain)&&(!scene||a.scene===scene)&&a.carIds.includes(chosen)).sort((a,b)=>ids?ids.indexOf(a.id)-ids.indexOf(b.id):0);
 return <div className="activity-links picture-activities">{list.map(item=><a href={`#/play/${item.id}?car=${chosen}`} className={`activity-link picture-activity play-${item.id}`} key={item.id} aria-label={item.title}><PlayPicture id={item.id} carId={chosen}/></a>)}</div>;
}
function Model({carId}:{carId:string}){return <VehicleViews carId={carId}/>;}
function useCarNameVoice(){const[available,setAvailable]=useState(()=>!!window.speechSynthesis?.getVoices().some(v=>v.localService&&/^zh[-_]/i.test(v.lang)));useEffect(()=>{const update=()=>setAvailable(!!window.speechSynthesis?.getVoices().some(v=>v.localService&&/^zh[-_]/i.test(v.lang)));window.speechSynthesis?.addEventListener('voiceschanged',update);return()=>window.speechSynthesis?.removeEventListener('voiceschanged',update);},[]);return available;}
function sayCar(car:typeof content.cars[number]){if(car.audio==='car-name-local')audio.feedback(car.name,[]);else void audio.play(car.audio);}
export function Showroom(_props:{welcome:boolean;begin:(sound:boolean)=>void}){
 const localNameVoice=useCarNameVoice();
 const[index,setIndex]=useState(Math.max(0,content.cars.findIndex(c=>c.id===activeCar()&&vehicleModel(c.id))));
 const[brand,setBrand]=useState('all'),[origin,setOrigin]=useState('all'),[query,setQuery]=useState(''),[page,setPage]=useState(0),[references,setReferences]=useState(false);const car=content.cars[index];
 const available=content.cars.filter(c=>references?!vehicleModel(c.id):!!vehicleModel(c.id));
 const brands=[...new Set(available.map(c=>c.brand))],countries=[...new Set(available.map(c=>brandOrigin(c.brand)).filter(Boolean))];
 const filtered=filterCatalogue(available,{brand,origin,query});const pages=Math.max(1,Math.ceil(filtered.length/8)),current=Math.min(page,pages-1);
 const clearFilters=()=>{setBrand('all');setOrigin('all');setQuery('');setPage(0);};
 const choose=(id:string)=>{const next=content.cars.findIndex(c=>c.id===id);setIndex(next);rememberCar(id);};
 return <div className="picture-showroom"><div className="car-roundabout"><Model carId={car.id}/><a className="picture-button car-heart" aria-label={`走近看看 ${car.name}`} href={`#/cars/${car.id}`}><PlaySymbol name="smile"/></a><button className="picture-button car-voice" aria-label={car.audio==='car-name-local'&&!localNameVoice?'本机未提供这辆车的名称声音':'听车名'} disabled={car.audio==='car-name-local'&&!localNameVoice} onClick={()=>sayCar(car)}><Volume2/></button></div>
 <section className="garage-picker" aria-label="挑选跑车"><div className="garage-picker-bar"><span className="garage-count">{references?<Camera aria-hidden="true"/>:<Box aria-hidden="true"/>}{references?`${content.cars.length-vehicleModels.length} 款真实车型 · 模型待补`:`${vehicleModels.length} 款立体车 · ${content.cars.length} 款真实车型`}</span></div>
 <div className="garage-filters">
  <label className="garage-search"><Search aria-hidden="true"/><span className="sr-only">查找车型或品牌</span><input type="search" aria-label="查找车型或品牌" placeholder="找车型或品牌" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
  <label>品牌<select aria-label="按汽车品牌筛选" value={brand} onChange={e=>{setBrand(e.target.value);setPage(0);}}><option value="all">全部品牌</option>{brands.map(b=><option key={b} value={b}>{available.find(c=>c.brand===b)?.zhBrand||b}</option>)}</select></label>
  <label>品牌发源地<select aria-label="按品牌发源地筛选" value={origin} onChange={e=>{setOrigin(e.target.value);setPage(0);}}><option value="all">世界各地</option>{countries.map(country=><option key={country} value={country}>{country}</option>)}</select></label>
 </div>
 <p className="garage-results" role="status">{filtered.length} 款可选车型{(brand!=='all'||origin!=='all'||query.trim())&&<button className="text-button" onClick={clearFilters}>清除筛选</button>}</p>
 <div className="car-gallery car-ribbon garage-paged" aria-label="选择跑车">{filtered.slice(current*8,current*8+8).map(c=><button key={c.id} className={`car-gallery-card ${c.id===car.id?'selected':''}`} aria-label={`选择 ${c.name}${vehicleModel(c.id)?'，有独立立体模型':'，参考图片，模型待补'}`} aria-pressed={c.id===car.id} onClick={()=>choose(c.id)}><CarImage carId={c.id} lazy/><span className="garage-car-name">{c.model}</span>{!vehicleModel(c.id)&&<small>参考图片 · 模型待补</small>}</button>)}</div>
 {!filtered.length&&<p className="garage-empty">没有找到这辆车，可以换个名字，或清除筛选再看看。</p>}
 {!!filtered.length&&<div className="garage-pager"><button className="picture-button" aria-label="上一组跑车" disabled={current===0} onClick={()=>setPage(current-1)}><ArrowLeft/></button><span aria-live="polite">{current+1} / {pages}</span><button className="picture-button" aria-label="下一组跑车" disabled={current===pages-1} onClick={()=>setPage(current+1)}><ArrowRight/></button></div>}
 {content.cars.some(c=>!vehicleModel(c.id))&&<button className="garage-reference-switch" aria-pressed={references} onClick={()=>{setReferences(!references);clearFilters();}}>{references?'回到立体车库':`查看 ${content.cars.length-vehicleModels.length} 款参考车图（模型待补）`}</button>}</section>
 <ActivityLinks carId={car.id} ids={['H03','M01','T04']}/></div>;
}
export function Detail({carId,favorite,favoriteBusy=false,favoriteError,toggleFavorite}:{carId:string;favorite:boolean;favoriteBusy?:boolean;favoriteError?:string;toggleFavorite:()=>void}){
 const localNameVoice=useCarNameVoice();
 const car=getCar(carId)!;useEffect(()=>{void safely(()=>db.recent.put({carId,at:new Date().toISOString()}),undefined);},[carId]);
 return <div className="picture-detail"><div className="car-roundabout detail-stage"><Model carId={carId}/><a className="picture-button car-prev" href="#/cars" aria-label="换一辆汽车"><ArrowLeft/></a><button className={`picture-button favorite-button car-heart ${favorite?'saved':''}`} onClick={toggleFavorite} disabled={favoriteBusy} aria-label={favoriteBusy?'正在保存…':favorite?'已放进车库':'我喜欢这辆车'} aria-pressed={favorite}><Heart fill={favorite?'currentColor':'none'}/></button><button className="picture-button car-voice" aria-label={car.audio==='car-name-local'&&!localNameVoice?'本机未提供这辆车的名称声音':'听车名'} disabled={car.audio==='car-name-local'&&!localNameVoice} onClick={()=>sayCar(car)}><Volume2/></button></div>
 {favoriteError&&<div className="activity-feedback pictorial-error" role="status"><button className="picture-button" aria-label="重试收藏" onClick={toggleFavorite}><RotateCcw/></button><span className="sr-only">{favoriteError}</span></div>}
 <ActivityLinks carId={carId} ids={['H03','M01','T04']}/></div>;
}
export function Garage({favorites:storedFavorites}:{favorites:string[]}){
 const favorites=selectableCarIds(storedFavorites);
 const[creations,setCreations]=useState<Creation[]>([]);const[error,setError]=useState('');useEffect(()=>{void safely(()=>db.creations.orderBy('createdAt').reverse().toArray(),[]).then(setCreations);},[]);
 return <div className="picture-garage"><div className="garage-roof" aria-hidden="true"><PlaySymbol name="garage"/><PlaySymbol name="heart"/></div><div className="favorite-grid">{(favorites.length?favorites:content.cars.slice(0,3).map(c=>c.id)).map(id=><a className={favorites.length?'garage-car':'garage-invitation'} key={id} href={`#/cars/${id}`} aria-label={`看看 ${getCar(id)?.name}`}><CarImage carId={id}/>{!favorites.length&&<Heart aria-hidden="true"/>}</a>)}</div>
 <section className="garage-art" aria-label="我的作品">{creations.length?<div className="creation-grid">{creations.map(c=><div className="creation-card" key={c.id}><ArtworkView creation={c}/><button className="picture-button" aria-label="下载图片" onClick={async()=>{try{await exportArtwork(c);}catch{setError('图片暂时无法导出，作品仍保存在车库。');}}}><Download/></button></div>)}</div>:<ActivityLinks ids={['A01','A02']}/>}</section>{error&&<span className="sr-only" role="status">{error}</span>}</div>;
}
