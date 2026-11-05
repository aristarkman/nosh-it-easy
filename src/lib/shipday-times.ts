// orders.scheduled_time is when the customer wants the food at their door.
// Shipday models two different moments (all UTC): expectedPickupTime, when
// the driver collects from the store, and expectedDeliveryTime, when the
// customer receives it. Sending the customer's time as the pickup time (and
// no delivery time) made every scheduled delivery arrive late by the drive.
//
// The driver pickup time is, in order of preference:
//   1. a "pickup:<ISO>" segment in orders.notes, written at checkout from a
//      traffic-aware Google drive-time estimate (see drive-time.server.ts)
//   2. the customer's time minus PICKUP_LEAD_MINUTES, when no estimate exists

// Default lead when there's no Google estimate for the order.
export const PICKUP_LEAD_MINUTES = 30;
// Parking, walking up, handing it over — added on top of the drive time.
export const HANDOFF_BUFFER_MINUTES = 5;
// A stored/estimated lead outside this range is ignored as implausible.
export const MIN_PICKUP_LEAD_MINUTES = 10;
export const MAX_PICKUP_LEAD_MINUTES = 90;
// Ask Shipday for a driver this long before the pickup.
export const DRIVER_DISPATCH_LEAD_MINUTES = 45;

const MS = 60_000;

// Pickup = customer's time minus (drive + handoff), rounded up to 5 minutes
// so the driver errs early, then clamped to a sane range.
export function pickupFromDriveSeconds(deliveryIso: string, driveSeconds: number): string {
  const rawMinutes = driveSeconds / 60 + HANDOFF_BUFFER_MINUTES;
  const lead = Math.min(
    MAX_PICKUP_LEAD_MINUTES,
    Math.max(MIN_PICKUP_LEAD_MINUTES, Math.ceil(rawMinutes / 5) * 5),
  );
  return new Date(new Date(deliveryIso).getTime() - lead * MS).toISOString();
}

export function pickupNoteSegment(pickupIso: string): string {
  return `pickup:${pickupIso}`;
}

function parsePickupNote(notes: string | null | undefined): string | null {
  const match = notes?.match(/(?:^|\|\s*)pickup:(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
  return match ? match[1] : null;
}

// When the food must be ready: the driver pickup time for a customer's
// scheduled delivery time. Shown on the tablet and kitchen ticket, and sent
// to Shipday.
export function driverPickupIso(deliveryIso: string, notes?: string | null): string {
  const deliveryMs = new Date(deliveryIso).getTime();
  const stored = parsePickupNote(notes);
  if (stored) {
    const leadMinutes = (deliveryMs - new Date(stored).getTime()) / MS;
    if (leadMinutes >= MIN_PICKUP_LEAD_MINUTES && leadMinutes <= MAX_PICKUP_LEAD_MINUTES) {
      return new Date(stored).toISOString();
    }
  }
  return new Date(deliveryMs - PICKUP_LEAD_MINUTES * MS).toISOString();
}

export function shipdayScheduleFields(
  deliveryIso: string,
  notes?: string | null,
): {
  expectedDeliveryDate: string;
  expectedDeliveryTime: string;
  expectedPickupTime: string;
} {
  const deliveryUtc = new Date(deliveryIso).toISOString(); // "2026-07-23T18:30:00.000Z"
  const pickupUtc = driverPickupIso(deliveryIso, notes);
  const date = deliveryUtc.slice(0, 10);
  return {
    expectedDeliveryDate: date,
    expectedDeliveryTime: deliveryUtc.slice(11, 19),
    // Shipday takes one date plus two bare times, so a pickup that falls on
    // the previous UTC day would be read as ~24h after delivery. Clamp it
    // to the start of the delivery's UTC day instead.
    expectedPickupTime: pickupUtc.slice(0, 10) === date ? pickupUtc.slice(11, 19) : "00:00:00",
  };
}
