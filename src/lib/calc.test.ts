import { describe, it, expect } from 'vitest';
import { calculateSplit, type ClaimWithItem } from './calc';

describe('calculateSplit', () => {
    const people = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
    ];

    it('splits items equally when no custom amounts are set', () => {
        const claims: ClaimWithItem[] = [
            {
                item_id: 'i1',
                person_id: 'p1',
                split_count: 2,
                custom_amount: null,
                custom_fraction: null,
                item_price: 20,
                item_name: 'Burger',
            },
            {
                item_id: 'i1',
                person_id: 'p2',
                split_count: 2,
                custom_amount: null,
                custom_fraction: null,
                item_price: 20,
                item_name: 'Burger',
            },
            {
                item_id: 'i2',
                person_id: 'p1',
                split_count: 1,
                custom_amount: null,
                custom_fraction: null,
                item_price: 15,
                item_name: 'Salad',
            },
        ];

        const receiptSubtotal = 35;
        const receiptTax = 3.5;
        const tipAmount = 7;
        const miscFeeAmount = 2;

        const result = calculateSplit(claims, people, receiptSubtotal, receiptTax, tipAmount, miscFeeAmount);

        expect(result).toHaveLength(2);

        // Alice: $10 (Burger half) + $15 (Salad) = $25 subtotal (25/35 proportion)
        const alice = result.find(p => p.person_id === 'p1');
        expect(alice?.subtotal).toBe(25);
        expect(alice?.taxShare).toBeCloseTo(2.5, 2);
        expect(alice?.tipShare).toBeCloseTo(5, 2);
        expect(alice?.miscFeeShare).toBeCloseTo(1.43, 2);

        // Bob: $10 (Burger half) = $10 subtotal (10/35 proportion)
        const bob = result.find(p => p.person_id === 'p2');
        expect(bob?.subtotal).toBe(10);
        expect(bob?.taxShare).toBeCloseTo(1.0, 2);
        expect(bob?.tipShare).toBeCloseTo(2, 2);
        expect(bob?.miscFeeShare).toBeCloseTo(0.57, 2);
    });

    it('handles custom amount claims correctly', () => {
        const claims: ClaimWithItem[] = [
            {
                item_id: 'i1',
                person_id: 'p1',
                split_count: 2,
                custom_amount: 12,
                custom_fraction: null,
                item_price: 20,
                item_name: 'Burger',
            },
            {
                item_id: 'i1',
                person_id: 'p2',
                split_count: 2,
                custom_amount: 8, // Remaining 8
                custom_fraction: null,
                item_price: 20,
                item_name: 'Burger',
            },
        ];

        const result = calculateSplit(claims, people, 20, 2, 4, 0);

        const alice = result.find(p => p.person_id === 'p1');
        expect(alice?.subtotal).toBe(12);
        expect(alice?.taxShare).toBe(1.2); // (12/20) * 2
        expect(alice?.tipShare).toBe(2.4); // (12/20) * 4

        const bob = result.find(p => p.person_id === 'p2');
        expect(bob?.subtotal).toBe(8);
    });

    it('calculates totals with 0 subtotal without dividing by zero', () => {
        // Edge case where everything is free but maybe there's a flat fee (unlikely, but ensures no NaN)
        const claims: ClaimWithItem[] = [
            {
                item_id: 'i1',
                person_id: 'p1',
                split_count: 1,
                custom_amount: null,
                custom_fraction: null,
                item_price: 0,
                item_name: 'Water',
            },
        ];

        const result = calculateSplit(claims, people, 0, 0, 0, 5);
        expect(result[0].subtotal).toBe(0);
        expect(result[0].taxShare).toBe(0);
        expect(result[0].tipShare).toBe(0);
        expect(result[0].miscFeeShare).toBe(0);
        expect(result[0].total).toBe(0);
    });
});
