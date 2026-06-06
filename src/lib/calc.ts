export interface ClaimWithItem {
  item_id: string;
  person_id: string;
  split_count: number;
  custom_amount: number | null;
  custom_fraction: string | null;
  item_price: number;
  item_name: string;
}

export interface PersonTotal {
  person_id: string;
  person_name: string;
  items: { name: string; price: number; split_count: number; custom_amount: number | null; custom_fraction: string | null; share: number }[];
  subtotal: number;
  taxShare: number;
  tipShare: number;
  miscFeeShare: number;
  total: number;
}

export function calculateSplit(
  claims: ClaimWithItem[],
  people: { id: string; name: string }[],
  receiptSubtotal: number,
  receiptTax: number,
  tipAmount: number,
  miscFee: number = 0
): PersonTotal[] {
  return people.map((person) => {
    const personClaims = claims.filter((c) => c.person_id === person.id);

    const items = personClaims.map((c) => ({
      name: c.item_name,
      price: c.item_price,
      split_count: c.split_count,
      custom_amount: c.custom_amount,
      custom_fraction: c.custom_fraction,
      share: c.custom_amount != null ? c.custom_amount : c.item_price / c.split_count,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.share, 0);
    const proportion = receiptSubtotal > 0 ? subtotal / receiptSubtotal : 0;
    const taxShare = proportion * receiptTax;
    const tipShare = proportion * tipAmount;
    const miscFeeShare = proportion * miscFee;
    const total = subtotal + taxShare + tipShare + miscFeeShare;

    return {
      person_id: person.id,
      person_name: person.name,
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      taxShare: Math.round(taxShare * 100) / 100,
      tipShare: Math.round(tipShare * 100) / 100,
      miscFeeShare: Math.round(miscFeeShare * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  });
}
