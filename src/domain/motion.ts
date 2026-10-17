/** Small level-track model, in arbitrary model units. Never factory vehicle data. */
export type MotionState = { distance: number; speed: number };
export function advanceMotion(state: MotionState, seconds: number, resistance: number, braking = false): MotionState {
  if (!Number.isFinite(seconds) || seconds <= 0 || state.speed <= 0) return state;
  const deceleration = Math.max(.1, resistance) + (braking ? 26 : 0);
  const dt = Math.min(seconds, state.speed / deceleration);
  const distance = Math.min(82, state.distance + state.speed * dt - .5 * deceleration * dt * dt);
  return { distance, speed: distance >= 82 ? 0 : Math.max(0, state.speed - deceleration * dt) };
}
export const motionResistance = { smooth: 5.5, rough: 11 } as const;
