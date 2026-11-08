import {content,getDisplayCar} from './content';

/** Catalogue artwork uses the same registered mesh as the vehicle viewer. */
export function vehiclePreview(carId:string){
 const car=getDisplayCar(carId);if(!car)return undefined;
 const render=`render-${carId}-front-left`;
 return content.assets.some(asset=>asset.id===render&&asset.kind==='image')?render:car.game?.side||car.displayImage||car.image;
}
