import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { LocationId } from "./order-context";

export type HoursRow = {
  location_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  hours_kind: string;
};

function fmtTime(t: string): string {
  // "07:00:00" or "07:00" -> "7am" / "7:30am"
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  const am = h < 12;
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  const mm = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
  return `${h}${mm}${am ? "am" : "pm"}`;
}

function todayRow(rows: HoursRow[], locationId: string): HoursRow | undefined {
  const dow = new Date().getDay();
  return rows.find(
    (x) =>
      x.location_id === locationId &&
      x.day_of_week === dow &&
      (x.hours_kind ?? "storefront") === "storefront"
  );
}

function todayLabel(rows: HoursRow[], locationId: string): string {
  const r = todayRow(rows, locationId);
  if (!r || r.is_closed || !r.open_time || !r.close_time) {
    return "Closed today";
  }
  return `Open today · ${fmtTime(r.open_time)} – ${fmtTime(r.close_time)}`;
}

function isOpenNow(rows: HoursRow[], locationId: string): boolean {
  const r = todayRow(rows, locationId);
  if (!r || r.is_closed || !r.open_time || !r.close_time) return false;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = r.open_time.split(":").map(Number);
  const [ch, cm] = r.close_time.split(":").map(Number);
  return mins >= oh * 60 + om && mins < ch * 60 + cm;
}

export function useStoreHours() {
  const [rows, setRows] = useState<HoursRow[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("store_hours")
        .select("location_id,day_of_week,open_time,close_time,is_closed,hours_kind");
      if (active && data) setRows(data as HoursRow[]);
    })();
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return {
    rows,
    todayLabel: (locationId: LocationId) => todayLabel(rows, locationId),
    isOpenNow: (locationId: LocationId) => isOpenNow(rows, locationId),
    loaded: rows.length > 0,
  };
}
