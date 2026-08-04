import type { IndustryPackDef } from "./types";
import { commonFields, expl, rel, rt } from "./common";

/**
 * Restaurant / hospitality industry pack.
 *
 * Canonical hierarchy (navigation):  Location → Menu → Dish → Ingredient
 * Canonical edge direction (stored):  Dish → Menu → Location
 *
 * Suppliers are upstream dependencies of ingredients — not children of dishes
 * or locations:  Supplier → Ingredient ← Dish → Menu → Location
 *
 * See docs/hospitality.md for full graph invariants and integrity rules.
 */
export const restaurantPack: IndustryPackDef = {
  key: "restaurant",
  version: "1.0.0",
  name: "Restaurant & hospitality",
  description:
    "For restaurants and hospitality groups: locations, menus, dishes, ingredients, suppliers, staff, events, and operational vendors.",
  primaryUnitTypeKey: "dish",
  recordTypes: [
    rt("staff", "Staff", "A team member — owner, chef, server, manager, or host.", {
      icon: "user",
      color: "#0ea5e9",
      sensitivity: "INTERNAL",
      fields: [
        {
          key: "role",
          name: "Role",
          type: "single_select",
          options: [
            "Owner",
            "General manager",
            "Head chef",
            "Sous chef",
            "Line cook",
            "Pastry chef",
            "Sommelier",
            "Server",
            "Bartender",
            "Host",
            "Expeditor",
          ],
        },
        commonFields.email(),
        commonFields.notes(),
      ],
      why: "Staff own dishes, run locations, and serve guests — without them the graph has no accountability.",
      question: "Who owns this dish, who runs this location, and who is on the floor?",
      cause: "People were named as staff members.",
    }),
    rt("team", "Team", "A staff group — Kitchen, Front of house, Bar, Management.", {
      icon: "users",
      color: "#0284c7",
      fields: [
        {
          key: "type",
          name: "Type",
          type: "single_select",
          options: ["Kitchen", "Front of house", "Bar", "Management", "Events", "Catering"],
        },
        commonFields.notes(),
      ],
      why: "Teams group staff by function and sit between the location and individual people in the hierarchy.",
      question: "Who is in this team, which location do they work at, and which dishes do they own?",
      cause: "Staff were captured with roles that map to distinct operational groups.",
    }),
    rt("location", "Location", "A physical restaurant branch or venue.", {
      icon: "map-pin",
      color: "#7c3aed",
      fields: [
        { key: "address", name: "Address", type: "short_text" },
        commonFields.status(["Open", "Closed", "Seasonal", "Coming soon"]),
        { key: "seats", name: "Seats", type: "number" },
        commonFields.notes(),
      ],
      why: "Locations anchor menus, staff, and events to a physical place.",
      question: "Which location serves this menu, and who is on staff there?",
      cause: "Restaurant locations were captured as organizational units.",
    }),
    rt("menu", "Menu", "A menu edition — dinner, brunch, seasonal, tasting.", {
      icon: "book-open",
      color: "#d97706",
      fields: [
        {
          key: "kind",
          name: "Type",
          type: "single_select",
          options: ["Dinner", "Brunch", "Lunch", "Happy hour", "Tasting", "Bar", "Seasonal", "Catering"],
        },
        commonFields.status(["Active", "Draft", "Archived", "Seasonal"]),
        { key: "season", name: "Season / period", type: "short_text" },
        commonFields.notes(),
      ],
      why: "Menus group dishes and connect them to a location and a season.",
      question: "Which dishes are on this menu and which location serves it?",
      cause: "Menu editions organize the restaurant's dish catalog.",
    }),
    rt("dish", "Dish", "A recipe or menu item the kitchen prepares.", {
      icon: "utensils",
      color: "#16a34a",
      fields: [
        {
          key: "category",
          name: "Category",
          type: "single_select",
          options: ["Appetizer", "Soup / salad", "Main", "Side", "Dessert", "Drink", "Cocktail", "Non-alcoholic"],
        },
        commonFields.status(["Concept", "In test", "Approved", "Live", "86'd", "Seasonal"]),
        { key: "price", name: "Price", type: "currency" },
        { key: "cost", name: "Food cost", type: "currency", sensitivity: "CONFIDENTIAL" },
        { key: "allergens", name: "Allergens", type: "short_text" },
        commonFields.notes(),
      ],
      why: "The dish is the primary unit of the restaurant — it connects staff, suppliers, and revenue.",
      question: "Who makes this dish, what goes in it, and where does it appear?",
      cause: "Dishes are the core product of a restaurant.",
    }),
    rt("ingredient", "Ingredient", "A raw ingredient or prepared component used in dishes.", {
      icon: "leaf",
      color: "#65a30d",
      fields: [
        { key: "unit", name: "Unit", type: "short_text" },
        { key: "par_level", name: "Par level", type: "number" },
        commonFields.status(["In stock", "Low", "Out", "Seasonal"]),
        { key: "allergen", name: "Allergen flag", type: "boolean" },
        commonFields.notes(),
      ],
      why: "Ingredients link dishes to suppliers and expose supply-chain risk.",
      question: "Which dishes use this ingredient and who supplies it?",
      cause: "Ingredient tracking connects the kitchen to the supply chain.",
    }),
    rt("supplier", "Supplier", "A food or beverage purveyor — produce, meat, seafood, dairy, wine.", {
      icon: "truck",
      color: "#b45309",
      sensitivity: "INTERNAL",
      fields: [
        {
          key: "category",
          name: "Category",
          type: "single_select",
          options: ["Produce", "Meat", "Seafood", "Dairy", "Bakery", "Wine & spirits", "Specialty", "Dry goods", "Other"],
        },
        { key: "contact", name: "Contact", type: "email" },
        { key: "delivery_days", name: "Delivery days", type: "short_text" },
        { key: "lead_time", name: "Lead time (days)", type: "number" },
        commonFields.status(["Active", "On hold", "Inactive"]),
        commonFields.notes(),
      ],
      why: "Suppliers are the upstream dependency for every dish — knowing who supplies what exposes single-supplier risk.",
      question: "Which ingredients come from this supplier, and which dishes depend on them?",
      cause: "Supply chain visibility was identified as a key operational need.",
    }),
    rt("vendor", "Operational vendor", "A non-food operational provider — POS, reservations, linen, waste, payroll, maintenance.", {
      icon: "plug",
      color: "#6366f1",
      sensitivity: "INTERNAL",
      fields: [
        {
          key: "category",
          name: "Category",
          type: "single_select",
          options: ["POS", "Reservations", "Delivery", "Linen & laundry", "Waste", "Payroll", "Accounting", "Marketing", "Comms", "Maintenance", "Other"],
        },
        { key: "cost", name: "Monthly cost", type: "currency", sensitivity: "CONFIDENTIAL" },
        { key: "contract_end", name: "Contract end", type: "date" },
        commonFields.status(["Active", "Trial", "Cancelled"]),
        { key: "url", name: "URL", type: "url" },
        commonFields.notes(),
      ],
      why: "Operational vendors are real dependencies and real spend — making them first-class shows what keeps the restaurant running.",
      question: "Which vendors support each location and what does it cost?",
      cause: "Operational tools were captured in the systems step.",
    }),
    rt("event", "Event", "A private dining, buyout, or catering event.", {
      icon: "calendar",
      color: "#0891b2",
      sensitivity: "INTERNAL",
      fields: [
        { key: "date", name: "Date", type: "date" },
        { key: "guest_count", name: "Guest count", type: "number" },
        { key: "revenue", name: "Revenue", type: "currency", sensitivity: "CONFIDENTIAL" },
        commonFields.status(["Inquiry", "Confirmed", "Completed", "Cancelled"]),
        { key: "contact", name: "Contact", type: "email" },
        commonFields.notes(),
      ],
      why: "Events are high-value engagements that connect locations, staff, and menus.",
      question: "Which staff is running this event, at which location, and what is the revenue?",
      cause: "Private dining and events were listed as a revenue source.",
    }),
  ],
  relationshipTypes: [
    // Operational hierarchy: stored edge direction is always bottom-up (child → parent)
    rel("dish_on_menu",              "dish",       "menu",       "appears on",    "features",           "many_to_many"),
    rel("menu_at_location",          "menu",       "location",   "served at",     "serves",             "many_to_many"),

    // Staff
    rel("chef_owns_dish",            "staff",      "dish",       "owns",          "is owned by",        "one_to_many"),
    rel("staff_works_at",            "staff",      "location",   "works at",      "employs",            "many_to_many"),
    rel("staff_in_team",             "staff",      "team",       "part of",       "includes",           "many_to_many"),
    rel("team_at_location",          "team",       "location",   "based at",      "employs team",       "many_to_many"),

    // Supply chain
    rel("dish_uses_ingredient",      "dish",       "ingredient", "uses",          "is used in",         "many_to_many"),
    rel("supplier_provides_ingredient", "supplier","ingredient", "provides",      "is provided by",     "many_to_many"),

    // Derived supply-chain shortcut (must be supported by ingredient path)
    rel("supplier_provides_dish",    "supplier",   "dish",       "supplies",      "is supplied by",     "many_to_many"),

    // Operations
    rel("location_uses_vendor",      "location",   "vendor",     "uses",          "is used by",         "many_to_many"),
    rel("event_at_location",         "event",      "location",   "held at",       "hosts",              "many_to_one"),

    // Lateral / pairing (must not affect hierarchy)
    rel("dish_paired_with",          "dish",       "dish",       "is paired with", "is paired with",    "many_to_many"),
  ],
  workflows: [
    {
      key: "dish_development",
      name: "Dish development",
      recordTypeKey: "dish",
      states: [
        { key: "concept",     name: "Concept" },
        { key: "kitchen_test",name: "Kitchen test" },
        { key: "approved",    name: "Approved",     },
        { key: "live",        name: "Live on menu", isTerminal: true },
      ],
      transitions: [
        { from: "concept",      to: "kitchen_test" },
        { from: "kitchen_test", to: "approved",    requiresApproval: true },
        { from: "approved",     to: "live" },
      ],
      explanation: expl(
        "Tracks a dish from idea to the menu, with a kitchen test gate.",
        "Which dishes are being tested and which are live?",
        "Standard restaurant R&D process.",
      ),
    },
  ],
  questions: [
    { id: "unowned_dishes",     text: "Which dishes have no chef assigned?" },
    { id: "supplier_risk",      text: "Which dishes depend on a single supplier?" },
    { id: "missing_supplier",   text: "Which ingredients have no active supplier?" },
    { id: "menu_without_location", text: "Which menus are not linked to a location?" },
    { id: "live_dishes_86d",    text: "Which dishes were recently 86'd?" },
    { id: "low_ingredient_stock", text: "Which ingredients are low or out of stock?" },
    { id: "event_pipeline",     text: "Which events are confirmed for next month?" },
  ],
  importMappings: [
    { key: "menu_csv",     label: "Menu items (CSV)",    targetRecordTypeKey: "dish",     columns: { Name: "displayName", Category: "category", Price: "price" } },
    { key: "supplier_csv", label: "Suppliers (CSV)",     targetRecordTypeKey: "supplier", columns: { Name: "displayName", Category: "category" } },
    { key: "staff_csv",    label: "Staff roster (CSV)",  targetRecordTypeKey: "staff",    columns: { Name: "displayName", Role: "role", Email: "email" } },
  ],
};
