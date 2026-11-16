/** Translate a grab offset to a destination grid, including differently sized cells. */
export function dropCell(pointer: number, origin: number, grab: number, sourceCell: number, targetCell: number, cells: number, footprint: number): number {
  const scaledGrab = grab / sourceCell * targetCell;
  return Math.max(0, Math.min(cells - footprint, Math.round((pointer - origin - scaledGrab) / targetCell)));
}
