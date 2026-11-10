import {ArrowRight} from 'lucide-react';
import type {CSSProperties} from 'react';
import {ActivityLinks} from './Browse';
import {PlaySymbol} from '../components/PlaySymbol';
import {TownCarInvitation, TownHeading, TownImage, TownStories} from '../components/Town';
import {activeCar} from '../domain/active-car';
import {getTownPlace, townPlaces} from '../domain/town';

export function World({sceneId}:{sceneId?:string}) {
  const place=sceneId?getTownPlace(sceneId):undefined;
  if(place)return <div className={`picture-world town-place place-${place.id}`} data-town-place={place.id}>
    <TownHeading title={place.name} description={place.invitation} back="#/explore"/>
    <div className="town-place-banner"><TownImage name={place.id} priority/><PlaySymbol name={place.symbol}/></div>
    <ActivityLinks ids={[...place.activities]} carId={activeCar()}/>
    {place.id==='studio'&&<TownStories/>}
    <nav className="town-neighbours" aria-label="去别的地方">{townPlaces.filter(p=>p.id!==place.id).map(p=><a key={p.id} href={`#/explore/${p.id}`} aria-label={`去${p.name}`}><PlaySymbol name={p.symbol}/><span>{p.name}</span></a>)}</nav>
  </div>;
  return <div className="picture-world town-world">
    <TownHeading title="今天，小车想去哪儿？" description="选一座房子，开进一个小发现。"><TownCarInvitation/></TownHeading>
    <div className="town-map" aria-label="汽车小镇六个地点">
      <TownImage name="town" className="town-map-art" priority alt="道路连着车展大厅、停车广场、修车工坊、泡泡洗车屋、科学公园和故事画室的微缩汽车小镇"/>
      <nav className="town-destinations" aria-label="选择小镇地点">{townPlaces.map(place=><a key={place.id} className={`town-destination town-destination-${place.id}`} href={`#/explore/${place.id}`} aria-label={place.name} style={{'--place-x':`${place.x}%`,'--place-y':`${place.y}%`} as CSSProperties}>
        <TownImage name={place.id} className="town-mobile-building"/>
        <span className="town-place-sign"><PlaySymbol name={place.symbol}/><span><strong>{place.name}</strong><small>{place.action}</small></span><ArrowRight aria-hidden="true"/></span>
      </a>)}</nav>
    </div>
    <TownStories/>
    <div className="town-home-note"><PlaySymbol name="hand"/><span>慢慢试，随时重来。每一个小发现，都值得一起看看。</span></div>
  </div>;
}
