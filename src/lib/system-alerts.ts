import { supabase } from "@/integrations/supabase/client";
import { sendOwnerErrorAlert } from "@/server/sms.functions";

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
    await supabase.from("system_alerts").insert({
      kind: input.kind,
      message: input.message,
      location_id: input.locationId ?? null,
      order_number: input.orderNumber ?? null,
      order_id: input.orderId ?? null,
      details: (input.details ?? null) as never,
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
