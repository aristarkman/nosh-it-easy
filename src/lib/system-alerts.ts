import { sendOwnerErrorAlert } from "@/lib/sms.functions";
import { recordSystemAlert } from "@/lib/system-alerts.functions";

export type AlertKind =
  | "payment_failed"
  | "order_save_failed"
  | "shipday_dispatch_failed"
  | "sms_failed";

export type ReportAlertInput = {
  kind: AlertKind;
  message: string;
  locationId?: string | null;
  locationName?: string | null;
  orderNumber?: string | null;
  orderId?: string | null;
  details?: Record<string, unknown>;
};

/**
 * Persist a system alert (visible on the tablet banner) and ping the owner via SMS.
 * Both calls are best-effort and never throw.
 */
export async function reportSystemAlert(input: ReportAlertInput) {
  try {
    await recordSystemAlert({
      data: {
        kind: input.kind,
        message: input.message,
        locationId: input.locationId ?? null,
        orderNumber: input.orderNumber ?? null,
        orderId: input.orderId ?? null,
        details: (input.details ?? null) as Record<string, unknown> | null,
      },
    });
  } catch (e) {
    console.error("system_alerts insert failed:", e);
  }
  try {
    await sendOwnerErrorAlert({
      data: {
        kind: input.kind,
        message: input.message,
        orderNumber: input.orderNumber ?? undefined,
        locationName: input.locationName ?? undefined,
      },
    });
  } catch (e) {
    console.error("owner SMS failed:", e);
  }
}
