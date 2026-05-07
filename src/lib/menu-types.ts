export type ModifierOption = { id: string; name: string; price?: number };
export type ModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: ModifierOption[];
};
export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string; // curated bucket label
  rawCategory: string | null; // original DB category
  image?: string;
  popular?: boolean;
  soldOut?: boolean;
  modifierGroups?: ModifierGroup[];
};
export type Category = { id: string; name: string; blurb?: string };
