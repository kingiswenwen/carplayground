import models from '../../content/vehicle-models.json';

// An absent record means pictures only. Never substitute a generic car mesh.
export type VehicleModelSpec={id:string;file:string;bytes:number;sha256:string;color:string;rotationY:number;paintMaterials:string[];lampMaterials:string[];excludedNodes:string[];recalculateNormals:boolean;source:{title:string;author:string;authorUrl:string;url:string;license:string;licenseUrl:string;mirror:string;modifications:string}};
export const vehicleModels:VehicleModelSpec[]=models;
export function vehicleModel(carId:string){return vehicleModels.find(model=>model.id===carId);}
