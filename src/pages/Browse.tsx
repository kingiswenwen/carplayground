import {activeCar,rememberCar} from '../domain/active-car';
import {useEffect,useState} from 'react';
import {VehicleViews} from '../components/VehicleViews';
import {ArrowLeft,Heart,Volume2,Download,RotateCcw} from 'lucide-react';
import {CarImage} from '../components/CarImage';
import {PlayPicture} from '../components/PlayPicture';
import {PlaySymbol} from '../components/PlaySymbol';
import {content,getCar} from '../domain/content';
import {audio} from '../services/audio';
import {db,safely,type Creation} from '../services/storage';
import {ArtworkView} from './Studio';
import {exportArtwork} from '../services/artwork';
export function ActivityLinks({ids,carId,domain,scene}:{ids?:string[];carId?:string;domain?:string;scene?:string}){
 const chosen=carId||activeCar();const list=content.activities.filter(a=>(!ids||ids.includes(a.id))&&(!domain||a.domain===domain)&&(!scene||a.scene===scene)&&a.carIds.includes(chosen)).sort((a,b)=>ids?ids.indexOf(a.id)-ids.indexOf(b.id):0);
 return <div className="activity-links picture-activities">{list.map(item=><a href={`#/play/${item.id}?car=${chosen}`} className={`activity-link picture-activity play-${item.id}`} key={item.id} aria-label={item.title}><PlayPicture id={item.id} carId={chosen}/></a>)}</div>;
}
function Model({carId}:{carId:string}){return <VehicleViews key={carId} carId={carId}/>;}
export function Showroom(_props:{welcome:boolean;begin:(sound:boolean)=>void}){
 const[index,setIndex]=useState(Math.max(0,content.cars.findIndex(c=>c.id===activeCar())));const car=content.cars[index];
 const choose=(i:number)=>{setIndex((i+content.cars.length)%content.cars.length);rememberCar(content.cars[(i+content.cars.length)%content.cars.length].id);};
 return <div className="picture-showroom"><div className="car-roundabout"><Model carId={car.id}/><a className="picture-button car-heart" aria-label={`走近看看 ${car.name}`} href={`#/cars/${car.id}`}><PlaySymbol name="smile"/></a><button className="picture-button car-voice" aria-label="听车名" onClick={()=>void audio.play(car.audio)}><Volume2/></button></div>
 <div className="car-gallery car-ribbon" aria-label="选择跑车">{content.cars.map((c,i)=><button key={c.id} className={`car-gallery-card ${i===index?'selected':''}`} aria-label={`选择 ${c.name}`} aria-pressed={i===index} onClick={()=>choose(i)}><CarImage carId={c.id} lazy/></button>)}</div>
 <ActivityLinks carId={car.id} ids={['H03','M01','T04']}/></div>;
}
export function Detail({carId,favorite,favoriteBusy=false,favoriteError,toggleFavorite}:{carId:string;favorite:boolean;favoriteBusy?:boolean;favoriteError?:string;toggleFavorite:()=>void}){
 const car=getCar(carId)!;useEffect(()=>{void safely(()=>db.recent.put({carId,at:new Date().toISOString()}),undefined);},[carId]);
 return <div className="picture-detail"><div className="car-roundabout detail-stage"><Model carId={carId}/><a className="picture-button car-prev" href="#/cars" aria-label="换一辆汽车"><ArrowLeft/></a><button className={`picture-button favorite-button car-heart ${favorite?'saved':''}`} onClick={toggleFavorite} disabled={favoriteBusy} aria-label={favoriteBusy?'正在保存…':favorite?'已放进车库':'我喜欢这辆车'} aria-pressed={favorite}><Heart fill={favorite?'currentColor':'none'}/></button><button className="picture-button car-voice" aria-label="听车名" onClick={()=>void audio.play(car.audio)}><Volume2/></button></div>
 {favoriteError&&<div className="activity-feedback pictorial-error" role="status"><button className="picture-button" aria-label="重试收藏" onClick={toggleFavorite}><RotateCcw/></button><span className="sr-only">{favoriteError}</span></div>}
 <ActivityLinks carId={carId} ids={['H03','M01','T04']}/></div>;
}
export function Garage({favorites}:{favorites:string[]}){
 const[creations,setCreations]=useState<Creation[]>([]);const[error,setError]=useState('');useEffect(()=>{void safely(()=>db.creations.orderBy('createdAt').reverse().toArray(),[]).then(setCreations);},[]);
 return <div className="picture-garage"><div className="garage-roof" aria-hidden="true"><PlaySymbol name="garage"/><PlaySymbol name="heart"/></div><div className="favorite-grid">{(favorites.length?favorites:content.cars.slice(0,3).map(c=>c.id)).map(id=><a className={favorites.length?'garage-car':'garage-invitation'} key={id} href={`#/cars/${id}`} aria-label={`看看 ${getCar(id)?.name}`}><CarImage carId={id}/>{!favorites.length&&<Heart aria-hidden="true"/>}</a>)}</div>
 <section className="garage-art" aria-label="我的作品">{creations.length?<div className="creation-grid">{creations.map(c=><div className="creation-card" key={c.id}><ArtworkView creation={c}/><button className="picture-button" aria-label="下载图片" onClick={async()=>{try{await exportArtwork(c);}catch{setError('图片暂时无法导出，作品仍保存在车库。');}}}><Download/></button></div>)}</div>:<ActivityLinks ids={['A01','A02']}/>}</section>{error&&<span className="sr-only" role="status">{error}</span>}</div>;
}
