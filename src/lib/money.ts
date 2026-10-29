// Belopp lagras i öre (heltal) för att undvika avrundningsfel.

export function formatKr(ore: number): string {
  const kr = (ore || 0) / 100;
  const hasOre = Math.round(kr * 100) % 100 !== 0;
  return (
    new Intl.NumberFormat('sv-SE', {
      minimumFractionDigits: hasOre ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(kr) + ' kr'
  );
}

/** "1 800" eller "1 800,50" → öre. Tom sträng → 0. */
export function parseKr(input: string | null | undefined): number {
  if (!input) return 0;
  const clean = String(input).replace(/\s/g, '').replace('kr', '').replace(',', '.');
  const n = Number(clean);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** Momsbelopp som ingår i ett pris inklusive moms. */
export function vatIncluded(totalOre: number, ratePercent: number): number {
  if (!ratePercent) return 0;
  return Math.round((totalOre * ratePercent) / (100 + ratePercent));
}

export const VAT_OPTIONS = [
  { value: 25, label: '25 %' },
  { value: 12, label: '12 %' },
  { value: 6, label: '6 %' },
  { value: 0, label: '0 % (momsfritt)' },
];
