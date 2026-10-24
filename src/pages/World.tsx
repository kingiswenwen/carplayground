import {useState} from 'react';
import {ArrowLeft,ArrowRight} from 'lucide-react';
import {ActivityLinks} from './Browse';
import {PlayPicture} from '../components/PlayPicture';
import {PlaySymbol} from '../components/PlaySymbol';
import {activeCar} from '../domain/active-car';
import {content,type SceneId} from '../domain/content';
const first=['H03','M01','T04','P01','T02','A02'];
export function World({sceneId}:{sceneId?:SceneId}){
 const[page,setPage]=useState(0);const ids=sceneId?content.activities.filter(a=>a.scene===sceneId).map(a=>a.id):[...first,...content.activities.map(a=>a.id).filter(id=>!first.includes(id))];const pages=Math.ceil(ids.length/3),car=activeCar();
 return <div className="picture-world"><div className="world-sky" aria-hidden="true"><PlaySymbol name="cloud"/><PlaySymbol name="sun"/><PlaySymbol name="cloud"/></div>{sceneId&&<a className="picture-button world-back" href="#/explore" aria-label="回到乐园"><ArrowLeft/></a>}
 <ActivityLinks ids={ids.slice(page*3,page*3+3)} carId={car}/>
 <div className="picture-pagination"><button className="picture-button" aria-label="前一组玩法" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ArrowLeft/></button><div className="picture-dots" aria-label="玩法分组">{Array.from({length:pages},(_,i)=>Math.abs(i-page)<=1&&<button key={i} aria-label={`第${i+1}组玩法`} aria-current={i===page?'page':undefined} onClick={()=>setPage(i)}/>)}</div><button className="picture-button" aria-label="更多玩法" disabled={page===pages-1} onClick={()=>setPage(p=>p+1)}><ArrowRight/></button></div>
 {!sceneId&&<div className="picture-story-shelf" aria-label="故事">{content.stories.map(s=><a aria-label={s.title} key={s.id} href={`#/stories/${s.id}`}><PlayPicture id={s.id==='ST01'?'A01':s.id==='ST02'?'S03':'L03'} carId={car}/></a>)}</div>}</div>;
}
