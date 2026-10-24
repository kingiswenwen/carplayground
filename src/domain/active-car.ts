import {getCar} from './content';
const key='carplayground-active-car-v1';
export function activeCar(){try{const value=localStorage.getItem(key);return value&&getCar(value)?value:'CAR01';}catch{return 'CAR01';}}
export function rememberCar(id:string){if(!getCar(id))return;try{localStorage.setItem(key,id);}catch{/* Selection still works in the current route. */}}
