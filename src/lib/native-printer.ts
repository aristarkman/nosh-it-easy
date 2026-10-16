export type NativePrintOrder = {
  orderNumber: string;
  locationName: string;
  orderType: "pickup" | "delivery";
  promisedTime: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string | null;
  paymentMethod: string;
  total: string;
  notes?: string | null;
  items: Array<{
    quantity: number;
    name: string;
    modifiers: string[];
    notes?: string | null;
  }>;
};

declare global {
  interface Window {
    NoshPrinter?: {
      isAvailable(): boolean;
      printOrder(json: string): void;
    };
  }
}

export function hasNativePrinter(): boolean {
  try {
    return window.NoshPrinter?.isAvailable() === true;
  } catch {
    return false;
  }
}

export function printNativeOrder(order: NativePrintOrder): boolean {
  if (!hasNativePrinter()) return false;
  window.NoshPrinter!.printOrder(JSON.stringify(order));
  return true;
}
