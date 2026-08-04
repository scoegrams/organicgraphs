# How Industry Packs Work

A pack is the "brain template" for an industry type. It tells the system what kinds of things exist in that org, how they relate to each other, and what questions matter. Every organization picks one pack when it's created — all its record types, relationship types, and workflows come from it.

---

## The four things a pack defines

### 1. Record types
The nouns of the org. What kinds of things exist?

Each record type has:
- `key` — machine identifier, e.g. `"dish"`
- `name` — display name, e.g. `"Dish"`
- `description` — one-liner for the UI
- `icon` — lucide icon name
- `color` — hex, used for graph nodes
- `sensitivity` — `GENERAL | INTERNAL | CONFIDENTIAL | RESTRICTED`
- `fields` — the data fields on each record (text, select, date, currency, etc.)
- `explanation` — the *why*, the *business question*, the *cause* (shown in the recommendation UI)

```ts
rt("dish", "Dish", "A menu item your kitchen prepares.", {
  icon: "utensils",
  color: "#f97316",
  fields: [
    commonFields.status(["Active", "86'd", "Seasonal"]),
    { key: "price", name: "Price", type: "currency" },
    { key: "category", name: "Category", type: "single_select",
      options: ["Appetizer", "Main", "Dessert", "Drink"] },
    commonFields.notes(),
  ],
  why: "Dishes are the primary product — they connect staff, suppliers, and revenue.",
  question: "What is on the menu, who makes it, and where does it come from?",
  cause: "Every restaurant's knowledge graph starts with what it serves.",
})
```

### 2. Relationship types
The verbs. How do things connect?

Each relationship type has:
- `key` — e.g. `"supplier_provides_ingredient"`
- `sourceTypeKey` / `targetTypeKey` — which record types it connects
- `forwardLabel` / `reverseLabel` — readable edge labels (`"provides"` / `"is provided by"`)
- `cardinality` — `one_to_one | one_to_many | many_to_one | many_to_many`

```ts
rel("supplier_provides_ingredient",
    "supplier", "ingredient",
    "provides", "is provided by",
    "many_to_many")
```

The graph explorer uses these labels for the inspector and the Obsidian export. The relationship key also drives brain fan-out rules.

### 3. Workflows
Linear state machines on the primary work unit. Optional.

```ts
{
  key: "dish_approval",
  name: "Dish development",
  recordTypeKey: "dish",
  states: [
    { key: "concept",    name: "Concept" },
    { key: "test",       name: "Kitchen test" },
    { key: "approved",   name: "Approved" },
    { key: "live",       name: "Live on menu", isTerminal: true },
  ],
  transitions: [
    { from: "concept", to: "test" },
    { from: "test",    to: "approved", requiresApproval: true },
    { from: "approved",to: "live" },
  ],
}
```

### 4. Suggested questions
Pre-written queries surfaced in the recommendation / AI brain UI.

```ts
{ id: "unowned_sections", text: "Which menu sections have no chef assigned?" },
{ id: "supplier_risk",    text: "Which dishes depend on a single supplier?" },
```

---

## How a pack becomes an org

When a user completes the onboarding wizard and approves the recommendation:

```
wizard answers
    ↓
assemble.ts  (pack + answers → full schema)
    ↓
seedRealFromWizard  (builds record/relationship definitions in Postgres)
    ↓
graph explorer  (reads definitions + records from DB)
```

The pack's record types become `RecordTypeDefinition` rows. Its relationship types become `RelationshipTypeDefinition` rows. These are what the graph explorer, builder, and Obsidian export all read.

---

## File layout for a new pack

```
src/lib/packs/
├── common.ts          ← shared helpers: rt(), rel(), commonFields, expl()
├── types.ts           ← IndustryPackDef interface
├── index.ts           ← PACKS registry — add your pack here
├── software.ts        ← example: full software company pack
├── construction.ts    ← example: construction project pack
└── restaurant.ts      ← ← ← NEW PACK GOES HERE
```

Then register it:
```ts
// src/lib/packs/index.ts
import { restaurantPack } from "./restaurant";

export const PACKS: IndustryPackDef[] = [
  genericPack,
  publishingPack,
  constructionPack,
  paymentsPack,
  softwarePack,
  restaurantPack,   // ← add here
];
```

---

## The restaurant org — what it needs

A restaurant's knowledge graph is simpler than software. The spine is:

```
Supplier → Ingredient → Dish → Menu → Location
              ↑               ↑
           Staff (Chef)    Staff (Server)
```

**Record types to define:**

| Type | What it is |
|---|---|
| `staff` | Anyone who works there — chef, server, manager |
| `dish` | A menu item |
| `ingredient` | A raw ingredient or prep component |
| `supplier` | A food vendor / purveyor |
| `menu` | A menu edition (brunch, dinner, seasonal) |
| `location` | A physical restaurant location |
| `vendor` | Non-food vendors (POS, linen, waste) |
| `event` | A private event or buyout |

**Primary unit:** `dish` — the restaurant's atomic work product.

**Key relationships:**

| Relationship | Edge |
|---|---|
| `chef_owns_dish` | staff → dish (owns / is owned by) |
| `dish_uses_ingredient` | dish → ingredient (uses / is used in) |
| `supplier_provides_ingredient` | supplier → ingredient (provides / is provided by) |
| `dish_on_menu` | dish → menu (appears on / features) |
| `menu_at_location` | menu → location (served at / serves) |
| `staff_works_at` | staff → location (works at / employs) |
| `dish_paired_with` | dish → dish (paired with / is paired with) |
| `event_at_location` | event → location (held at / hosts) |

**Workflow:** `dish_development` — `Concept → Kitchen test → Approved → Live on menu`

**The graph spine:** `Supplier → Ingredient → Dish → Menu → Location`  
This is the restaurant equivalent of `Client → Project → Feature`.

---

## Field types available

| Type | Use for |
|---|---|
| `short_text` | Names, codes |
| `long_text` | Notes, descriptions |
| `single_select` | Category, status with fixed options |
| `boolean` | Yes/no flags |
| `date` | Seasonal dates, expiry |
| `currency` | Cost, price, spend |
| `email` | Contact info |
| `url` | Links |
| `number` | Quantity, rating |
| `percentage` | Margin, food cost % |

---

## Brain fan-out for restaurants

The `brainFanOut` function in `src/lib/graph/brain-link.ts` defines automatic secondary edges. For a restaurant pack, rules to add:

- **Supplier → Ingredient → Dish**: when an ingredient is linked to a dish, also link the dish's supplier to the dish (`supplier_provides_dish` fan-out).
- **Staff → Dish**: when a chef owns a dish, also suggest linking them to the menu that dish is on.
- **Ingredient → Allergen**: (future) when an ingredient is flagged as an allergen, all dishes using it inherit the flag.

---

## What the wizard would ask for restaurants

The onboarding wizard (`src/lib/wizard.ts`) currently asks:
1. Organization — name, locations, description
2. People — staff names and roles
3. Systems — POS, reservation system, vendors
4. Value & work — dishes, menus, features
5. Security — PCI for payments, health codes
6. Recommendation — generated schema preview

For a restaurant, "Value & work" would ask about dishes and menus rather than software features. The wizard steps are reusable — only the field labels and demo data need to change per industry.
