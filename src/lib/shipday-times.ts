// orders.scheduled_time is when the customer wants the food at their door.
// Shipday models two different moments (all UTC): expectedPickupTime, when
// the driver collects from the store, and expectedDeliveryTime, when the
// customer receives it. Sending the customer's time as the pickup time (and
// no delivery time) made every scheduled delivery arrive late by the drive.

// Driver should leave the store this long before the customer's time.
export const PICKUP_LEAD_MINUTES = 30;
// Ask Shipday for a driver this long before that pickup.
export const DRIVER_DISPATCH_LEAD_MINUTES = 45;

export function shipdayScheduleFields(deliveryIso: string): {
  expectedDeliveryDate: string;
  expectedDeliveryTime: string;
  expectedPickupTime: string;
} {
  const delivery = new Date(deliveryIso);
  const pickup = new Date(delivery.getTime() - PICKUP_LEAD_MINUTES * 60_000);
  const deliveryUtc = delivery.toISOString(); // "2026-07-23T18:30:00.000Z"
  const pickupUtc = pickup.toISOString();
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
