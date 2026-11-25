export const MIN_VEHICLE_ZOOM=75;
export const MAX_VEHICLE_ZOOM=250;
export const VEHICLE_ZOOM_STEP=25;

export type VehicleViewActions={
  adjustZoom:(percent:number)=>void;
  resetView:()=>void;
};
