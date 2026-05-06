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
  category: string;
  image?: string;
  popular?: boolean;
  soldOut?: boolean;
  modifierGroups?: ModifierGroup[];
};
export type Category = { id: string; name: string; blurb?: string };

export const CATEGORIES: Category[] = [
  { id: "sandwiches", name: "Classic Sandwiches", blurb: "Hand-carved, piled high, on fresh-baked rye." },
  { id: "platters", name: "Deli Platters" },
  { id: "soups", name: "Soups & Sides" },
  { id: "breakfast", name: "All-Day Breakfast" },
  { id: "knishes", name: "Knishes & Latkes" },
  { id: "drinks", name: "Drinks" },
  { id: "desserts", name: "Desserts" },
];

const breadGroup: ModifierGroup = {
  id: "bread",
  name: "Choose your bread",
  required: true,
  min: 1,
  max: 1,
  options: [
    { id: "rye", name: "Fresh Rye" },
    { id: "challah", name: "Challah" },
    { id: "pumpernickel", name: "Pumpernickel" },
    { id: "club", name: "Club Roll", price: 1 },
    { id: "wrap", name: "Wrap" },
  ],
};
const addonsGroup: ModifierGroup = {
  id: "addons",
  name: "Add-ons",
  required: false,
  min: 0,
  max: 6,
  options: [
    { id: "swiss", name: "Swiss Cheese", price: 1.5 },
    { id: "muenster", name: "Muenster", price: 1.5 },
    { id: "tomato", name: "Tomato", price: 0.75 },
    { id: "onion", name: "Onion", price: 0.5 },
    { id: "russian", name: "Russian Dressing", price: 0.5 },
    { id: "extra-meat", name: "Extra Meat (¼ lb)", price: 6 },
  ],
};
const sideGroup: ModifierGroup = {
  id: "side",
  name: "Make it a combo (+ pickle, slaw, drink)",
  required: false,
  min: 0,
  max: 1,
  options: [{ id: "combo", name: "Add Combo", price: 5.5 }],
};

export const ITEMS: MenuItem[] = [
  {
    id: "pastrami-rye",
    name: "Hot Pastrami on Rye",
    description: "Slow-cured, hand-carved pastrami piled on fresh seeded rye with deli mustard.",
    price: 18.95,
    category: "sandwiches",
    popular: true,
    modifierGroups: [breadGroup, addonsGroup, sideGroup],
  },
  {
    id: "corned-beef",
    name: "Corned Beef Sandwich",
    description: "House-brined corned beef, sliced thick, with mustard on rye.",
    price: 17.95,
    category: "sandwiches",
    popular: true,
    modifierGroups: [breadGroup, addonsGroup, sideGroup],
  },
  {
    id: "reuben",
    name: "The Reuben",
    description: "Corned beef, swiss, sauerkraut, and Russian dressing on grilled rye.",
    price: 19.5,
    category: "sandwiches",
    popular: true,
    modifierGroups: [addonsGroup, sideGroup],
  },
  {
    id: "turkey-club",
    name: "Roast Turkey Club",
    description: "Oven-roasted turkey, lettuce, tomato, mayo on a toasted club roll.",
    price: 16.5,
    category: "sandwiches",
    modifierGroups: [breadGroup, addonsGroup, sideGroup],
  },
  {
    id: "tongue",
    name: "Beef Tongue Sandwich",
    description: "A deli classic. Tender, sliced thin, on rye with mustard.",
    price: 18.5,
    category: "sandwiches",
    modifierGroups: [breadGroup, addonsGroup],
  },
  {
    id: "chicken-soup",
    name: "Matzo Ball Soup",
    description: "Grandma's recipe. One fluffy matzo ball in golden chicken broth.",
    price: 8.5,
    category: "soups",
    popular: true,
  },
  {
    id: "split-pea",
    name: "Split Pea Soup",
    description: "Thick, hearty, and warming. Served with a slice of rye.",
    price: 7.5,
    category: "soups",
  },
  {
    id: "potato-knish",
    name: "Potato Knish",
    description: "Baked, golden, and stuffed with seasoned potato.",
    price: 5.5,
    category: "knishes",
    popular: true,
  },
  {
    id: "kasha-knish",
    name: "Kasha Knish",
    description: "Roasted buckwheat in a flaky pastry shell.",
    price: 5.5,
    category: "knishes",
  },
  {
    id: "latkes",
    name: "Potato Latkes (3)",
    description: "Crispy hand-grated potato pancakes. Apple sauce + sour cream.",
    price: 9.5,
    category: "knishes",
  },
  {
    id: "lox-platter",
    name: "Nova Lox Platter",
    description: "Sliced Nova lox, cream cheese, tomato, onion, capers, bagel.",
    price: 22.5,
    category: "platters",
    popular: true,
  },
  {
    id: "whitefish",
    name: "Whitefish Salad Platter",
    description: "House-made whitefish salad with bagel and fixings.",
    price: 19.5,
    category: "platters",
  },
  {
    id: "lox-eggs-onions",
    name: "Lox, Eggs & Onions",
    description: "Scrambled with sautéed onions. Served with a bagel.",
    price: 17.5,
    category: "breakfast",
  },
  {
    id: "bagel-cc",
    name: "Bagel & Cream Cheese",
    description: "Fresh-baked bagel with plain or scallion cream cheese.",
    price: 5.5,
    category: "breakfast",
  },
  {
    id: "drbrowns",
    name: "Dr. Brown's Soda",
    description: "Cel-Ray, Black Cherry, Cream, or Root Beer.",
    price: 3.5,
    category: "drinks",
    popular: true,
  },
  {
    id: "egg-cream",
    name: "Classic Egg Cream",
    description: "Milk, seltzer, U-Bet chocolate syrup. The real thing.",
    price: 5,
    category: "drinks",
  },
  {
    id: "blackandwhite",
    name: "Black & White Cookie",
    description: "Big, soft, half vanilla, half chocolate fondant.",
    price: 4.5,
    category: "desserts",
    popular: true,
  },
  {
    id: "rugelach",
    name: "Rugelach (4 pc)",
    description: "Flaky pastry rolled with cinnamon, walnut, and raisin.",
    price: 6.5,
    category: "desserts",
  },
];

export const UPSELLS = [
  { id: "drbrowns", reason: "Add a Dr. Brown's" },
  { id: "potato-knish", reason: "Add a knish" },
  { id: "blackandwhite", reason: "Add a black & white" },
];

export const getItem = (id: string) => ITEMS.find((i) => i.id === id);
