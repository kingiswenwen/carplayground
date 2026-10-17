export type ParkingState = { cars: string[]; slots: (string | null)[] };
export function createParking(count = 2, slotCount = count): ParkingState {
  return { cars: Array.from({ length: count }, (_, i) => `car-${i}`), slots: Array(slotCount).fill(null) };
}
export function placeCar(state: ParkingState, car: string, slot: number): ParkingState {
  if (!state.cars.includes(car) || !Number.isInteger(slot) || slot < 0 || slot >= state.slots.length ||
    state.slots[slot] !== null || state.slots.includes(car)) return state;
  return { ...state, slots: state.slots.map((value, i) => i === slot ? car : value) };
}
export const parkedCount = (state: ParkingState) => state.slots.filter(Boolean).length;
export const parkingComplete = (state: ParkingState) => state.cars.every(car => state.slots.includes(car));
export function colorOptions(target: string, expanded: boolean) {
  const all = ['red', 'blue', 'white'];
  if (!all.includes(target)) throw new Error('未知颜色');
  return expanded ? all : [target, all[(all.indexOf(target) + 1) % all.length]];
}
