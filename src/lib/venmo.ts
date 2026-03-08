export function buildVenmoLink(
  venmoUsername: string,
  amount: number,
  note: string
): string {
  const cleanUsername = venmoUsername.replace("@", "");
  return `https://venmo.com/${encodeURIComponent(cleanUsername)}?txn=pay&amount=${amount.toFixed(2)}&note=${encodeURIComponent(note)}`;
}
