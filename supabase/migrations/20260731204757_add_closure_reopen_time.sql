-- Optional "reopens at" time for a closure. Only meaningful on the
-- closure's end_date: if set, online ordering stays blocked that day
-- until this time, then resumes for the rest of the day's normal hours.
-- Leave null to keep the existing behavior (fully closed through
-- end_date, reopens at normal hours the next day).

ALTER TABLE public.store_closures
  ADD COLUMN IF NOT EXISTS reopen_time time;

NOTIFY pgrst, 'reload schema';
