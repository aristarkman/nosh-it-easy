import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, MapPin, Star } from "lucide-react";
import { fmt } from "@/lib/order-context";
import type { CartLine } from "@/lib/order-context";

type LastOrder = {
  orderId: string;
  name: string;
  location: string;
  orderType: "pickup" | "delivery";
  whenType: "asap" | "schedule";
  scheduledTime: string;
  pay: string;
  total: number;
  items: CartLine[];
};

export const Route = createFileRoute("/confirmation/$orderId")({
  head: ({ params }) => ({
    meta: [
      { title: `Order ${params.orderId} confirmed — The Kosher Nosh` },
      { name: "description", content: "Your order is in the kitchen." },
    ],
  }),
  component: Confirmation,
});

function Confirmation() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<LastOrder | null>(null);
  const [feedback, setFeedback] = useState<"" | "happy" | "unhappy">("");
  const [feedbackText, setFeedbackText] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("kn-last-order");
    if (raw) setOrder(JSON.parse(raw));
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-10">
      <div className="rounded-2xl border border-border bg-card p-7 text-center shadow-[var(--shadow-card)]">
        <div className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-secondary/10 text-secondary">
          <CheckCircle2 className="size-8" />
        </div>
        <h1 className="mt-4 font-display text-4xl font-black">Order placed!</h1>
        <p className="mt-2 text-muted-foreground">
          Thanks{order?.name ? `, ${order.name.split(" ")[0]}` : ""}. We're firing up the slicer.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm">
          <span className="text-muted-foreground">Order #</span>
          <span className="font-mono font-bold text-foreground">{orderId}</span>
        </div>
        {order && (
          <div className="mt-6 grid gap-3 text-left text-sm sm:grid-cols-2">
            <Info label={order.orderType === "delivery" ? "Delivery" : "Pickup"} value={order.location} icon={<MapPin className="size-4" />} />
            <Info
              label="When"
              value={order.whenType === "asap" ? "ASAP · ~15 min" : new Date(order.scheduledTime).toLocaleString()}
            />
            <Info label="Payment" value={order.pay === "in-person" ? "Pay in person" : order.pay} />
            <Info label="Total" value={fmt(order.total)} />
          </div>
        )}
      </div>

      {feedback === "" && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
          <h2 className="font-display text-xl font-bold">How was your ordering experience?</h2>
          <p className="mt-1 text-sm text-muted-foreground">A second of feedback helps us a lot.</p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={() => setFeedback("happy")}
              className="rounded-full bg-secondary px-5 py-2.5 text-sm font-semibold text-secondary-foreground hover:opacity-90"
            >
              😋 Loved it
            </button>
            <button
              onClick={() => setFeedback("unhappy")}
              className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground hover:border-primary"
            >
              😕 Could be better
            </button>
          </div>
        </div>
      )}

      {feedback === "happy" && (
        <div className="mt-8 rounded-2xl border border-secondary/40 bg-secondary/5 p-6 text-center">
          <Star className="mx-auto size-7 text-mustard" />
          <h2 className="mt-2 font-display text-xl font-bold">Tell the world!</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A Google review really helps a small deli like ours.
          </p>
          <a
            href="https://search.google.com/local/writereview?placeid=ChIJ"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Leave a Google review
          </a>
        </div>
      )}

      {feedback === "unhappy" && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-xl font-bold">We're listening</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us what went wrong — this goes straight to the owner.
          </p>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            rows={4}
            maxLength={500}
            className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary"
            placeholder="What happened?"
          />
          <button
            onClick={() => setFeedback("happy")}
            className="mt-3 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Send feedback
          </button>
        </div>
      )}

      <div className="mt-8 text-center">
        <Link to="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Place another order
        </Link>
      </div>
    </div>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-1.5 font-medium capitalize">
        {icon}
        {value}
      </div>
    </div>
  );
}
