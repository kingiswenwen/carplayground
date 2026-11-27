import {useState, type ReactNode} from 'react';
import {ArrowLeft, ArrowRight, RefreshCw} from './TownIcons';
import {assetUrl, content} from '../domain/content';
import {activeCar} from '../domain/active-car';
import {PlaySymbol} from './PlaySymbol';
import {CarThumbnail} from './CarImage';

export function TownImage({name,className='',priority=false,alt='',linkSymbol}:{name:string;className?:string;priority?:boolean;alt?:string;linkSymbol?:string}) {
  const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  return <span className={`town-art ${className}`} data-unavailable={failed}>
    <img src={assetUrl(`town-${name}`)+(attempt?`?retry=${attempt}`:'')} alt={alt} draggable={false} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'} onError={()=>setFailed(true)} onLoad={()=>setFailed(false)}/>
    {failed&&<span className="town-art-recovery" role="status">
      <PlaySymbol name={linkSymbol||'world'}/>
      {linkSymbol?<span className="sr-only">插画暂时没有加载，仍可打开。</span>:<>
        <span>插画暂时没有加载。</span>
        <button type="button" aria-label="重新加载小镇风景" onClick={()=>{setFailed(false);setAttempt(a=>a+1);}}><RefreshCw/></button>
      </>}
    </span>}
  </span>;
}
export function TownHeading({title,description,back,children}:{title:string;description?:string;back?:string;children?:ReactNode}) {
  return <div className="town-heading">{back&&<a className="picture-button" data-town-back href={back} aria-label="回到小镇"><ArrowLeft/></a>}<div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{children}</div>;
}
export function TownStories() {
  return <section className="town-stories" aria-label="小镇故事"><div className="town-section-heading"><h2>小车的故事时间</h2><PlaySymbol name="book"/></div><div className="town-story-shelf">{content.stories.map((story,index)=><a href={`#/stories/${story.id}`} aria-label={story.title} key={story.id} className={`town-story-book book-${index}`}><TownImage name={`story-${story.id}`} linkSymbol="book"/><span><strong>{story.title}</strong><small>四幕故事 · 一起听，一起玩</small></span><ArrowRight aria-hidden="true"/></a>)}</div></section>;
}
export function TownCarInvitation() {
  const car=content.cars.find(car=>car.id===activeCar())||content.cars[0];
  return <a className="town-car-invitation" href="#/cars" aria-label="挑选爱车，带它去小镇"><CarThumbnail imageId={car.game!.side}/><span>带上爱车</span><ArrowRight aria-hidden="true"/></a>;
}
