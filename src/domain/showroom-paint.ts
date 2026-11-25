export const paintFinishes = [
  {id:'gloss', label:'亮面'},
  {id:'matte', label:'哑光'},
  {id:'metallic', label:'金属漆'},
] as const;

export type PaintFinish = typeof paintFinishes[number]['id'];
export type PaintColor = {hue:number; saturation:number; brightness:number};
export type ShowroomPaint = PaintColor & {finish:PaintFinish};

export function paintHex({hue,saturation,brightness}:PaintColor) {
  const value=brightness/100, chroma=saturation/100;
  return '#'+[5,3,1].map(channel=>{
    const angle=(channel+hue/60)%6;
    const amount=value*(1-chroma*Math.max(0,Math.min(angle,4-angle,1)));
    return Math.round(amount*255).toString(16).padStart(2,'0');
  }).join('');
}

export function paintColor(hex:string):PaintColor {
  const [red,green,blue]=[1,3,5].map(start=>Number.parseInt(hex.slice(start,start+2),16)/255);
  const highest=Math.max(red,green,blue), spread=highest-Math.min(red,green,blue);
  let hue=0;
  if(spread){
    if(highest===red)hue=(green-blue)/spread;
    else if(highest===green)hue=2+(blue-red)/spread;
    else hue=4+(red-green)/spread;
  }
  return {hue:(hue*60+360)%360,saturation:highest?100*spread/highest:0,brightness:highest*100};
}
