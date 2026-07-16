const FEED_URL = "https://ihqeuyvovhleamkowjpg.supabase.co/functions/v1/public-menu-feed";

export type MenuFeed = {
  generated_at: string;
  source: string;
  locations: Array<{ id: string; name: string; slug: string }>;
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    display_order: number;
    active: boolean;
    updated_at: string;
  }>;
  items: Array<{
    id: string;
    name: string;
    slug: string;
    short_description: string | null;
    category_id: string;
    category_slug: string | null;
    image_url: string | null;
    display_order: number;
    featured: boolean;
    dietary_labels: string[];
    ordering_url: string;
    updated_at: string;
    locations: Array<{
      location_id: string;
      available: boolean;
      price: number;
      price_display_text: string | null;
    }>;
  }>;
};

export async function fetchMenuFeed(params: {
  location?: string;
  category?: string;
}): Promise<MenuFeed> {
  const url = new URL(FEED_URL);
  if (params.location) url.searchParams.set("location", params.location);
  if (params.category) url.searchParams.set("category", params.category);
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Menu feed request failed (${res.status})`);
  }
  return (await res.json()) as MenuFeed;
}
