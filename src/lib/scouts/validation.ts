/** Accept legacy bounded inputs, but preserve the product's daily cadence. */
export function dailyScoutInterval(value?: number): number {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 15 || value > 1440)) {
    throw new Error("Scout poll interval must be a whole number between 15 and 1440 minutes.");
  }
  return 1440;
}
