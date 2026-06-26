import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/welcome/address")({
  head: () => ({
    meta: [{ title: "Add a delivery address — The Kosher Nosh" }],
  }),
  component: WelcomeAddressPage,
});

function WelcomeAddressPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addr, setAddr] = useState({
    address_line1: "",
    address_line2: "",
    city: "",
    state: "NJ",
    zip: "",
    delivery_notes: "",
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate({ to: "/login" });
        return;
      }
      setUserId(data.user.id);
      setChecking(false);
    });
  }, [navigate]);

  const skip = () => navigate({ to: "/" });

  const save = async () => {
    if (!userId) return;
    if (!addr.address_line1.trim() || !addr.city.trim() || !addr.zip.trim()) {
      toast.error("Please fill street, city, and ZIP — or tap Skip for now.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("customer_addresses").insert({
      user_id: userId,
      label: "Home",
      address_line1: addr.address_line1.trim(),
      address_line2: addr.address_line2.trim() || null,
      city: addr.city.trim(),
      state: addr.state.trim() || "NJ",
      zip: addr.zip.trim(),
      delivery_notes: addr.delivery_notes.trim() || null,
      is_default: true,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Address saved!");
    navigate({ to: "/" });
  };

  if (checking) {
    return <div className="mx-auto max-w-md px-4 py-12 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-4xl font-black">Add a delivery address</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Save your address now for faster checkout later. This step is optional — you can always add one from your account.
      </p>

      <div className="mt-6 grid gap-3">
        <Field label="Street address" value={addr.address_line1} onChange={(v) => setAddr({ ...addr, address_line1: v })} placeholder="123 Main St" />
        <Field label="Apt / Suite (optional)" value={addr.address_line2} onChange={(v) => setAddr({ ...addr, address_line2: v })} />
        <div className="grid grid-cols-3 gap-2">
          <Field label="City" value={addr.city} onChange={(v) => setAddr({ ...addr, city: v })} />
          <Field label="State" value={addr.state} onChange={(v) => setAddr({ ...addr, state: v })} />
          <Field label="ZIP" value={addr.zip} onChange={(v) => setAddr({ ...addr, zip: v.replace(/\D/g, "").slice(0, 5) })} />
        </div>
        <Field label="Delivery notes (optional)" value={addr.delivery_notes} onChange={(v) => setAddr({ ...addr, delivery_notes: v })} placeholder="Gate code, leave at door, etc." />
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save address"}
        </button>
        <button
          onClick={skip}
          className="w-full rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold transition hover:border-primary"
        >
          Skip for now
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        You can manage addresses anytime from your{" "}
        <Link to="/account" className="font-semibold text-primary hover:underline">account</Link>.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
