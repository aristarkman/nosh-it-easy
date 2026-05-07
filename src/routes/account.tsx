import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/lib/customer-auth";
import { useOrder, fmt, type CartLine, type LocationId, type OrderType } from "@/lib/order-context";
import { toast } from "sonner";
import { Plus, Trash2, RotateCcw, LogOut, Star, StarOff } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [{ title: "My account — The Famous Kosher Nosh" }],
  }),
  component: AccountPage,
});

type Profile = {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  marketing_email: boolean;
  marketing_sms: boolean;
};

type Address = {
  id: string;
  label: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  delivery_notes: string | null;
  is_default: boolean;
};

type Order = {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  total: number;
  order_type: string;
  location_id: string;
  items: CartLine[];
};

function AccountPage() {
  const auth = useCustomerAuth();
  const navigate = useNavigate();

  if (!auth.loading && !auth.authed) {
    if (typeof window !== "undefined") navigate({ to: "/login" });
    return null;
  }

  if (auth.loading) {
    return <div className="mx-auto max-w-3xl px-4 py-12 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl font-black">My account</h1>
          <p className="text-sm text-muted-foreground">{auth.email}</p>
        </div>
        <button
          onClick={async () => {
            await auth.signOut();
            navigate({ to: "/" });
          }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:border-destructive hover:text-destructive"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </div>

      <div className="mt-8 grid gap-6">
        <ProfileCard userId={auth.userId!} />
        <RewardsCard userId={auth.userId!} />
        <FavoritesCard userId={auth.userId!} />
        <OrdersCard userId={auth.userId!} />
        <AddressesCard userId={auth.userId!} />
      </div>
    </div>
  );
}

function ProfileCard({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("customer_profiles")
        .select("full_name,phone,email,marketing_email,marketing_sms")
        .eq("user_id", userId)
        .maybeSingle();
      setProfile(
        data ?? { full_name: "", phone: "", email: "", marketing_email: false, marketing_sms: false }
      );
    })();
  }, [userId]);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("customer_profiles")
      .upsert({ user_id: userId, ...profile });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved");
  };

  if (!profile) return <Card title="Profile">Loading…</Card>;

  return (
    <Card title="Profile">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Full name" value={profile.full_name ?? ""} onChange={(v) => setProfile({ ...profile, full_name: v })} />
        <Input label="Phone" value={profile.phone ?? ""} onChange={(v) => setProfile({ ...profile, phone: v })} />
      </div>
      <div className="mt-3 space-y-2">
        <Toggle
          label="Email me deals & specials"
          checked={profile.marketing_email}
          onChange={(v) => setProfile({ ...profile, marketing_email: v })}
        />
        <Toggle
          label="Text me order updates & specials"
          checked={profile.marketing_sms}
          onChange={(v) => setProfile({ ...profile, marketing_sms: v })}
        />
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </Card>
  );
}

function AddressesCard({ userId }: { userId: string }) {
  const [list, setList] = useState<Address[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Omit<Address, "id">>({
    label: "Home",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "NJ",
    zip: "",
    delivery_notes: "",
    is_default: false,
  });

  const load = async () => {
    const { data } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    setList((data ?? []) as Address[]);
  };

  useEffect(() => {
    load();
  }, [userId]);

  const add = async () => {
    if (!draft.address_line1 || !draft.city || !draft.zip) {
      toast.error("Please fill street, city, and ZIP.");
      return;
    }
    if (draft.is_default) {
      await supabase.from("customer_addresses").update({ is_default: false }).eq("user_id", userId);
    }
    const { error } = await supabase.from("customer_addresses").insert({ user_id: userId, ...draft });
    if (error) {
      toast.error(error.message);
      return;
    }
    setAdding(false);
    setDraft({ label: "Home", address_line1: "", address_line2: "", city: "", state: "NJ", zip: "", delivery_notes: "", is_default: false });
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("customer_addresses").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const setDefault = async (id: string) => {
    await supabase.from("customer_addresses").update({ is_default: false }).eq("user_id", userId);
    await supabase.from("customer_addresses").update({ is_default: true }).eq("id", id);
    load();
  };

  return (
    <Card title="Saved addresses">
      <div className="space-y-2">
        {list.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3">
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{a.label}</span>
                {a.is_default && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">Default</span>}
              </div>
              <div className="text-muted-foreground">
                {a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ""}, {a.city}, {a.state} {a.zip}
              </div>
              {a.delivery_notes && <div className="mt-0.5 text-xs text-muted-foreground">Note: {a.delivery_notes}</div>}
            </div>
            <div className="flex shrink-0 gap-2">
              {!a.is_default && (
                <button onClick={() => setDefault(a.id)} className="text-xs font-semibold text-primary hover:underline">
                  Make default
                </button>
              )}
              <button onClick={() => remove(a.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No addresses saved yet.</p>
        )}
      </div>

      {adding ? (
        <div className="mt-4 grid gap-2 rounded-xl border border-border bg-background p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input label="Label" value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })} />
            <Input label="Street address" value={draft.address_line1} onChange={(v) => setDraft({ ...draft, address_line1: v })} />
            <Input label="Apt / Suite (optional)" value={draft.address_line2 ?? ""} onChange={(v) => setDraft({ ...draft, address_line2: v })} />
            <Input label="City" value={draft.city} onChange={(v) => setDraft({ ...draft, city: v })} />
            <Input label="State" value={draft.state} onChange={(v) => setDraft({ ...draft, state: v })} />
            <Input label="ZIP" value={draft.zip} onChange={(v) => setDraft({ ...draft, zip: v.replace(/\D/g, "").slice(0, 5) })} />
          </div>
          <Input label="Delivery notes (optional)" value={draft.delivery_notes ?? ""} onChange={(v) => setDraft({ ...draft, delivery_notes: v })} />
          <Toggle label="Make this my default address" checked={draft.is_default} onChange={(v) => setDraft({ ...draft, is_default: v })} />
          <div className="flex gap-2">
            <button onClick={add} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
              Save address
            </button>
            <button onClick={() => setAdding(false)} className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:border-destructive">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:border-primary"
        >
          <Plus className="size-4" /> Add address
        </button>
      )}
    </Card>
  );
}

type Favorite = {
  id: string;
  name: string;
  location_id: string;
  order_type: string;
  items: CartLine[];
  source_order_id: string | null;
  created_at: string;
};

type ReorderTarget = {
  items: CartLine[];
  location_id?: string;
  order_type?: string;
  label: string;
};

function useReorderDialog() {
  const { cart, clearCart, addToCart, setLocation, setOrderType } = useOrder();
  const navigate = useNavigate();
  const [pending, setPending] = useState<ReorderTarget | null>(null);

  const apply = (target: ReorderTarget, mode: "replace" | "merge") => {
    if (mode === "replace") clearCart();
    if (target.location_id) setLocation(target.location_id as LocationId);
    if (target.order_type) setOrderType(target.order_type as OrderType);
    target.items.forEach((line) => {
      const { lineId: _omit, ...rest } = line;
      void _omit;
      addToCart(rest);
    });
    toast.success(mode === "replace" ? "Cart replaced" : "Items added to cart");
    navigate({ to: "/cart" });
    setPending(null);
  };

  const start = (target: ReorderTarget) => {
    if (cart.length === 0) {
      apply(target, "replace");
    } else {
      setPending(target);
    }
  };

  const dialog = (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You already have items in your cart</AlertDialogTitle>
          <AlertDialogDescription>
            Reordering <strong>{pending?.label}</strong>. Replace your current cart, or merge these
            items in?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => pending && apply(pending, "merge")}
            className="bg-secondary text-secondary-foreground hover:opacity-90"
          >
            Merge
          </AlertDialogAction>
          <AlertDialogAction
            onClick={() => pending && apply(pending, "replace")}
          >
            Replace cart
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { start, dialog };
}

function FavoritesCard({ userId }: { userId: string }) {
  const [list, setList] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const { start: startReorder, dialog } = useReorderDialog();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customer_favorites")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setList((data ?? []) as unknown as Favorite[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [userId]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("customer_favorites").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      setList((prev) => prev.filter((f) => f.id !== id));
      toast.success("Favorite removed");
    }
  };

  return (
    <Card title="Favorites">
      {dialog}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No favorites yet. Save a past order or your current cart for one-tap reordering.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((f) => {
            const itemCount = f.items.reduce((s, l) => s + l.quantity, 0);
            const total = f.items.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
            return (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
              >
                <div className="min-w-0 text-sm">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Star className="size-3.5 fill-primary text-primary" />
                    {f.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {itemCount} item{itemCount === 1 ? "" : "s"} · {fmt(total)} ·{" "}
                    {f.order_type} · {f.location_id}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() =>
                      startReorder({
                        items: f.items,
                        location_id: f.location_id,
                        order_type: f.order_type,
                        label: f.name,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <RotateCcw className="size-3.5" /> Reorder
                  </button>
                  <button
                    onClick={() => remove(f.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove favorite"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function OrdersCard({ userId }: { userId: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedSourceIds, setSavedSourceIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const { start: startReorder, dialog } = useReorderDialog();

  useEffect(() => {
    (async () => {
      const [{ data: orderRows }, { data: favRows }] = await Promise.all([
        supabase
          .from("orders")
          .select("id,order_number,created_at,status,total,order_type,location_id,items")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("customer_favorites")
          .select("source_order_id")
          .eq("user_id", userId),
      ]);
      setOrders((orderRows ?? []) as unknown as Order[]);
      setSavedSourceIds(
        new Set((favRows ?? []).map((r) => r.source_order_id).filter(Boolean) as string[])
      );
      setLoading(false);
    })();
  }, [userId]);

  const saveAsFavorite = async (o: Order) => {
    const name = window.prompt("Name this favorite (e.g. \"My usual\")", `Order #${o.order_number}`);
    if (!name) return;
    setSavingId(o.id);
    const { error } = await supabase.from("customer_favorites").insert({
      user_id: userId,
      name: name.trim().slice(0, 60),
      location_id: o.location_id,
      order_type: o.order_type,
      items: o.items as unknown as never,
      source_order_id: o.id,
    });
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSavedSourceIds((prev) => new Set(prev).add(o.id));
    toast.success("Saved to favorites");
  };

  return (
    <Card title="Order history">
      {dialog}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => {
            const saved = savedSourceIds.has(o.id);
            return (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
              >
                <div className="text-sm">
                  <div className="font-semibold">
                    #{o.order_number} · {fmt(Number(o.total))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString()} · {o.order_type} · {o.status}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => saveAsFavorite(o)}
                    disabled={saved || savingId === o.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold hover:border-primary disabled:cursor-default disabled:opacity-50 disabled:hover:border-border"
                    title={saved ? "Already saved as a favorite" : "Save as favorite"}
                  >
                    {saved ? (
                      <>
                        <Star className="size-3.5 fill-primary text-primary" /> Saved
                      </>
                    ) : (
                      <>
                        <StarOff className="size-3.5" /> Favorite
                      </>
                    )}
                  </button>
                  <button
                    onClick={() =>
                      startReorder({
                        items: o.items,
                        location_id: o.location_id,
                        order_type: o.order_type,
                        label: `#${o.order_number}`,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <RotateCcw className="size-3.5" /> Reorder
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-primary" />
      {label}
    </label>
  );
}

function RewardsCard({ userId }: { userId: string }) {
  const [completed, setCompleted] = useState(0);
  const [redeemed, setRedeemed] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ count: c }, { count: r }] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .in("status", ["ready", "completed"]),
        supabase
          .from("loyalty_redemptions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);
      setCompleted(c ?? 0);
      setRedeemed(r ?? 0);
      setLoading(false);
    })();
  }, [userId]);

  const earned = Math.floor(completed / 10);
  const available = Math.max(0, earned - redeemed);
  const progress = completed % 10;

  return (
    <Card title="Loyalty rewards">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-black">${(available * 5).toFixed(0)}</div>
              <div className="text-xs text-muted-foreground">
                available · {available} reward{available === 1 ? "" : "s"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold">{progress} / 10</div>
              <div className="text-xs text-muted-foreground">orders to next $5</div>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(progress / 10) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Earn $5 off for every 10 completed orders. Apply at checkout.
          </p>
        </div>
      )}
    </Card>
  );
}

// Add a placeholder Link import alias guard so unused imports don't break build
void Link;

