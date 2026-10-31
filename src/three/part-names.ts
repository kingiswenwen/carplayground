// Both front and rear lamps are valid "car lights" in the exploration games.
export const isVehicleLampName=(name:string)=>/head.?light|head.?lamp|front.?light|rear.?light|tail.?light|brake.?light|breaklight|fog.?light/i.test(name);
