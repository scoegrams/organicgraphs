# Restaurant & hospitality graph

The restaurant graph has **multiple valid views**, but only one canonical data model. Visual hierarchy must never change relationship semantics.

See also: [How packs work](./how-packs-work.md) · Implementation prompt section in [og-prompt.md](./og-prompt.md).

## Canonical hierarchy and graph invariants

Model the restaurant as a property graph, not as a strict folder tree. Preserve typed relationships as first-class edges.

### Operational hierarchy

Use this hierarchy for navigation, graph ranking, onboarding, and profile summaries:

```text
Restaurant organization
└── Location
    ├── Menu
    │   └── Dish
    │       └── Ingredient
    ├── Staff
    ├── Event
    └── Operational vendor
```

Suppliers are upstream dependencies of ingredients; they are not children of dishes or locations:

```text
Supplier → Ingredient ← Dish → Menu → Location
```

Supporting edges:

```text
Staff → Dish
Staff → Location
Event → Location
Location → Vendor
Dish ↔ Dish
```

### Canonical relationship directions

Store relationships in these directions regardless of visual placement:

```text
staff    → dish        chef_owns_dish
dish     → ingredient  dish_uses_ingredient
supplier → ingredient  supplier_provides_ingredient
dish     → menu        dish_on_menu
menu     → location    menu_at_location
staff    → location    staff_works_at
event    → location    event_at_location
location → vendor      location_uses_vendor
supplier → dish        supplier_provides_dish
dish     → dish        dish_paired_with
```

The visual layout may traverse relationships in reverse to present `Location → Menu → Dish`, but it must never reverse or duplicate stored edges merely to obtain that layout.

### Entity-boundary rules

- `location` means a physical restaurant branch, not the restaurant organization itself.
- `menu` means a menu edition or service menu, not a dish category.
- `dish` is the primary work unit.
- `ingredient` means a raw ingredient or prepared component.
- `supplier` is restricted to food and beverage purveyors.
- `vendor` is restricted to operational providers such as POS, reservations, linen, waste, payroll, and maintenance.
- A staff member is represented by one canonical `staff` node. Chef, server, and manager are roles, not separate record types.
- A dish appearing on multiple menus remains one canonical dish unless the records represent genuinely different recipes or versions.
- `dish_paired_with` is a lateral association and must never affect hierarchy or ownership.
- `supplier_provides_dish` is a derived dependency edge. The authoritative supply facts remain `supplier_provides_ingredient` and `dish_uses_ingredient`.

### Graph integrity rules

1. Every active menu should connect to at least one location.
2. Every live dish should connect to at least one active menu.
3. Every ingredient used by a live dish should preferably have an active supplier; report missing suppliers rather than inventing them.
4. Every generated supplier-to-dish edge must be supported by this path: `Supplier → Ingredient ← Dish`.
5. Removing the final supporting ingredient path must remove or invalidate the derived `supplier_provides_dish` edge.
6. Never connect a supplier directly to a location unless a separately defined relationship explicitly represents that fact.
7. Never classify a POS, reservation platform, linen service, or waste company as a food supplier.
8. Do not create duplicate nodes because of capitalization, punctuation, spacing, or common aliases.
9. Do not create duplicate edges with the same type, source, and target.
10. Prevent accidental self-relationships except where a self-referential relationship is explicitly supported and meaningful.

### Visual hierarchy

Presentation ranks only (must not create edges):

```text
Rank 0: Location
Rank 1: Menu, Staff, Event, Vendor
Rank 2: Dish
Rank 3: Ingredient
Rank 4: Supplier
```

Conceptual views over the same canonical graph:

- Operational: `Location → Menu → Dish → Ingredient`
- Supply-chain: `Supplier → Ingredient → Dish`
- Staffing: `Staff → Dish and Location`

### Label correction

`location_uses_vendor`: forward `uses` · reverse `is used by`

### Key distinction

```text
Visual drill-down: Location → Menu → Dish → Ingredient
Stored edge direction: Dish → Menu → Location
```

That is not a contradiction. The first describes how humans navigate the restaurant; the second describes the grammatical meaning of each relationship.
