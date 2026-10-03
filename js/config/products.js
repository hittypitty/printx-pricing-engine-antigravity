/**
 * BV Web — Product Catalog (default data)
 *
 * Each product:
 *   id        unique string
 *   title     display name
 *   category  used for the category filter chips
 *   image     optional image URL ('' → placeholder)
 *   unit      selling unit label (e.g. 'pc')
 *   stock     units currently available (0 = Out of Stock)
 *   tiers     quantity-wise price slabs, sorted by minQty:
 *             { minQty, maxQty, price }  — maxQty null = "and above"
 *
 * NOTE: Sample data based on the existing Dropship rates in pricingBrain.js.
 * Replace with real catalog / stock figures. Edits made in "Manage Products"
 * are saved in the browser (localStorage) until a database is connected.
 */

export const LOW_STOCK_THRESHOLD = 10;

export const PRODUCTS = [
  {
    id: 'sipper',
    title: 'Sipper Bottle',
    category: 'Drinkware',
    image: '',
    unit: 'pc',
    stock: 120,
    tiers: [
      { minQty: 1, maxQty: 9, price: 200 },
      { minQty: 10, maxQty: 49, price: 180 },
      { minQty: 50, maxQty: null, price: 160 },
    ],
  },
  {
    id: 'sipper-straw',
    title: 'Sipper with Straw',
    category: 'Drinkware',
    image: '',
    unit: 'pc',
    stock: 8,
    tiers: [
      { minQty: 1, maxQty: 9, price: 300 },
      { minQty: 10, maxQty: 49, price: 270 },
      { minQty: 50, maxQty: null, price: 240 },
    ],
  },
  {
    id: 'mug-white',
    title: 'White Sublimation Mug',
    category: 'Drinkware',
    image: '',
    unit: 'pc',
    stock: 450,
    tiers: [
      { minQty: 1, maxQty: 9, price: 100 },
      { minQty: 10, maxQty: 49, price: 90 },
      { minQty: 50, maxQty: 99, price: 80 },
      { minQty: 100, maxQty: null, price: 72 },
    ],
  },
  {
    id: 'wall-clock',
    title: 'Custom Wall Clock',
    category: 'Home & Decor',
    image: '',
    unit: 'pc',
    stock: 0,
    tiers: [
      { minQty: 1, maxQty: 9, price: 350 },
      { minQty: 10, maxQty: null, price: 315 },
    ],
  },
  {
    id: 'badge-circle',
    title: 'Round Button Badge',
    category: 'Corporate',
    image: '',
    unit: 'pc',
    stock: 1000,
    tiers: [
      { minQty: 1, maxQty: 49, price: 25 },
      { minQty: 50, maxQty: 199, price: 20 },
      { minQty: 200, maxQty: null, price: 16 },
    ],
  },
  {
    id: 'sash-plain',
    title: 'Plain Sash',
    category: 'Corporate',
    image: '',
    unit: 'pc',
    stock: 60,
    tiers: [
      { minQty: 1, maxQty: 24, price: 30 },
      { minQty: 25, maxQty: null, price: 25 },
    ],
  },
  {
    id: 'visiting-card-100',
    title: 'Visiting Cards (Pack of 100)',
    category: 'Stationery',
    image: '',
    unit: 'pack',
    stock: 200,
    tiers: [
      { minQty: 1, maxQty: 4, price: 500 },
      { minQty: 5, maxQty: null, price: 450 },
    ],
  },
  {
    id: 'sublimation-tape',
    title: 'Sublimation Heat Tape',
    category: 'Supplies',
    image: '',
    unit: 'roll',
    stock: 5,
    tiers: [
      { minQty: 1, maxQty: 9, price: 140 },
      { minQty: 10, maxQty: null, price: 125 },
    ],
  },
];
