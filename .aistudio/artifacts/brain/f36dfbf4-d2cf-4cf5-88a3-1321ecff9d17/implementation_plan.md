# Real-time Inventory Summary Cards

Add a high-visibility summary header to the Inventory Management page that provides real-time business metrics, including total capital investment (modal), SKU density, and stock health alerts.

### User Review & Critical Decisions

> [!IMPORTANT]
> The "Total Modal" calculation uses the **Weighted Average Cost (WAC/HPP)** stored in the `productCosts` table multiplied by the current `stock` level for each product. This data is only visible to the **OWNER** role to maintain financial confidentiality.

-   **Confirmed Position**: Displayed as a horizontal row of summary cards at the top of the Inventory page (header cards).
-   **Confirmed Metrics**:
    1.  **Total Modal (IDR)**: Sum of (Current Stock × HPP).
    2.  **Total Item (SKU)**: Count of all registered products.
    3.  **Total Physical Units**: Sum of all stock quantities (mixed Pcs/Kg).
    4.  **Low Stock Alert**: Percentage of active products currently below their minimum stock threshold.

---

### 1. Overview & Core Concept

-   **What It Does**: It provides the business owner with an immediate financial snapshot of their warehouse value and operational health without needing to export reports or manually calculate spreadsheets.
-   **Target Audience / Persona**: The Store Owner (Rido) during morning inventory checks or procurement planning.
-   **Key Value**: Reduces the time to understand business liquidity tied up in stock and highlights immediate restock needs.

---

### 2. User Experience & Visual Design

-   **Key User Flows**:
    1.  User navigates to the **Inventory** tab.
    2.  System instantly calculates totals from the local Dexie database.
    3.  A row of 4 compact, high-density cards appears below the page title.
    4.  The "Low Stock" card pulses or changes color (Amber to Red) if the percentage exceeds a critical threshold (e.g., >20% items low).
-   **Visual Identity & Theme**:
    -   *Aesthetic Direction*: Utilitarian Dashboard (SaaS style).
    -   *Layout*: A responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`) with standard container padding.
    -   *Typographic Hierarchy*: Large tabular numerals for primary values (`text-2xl font-black tabular-nums`), small uppercase micro-labels for descriptions.
-   **Interactive Feedback**: Subtle hover lift effects on cards; numeric values will animate/transition smoothly if stock changes occur while the page is open.

---

### 3. Key Product Decisions & Trade-Offs

-   **Decision 1: Real-time Calculation via useLiveQuery**
    -   *Chosen Approach*: Perform the summation on the client-side using `useLiveQuery` results.
    -   *Why*: Provides an "instant" feel where values update immediately as sales or adjustments happen.
    -   *Alternatives Considered*: Server-side aggregation (too slow for a local-first PWA architecture).
-   **Decision 2: Unit Normalization**
    -   *Chosen Approach*: "Total Units" will be a raw sum of base units (e.g., 100 Pcs + 50 Kg = 150 units).
    -   *Why*: Simplicity for a high-level summary. Detailed breakdowns remain available in the product table.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    Inventory.tsx                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │             Summary Stats (Memoized)              │  │
│  │  [Modal]  [SKUs]  [Total Units]  [Low Stock %]    │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│            useLiveQuery(db.products)                    │
│            useLiveQuery(db.productCosts)                │
└──────────────────────────┬──────────────────────────────┘
                           │
                 Dexie (IndexedDB)
```

-   **Data Model & State**:
    -   `products`: Contains `stock`, `minimumStock`, `baseUnit`.
    -   `productCosts`: Contains `hpp` (WAC) per `productId`.
-   **Logic Mapping**:
    -   The calculation will be wrapped in `useMemo` dependent on the `products` and `costs` arrays.
    -   A helper component `<StatCard />` will be used to maintain visual consistency across the 4 metrics.
