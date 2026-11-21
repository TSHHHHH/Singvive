/** Short kg number for item cards: "0.65", "1", "1.2" (at most two decimals, no trailing zeros). */
export function shortKg(kg: number): string {
  return String(Number(kg.toFixed(2)));
}

/**
 * Item weight as the survivor feels it, with the raw weight in brackets when a
 * bag cut or the loose penalty changes it: "0.65kg(1kg)". Unchanged: "1kg".
 */
export function feltWeightLabel(rawKg: number, factor: number): string {
  const felt = shortKg(rawKg * factor);
  const raw = shortKg(rawKg);
  return felt === raw ? `${raw}kg` : `${felt}kg(${raw}kg)`;
}
