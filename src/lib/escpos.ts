// Minimal ESC/POS command builder for 80mm thermal receipt/kitchen printers
// (MUNBYN P047, Epson TM-m30 / M362B, and most other ESC/POS-compatible
// printers). Produces raw bytes meant to be sent via RawBT's `rawbt:base64,`
// URL scheme from an Android tablet — see src/lib/print-ticket.ts.

const ESC = 0x1b;
const GS = 0x1d;

export class EscPosBuilder {
  private chunks: number[] = [];

  private push(...bytes: number[]) {
    this.chunks.push(...bytes);
    return this;
  }

  init() {
    return this.push(ESC, 0x40); // ESC @ — initialize printer
  }

  bold(on: boolean) {
    return this.push(ESC, 0x45, on ? 1 : 0); // ESC E n
  }

  doubleSize(on: boolean) {
    return this.push(GS, 0x21, on ? 0x11 : 0x00); // GS ! n — double width+height
  }

  /** Double height only, normal width — used as the new bigger base body font. */
  tallText(on: boolean) {
    return this.push(GS, 0x21, on ? 0x01 : 0x00); // GS ! n — height x2, width x1
  }

  /** White-on-black stamp, e.g. for a PAID / NOT PAID banner. */
  reverse(on: boolean) {
    return this.push(GS, 0x42, on ? 1 : 0); // GS B n
  }

  align(mode: "left" | "center" | "right") {
    const n = mode === "left" ? 0 : mode === "center" ? 1 : 2;
    return this.push(ESC, 0x61, n); // ESC a n
  }

  text(s: string) {
    // Printers expect single-byte text (CP437-ish). Strip characters outside
    // basic Latin/punctuation to avoid garbled output on non-UTF-8 firmware.
    const cleaned = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    for (let i = 0; i < cleaned.length; i++) {
      const code = cleaned.charCodeAt(i);
      this.chunks.push(code < 256 ? code : 0x3f); // fallback '?'
    }
    return this;
  }

  line(s = "") {
    this.text(s);
    return this.push(0x0a); // LF
  }

  feed(lines = 1) {
    for (let i = 0; i < lines; i++) this.push(0x0a);
    return this;
  }

  divider(char = "-", width = 42) {
    return this.line(char.repeat(width));
  }

  /** Two-column row (e.g. "Item name" left, "$12.00" right), wraps left text if needed. */
  row(left: string, right: string, width = 42) {
    const rightStr = right;
    const maxLeft = Math.max(1, width - rightStr.length - 1);
    if (left.length <= maxLeft) {
      const pad = width - left.length - rightStr.length;
      return this.line(left + " ".repeat(Math.max(1, pad)) + rightStr);
    }
    // Wrap long left text onto its own line(s), right value on the last line
    const words = left.split(" ");
    let lineBuf = "";
    const wrapped: string[] = [];
    for (const w of words) {
      if ((lineBuf + " " + w).trim().length > width) {
        wrapped.push(lineBuf.trim());
        lineBuf = w;
      } else {
        lineBuf = (lineBuf + " " + w).trim();
      }
    }
    if (lineBuf) wrapped.push(lineBuf);
    wrapped.forEach((wLine, idx) => {
      if (idx < wrapped.length - 1) {
        this.line(wLine);
      } else {
        const pad = width - wLine.length - rightStr.length;
        this.line(wLine + " ".repeat(Math.max(1, pad)) + rightStr);
      }
    });
    return this;
  }

  cut() {
    return this.push(GS, 0x56, 0x00); // GS V 0 — full cut
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.chunks);
  }

  toBase64(): string {
    const bytes = this.toBytes();
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
}
