import {assetUrl,getCar} from '../domain/content';
import {PlaySymbol} from './PlaySymbol';
import {TownImage} from './Town';

/** Event art is decorative; story links keep the actual chosen car for play. */
export function StoryScene({storyId,frame,carId}:{storyId:string;frame:number;carId:string}){
 const car=getCar(carId)||getCar('CAR01')!;
 return <span className={`story-scene story-art-${storyId} story-art-frame-${frame}`} aria-hidden="true">
  <TownImage name={`story-${storyId}-${frame}`} className="town-story-environment" priority/>
  <span className="town-story-car"><img src={assetUrl(car.game!.side)} alt=""/><PlaySymbol name="arrow"/></span>
  {storyId==='ST02'&&frame===1&&<span className="town-weather-transition">雨停了，太阳出来啦</span>}
  <PlaySymbol name="hand" className="story-play-hand"/>
 </span>;
}
