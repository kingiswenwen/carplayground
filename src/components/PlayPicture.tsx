import {assetUrl,getCar} from '../domain/content';
import {PlaySymbol} from './PlaySymbol';

const symbols:Record<string,[string,string]>={H03:['shower','sponge'],M01:['home','garage'],M02:['car','garage'],M03:['car','garage'],L03:['red','blue'],T04:['wheel','tool'],P01:['hand','arrow'],T02:['plank','bridge'],T03:['road','flag'],E01:['red','blue'],E02:['wheel','light'],T01:['wheel','tool'],E03:['stop','arrow'],M04:['red','blue'],S01:['ball','ice'],S02:['lamp','moon'],S03:['rain','umbrella'],L01:['bag','belt'],C02:['bag','flag'],H01:['tree','book'],H02:['friend','tool'],L02:['friend','heart'],C01:['heart','smile'],C03:['tree','star'],A01:['palette','star'],A02:['pencil','wheel']};
const parking=['M01','M02','M03','L03'];
export function PlayPicture({id,carId='CAR01'}:{id:string;carId?:string}){
 if(['world','cars','garage'].includes(id))return <span className={`play-picture nav-picture picture-${id}`} aria-hidden="true"><PlaySymbol name={id==='cars'?'car':id}/></span>;
 const car=getCar(carId)||getCar('CAR01')!,parts=symbols[id]||['book','star'];
 const bay=parking.includes(id),wash=id==='H03',bridge=id==='T02',motion=['P01','E03','S01'].includes(id),assembly=id==='T04';
 return <span className={`play-picture illustrated-picture picture-${id}`} aria-hidden="true">
  <svg viewBox="0 0 320 220" className="picture-land" preserveAspectRatio="xMidYMid meet">
   <ellipse cx="160" cy="185" rx="139" ry="17" fill="#486a6114"/>
   {wash?<><path d="M39 167V65Q39 36 69 36H249Q280 36 280 65V167" fill="#9fcfcd" stroke="#639e9a" strokeWidth="6"/><path d="M60 160V71Q60 57 75 57H244Q260 57 260 71V160" fill="#e0f2ed"/>{[80,120,160,200,240].map(x=><path key={x} d={`M${x} 68v40`} className="picture-water" stroke="#8cc9d6" strokeWidth="6" strokeLinecap="round"/>)}</>:bay?<><path d="M29 184V55h262v129" fill="#f1d694"/><path d="m17 57 143-40 143 40" fill="none" stroke="#d78365" strokeWidth="16" strokeLinecap="round"/><path d="M49 184V89h99v95m20 0V89h104v95" fill="#6c9192" stroke="#fff3d6" strokeWidth="5"/><path d="M66 101h62m57 0h68" stroke="#b7d3ce" strokeWidth="5"/></>:bridge?<><path d="M119 31v153h82V31" fill="#8cc4d4"/><path d="M128 67h63m-63 31h63m-63 62h63" stroke="#c4e4e7" strokeWidth="5"/><path d="M32 166h257" stroke="#d1a77c" strokeWidth="29"/><path d="M37 162h247" stroke="#ecd0a4" strokeWidth="4"/></>:motion?<><path d="M18 122h283M18 178h283" stroke="#77999a" strokeWidth="41" strokeLinecap="round"/><path d="M22 122h276M22 178h276" stroke="#fff2cd" strokeWidth="3" strokeDasharray="14 12"/></>:assembly?<><path d="M25 171h270v19H25z" fill="#be9775"/><path d="M41 190v18m237-18v18" stroke="#a27c5d" strokeWidth="10"/><path d="M43 24h235v91H43z" fill="#ead2a7"/><path d="M55 36h210v66H55z" fill="#f6e8ca"/>{[80,120,160,200,240].map(x=><circle key={x} cx={x} cy="52" r="3" fill="#c4ab83"/>)}</>:<><path d="M24 182q7-86 60-72 34-55 77-8 50-43 93-7 42 20 42 87z" fill="#b4cda0"/><path d="M23 186q90-44 275 0" fill="none" stroke="#f3e2b5" strokeWidth="22"/></>}
  </svg>
  <img className={`picture-car${bay?' top-car':''}`} src={assetUrl(bay?car.game!.top:car.game!.side)} alt="" draggable={false}/>
  <PlaySymbol name={parts[0]} className="picture-object object-one"/>
  <PlaySymbol name={parts[1]} className="picture-object object-two"/>
  {wash&&<span className="picture-scrub"><PlaySymbol name="sponge"/></span>}
 </span>;
}
