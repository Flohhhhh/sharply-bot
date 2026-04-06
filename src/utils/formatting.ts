export function formatUsdPrice(cents: number | null): string {
  if (typeof cents !== 'number') return 'Unknown';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(cents / 100);
}
