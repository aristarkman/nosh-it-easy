
-- Reusable modifier groups (e.g., "Bread choice", "Add-ons")
CREATE TABLE public.modifier_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1,
  required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.modifier_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_modifier_options_group ON public.modifier_options(group_id);

-- Junction: assign modifier groups to menu items
CREATE TABLE public.menu_item_modifier_groups (
  menu_item_id UUID NOT NULL,
  modifier_group_id UUID NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (menu_item_id, modifier_group_id)
);
CREATE INDEX idx_mimg_item ON public.menu_item_modifier_groups(menu_item_id);

ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_modifier_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads modifier_groups" ON public.modifier_groups FOR SELECT USING (true);
CREATE POLICY "admins manage modifier_groups" ON public.modifier_groups FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "anyone reads modifier_options" ON public.modifier_options FOR SELECT USING (true);
CREATE POLICY "admins manage modifier_options" ON public.modifier_options FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "anyone reads menu_item_modifier_groups" ON public.menu_item_modifier_groups FOR SELECT USING (true);
CREATE POLICY "admins manage menu_item_modifier_groups" ON public.menu_item_modifier_groups FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_modifier_groups_updated_at BEFORE UPDATE ON public.modifier_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
