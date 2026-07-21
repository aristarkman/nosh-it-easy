import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChefHat,
  Clock,
  LogOut,
  MapPin,
  Phone,
  Printer,
  ShoppingBag,
  Truck,
  User,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS, fmt, type CartLine } from "@/lib/order-context";
import { sendOrderStatusSms } from "@/lib/sms.functions";
import { dispatchShipday } from "@/lib/shipday.functions";
import { geocodeAddress } from "@/lib/geocoding.functions";
import { useNewOrderAlarm } from "@/lib/use-new-order-alarm";
import { useWakeLock } from "@/lib/use-wake-lock";
import { printOrderTicket } from "@/lib/print-ticket";
import { reportSystemAlert } from "@/lib/system-alerts";
import { toast } from "sonner";

// Glen Rock runs unattended: new orders auto-accept, auto-print, and
// delivery orders always go to Shipday — no staff tap, no self-delivery
// choice.
const AUTO_LOCATIONS = new Set(["glen-rock"]);

// Cresskill auto-prints the ticket the moment an order arrives, but stays
// otherwise manual: staff still tap Accept (which won't re-print — see
// autoPrintedRef below) and still choose self-delivery vs Shipday.
const AUTO_PRINT_LOCATIONS = new Set(["cresskill"]);

export const Route = createFileRoute("/tablet")({
  head: () => ({
    meta: [
      { title: "Order Tablet — The Kosher Nosh" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "KN Tablet" },
      { name: "theme-color", content: "#b91c1c" },
    ],
    links: [
      { rel: "manifest", href: "/tablet-manifest.json" },
      { rel: "apple-touch-icon", href: "/tablet-icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/tablet-icon-512.png" },
    ],
  }),
  component: TabletPage,
});

type Status = "new" | "accepted" | "ready" | "completed" | "cancelled";
type DeliveryStatus = "unassigned" | "assigned" | "out_for_delivery" | "delivered";

type Order = {
  id: string;
  order_number: string;
  location_id: string;
  order_type: "pickup" | "delivery";
  status: Status;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_address: string | null;
  delivery_status: DeliveryStatus | null;
  when_type: string;
  scheduled_time: string | null;
  payment_method: string;
  subtotal: number;
  tax: number;
  delivery_fee: number;
  total: number;
  items: CartLine[];
  notes: string | null;
  created_at: string;
  refunded_total: number;
  refund_status: "none" | "partial" | "full" | "voided";
  shipday_order_id: string | null;
  shipday_tracking_url: string | null;
};

const STATUS_FLOW: Record<Status, { next?: Status; label?: string; color: string }> = {
  new: { next: "accepted", label: "Accept", color: "bg-primary" },
  accepted: { next: "ready", label: "Mark ready", color: "bg-secondary" },
  ready: { next: "completed", label: "Complete", color: "bg-foreground" },
  completed: { color: "bg-muted-foreground" },
  cancelled: { color: "bg-muted-foreground" },
};

function parseTip(notes: string | null): number {
  const match = notes?.match(/(?:^|\|\s*)tip:([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : 0;
}

// Orders placed before this consent checkbox existed won't have an
// "sms:" segment at all — treated as no consent (opt-in, not opt-out).
function hasSmsConsent(notes: string | null): boolean {
  return /(?:^|\|\s*)sms:1(?:\s*\||$)/.test(notes ?? "");
}

function parseOrderNotes(notes: string | null): string[] {
  return (notes ?? "")
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p.startsWith("note:"))
    .map((p) => p.slice("note:".length).trim())
    .filter(Boolean);
}

function setDeliveryChoice(notes: string | null, choice: "shipday" | "self"): string {
  const cleaned = (notes ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith("delivery:"));
  return [...cleaned, `delivery:${choice}`].join(" | ");
}

// Shared by the manual "Ship with Shipday" dialog button and the Glen Rock
// auto-dispatch path — component state (dispatching/toasts/etc.) stays with
// each caller, this just does the actual work and reports success/failure.
async function dispatchOrderToShipday(
  order: Order,
): Promise<{ ok: true; patch: Record<string, unknown> } | { ok: false; message: string }> {
  if (!order.delivery_address) return { ok: false, message: "No delivery address on file." };

  const notes = setDeliveryChoice(order.notes, "shipday");
  const { error: choiceError } = await supabase.from("orders").update({ notes }).eq("id", order.id);
  if (choiceError) return { ok: false, message: "Could not save delivery choice" };

  const result = await dispatchShipday({
    data: {
      orderNumber: order.order_number,
      locationId: order.location_id,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: order.customer_email,
      deliveryAddress: order.delivery_address,
      total: Number(order.total),
      subtotal: Number(order.subtotal),
      tax: Number(order.tax),
      tip: parseTip(order.notes),
      deliveryFee: Number(order.delivery_fee),
      notes: order.notes,
      scheduledTime: order.scheduled_time,
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    },
  }).catch((error) => ({
    ok: false as const,
    message: error instanceof Error ? error.message : "Could not reach Shipday.",
  }));

  if (!result.ok) return { ok: false, message: result.message || "Could not dispatch to Shipday" };

  const patch = {
    notes,
    shipday_order_id: result.shipdayOrderId,
    shipday_tracking_url: result.trackingUrl,
    quoted_delivery_fee: Number(order.delivery_fee),
    dispatched_at: new Date().toISOString(),
    delivery_status: "unassigned" as const,
  };
  const { error: persistError } = await supabase.from("orders").update(patch).eq("id", order.id);
  if (persistError) {
    return { ok: false, message: "Shipday accepted the order, but tracking could not be saved" };
  }

  return { ok: true, patch };
}

function TabletPage() {
  const nav = useNavigate();
  useWakeLock();
  const [orders, setOrders] = useState<Order[]>([]);
  const [locFilter, setLocFilter] = useState<string>("all");
  const [tab, setTab] = useState<Status>("new");
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [deliveryChoiceOrder, setDeliveryChoiceOrder] = useState<Order | null>(null);
  const [dispatching, setDispatching] = useState(false);
  // Shared between advance() and the Cresskill auto-print effect below, so
  // accepting an order that already auto-printed doesn't print it again.
  const autoPrintedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        nav({ to: "/staff/login" });
        return;
      }
      const userId = sessionData.session.user.id;
      setUserEmail(sessionData.session.user.email ?? "");
      const [{ data: roles }, { data: locs }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("staff_locations").select("location_id").eq("user_id", userId),
      ]);
      if (!mounted) return;
      const admin = (roles ?? []).some((r) => r.role === "admin");
      setIsAdmin(admin);
      const assigned = (locs ?? []).map((l) => l.location_id);
      setAllowedLocations(admin ? LOCATIONS.map((l) => l.id) : assigned);
      setAuthChecked(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) nav({ to: "/staff/login" });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [nav]);

  useEffect(() => {
    if (!authChecked) return;
    let mounted = true;
    void (async () => {
      let query = supabase
        .from("orders")
        .select("*")
        .in("status", ["new", "accepted", "ready"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (!isAdmin && allowedLocations.length > 0) {
        query = query.in("location_id", allowedLocations);
      }
      const { data, error } = await query;
      if (!mounted) return;
      if (error) toast.error("Failed to load orders");
      else setOrders((data ?? []) as unknown as Order[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("orders-tablet")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        setOrders((previous) => {
          if (payload.eventType === "INSERT") {
            const next = payload.new as Order;
            if (!isAdmin && !allowedLocations.includes(next.location_id)) return previous;
            toast.success(`New order ${next.order_number}`);
            return [next, ...previous];
          }
          if (payload.eventType === "UPDATE") {
            const next = payload.new as Order;
            if (!isAdmin && !allowedLocations.includes(next.location_id)) return previous;
            return previous.map((order) => (order.id === next.id ? next : order));
          }
          if (payload.eventType === "DELETE") {
            const deleted = payload.old as { id: string };
            return previous.filter((order) => order.id !== deleted.id);
          }
          return previous;
        });
      })
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [authChecked, isAdmin, allowedLocations]);

  const filtered = useMemo(
    () =>
      orders.filter(
        (order) => (locFilter === "all" || order.location_id === locFilter) && order.status === tab,
      ),
    [orders, locFilter, tab],
  );

  const advance = async (order: Order) => {
    const next = STATUS_FLOW[order.status].next;
    if (!next) return;
    // .eq("status", order.status) + checking the returned row count guards
    // against double-processing the same order — e.g. Glen Rock's
    // auto-accept effect re-running, or two tablets open on the same order.
    // If nothing matched, someone/something already advanced it; skip the
    // side effects below rather than re-printing/re-texting/re-dispatching.
    const { data, error } = await supabase
      .from("orders")
      .update({ status: next })
      .eq("id", order.id)
      .eq("status", order.status)
      .select("id");
    if (error) {
      toast.error("Update failed");
      return;
    }
    if (!data || data.length === 0) return;

    const updatedOrder = { ...order, status: next };
    setOrders((previous) => previous.map((item) => (item.id === order.id ? updatedOrder : item)));

    if (
      (next === "accepted" || next === "ready") &&
      order.customer_phone &&
      hasSmsConsent(order.notes)
    ) {
      const locName = LOCATIONS.find((location) => location.id === order.location_id)?.name;
      void sendOrderStatusSms({
        data: {
          to: order.customer_phone,
          status: next,
          orderNumber: order.order_number,
          customerName: order.customer_name,
          orderType: order.order_type,
          locationName: locName,
        },
      }).catch((error) => console.error("SMS send failed:", error));
    }

    if (next === "accepted" && !autoPrintedRef.current.has(order.id)) {
      const locName = LOCATIONS.find((location) => location.id === order.location_id)?.name;
      try {
        printOrderTicket(updatedOrder, locName);
      } catch (error) {
        console.error("Ticket print failed:", error);
        toast.error("Could not open printer app. Reprint from the order card.");
      }
    }

    if (next === "accepted" && order.order_type === "delivery") {
      if (AUTO_LOCATIONS.has(order.location_id)) {
        void autoDispatchShipday(updatedOrder);
      } else {
        setDeliveryChoiceOrder(updatedOrder);
      }
    }
  };

  // Glen Rock delivery orders skip the manual choice dialog entirely and go
  // straight to Shipday. Failures here have no staff present to notice them
  // via a dialog, so they get a persistent toast plus the same
  // system_alerts + owner-SMS path used for other unattended failures.
  const autoDispatchShipday = async (order: Order) => {
    const result = await dispatchOrderToShipday(order);
    if (!result.ok) {
      toast.error(`${order.order_number}: Shipday dispatch failed — ${result.message}`, {
        duration: 15000,
      });
      void reportSystemAlert({
        kind: "shipday_dispatch_failed",
        message: result.message,
        locationId: order.location_id,
        locationName: LOCATIONS.find((location) => location.id === order.location_id)?.name,
        orderNumber: order.order_number,
        orderId: order.id,
      });
      return;
    }
    setOrders((previous) =>
      previous.map((item) => (item.id === order.id ? { ...item, ...result.patch } : item)),
    );
  };

  // Glen Rock runs unattended: any "new" order for it gets auto-accepted
  // (which triggers print + SMS + Shipday dispatch via `advance` above)
  // without waiting for a staff tap. autoAcceptedRef prevents re-triggering
  // on every re-render/orders update — an order is only ever handed to
  // `advance` once per page session; `advance`'s own conditional update
  // (.eq("status", order.status)) is the real guard against double-firing
  // side effects if e.g. two tablets are open.
  const autoAcceptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!authChecked) return;
    const pending = orders.filter(
      (order) =>
        AUTO_LOCATIONS.has(order.location_id) &&
        order.status === "new" &&
        !autoAcceptedRef.current.has(order.id),
    );
    for (const order of pending) {
      autoAcceptedRef.current.add(order.id);
      void advance(order);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, authChecked]);

  // Cresskill: print the ticket the instant a "new" order arrives, without
  // touching its status — staff still tap Accept manually (advance() checks
  // autoPrintedRef so that tap won't print a second copy) and still get the
  // self-delivery/Shipday choice dialog as usual.
  useEffect(() => {
    if (!authChecked) return;
    const pending = orders.filter(
      (order) =>
        AUTO_PRINT_LOCATIONS.has(order.location_id) &&
        order.status === "new" &&
        !autoPrintedRef.current.has(order.id),
    );
    for (const order of pending) {
      autoPrintedRef.current.add(order.id);
      const locName = LOCATIONS.find((location) => location.id === order.location_id)?.name;
      try {
        printOrderTicket(order, locName);
      } catch (error) {
        console.error("Auto-print failed:", error);
        toast.error(
          `Could not auto-print ${order.order_number}. Print manually from the order card.`,
        );
      }
    }
  }, [orders, authChecked]);

  const cancel = async (order: Order) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order.id);
    if (error) toast.error("Cancel failed");
  };

  const chooseSelfDelivery = async () => {
    const order = deliveryChoiceOrder;
    if (!order) return;
    setDispatching(true);
    const notes = setDeliveryChoice(order.notes, "self");
    const { error } = await supabase
      .from("orders")
      .update({ notes, delivery_status: "unassigned" })
      .eq("id", order.id);
    setDispatching(false);
    if (error) {
      toast.error("Could not save delivery choice");
      return;
    }
    setOrders((previous) =>
      previous.map((item) =>
        item.id === order.id ? { ...item, notes, delivery_status: "unassigned" } : item,
      ),
    );
    setDeliveryChoiceOrder(null);
    toast.success("Set for in-house delivery. Assign a driver on the Dispatch screen.");
  };

  const chooseShipday = async () => {
    const order = deliveryChoiceOrder;
    if (!order || !order.delivery_address) return;
    setDispatching(true);
    const result = await dispatchOrderToShipday(order);
    setDispatching(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setOrders((previous) =>
      previous.map((item) => (item.id === order.id ? { ...item, ...result.patch } : item)),
    );
    setDeliveryChoiceOrder(null);
    toast.success("Order dispatched to Shipday");
  };

  const counts = useMemo(() => {
    const result: Record<Status, number> = {
      new: 0,
      accepted: 0,
      ready: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const order of orders) {
      if (locFilter === "all" || order.location_id === locFilter) result[order.status]++;
    }
    return result;
  }, [orders, locFilter]);

  const { enabled: alarmEnabled, enable: enableAlarm } = useNewOrderAlarm(counts.new);

  // Browsers require a genuine user gesture before audio can play — that's
  // a hard restriction, not something to work around. But it doesn't have
  // to be a *specific* button: the first tap/click anywhere on the tablet
  // screen silently unlocks it, so in practice staff never notice a
  // separate "enable" step. The manual button stays as a visible
  // status/fallback.
  useEffect(() => {
    if (alarmEnabled) return;
    const unlock = () => enableAlarm();
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, [alarmEnabled, enableAlarm]);

  if (!authChecked) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>
    );
  }

  if (allowedLocations.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/40 p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="font-display text-2xl">No locations assigned</h1>
          <p className="text-sm text-muted-foreground">
            Your account ({userEmail}) is not assigned to any store. Contact your manager.
          </p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              nav({ to: "/staff/login" });
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-bold uppercase tracking-wider"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </div>
    );
  }

  const visibleLocations = LOCATIONS.filter((location) => allowedLocations.includes(location.id));
  const showAllFilter = visibleLocations.length > 1;

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">
              Kitchen Tablet {isAdmin && "· Admin"}
            </div>
            <h1 className="font-display text-2xl tracking-wide">Live Orders</h1>
            <div className="text-xs text-muted-foreground">{userEmail}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showAllFilter && (
              <Filter
                active={locFilter === "all"}
                onClick={() => setLocFilter("all")}
                label="All"
              />
            )}
            {visibleLocations.map((location) => (
              <Filter
                key={location.id}
                active={locFilter === location.id || (!showAllFilter && locFilter === "all")}
                onClick={() => setLocFilter(location.id)}
                label={location.name}
              />
            ))}
            <button
              onClick={enableAlarm}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                alarmEnabled
                  ? "border-primary bg-primary/10 text-primary"
                  : "animate-pulse border-destructive bg-destructive/10 text-destructive"
              }`}
              title={alarmEnabled ? "Sound on" : "Tap to enable order alerts"}
            >
              {alarmEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              {alarmEnabled ? "Alerts on" : "Enable alerts"}
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                nav({ to: "/staff/login" });
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1400px] gap-1 px-4">
          {(["new", "accepted", "ready"] as Status[]).map((status) => (
            <button
              key={status}
              onClick={() => setTab(status)}
              className={`relative -mb-px border-b-2 px-4 py-3 text-sm font-bold uppercase tracking-wider transition ${
                tab === status
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {labelFor(status)}
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-bold text-background">
                {counts[status]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <SystemAlertsBanner
        isAdmin={isAdmin}
        allowedLocations={allowedLocations}
        locFilter={locFilter}
      />

      <div className="mx-auto max-w-[1400px] p-4">
        {loading ? (
          <div className="py-20 text-center text-muted-foreground">Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            No {labelFor(tab).toLowerCase()} orders.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((order) => (
              <OrderCard
                key={order.id}
                o={order}
                onAdvance={() => void advance(order)}
                onCancel={() => void cancel(order)}
                onPrint={() => {
                  const locName = LOCATIONS.find(
                    (location) => location.id === order.location_id,
                  )?.name;
                  try {
                    printOrderTicket(order, locName);
                  } catch (error) {
                    console.error("Ticket print failed:", error);
                    toast.error("Could not open printer app.");
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {deliveryChoiceOrder && (
        <DeliveryChoiceDialog
          order={deliveryChoiceOrder}
          busy={dispatching}
          onShipday={() => void chooseShipday()}
          onSelf={() => void chooseSelfDelivery()}
        />
      )}
    </div>
  );
}

function DeliveryChoiceDialog({
  order,
  busy,
  onShipday,
  onSelf,
}: {
  order: Order;
  busy: boolean;
  onShipday: () => void;
  onSelf: () => void;
}) {
  const [formattedDeliveryAddress, setFormattedDeliveryAddress] = useState(
    order.delivery_address ?? "",
  );

  useEffect(() => {
    if (!order.delivery_address) return;
    let cancelled = false;
    setFormattedDeliveryAddress(order.delivery_address);
    void geocodeAddress({ data: { address: order.delivery_address } })
      .then((result) => {
        if (!cancelled && result.ok && result.formatted) {
          setFormattedDeliveryAddress(result.formatted);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [order.delivery_address]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-background shadow-2xl">
        <div className="border-b border-border p-5">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Delivery accepted · {order.order_number}
          </div>
          <h2 className="mt-1 font-display text-3xl">How will this order be delivered?</h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <div className="font-bold">{order.customer_name}</div>
            <a
              href={`tel:${order.customer_phone}`}
              className="mt-1 flex items-center gap-2 text-sm"
            >
              <Phone className="size-4 text-muted-foreground" /> {order.customer_phone}
            </a>
            <div className="mt-3 flex items-start gap-2 text-base font-semibold">
              <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
              <span>{formattedDeliveryAddress || order.delivery_address}</span>
            </div>
            {order.when_type === "schedule" && order.scheduled_time && (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-4" /> Scheduled for{" "}
                {new Date(order.scheduled_time).toLocaleString()}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={onShipday}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-sm font-black uppercase tracking-wider text-primary-foreground disabled:opacity-50"
          >
            <Truck className="size-5" /> {busy ? "Dispatching…" : "Dispatch to Shipday"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSelf}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-foreground px-4 py-4 text-sm font-black uppercase tracking-wider disabled:opacity-50"
          >
            <ShoppingBag className="size-5" /> Deliver ourselves
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Deliver ourselves keeps the order in the internal Dispatch screen for driver assignment.
          </p>
        </div>
      </div>
    </div>
  );
}

function labelFor(status: Status) {
  return status === "new"
    ? "New"
    : status === "accepted"
      ? "In kitchen"
      : status === "ready"
        ? "Ready"
        : status;
}

function Filter({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
        active
          ? "bg-foreground text-background"
          : "border border-border bg-background text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function OrderCard({
  o,
  onAdvance,
  onCancel,
  onPrint,
}: {
  o: Order;
  onAdvance: () => void;
  onCancel: () => void;
  onPrint: () => void;
}) {
  const flow = STATUS_FLOW[o.status];
  const loc = LOCATIONS.find((location) => location.id === o.location_id);
  const ago = timeAgo(o.created_at);
  const isNew = o.status === "new";
  const refunded = (o.refunded_total ?? 0) > 0;

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-card shadow-sm ${
        isNew ? "border-primary ring-2 ring-primary/20" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div>
          <div className="font-display text-xl tracking-wide">{o.order_number}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> {ago}
            <span>·</span>
            <span>{loc?.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-background">
          {o.order_type === "delivery" ? (
            <Truck className="size-3" />
          ) : (
            <ShoppingBag className="size-3" />
          )}
          {o.order_type}
        </div>
      </div>

      <div className="space-y-1 border-b border-border p-4 text-sm">
        <div className="flex items-center gap-2">
          <User className="size-3.5 text-muted-foreground" /> {o.customer_name}
        </div>
        <div className="flex items-center gap-2">
          <Phone className="size-3.5 text-muted-foreground" />
          <a href={`tel:${o.customer_phone}`} className="text-foreground">
            {o.customer_phone}
          </a>
        </div>
        {o.delivery_address && (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-3.5 text-muted-foreground" /> {o.delivery_address}
          </div>
        )}
        <div className="flex items-center gap-2 text-muted-foreground">
          <ChefHat className="size-3.5" />
          {o.when_type === "asap"
            ? "ASAP"
            : o.scheduled_time
              ? new Date(o.scheduled_time).toLocaleString()
              : "Scheduled"}
        </div>
        {o.shipday_order_id && (
          <div className="text-xs font-bold uppercase tracking-wider text-secondary">
            Shipday dispatched
          </div>
        )}
        {parseOrderNotes(o.notes).map((n, i) => (
          <div
            key={i}
            className="mt-1 rounded-lg bg-primary/10 px-2 py-1.5 text-xs font-semibold text-primary"
          >
            📝 {n}
          </div>
        ))}
      </div>

      <ul className="flex-1 space-y-2 p-4 text-sm">
        {o.items.map((line, index) => (
          <li key={line.lineId ?? `${line.itemId}-${index}`}>
            <div className="flex justify-between gap-2 font-semibold">
              <span>
                {line.quantity}× {line.name}
              </span>
              <span>{fmt(line.unitPrice * line.quantity)}</span>
            </div>
            {line.modifiers?.length > 0 && (
              <ul className="ml-3 text-xs text-muted-foreground">
                {line.modifiers.map((modifier) =>
                  modifier.options.map((option) => (
                    <li key={`${modifier.groupId}-${option.id}`}>+ {option.name}</li>
                  )),
                )}
              </ul>
            )}
            {line.notes && <div className="ml-3 text-xs italic text-primary">“{line.notes}”</div>}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t border-border p-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Total</span>{" "}
          <span className="font-bold">{fmt(o.total)}</span>{" "}
          <span className="text-xs text-muted-foreground">· {o.payment_method}</span>
          {refunded && (
            <div className="mt-0.5 text-xs font-bold uppercase tracking-wider text-destructive">
              {o.refund_status === "voided"
                ? "Voided"
                : o.refund_status === "full"
                  ? `Refunded ${fmt(o.refunded_total)}`
                  : `Partial refund ${fmt(o.refunded_total)}`}
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={onPrint}
            className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            aria-label="Print ticket"
          >
            <Printer className="size-4" />
          </button>
          {o.status !== "ready" && o.status !== "completed" && (
            <button
              onClick={onCancel}
              className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
              aria-label="Cancel order"
            >
              <X className="size-4" />
            </button>
          )}
          {flow.next && (
            <button
              onClick={onAdvance}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:opacity-90 ${flow.color}`}
            >
              <Check className="size-3.5" /> {flow.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

type SystemAlert = {
  id: string;
  kind: string;
  severity: string;
  location_id: string | null;
  order_number: string | null;
  message: string;
  created_at: string;
  acknowledged_at: string | null;
};

function SystemAlertsBanner({
  isAdmin,
  allowedLocations,
  locFilter,
}: {
  isAdmin: boolean;
  allowedLocations: string[];
  locFilter: string;
}) {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      let query = supabase
        .from("system_alerts")
        .select("id,kind,severity,location_id,order_number,message,created_at,acknowledged_at")
        .is("acknowledged_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!isAdmin && allowedLocations.length > 0) {
        query = query.or(`location_id.is.null,location_id.in.(${allowedLocations.join(",")})`);
      }
      const { data } = await query;
      if (mounted) setAlerts((data ?? []) as SystemAlert[]);
    })();

    const channel = supabase
      .channel("system-alerts-tablet")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_alerts" },
        (payload) => {
          setAlerts((previous) => {
            if (payload.eventType === "INSERT") {
              const next = payload.new as SystemAlert;
              if (!isAdmin && next.location_id && !allowedLocations.includes(next.location_id))
                return previous;
              if (next.acknowledged_at) return previous;
              toast.error(`⚠️ ${next.kind.replace(/_/g, " ")}`);
              return [next, ...previous];
            }
            if (payload.eventType === "UPDATE") {
              const next = payload.new as SystemAlert;
              if (next.acknowledged_at) return previous.filter((alert) => alert.id !== next.id);
              return previous.map((alert) => (alert.id === next.id ? next : alert));
            }
            return previous;
          });
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, allowedLocations]);

  const visible = alerts.filter(
    (alert) => locFilter === "all" || !alert.location_id || alert.location_id === locFilter,
  );
  if (visible.length === 0) return null;

  const acknowledge = async (id: string) => {
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("system_alerts")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: user.user?.id ?? null })
      .eq("id", id);
    if (error) toast.error("Could not dismiss alert");
  };

  return (
    <div className="border-b border-destructive/40 bg-destructive/10">
      <div className="mx-auto max-w-[1400px] space-y-2 px-4 py-3">
        {visible.map((alert) => (
          <div
            key={alert.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-background p-3"
          >
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <div className="font-bold uppercase tracking-wider text-destructive">
                  {alert.kind.replace(/_/g, " ")}
                  {alert.order_number && (
                    <span className="ml-2 text-foreground">#{alert.order_number}</span>
                  )}
                  {alert.location_id && (
                    <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
                      @{" "}
                      {LOCATIONS.find((location) => location.id === alert.location_id)?.name ??
                        alert.location_id}
                    </span>
                  )}
                </div>
                <div className="text-foreground">{alert.message}</div>
                <div className="text-xs text-muted-foreground">{timeAgo(alert.created_at)}</div>
              </div>
            </div>
            <button
              onClick={() => void acknowledge(alert.id)}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:border-foreground"
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
