import {assetUrl,getCar} from '../domain/content';
import {PlaySymbol} from './PlaySymbol';

const sceneProps:Record<string,string[][]>={
 ST01:[['light','wheel'],['garage','car'],['heart','smile'],['palette','pencil']],
 ST02:[['rain','umbrella'],['bag','belt'],['road','flag'],['sun','tree']],
 ST03:[['garage','car'],['shower','sponge'],['friend','tool'],['red','blue']],
};

export function StoryScene({storyId,frame,carId}:{storyId:string;frame:number;carId:string}){
 const car=getCar(carId)||getCar('CAR01')!,rain=storyId==='ST02'&&frame===0;
 const garage=storyId==='ST03',hall=storyId==='ST01',props=sceneProps[storyId]?.[frame]||['tree','star'];
 return <span className={`story-scene story-art-${storyId} story-art-frame-${frame}`} aria-hidden="true">
  <svg className="story-landscape" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice">
   <path fill={rain?'#c9dfe2':'#dbece2'} d="M0 0h800v500H0z"/>
   <path fill="#b6ce9e" d="M0 278q180-102 370-14 249-92 430 14v222H0z"/>
   <path fill="#d4dfb5" d="M0 360q228-63 400-10 242-69 400 3v147H0z"/>
   {hall&&<><path fill="#edce94" d="M101 327V118Q101 57 170 57h460q69 0 69 61v209z"/><path fill="#f8e8c4" d="M128 324V126q0-43 46-43h451q46 0 46 43v198z"/><path fill="#829fa3" d="M159 116h479v152H159z"/><path stroke="#b8d3d0" strokeWidth="4" d="M318 116v150m160-150v150"/><path fill="#eee1bc" d="m155 107 90-10 55 171H124zm346-10 90 10 83 161H446z" opacity=".5"/><path fill="#d5b57e" d="M77 328h647v22H77z"/></>}
   {garage&&<><path fill="#edce94" d="M103 326V129h594v197z"/><path fill="#d68a6d" d="M76 130 400 50l324 80-12 25-312-72-312 72z"/>{[170,345,520].map((x,i)=><g key={x}><path fill={frame===3?['#d9947e','#8db6c5','#efeed8'][i]:'#709295'} d={`M${x} 174h116v152H${x}z`}/><path stroke="#f8eccb" strokeWidth="5" d={`M${x+10} 184h96m-96 14h96m-96 14h96`}/></g>)}</>}
   {!hall&&!garage&&<><path stroke="#e6d5aa" strokeWidth="70" fill="none" d="M-50 393q311-156 563-13 147 96 337-7"/><path stroke="#f5e7c3" strokeWidth="4" strokeDasharray="18 20" fill="none" d="M-50 393q311-156 563-13 147 96 337-7"/></>}
   {rain&&Array.from({length:27},(_,i)=><path key={i} d={`m${25+i*31%780} ${25+i*47%300}-12 27`} stroke="#83b8c9" strokeWidth="4" strokeLinecap="round"/>)}
   {storyId==='ST02'&&frame===2&&<><path fill="#9ec6ce" d="M360 297h124v203H360z"/><path fill="#d4bd91" d="M333 346h177v66H333z"/><path stroke="#f6e4bd" strokeWidth="5" d="M349 357h142m-142 18h142m-142 18h142"/></>}
   <ellipse cx="396" cy="378" rx="228" ry="22" fill="#4e706622"/>
  </svg>
  <img className="story-hero-car" src={assetUrl(car.game!.side)} alt="" draggable={false}/>
  <PlaySymbol name={props[0]} className="story-prop story-prop-first"/>
  <PlaySymbol name={props[1]} className="story-prop story-prop-second"/>
  {storyId==='ST02'&&frame===1&&<div className="story-packing-props"><PlaySymbol name="water"/><PlaySymbol name="cap"/><PlaySymbol name="belt"/></div>}
  {storyId==='ST03'&&frame===1&&<img className="story-waiting-car" src={assetUrl(getCar('CAR11')!.game!.side)} alt=""/>}
  {storyId==='ST01'&&frame===3&&<span className="story-easel"><PlaySymbol name="star"/><PlaySymbol name="leaf"/></span>}
  <PlaySymbol name="hand" className="story-play-hand"/>
 </span>;
}
