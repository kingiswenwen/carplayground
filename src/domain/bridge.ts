export const bridgeReaches = [
  { width: 300, boards: [240, 360] },
  { width: 430, boards: [360, 500] },
] as const;

export const bridgeBearing = 22;

export function spansRiver(boardWidth: number, riverWidth: number) {
  return boardWidth >= riverWidth + 2 * bridgeBearing;
}
