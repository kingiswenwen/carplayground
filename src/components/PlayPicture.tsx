import {useState} from 'react';
import {assetUrl} from '../domain/content';
import {PlaySymbol} from './PlaySymbol';

const activitySymbols:Record<string,string>={
  A01:'palette',A02:'wheel',C01:'heart',C02:'bag',C03:'tree',
  E01:'red',E02:'wheel',E03:'stop',H01:'tree',H02:'friend',H03:'shower',
  L01:'bag',L02:'friend',L03:'garage',M01:'home',M02:'garage',M03:'car',M04:'flag',
  P01:'hand',S01:'ball',S02:'lamp',S03:'rain',T01:'tool',T02:'plank',T03:'road',T04:'wheel',
};

export function PlayPicture({id}:{id:string}){
  if(id==='world'||id==='cars'||id==='garage'){
    return <span className="play-picture nav-picture" aria-hidden="true"><PlaySymbol name={id==='cars'?'car':id}/></span>;
  }
  return <TownCover key={id} id={id}/>;
}

function TownCover({id}:{id:string}){
  const [failed,setFailed]=useState(false);
  return <span className={`play-picture town-activity-cover picture-${id}`} aria-hidden="true">
    {failed
      ? <PlaySymbol name={activitySymbols[id]||'car'} className="town-cover-fallback"/>
      : <img className="town-cover" src={assetUrl(`town-activity-${id}`)} alt="" width={720} height={490} loading="lazy" draggable={false} onError={()=>setFailed(true)}/>}
  </span>;
}
