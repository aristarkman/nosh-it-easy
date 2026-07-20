import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock, CalendarClock } from "lucide-react";
import { LOCATIONS, useOrder, type WhenType } from "@/lib/order-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/when")({
  head: () => ({
    meta: [
      { title: "When do you want your order? — The Kosher Nosh" },
      { name: "description", content: "Pick ASAP or schedule your Kosher Nosh order for later." },
    ],
  }),
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("kn-order") ?? localStorage.getItem("kn-order-v1");
        const parsed = raw ? JSON.parse(raw) : null;
        const s = parsed?.state ?? parsed;
        if (!s?.location) throw redirect({ to: "/" });
        if (!s?.orderType) throw redirect({ to: "/order-type" });
      } catch (e) {
        if ((e as { isRedirect?: boolean })?.isRedirect) throw e;
      }
    }
  },
  component: WhenPage,
});

type HoursRow = { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean };
type Closure = { start_date: string; end_date: string };

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function WhenPage() {
  const navigate = useNavigate();
  const { location, orderType, whenType, scheduledTime, setWhen } = useOrder();
  const loc = LOCATIONS.find((l) => l.id === location);

  const [hours, setHours] = useState<HoursRow[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [choice, setChoice] = useState<WhenType>(whenType ?? "asap");
  const [time, setTime] = useState<string>(scheduledTime ?? "");

  useEffect(() => {
    if (!location) return;
    (async () => {
      const today = ymd(new Date());
      const [{ data: h }, { data: c }] = await Promise.all([
        supabase
          .from("store_hours")
          .select("day_of_week,open_time,close_time,is_closed,hours_kind,location_id")
          .eq("location_id", location)
          .eq("hours_kind", "online"),
        supabase
          .from("store_closures")
          .select("location_id,start_date,end_date")
          .gte("end_date", today),
      ]);
      setHours((h ?? []) as HoursRow[]);
      setClosures(
        ((c ?? []) as { location_id: string | null; start_date: string; end_date: string }[])
          .filter((x) => x.location_id === null || x.location_id === location)
          .map((x) => ({ start_date: x.start_date, end_date: x.end_date }))
      );
      setLoaded(true);
    })();
  }, [location]);

  const checkTime = (d: Date): { ok: boolean; reason?: string } => {
    const k = ymd(d);
    const closure = closures.find((c) => c.start_date <= k && c.end_date >= k);
    if (closure) return { ok: false, reason: "We're closed on that date." };
    const row = hours.find((r) => r.day_of_week === d.getDay());
    if (!row || row.is_closed || !row.open_time || !row.close_time) {
      return { ok: false, reason: "We're not accepting online orders that day." };
    }
    const [oh, om] = row.open_time.split(":").map(Number);
    const [ch, cm] = row.close_time.split(":").map(Number);
    const mins = d.getHours() * 60 + d.getMinutes();
    if (mins < oh * 60 + om || mins > ch * 60 + cm) {
      return { ok: false, reason: `Online ordering that day runs ${row.open_time.slice(0, 5)}–${row.close_time.slice(0, 5)}.` };
    }
    return { ok: true };
  };

  const openNow = useMemo(() => {
    if (!loaded) return true; // optimistic until loaded
    if (hours.length === 0) return true; // no online schedule configured → always allow ASAP
    return checkTime(new Date()).ok;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, hours, closures]);

  // Force choice to "schedule" when store is closed
  useEffect(() => {
    if (loaded && !openNow && choice === "asap") setChoice("schedule");
  }, [loaded, openNow, choice]);

  // Sensible default for the datetime input: the next slot that's actually
  // available, i.e. at least 1h of prep lead time from now, and inside
  // online-ordering hours on a day that isn't closed. Walks forward day by
  // day (up to 2 weeks) so it never lands on a closure or an already-closed
  // day. Falls back to the plain +1h/15-min-rounded time if hours haven't
  // loaded yet or none are configured.
  const defaultMin = useMemo(() => {
    const toLocalInput = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

    const bufferStart = new Date(Date.now() + 60 * 60 * 1000);
    bufferStart.setSeconds(0, 0);
    bufferStart.setMinutes(Math.ceil(bufferStart.getMinutes() / 15) * 15);

    if (!loaded || hours.length === 0) return toLocalInput(bufferStart);

    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const day = new Date(bufferStart);
      day.setDate(day.getDate() + dayOffset);
      const key = ymd(day);

      const closed = closures.some((c) => c.start_date <= key && c.end_date >= key);
      if (closed) continue;

      const row = hours.find((r) => r.day_of_week === day.getDay());
      if (!row || row.is_closed || !row.open_time || !row.close_time) continue;

      const [oh, om] = row.open_time.split(":").map(Number);
      const [ch, cm] = row.close_time.split(":").map(Number);
      const openMins = oh * 60 + om;
      const closeMins = ch * 60 + cm;

      const candidateMins =
        dayOffset === 0 ? Math.max(bufferStart.getHours() * 60 + bufferStart.getMinutes(), openMins) : openMins;
      if (candidateMins > closeMins) continue;

      const result = new Date(day);
      result.setHours(Math.floor(candidateMins / 60), candidateMins % 60, 0, 0);
      return toLocalInput(result);
    }

    return toLocalInput(bufferStart);
  }, [loaded, hours, closures]);

  // When schedule is selected but no time chosen yet, seed with the default.
  // Re-runs when defaultMin changes (e.g. once store hours finish loading)
  // so the seeded value reflects real next-available-time, not the
  // optimistic +1h guess — but only while the customer hasn't typed their
  // own time yet.
  useEffect(() => {
    if (choice === "schedule" && !time) setTime(defaultMin);
  }, [choice, defaultMin, time]);

  const scheduleCheck = useMemo(() => {
    if (choice !== "schedule") return { ok: true } as { ok: boolean; reason?: string };
    if (!time) return { ok: false, reason: "Pick a date and time." };
    const d = new Date(time);
    if (isNaN(d.getTime())) return { ok: false, reason: "Invalid time." };
    if (d.getTime() < Date.now()) return { ok: false, reason: "Pick a future time." };
    return checkTime(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice, time, hours, closures]);

  const canContinue = choice === "asap" ? openNow : scheduleCheck.ok;

  const onContinue = () => {
    if (!canContinue) return;
    if (choice === "asap") setWhen("asap");
    else setWhen("schedule", time);
    navigate({ to: "/menu" });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:pt-14">
      <Link
        to="/order-type"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>

      <div className="mt-4 flex items-baseline justify-between">
        <h1 className="font-display text-4xl font-black text-foreground sm:text-5xl">
          When do you want your order?
        </h1>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Step 3 of 3
        </span>
      </div>
      <p className="mt-2 text-muted-foreground">
        {orderType === "delivery" ? "Delivering from" : "Pickup at"}{" "}
        <span className="font-semibold text-foreground">{loc?.name}</span>
      </p>

      {loaded && !openNow && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-sm">
          We're closed right now — pick a future time to schedule your order.
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {openNow && (
          <Card
            active={choice === "asap"}
            onClick={() => setChoice("asap")}
            icon={<Clock className="size-7" />}
            title="ASAP"
            subtitle={orderType === "delivery" ? "Out for delivery soon" : "Ready in ~15 min"}
            line="We'll start as soon as you check out."
          />
        )}
        <Card
          active={choice === "schedule"}
          onClick={() => setChoice("schedule")}
          icon={<CalendarClock className="size-7" />}
          title="Schedule for later"
          subtitle="Pick a date & time"
          line="Order ahead — great for catering and busy days."
        />
      </div>

      {choice === "schedule" && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <label className="block text-sm font-medium">Date & time</label>
          <input
            type="datetime-local"
            value={time || defaultMin}
            onChange={(e) => setTime(e.target.value)}
            className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          {time && !scheduleCheck.ok && (
            <p className="mt-2 text-xs text-destructive">{scheduleCheck.reason}</p>
          )}
        </div>
      )}

      <button
        onClick={onContinue}
        disabled={!canContinue}
        className="mt-8 w-full rounded-2xl bg-primary px-6 py-4 text-base font-bold text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue to menu
      </button>
    </div>
  );
}

function Card({
  active,
  onClick,
  icon,
  title,
  subtitle,
  line,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  line: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group rounded-2xl border bg-card p-6 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-pop)] ${
        active ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      <div className="inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h2 className="mt-4 font-display text-3xl font-black">{title}</h2>
      <div className="text-sm font-medium text-secondary">{subtitle}</div>
      <p className="mt-2 text-sm text-muted-foreground">{line}</p>
    </button>
  );
}
