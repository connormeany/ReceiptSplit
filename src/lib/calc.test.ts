import { describe, it, expect } from "vitest";
import { calculateSplit, ClaimWithItem } from "./calc";

describe("calculateSplit", () => {
  it("splits a basic receipt correctly", () => {
    const claims: ClaimWithItem[] = [
      {
        item_id: "item1",
        person_id: "p1",
        split_count: 1,
        custom_amount: null,
        custom_fraction: null,
        item_price: 10,
        item_name: "Burger",
      },
      {
        item_id: "item2",
        person_id: "p2",
        split_count: 1,
        custom_amount: null,
        custom_fraction: null,
        item_price: 20,
        item_name: "Steak",
      },
    ];

    const people = [
      { id: "p1", name: "Alice" },
      { id: "p2", name: "Bob" },
    ];

    const receiptSubtotal = 30;
    const receiptTax = 3; // 10% tax
    const tipAmount = 6; // 20% tip
    const miscFee = 0;

    const result = calculateSplit(claims, people, receiptSubtotal, receiptTax, tipAmount, miscFee);

    // Alice: $10 (33.33% of subtotal) -> Tax $1, Tip $2, Total $13
    expect(result[0]!.subtotal).toBe(10);
    expect(result[0]!.taxShare).toBe(1);
    expect(result[0]!.tipShare).toBe(2);
    expect(result[0]!.total).toBe(13);

    // Bob: $20 (66.67% of subtotal) -> Tax $2, Tip $4, Total $26
    expect(result[1]!.subtotal).toBe(20);
    expect(result[1]!.taxShare).toBe(2);
    expect(result[1]!.tipShare).toBe(4);
    expect(result[1]!.total).toBe(26);
  });

  it("handles shared items accurately", () => {
    const claims: ClaimWithItem[] = [
      {
        item_id: "item1",
        person_id: "p1",
        split_count: 2,
        custom_amount: null,
        custom_fraction: null,
        item_price: 15,
        item_name: "Appetizer",
      },
      {
        item_id: "item1",
        person_id: "p2",
        split_count: 2,
        custom_amount: null,
        custom_fraction: null,
        item_price: 15,
        item_name: "Appetizer",
      },
    ];

    const people = [
      { id: "p1", name: "Alice" },
      { id: "p2", name: "Bob" },
    ];

    const receiptSubtotal = 15;
    const receiptTax = 1.5;
    const tipAmount = 3;
    const miscFee = 0;

    const result = calculateSplit(claims, people, receiptSubtotal, receiptTax, tipAmount, miscFee);

    // Both should pay half of 15 ($7.5) -> Tax 0.75, Tip 1.5, Total $9.75
    expect(result[0]!.subtotal).toBe(7.5);
    expect(result[0]!.taxShare).toBe(0.75);
    expect(result[0]!.tipShare).toBe(1.5);
    expect(result[0]!.total).toBe(9.75);

    expect(result[1]!.subtotal).toBe(7.5);
    expect(result[1]!.taxShare).toBe(0.75);
    expect(result[1]!.tipShare).toBe(1.5);
    expect(result[1]!.total).toBe(9.75);
  });

  it("handles custom fractional amounts (custom_amount populated from fraction math)", () => {
    const claims: ClaimWithItem[] = [
      {
        item_id: "item1",
        person_id: "p1",
        split_count: 1,
        custom_amount: 3.33, // represents 1/3 of a $10 item
        custom_fraction: "1/3",
        item_price: 10,
        item_name: "Pizza",
      },
      {
        item_id: "item1",
        person_id: "p2",
        split_count: 1,
        custom_amount: 6.67, // "Claim Rest" for the $10 item
        custom_fraction: null,
        item_price: 10,
        item_name: "Pizza",
      },
    ];

    const people = [
      { id: "p1", name: "Alice" },
      { id: "p2", name: "Bob" },
    ];

    const receiptSubtotal = 10;
    const receiptTax = 1; // 10%
    const tipAmount = 2; // 20%
    const miscFee = 0;

    const result = calculateSplit(claims, people, receiptSubtotal, receiptTax, tipAmount, miscFee);

    // Alice
    expect(result[0]!.subtotal).toBe(3.33);
    // Tax share = (3.33 / 10) * 1 = 0.333 -> Math.round is 0.33
    expect(result[0]!.taxShare).toBe(0.33);
    // Tip share = (3.33 / 10) * 2 = 0.666 -> Math.round is 0.67
    expect(result[0]!.tipShare).toBe(0.67);
    expect(result[0]!.total).toBe(3.33 + 0.33 + 0.67); // 4.33

    // Bob
    expect(result[1]!.subtotal).toBe(6.67);
    // Tax share = (6.67 / 10) * 1 = 0.667 -> Math.round is 0.67
    expect(result[1]!.taxShare).toBe(0.67);
    // Tip share = (6.67 / 10) * 2 = 1.334 -> Math.round is 1.33
    expect(result[1]!.tipShare).toBe(1.33);
    expect(result[1]!.total).toBe(6.67 + 0.67 + 1.33); // 8.67
  });

  it("handles a zero subtotal gracefully", () => {
    const claims: ClaimWithItem[] = [];
    const people = [{ id: "p1", name: "Alice" }];

    const result = calculateSplit(claims, people, 0, 0, 0, 0);

    expect(result[0]!.subtotal).toBe(0);
    expect(result[0]!.taxShare).toBe(0);
    expect(result[0]!.tipShare).toBe(0);
    expect(result[0]!.total).toBe(0);
  });
});
