# Catalogue status

Generated from `data/catalogue.json` (25 products, 5 categories).

**Nothing here was invented during integration.** Names, descriptions, specifications,
features and images were carried over from the storefront prototype, which took them
from the Elanpro catalogue. What the business still has to supply is marked.

- **Prices: none are confirmed.** 3 are marketplace listings and 22 are the prototype's
  placeholders. Every product is stored with `priceSource` `listed` or `indicative`; the
  product page says the price needs confirming and the admin list shows "Not confirmed".
  Saving a price in Admin → Products marks it `confirmed`.
- **Stock: not provided.** `npm run seed` loads every product with stock 0, so nothing can
  be ordered until real stock is entered. (`seed:demo` / `dev:local` add 5 units for local
  testing only and refuse to run in production.)
- **SKU: not provided.** The model number is shown instead; SKUs can be added in the admin panel.
- **Images:** local files are the prototype's catalogue cut-outs. Some products also point at a
  photo on elanpro.net, with the local image as fallback. Confirm you may use both, or
  replace them through Admin → Products → Images.
- **Warranty, MRP, featured flags:** not provided (warranty 0 = not shown, MRP = price, none featured).

| Model | Name | Brand | SKU | Category | Description | Specifications | Images | Price in file | Price status | Stock in seed |
|---|---|---|---|---|---|---|---|---|---|---|
| EGN 1500 C4 | Reach-In Premium Cooler | Elanpro | not provided | Professional Kitchen | yes | 7 rows, 7 features | 2 local + 1 elanpro.net | ₹1,85,000 | **placeholder, needs confirmation** | 0 (not provided) |
| EGN 2100 C | Undercounter Premium Cooler | Elanpro | not provided | Professional Kitchen | yes | 7 rows, 5 features | 2 local + 1 elanpro.net | ₹98,000 | **placeholder, needs confirmation** | 0 (not provided) |
| ESH 2000 | Saladette Counter with Prep Table | Elanpro | not provided | Professional Kitchen | yes | 7 rows, 6 features | 1 local + 1 elanpro.net | ₹1,35,000 | **placeholder, needs confirmation** | 0 (not provided) |
| ED10 | Blast Chiller / Freezer | Elanpro | not provided | Professional Kitchen | yes | 8 rows, 6 features | 1 local + 1 elanpro.net | ₹3,40,000 | **placeholder, needs confirmation** | 0 (not provided) |
| RI 551 C | Reach-In Static Cooler | Elanpro | not provided | Professional Kitchen | yes | 7 rows, 7 features | 1 local + 1 elanpro.net | ₹68,795 | **marketplace listing, needs confirmation** | 0 (not provided) |
| EWG 51 D | Wine Cooler | Elanpro | not provided | Bar Refrigeration | yes | 7 rows, 8 features | 1 local | ₹62,000 | **placeholder, needs confirmation** | 0 (not provided) |
| EWG 130 D | Wine Cooler | Elanpro | not provided | Bar Refrigeration | yes | 7 rows, 8 features | 1 local + 1 elanpro.net | ₹1,10,000 | **placeholder, needs confirmation** | 0 (not provided) |
| EBB 2D / 2D SS | Back Bar | Elanpro | not provided | Bar Refrigeration | yes | 8 rows, 5 features | 1 local + 1 elanpro.net | ₹58,000 | **placeholder, needs confirmation** | 0 (not provided) |
| EGF 5G | Glass Froster | Elanpro | not provided | Bar Refrigeration | yes | 7 rows, 4 features | 1 local | ₹48,000 | **placeholder, needs confirmation** | 0 (not provided) |
| EGN 2100 CG | Undercounter Bar | Elanpro | not provided | Bar Refrigeration | yes | 7 rows, 4 features | 1 local + 1 elanpro.net | ₹1,05,000 | **placeholder, needs confirmation** | 0 (not provided) |
| EIM 61 BW | Ice Machine | Elanpro | not provided | Ice Machine | yes | 8 rows, 5 features | 1 local | ₹72,000 | **placeholder, needs confirmation** | 0 (not provided) |
| EIM 101 | Ice Machine | Elanpro | not provided | Ice Machine | yes | 8 rows, 5 features | 1 local | ₹1,05,000 | **placeholder, needs confirmation** | 0 (not provided) |
| EIM 201 | Ice Machine | Elanpro | not provided | Ice Machine | yes | 8 rows, 5 features | 1 local | ₹1,95,000 | **placeholder, needs confirmation** | 0 (not provided) |
| EIM 1001 | Ice Machine | Elanpro | not provided | Ice Machine | yes | 8 rows, 5 features | 1 local + 1 elanpro.net | ₹6,50,000 | **placeholder, needs confirmation** | 0 (not provided) |
| EFM 101 | Ice Flaker | Elanpro | not provided | Ice Machine | yes | 7 rows, 4 features | 1 local + 1 elanpro.net | ₹1,25,000 | **placeholder, needs confirmation** | 0 (not provided) |
| EKG 650 G | Flat Glass Top Freezer | Elanpro | not provided | Retail Solution | yes | 10 rows, 7 features | 1 local | ₹52,000 | **placeholder, needs confirmation** | 0 (not provided) |
| EF 825 G | Hard Top Freezer cum Chiller | Elanpro | not provided | Retail Solution | yes | 9 rows, 7 features | 1 local | ₹45,500 | **marketplace listing, needs confirmation** | 0 (not provided) |
| ECG 305 | Upright Display Chiller | Elanpro | not provided | Retail Solution | yes | 7 rows, 7 features | 1 local | ₹32,000 | **placeholder, needs confirmation** | 0 (not provided) |
| ECG 1506 | Upright Display Chiller | Elanpro | not provided | Retail Solution | yes | 7 rows, 7 features | 1 local | ₹1,45,000 | **marketplace listing, needs confirmation** | 0 (not provided) |
| EFGV 1000 | Upright Display Freezer | Elanpro | not provided | Retail Solution | yes | 7 rows, 7 features | 1 local + 1 elanpro.net | ₹1,65,000 | **placeholder, needs confirmation** | 0 (not provided) |
| Galaxy | Snacks & Beverages Vending Machine | Elanpro | not provided | Vending Machine | yes | 9 rows, 6 features | 1 local | ₹3,25,000 | **placeholder, needs confirmation** | 0 (not provided) |
| Nova | Elevator Vending Machine | Elanpro | not provided | Vending Machine | yes | 9 rows, 6 features | 1 local | ₹3,90,000 | **placeholder, needs confirmation** | 0 (not provided) |
| Frozone | Frozen Food & Ice Cream Vending Machine | Elanpro | not provided | Vending Machine | yes | 9 rows, 6 features | 1 local | ₹4,50,000 | **placeholder, needs confirmation** | 0 (not provided) |
| Orion | All-Purpose Vending Machine with QR Code | Elanpro | not provided | Vending Machine | yes | 9 rows, 6 features | 1 local + 1 elanpro.net | ₹1,85,000 | **placeholder, needs confirmation** | 0 (not provided) |
| Apollo | Smart Locker for Vending & Storage | Elanpro | not provided | Vending Machine | yes | 9 rows, 6 features | 1 local | ₹2,40,000 | **placeholder, needs confirmation** | 0 (not provided) |

## Categories

| Category | Tagline (neutral, replaces prototype marketing lines) | Products |
|---|---|---|
| Professional Kitchen | For professional kitchens | 5 |
| Bar Refrigeration | For bars and beverage service | 5 |
| Retail Solution | For food and beverage retail | 5 |
| Ice Machine | Dice and flake ice machines | 5 |
| Vending Machine | Cashless vending machines | 5 |
