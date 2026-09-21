/**
 * Currency utility for formatting and calculating Nigerian Naira (₦) amounts.
 */

export function formatNaira(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '₦0';
  }
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNairaDetailed(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '₦0.00';
  }
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function calculateLineTotal(unitPrice: number, quantity: number): number {
  return Math.round((unitPrice * quantity) * 100) / 100;
}

export function calculateSubtotal(items: { lineTotal: number }[]): number {
  return items.reduce((sum, item) => sum + item.lineTotal, 0);
}

export function calculateGrandTotal(subtotal: number, discount: number = 0): number {
  return Math.max(0, subtotal - discount);
}
