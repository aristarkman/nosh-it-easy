import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/admin/promos")({
  head: () => ({ meta: [{ title: "Promo codes — Admin" }] }),
  component: PromosPage,
});

type Promo = {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed" | "bogo";
  discount_value: number;
  bogo_buy_item_id: string | null;
  bogo_get_item_id: string | null;
  min_subtotal: number;
  max_uses_per_customer: number;
  max_total_uses: number | null;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
};

type Item = { id: string; name: string };

const empty: Omit<Promo, "id"> = {
  code: "",
  description: "",
  discount_type: "percent",
  discount_value: 10,
  bogo_buy_item_id: null,
  bogo_get_item_id: null,
  min_subtotal: 0,
  max_uses_per_customer: 1,
  max_total_uses: null,
  active: true,
  starts_at: null,
  expires_at: null,
};

function PromosPage() {
  const [list, setList] = useState<Promo[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Omit<Promo, "id">>(empty);
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = async () => {
    const [{ data: ps }, { data: mi }, { data: rs }] = await Promise.all([
      supabase.from("promo_codes").select("*").order("created_at", { ascending: false }),
      supabase.from("menu_items").select("id,name").eq("active", true).order("name"),
      supabase.from("promo_redemptions").select("promo_code_id"),
    ]);
    setList((ps ?? []) as Promo[]);
    setItems((mi ?? []) as Item[]);
    const c: Record<string, number> = {};
    (rs ?? []).forEach((r: { promo_code_id: string }) => {
      c[r.promo_code_id] = (c[r.promo_code_id] ?? 0) + 1;
    });
    setCounts(c);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!draft.code.trim()) return toast.error("Code is required");
    if (draft.discount_type === "bogo" && (!draft.bogo_buy_item_id || !draft.bogo_get_item_id))
      return toast.error("Pick both BOGO items");
    setSaving(true);
    const payload = {
      ...draft,
      code: draft.code.trim().toUpperCase(),
      description: draft.description || null,
      discount_value:
        draft.discount_type === "bogo" ? 0 : Number(draft.discount_value) || 0,
      starts_at: draft.starts_at || null,
      expires_at: draft.expires_at || null,
      max_total_uses: draft.max_total_uses === null ? null : Number(draft.max_total_uses) || null,
    };
    const { error } = await supabase.from("promo_codes").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Created ${payload.code}`);
    setDraft(empty);
    load();
  };

  const toggleActive = async (p: Promo) => {
    const { error } = await supabase.from("promo_codes").update({ active: !p.active }).eq("id", p.id);
    if (error) toast.error(error.message);
    else load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this code? Past redemptions will be removed.")) return;
    const { error } = await supabase.from("promo_codes").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const itemName = (id: string | null) => items.find((i) => i.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Promo codes</h2>
        <p className="text-sm text-muted-foreground">
          Create discount codes. Use <strong>1 use per customer</strong> for one-time-use codes, or
          create a <strong>BOGO</strong> code (buy 1 of an item, get a 2nd free).
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          New promo code
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Code (e.g. WELCOME10)"
            value={draft.code}
            onChange={(v) => setDraft({ ...draft, code: v.toUpperCase() })}
          />
          <Input
            label="Description (internal)"
            value={draft.description ?? ""}
            onChange={(v) => setDraft({ ...draft, description: v })}
          />
          <div>
            <Label>Discount type</Label>
            <select
              value={draft.discount_type}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  discount_type: e.target.value as Promo["discount_type"],
                })
              }
              className="w-full rounded border border-border bg-background px-2 py-2 text-sm"
            >
              <option value="percent">% off subtotal</option>
              <option value="fixed">$ off subtotal</option>
              <option value="bogo">BOGO (buy 1, get 1 free)</option>
            </select>
          </div>

          {draft.discount_type !== "bogo" && (
            <Input
              label={draft.discount_type === "percent" ? "Percent off (e.g. 10)" : "Dollars off"}
              value={String(draft.discount_value)}
              onChange={(v) => setDraft({ ...draft, discount_value: parseFloat(v) || 0 })}
            />
          )}

          {draft.discount_type === "bogo" && (
            <>
              <div>
                <Label>Buy this item</Label>
                <select
                  value={draft.bogo_buy_item_id ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, bogo_buy_item_id: e.target.value || null })
                  }
                  className="w-full rounded border border-border bg-background px-2 py-2 text-sm"
                >
                  <option value="">— pick item —</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Get this item free</Label>
                <select
                  value={draft.bogo_get_item_id ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, bogo_get_item_id: e.target.value || null })
                  }
                  className="w-full rounded border border-border bg-background px-2 py-2 text-sm"
                >
                  <option value="">— pick item —</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <Input
            label="Minimum subtotal ($)"
            value={String(draft.min_subtotal)}
            onChange={(v) => setDraft({ ...draft, min_subtotal: parseFloat(v) || 0 })}
          />
          <Input
            label="Max uses per customer (0 = unlimited)"
            value={String(draft.max_uses_per_customer)}
            onChange={(v) => setDraft({ ...draft, max_uses_per_customer: parseInt(v) || 0 })}
          />
          <Input
            label="Max total uses (blank = unlimited)"
            value={draft.max_total_uses === null ? "" : String(draft.max_total_uses)}
            onChange={(v) =>
              setDraft({ ...draft, max_total_uses: v === "" ? null : parseInt(v) || 0 })
            }
          />
          <Input
            label="Starts at (optional)"
            type="datetime-local"
            value={draft.starts_at ?? ""}
            onChange={(v) => setDraft({ ...draft, starts_at: v || null })}
          />
          <Input
            label="Expires at (optional)"
            type="datetime-local"
            value={draft.expires_at ?? ""}
            onChange={(v) => setDraft({ ...draft, expires_at: v || null })}
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          <Plus className="size-3.5" /> {saving ? "Saving…" : "Add promo code"}
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3 font-display text-lg">All promo codes</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Value</th>
                <th className="px-4 py-2">Per cust</th>
                <th className="px-4 py-2">Used</th>
                <th className="px-4 py-2">Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    No promo codes yet.
                  </td>
                </tr>
              )}
              {list.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono font-bold">{p.code}</td>
                  <td className="px-4 py-2">
                    {p.discount_type === "bogo"
                      ? `BOGO: ${itemName(p.bogo_buy_item_id)} → ${itemName(p.bogo_get_item_id)}`
                      : p.discount_type}
                  </td>
                  <td className="px-4 py-2">
                    {p.discount_type === "percent"
                      ? `${p.discount_value}%`
                      : p.discount_type === "fixed"
                      ? `$${Number(p.discount_value).toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {p.max_uses_per_customer === 0 ? "∞" : p.max_uses_per_customer}
                  </td>
                  <td className="px-4 py-2">
                    {counts[p.id] ?? 0}
                    {p.max_total_uses ? ` / ${p.max_total_uses}` : ""}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleActive(p)}
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                        p.active
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.active ? "Active" : "Off"}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => remove(p.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-background px-2 py-2 text-sm"
      />
    </label>
  );
}
