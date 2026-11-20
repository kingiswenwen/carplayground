import type {Rect} from '../domain/direct-play';

const imageSize={width:1122,height:1402};
export const bridgeRiverX=[423,631];
export const bridgeLaneY=589;
const shutterCrop={x:613,y:965,w:445,h:229};
type Banks={left:number;right:number};

function mapX(x:number,{left,right}:Banks){
  const [sourceLeft,sourceRight]=bridgeRiverX;
  if(x<=sourceLeft)return x*left/sourceLeft;
  if(x<=sourceRight)return left+(x-sourceLeft)*(right-left)/(sourceRight-sourceLeft);
  return right+(x-sourceRight)*(1000-right)/(imageSize.width-sourceRight);
}
function mapY(y:number,height:number){
  const lane=height*.44;
  return y<=bridgeLaneY?y*lane/bridgeLaneY:lane+(y-bridgeLaneY)*(height-lane)/(imageSize.height-bridgeLaneY);
}

export function bridgeShutterRect(banks:Banks,height:number):Rect{
  const left=mapX(shutterCrop.x,banks),right=mapX(shutterCrop.x+shutterCrop.w,banks);
  const top=mapY(shutterCrop.y,height),bottom=mapY(shutterCrop.y+shutterCrop.h,height);
  return {x:(left+right)/2,y:(top+bottom)/2,w:right-left,h:bottom-top};
}
