// Normalizes the raw card inputs the iPOSpays Freedom-to-Design widget reads.
// The widget reads element.value directly at tokenization time and rejects
// anything that isn't bare digits (FTD_001) or an MM/YY expiry (FTD_004).
// Autofill and pasted values routinely include spaces, dashes, or MM/YYYY,
// so we sanitize both on input and again immediately before postData().

export function normalizeCardNumber(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 19);
}

export function normalizeExpiry(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 1 && Number(d) > 1) d = `0${d}`;
  if (d.length <= 2) return d;
  const mm = d.slice(0, 2);
  let yy = d.slice(2);
  if (yy.length >= 4) yy = yy.slice(2); // MM/YYYY -> MM/YY
  return `${mm}/${yy.slice(0, 2)}`;
}

export function normalizeCvv(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 4);
}

function luhn(num: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return num.length > 0 && sum % 10 === 0;
}

function setValue(el: HTMLInputElement, value: string) {
  if (el.value === value) return;
  el.value = value;
  // Let any widget listeners see the corrected value.
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Sanitizes the live DOM inputs and validates them.
 * Returns an error message to show the customer, or null when the fields look
 * good enough to hand off to the widget.
 */
export function sanitizeAndValidateCardFields(): string | null {
  const numEl = document.getElementById("ccnumber") as HTMLInputElement | null;
  const expEl = document.getElementById("ccexpiry") as HTMLInputElement | null;
  const cvvEl = document.getElementById("cccvv") as HTMLInputElement | null;
  if (!numEl || !expEl || !cvvEl) return "Card form is still loading. Please wait a moment.";

  const number = normalizeCardNumber(numEl.value);
  const expiry = normalizeExpiry(expEl.value);
  const cvv = normalizeCvv(cvvEl.value);

  setValue(numEl, number);
  setValue(expEl, expiry);
  setValue(cvvEl, cvv);

  if (number.length < 13 || number.length > 19 || !luhn(number)) {
    return "That card number doesn't look right. Please re-enter it (digits only).";
  }

  const m = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!m) return "Enter the card expiry as MM/YY (for example 07/28).";
  const mm = Number(m[1]);
  const yy = Number(m[2]);
  if (mm < 1 || mm > 12) return "Expiry month must be between 01 and 12.";
  const now = new Date();
  const expYear = 2000 + yy;
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  if (expYear < curYear || (expYear === curYear && mm < curMonth)) {
    return "That card looks expired. Please check the expiry date.";
  }
  if (expYear > curYear + 20) return "Enter the card expiry as MM/YY (for example 07/28).";

  if (cvv.length < 3) return "Enter the 3- or 4-digit security code (CVV).";

  return null;
}
