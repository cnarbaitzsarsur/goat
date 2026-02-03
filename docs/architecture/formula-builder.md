# Formula Builder Architecture

> Design document for implementing a formula/expression builder for DuckDB-backed layer data in GOAT.

## Overview

This document outlines the architecture for a formula builder that allows users to create computed columns and perform aggregations on layer data stored in DuckLake (DuckDB + PostgreSQL catalog).

---

## UI Design Sketches

### Main Modal Layout

The Formula Builder opens as a modal dialog (`maxWidth="lg"`), similar to Project Info:

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│   ╔══════════════════════════════════════════════════════════════════════════════╗   │
│   ║  Formula Builder                                                        ✕    ║   │
│   ╠══════════════════════════════════════════════════════════════════════════════╣   │
│   ║                                                                              ║   │
│   ║   ┌────────────────────────────────────────────────────────────────────┐    ║   │
│   ║   │  "population" / "area_km2" * 1000                              fx │    ║   │
│   ║   │                                                                    │    ║   │
│   ║   │                                                                    │    ║   │
│   ║   └────────────────────────────────────────────────────────────────────┘    ║   │
│   ║                                                                              ║   │
│   ║   ┌─────────────────────────────┐    ┌─────────────────────────────────┐   ║   │
│   ║   │  FUNCTIONS                  │    │  FIELDS                         │   ║   │
│   ║   │  ┌───────────────────────┐  │    │                                 │   ║   │
│   ║   │  │ 🔍 Search...          │  │    │  ┌─ Layer: Building Data ─────┐ │   ║   │
│   ║   │  └───────────────────────┘  │    │  │                            │ │   ║   │
│   ║   │                             │    │  │  123  population           │ │   ║   │
│   ║   │  ▼ Math                     │    │  │  1.2  area_km2             │ │   ║   │
│   ║   │     abs             ℹ       │    │  │  Abc  name                 │ │   ║   │
│   ║   │     round           ℹ       │    │  │  Abc  district             │ │   ║   │
│   ║   │     floor           ℹ       │    │  │  📅  created_at            │ │   ║   │
│   ║   │     ceil            ℹ       │    │  │  📍  geometry              │ │   ║   │
│   ║   │     sqrt            ℹ       │    │  │                            │ │   ║   │
│   ║   │     power           ℹ       │    │  └────────────────────────────┘ │   ║   │
│   ║   │                             │    │                                 │   ║   │
│   ║   │  ▶ String                   │    │  Click a field to insert it     │   ║   │
│   ║   │  ▶ Date & Time              │    │  into your formula              │   ║   │
│   ║   │  ▶ Aggregate                │    │                                 │    ║   │
│   ║   │  ▶ Window                   │    └─────────────────────────────────┘    ║   │
│   ║   │  ▶ Spatial                  │                                           ║   │
│   ║   │  ▶ Conditional              │                                           ║   │
│   ║   └─────────────────────────────┘                                           ║   │
│   ║                                                                             ║   │
│   ║   ┌──────────────────────────────────────────────────────────────────────┐  ║   │
│   ║   │  ℹ️ FUNCTION HELP                                                    │  ║   │
│   ║   │  ─────────────────────────────────────────────────────────────────── │  ║   │
│   ║   │  round(x, decimals)                                                  │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   │  Rounds a number to a specified number of decimal places.            │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   │  Parameters:                                                         │  ║   │
│   ║   │    x          The number to round                                    │  ║   │
│   ║   │    decimals   Number of decimal places (default: 0)                  │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   │  Example:   round("price", 2)  →  12.35                              │  ║   │
│   ║   └──────────────────────────────────────────────────────────────────────┘  ║   │
│   ║                                                                             ║   │
│   ║   ┌──────────────────────────────────────────────────────────────────────┐  ║   │
│   ║   │  📊 PREVIEW                                               🔄 Refresh │  ║   │
│   ║   │  ─────────────────────────────────────────────────────────────────── │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   │    population    area_km2       Result                               │  ║   │
│   ║   │    ──────────────────────────────────────                            │  ║   │
│   ║   │    52,000        12.50          4,160.00                             │  ║   │
│   ║   │    38,500         8.20          4,695.12                             │  ║   │
│   ║   │   125,000        45.80          2,729.26                             │  ║   │
│   ║   │    18,200         4.10          4,439.02                             │  ║   │
│   ║   │    67,300        22.30          3,017.94                             │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   │  Result type: DOUBLE                              Showing 5 rows     │  ║   │
│   ║   └──────────────────────────────────────────────────────────────────────┘  ║   │
│   ║                                                                             ║   │
│   ║   ───────────────────────────────────────────────────────────────────────   ║   │
│   ║                                                                             ║   │
│   ║                                          ┌──────────┐   ┌──────────────┐    ║   │
│   ║                                          │  Cancel  │   │    Apply     │    ║   │
│   ║                                          └──────────┘   └──────────────┘    ║   │
│   ║                                                                             ║   │
│   ╚═════════════════════════════════════════════════════════════════════════════╝   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Empty State (No Formula Yet)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│   ╔══════════════════════════════════════════════════════════════════════════════╗   │
│   ║  Formula Builder                                                        ✕    ║   │
│   ╠══════════════════════════════════════════════════════════════════════════════╣   │
│   ║                                                                              ║   │
│   ║   ┌────────────────────────────────────────────────────────────────────┐    ║   │
│   ║   │                                                                    │    ║   │
│   ║   │  Enter a formula, e.g.  "population" / "area_km2"              fx │    ║   │
│   ║   │                                                                    │    ║   │
│   ║   └────────────────────────────────────────────────────────────────────┘    ║   │
│   ║                                                                              ║   │
│   ║   ┌─────────────────────────────┐    ┌─────────────────────────────────┐   ║   │
│   ║   │  FUNCTIONS                  │    │  FIELDS                         │   ║   │
│   ║   │  ...                        │    │  ...                            │   ║   │
│   ║   └─────────────────────────────┘    └─────────────────────────────────┘   ║   │
│   ║                                                                              ║   │
│   ║   ┌──────────────────────────────────────────────────────────────────────┐  ║   │
│   ║   │  💡 QUICK TEMPLATES                                                  │  ║   │
│   ║   │  ─────────────────────────────────────────────────────────────────── │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────┐  │  ║   │
│   ║   │  │  📊 Percent of      │  │  📈 Classify into   │  │  📐 Area    │  │  ║   │
│   ║   │  │     Total           │  │     5 Groups        │  │     in km²  │  │  ║   │
│   ║   │  └─────────────────────┘  └─────────────────────┘  └─────────────┘  │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────┐  │  ║   │
│   ║   │  │  📉 Normalize       │  │  🏷️  Categorize     │  │  📅 Extract │  │  ║   │
│   ║   │  │     (0 to 1)        │  │     (CASE)          │  │     Year    │  │  ║   │
│   ║   │  └─────────────────────┘  └─────────────────────┘  └─────────────┘  │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   └──────────────────────────────────────────────────────────────────────┘  ║   │
│   ║                                                                              ║   │
│   ║   ┌──────────────────────────────────────────────────────────────────────┐  ║   │
│   ║   │  📊 PREVIEW                                                          │  ║   │
│   ║   │  ─────────────────────────────────────────────────────────────────── │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   │                    Enter a formula to see preview                    │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   └──────────────────────────────────────────────────────────────────────┘  ║   │
│   ║                                                                              ║   │
│   ╚══════════════════════════════════════════════════════════════════════════════╝   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Error State (Invalid Formula)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│   ╔══════════════════════════════════════════════════════════════════════════════╗   │
│   ║  Formula Builder                                                        ✕    ║   │
│   ╠══════════════════════════════════════════════════════════════════════════════╣   │
│   ║                                                                              ║   │
│   ║   ┌────────────────────────────────────────────────────────────────────┐    ║   │
│   ║   │  "population" / "unknown_column" * 1000                        fx │    ║   │
│   ║   │  ─────────────────────────────────────────────────────────────────│    ║   │
│   ║   │                     ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲                              │    ║   │
│   ║   └────────────────────────────────────────────────────────────────────┘    ║   │
│   ║                                                                              ║   │
│   ║   ┌──────────────────────────────────────────────────────────────────────┐  ║   │
│   ║   │  ⚠️ ERROR                                                            │  ║   │
│   ║   │  ─────────────────────────────────────────────────────────────────── │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   │  Unknown column: "unknown_column"                                    │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   │  Available columns:                                                  │  ║   │
│   ║   │    • population                                                      │  ║   │
│   ║   │    • area_km2                                                        │  ║   │
│   ║   │    • name                                                            │  ║   │
│   ║   │    • district                                                        │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   └──────────────────────────────────────────────────────────────────────┘  ║   │
│   ║                                                                              ║   │
│   ║   ┌──────────────────────────────────────────────────────────────────────┐  ║   │
│   ║   │  📊 PREVIEW                                                          │  ║   │
│   ║   │  ─────────────────────────────────────────────────────────────────── │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   │              ⚠️  Fix the formula errors to see preview               │  ║   │
│   ║   │                                                                      │  ║   │
│   ║   └──────────────────────────────────────────────────────────────────────┘  ║   │
│   ║                                                                              ║   │
│   ║   ───────────────────────────────────────────────────────────────────────   ║   │
│   ║                                                                              ║   │
│   ║                                          ┌──────────┐   ┌──────────────┐    ║   │
│   ║                                          │  Cancel  │   │    Apply     │    ║   │
│   ║                                          └──────────┘   └─────┬────────┘    ║   │
│   ║                                                               │             ║   │
│   ║                                                          (disabled)         ║   │
│   ╚══════════════════════════════════════════════════════════════════════════════╝   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Function Panel - Expanded Category

```
┌─────────────────────────────┐
│  FUNCTIONS                  │
│  ┌───────────────────────┐  │
│  │ 🔍 Search...          │  │
│  └───────────────────────┘  │
│                             │
│  ▼ Math                     │ ← Click to collapse
│    ┌─────────────────────┐  │
│    │  abs                │◀─│── Click to insert: abs()
│    │  Absolute value     │  │   Shows short description
│    └─────────────────────┘  │
│    ┌─────────────────────┐  │
│    │  round          ℹ️  │◀─│── Click ℹ️ for full docs
│    │  Round to decimals  │  │
│    └─────────────────────┘  │
│    ┌─────────────────────┐  │
│    │  floor              │  │
│    │  Round down         │  │
│    └─────────────────────┘  │
│    ┌─────────────────────┐  │
│    │  ceil               │  │
│    │  Round up           │  │
│    └─────────────────────┘  │
│    ┌─────────────────────┐  │
│    │  sqrt               │  │
│    │  Square root        │  │
│    └─────────────────────┘  │
│    ...more...               │
│                             │
│  ▶ String                   │ ← Click to expand
│  ▶ Date & Time              │
│  ▶ Aggregate                │
│  ▶ Window                   │
│  ▶ Spatial                  │
│  ▶ Conditional              │
└─────────────────────────────┘
```

### Fields Panel - With Type Icons

```
┌─────────────────────────────────┐
│  FIELDS                         │
│                                 │
│  Layer: Population Census       │
│  ─────────────────────────────  │
│                                 │
│  ┌─────────────────────────┐   │
│  │  123   population       │◀──│── INTEGER
│  │        Integer          │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │  1.2   area_km2         │◀──│── DOUBLE
│  │        Double           │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │  Abc   name             │◀──│── VARCHAR
│  │        Text             │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │  Abc   district         │   │
│  │        Text             │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │  📅   created_at        │◀──│── TIMESTAMP
│  │        Date/Time        │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │  📍   geometry          │◀──│── GEOMETRY
│  │        Polygon          │   │
│  └─────────────────────────┘   │
│                                 │
│  ─────────────────────────────  │
│  Click a field to insert       │
│  "field_name" into formula     │
└─────────────────────────────────┘
```

### Preview Table States

**Loading:**
```
┌──────────────────────────────────────────────────────────────────────────┐
│  📊 PREVIEW                                                   🔄 Loading │
│  ─────────────────────────────────────────────────────────────────────── │
│                                                                          │
│                         ◠ ◡ ◠                                            │
│                      Loading preview...                                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**With Results:**
```
┌──────────────────────────────────────────────────────────────────────────┐
│  📊 PREVIEW                                                   🔄 Refresh │
│  ─────────────────────────────────────────────────────────────────────── │
│                                                                          │
│  ┌────────────────┬────────────────┬────────────────────────────────┐   │
│  │  population    │   area_km2     │   Result                       │   │
│  ├────────────────┼────────────────┼────────────────────────────────┤   │
│  │       52,000   │        12.50   │                      4,160.00  │   │
│  │       38,500   │         8.20   │                      4,695.12  │   │
│  │      125,000   │        45.80   │                      2,729.26  │   │
│  │       18,200   │         4.10   │                      4,439.02  │   │
│  │       67,300   │        22.30   │                      3,017.94  │   │
│  └────────────────┴────────────────┴────────────────────────────────┘   │
│                                                                          │
│  Result type: DOUBLE                                    Showing 5 rows   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Compact Trigger (In Right Panel Config)

The trigger component shown in the narrow settings panel:

```
┌─────────────────────────────────────┐
│  Chart Configuration                │
│  ─────────────────────────────────  │
│                                     │
│  Layer                              │
│  ┌─────────────────────────────┐   │
│  │  Population Census       ▼  │   │
│  └─────────────────────────────┘   │
│                                     │
│  Operation                          │
│  ┌─────────────────────────────┐   │
│  │  Custom Formula          ▼  │   │
│  └─────────────────────────────┘   │
│                                     │
│  Formula                            │
│  ┌─────────────────────────────┐   │
│  │  "population" / "ar... ✏️  │◀──── Truncated preview
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │  fx  Edit Formula...        │◀──── Opens modal
│  └─────────────────────────────┘   │
│                                     │
│  Group By                           │
│  ┌─────────────────────────────┐   │
│  │  district                ▼  │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

### Template Selection Dialog

When clicking a quick template:

```
┌────────────────────────────────────────────────────────┐
│  📊 Percent of Total                              ✕    │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Calculate each value as a percentage of the total.    │
│                                                        │
│  Select a column:                                      │
│  ┌──────────────────────────────────────────────┐     │
│  │  population                               ▼  │     │
│  └──────────────────────────────────────────────┘     │
│                                                        │
│  Generated formula:                                    │
│  ┌──────────────────────────────────────────────┐     │
│  │  "population" / SUM("population") OVER () * 100    │
│  └──────────────────────────────────────────────┘     │
│                                                        │
│                        ┌──────────┐  ┌────────────┐   │
│                        │  Cancel  │  │   Insert   │   │
│                        └──────────┘  └────────────┘   │
└────────────────────────────────────────────────────────┘
```

### Mobile / Narrow Screen Layout

```
┌────────────────────────────────────────┐
│  Formula Builder                  ✕    │
├────────────────────────────────────────┤
│                                        │
│  ┌────────────────────────────────┐   │
│  │  "population" / "area" * 1000  │   │
│  │                                │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  Functions ▼ │  Fields ▼        │ │◀─ Tabs instead
│  └──────────────────────────────────┘ │   of side-by-side
│                                        │
│  ▼ Math                                │
│    abs · round · floor · ceil          │
│    sqrt · power · ln · log10           │
│                                        │
│  ▶ String                              │
│  ▶ Date & Time                         │
│  ▶ Aggregate                           │
│                                        │
│  ────────────────────────────────────  │
│  PREVIEW                               │
│  ┌────────────────────────────────┐   │
│  │ pop.    area    Result         │   │
│  │ 52000   12.5    4160.00        │   │
│  │ 38500    8.2    4695.12        │   │
│  │ 125000  45.8    2729.26        │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌──────────┐  ┌──────────────────┐   │
│  │  Cancel  │  │      Apply       │   │
│  └──────────┘  └──────────────────┘   │
└────────────────────────────────────────┘
```

---

## Design Principles

1. **Standard DuckDB SQL syntax** - No custom DSL or magic transformations
2. **Security through whitelisting** - Only allow approved functions
3. **AI-friendly** - LLMs can generate valid expressions
4. **Portable knowledge** - Users learn real SQL that works elsewhere
5. **Templates for beginners** - Common patterns accessible via snippets

## Use Cases

| Use Case | Description | Example |
|----------|-------------|---------|
| **Add Computed Column** | Create new column from existing data | `"population" / "area_km2"` |
| **Classification** | Assign categories based on values | `ntile(5) OVER (ORDER BY "income")` |
| **Normalization** | Scale values to comparable range | `("val" - MIN("val") OVER ()) / (MAX("val") OVER () - MIN("val") OVER ())` |
| **Aggregation** | Summary statistics (dashboard widgets) | `SUM("population") GROUP BY "district"` |
| **Filtering** | Filter features (existing CQL2 support) | `"population" > 10000 AND "type" = 'urban'` |

## Expression Types

### 1. Row Expressions (Field Calculator)

Compute a value for **each row** independently or using window functions.

```sql
-- Simple arithmetic (per-row)
"population" / "area_km2"

-- Using window functions (per-row with aggregate context)
"population" / SUM("population") OVER () * 100

-- Classification
ntile(5) OVER (ORDER BY "population")

-- Conditional
CASE 
    WHEN "value" > 100 THEN 'High'
    WHEN "value" > 50 THEN 'Medium'
    ELSE 'Low'
END
```

**Result:** Same number of rows, with new computed column.

### 2. Aggregation (Summary Statistics)

Collapse rows into summary statistics, optionally grouped.

```sql
-- Total
SELECT SUM("population") FROM layer

-- Grouped
SELECT "district", SUM("population"), AVG("income")
FROM layer
GROUP BY "district"
```

**Result:** Fewer rows (one per group, or single row for totals).

### 3. Filtering (CQL2 - Existing)

Boolean expressions for WHERE clauses. Already implemented via `pygeofilter` and `DuckDBCQLEvaluator`.

```json
{
  "op": "and",
  "args": [
    {"op": ">", "args": [{"property": "population"}, 10000]},
    {"op": "=", "args": [{"property": "type"}, "urban"]}
  ]
}
```

## Allowed Functions (Whitelist)

### Operators

```sql
-- Arithmetic
+  -  *  /  %

-- Comparison
=  <>  !=  <  >  <=  >=

-- Logical
AND  OR  NOT  IS NULL  IS NOT NULL

-- String
||  (concatenation)

-- Other
BETWEEN  IN  LIKE  ILIKE
```

---

## Function Documentation Structure

Each function has documentation in both **English** and **German**. The function registry is stored in a structured format that supports i18n.

### Backend Function Registry (Python)

```python
# goatlib/analysis/expressions/functions.py

from dataclasses import dataclass
from enum import Enum

class FunctionCategory(str, Enum):
    MATH = "math"
    STRING = "string"
    DATE = "date"
    AGGREGATE = "aggregate"
    WINDOW = "window"
    SPATIAL = "spatial"
    CONDITIONAL = "conditional"

@dataclass
class FunctionDoc:
    """Documentation for a single function."""
    name: str
    syntax: str
    example: str
    category: FunctionCategory
    description_en: str
    description_de: str
    return_type: str
    parameters: list[dict]  # [{"name": "x", "type": "NUMERIC", "description_en": "...", "description_de": "..."}]

# Example registry entry
FUNCTION_REGISTRY: dict[str, FunctionDoc] = {
    "abs": FunctionDoc(
        name="abs",
        syntax="abs(x)",
        example='abs("temperature")',
        category=FunctionCategory.MATH,
        description_en="Returns the absolute (positive) value of a number.",
        description_de="Gibt den absoluten (positiven) Wert einer Zahl zurück.",
        return_type="NUMERIC",
        parameters=[{
            "name": "x",
            "type": "NUMERIC",
            "description_en": "The numeric value",
            "description_de": "Der numerische Wert"
        }]
    ),
    # ... more functions
}
```

### Frontend i18n Structure

Function descriptions are stored in the translation files:

```json
// i18n/locales/en/formula.json
{
  "formula_builder": "Formula Builder",
  "functions": "Functions",
  "fields": "Fields",
  "preview": "Preview",
  "preview_result": "Preview ({{count}} rows)",
  "result_type": "Result type",
  "categories": {
    "math": "Math",
    "string": "String",
    "date": "Date & Time",
    "aggregate": "Aggregate",
    "window": "Window",
    "spatial": "Spatial",
    "conditional": "Conditional"
  },
  "fn": {
    "abs": {
      "description": "Returns the absolute (positive) value of a number.",
      "param_x": "The numeric value"
    },
    "round": {
      "description": "Rounds a number to a specified number of decimal places.",
      "param_x": "The number to round",
      "param_d": "Number of decimal places (default: 0)"
    },
    "floor": {
      "description": "Rounds a number down to the nearest integer.",
      "param_x": "The number to round down"
    },
    "ceil": {
      "description": "Rounds a number up to the nearest integer.",
      "param_x": "The number to round up"
    },
    "sqrt": {
      "description": "Returns the square root of a number.",
      "param_x": "The number (must be non-negative)"
    },
    "power": {
      "description": "Returns a number raised to a power.",
      "param_x": "The base number",
      "param_y": "The exponent"
    },
    "ln": {
      "description": "Returns the natural logarithm (base e) of a number.",
      "param_x": "The number (must be positive)"
    },
    "log10": {
      "description": "Returns the base-10 logarithm of a number.",
      "param_x": "The number (must be positive)"
    },
    "greatest": {
      "description": "Returns the largest value from a list of values.",
      "param_values": "Two or more values to compare"
    },
    "least": {
      "description": "Returns the smallest value from a list of values.",
      "param_values": "Two or more values to compare"
    },
    "length": {
      "description": "Returns the number of characters in a string.",
      "param_s": "The input string"
    },
    "lower": {
      "description": "Converts a string to lowercase.",
      "param_s": "The input string"
    },
    "upper": {
      "description": "Converts a string to uppercase.",
      "param_s": "The input string"
    },
    "concat": {
      "description": "Joins two or more strings together.",
      "param_values": "Strings to concatenate"
    },
    "substring": {
      "description": "Extracts a portion of a string.",
      "param_s": "The input string",
      "param_start": "Starting position (1-based)",
      "param_len": "Number of characters to extract"
    },
    "replace": {
      "description": "Replaces occurrences of a substring with another string.",
      "param_s": "The input string",
      "param_from": "Substring to find",
      "param_to": "Replacement string"
    },
    "year": {
      "description": "Extracts the year from a date.",
      "param_d": "The date value"
    },
    "month": {
      "description": "Extracts the month (1-12) from a date.",
      "param_d": "The date value"
    },
    "day": {
      "description": "Extracts the day of the month from a date.",
      "param_d": "The date value"
    },
    "date_diff": {
      "description": "Calculates the difference between two dates.",
      "param_unit": "Unit of measurement ('day', 'month', 'year')",
      "param_d1": "Start date",
      "param_d2": "End date"
    },
    "sum": {
      "description": "Calculates the sum of values. Use with OVER() for row-level or GROUP BY for aggregation.",
      "param_x": "Column to sum"
    },
    "avg": {
      "description": "Calculates the average (mean) of values.",
      "param_x": "Column to average"
    },
    "min": {
      "description": "Returns the minimum value.",
      "param_x": "Column to find minimum"
    },
    "max": {
      "description": "Returns the maximum value.",
      "param_x": "Column to find maximum"
    },
    "count": {
      "description": "Counts the number of non-null values.",
      "param_x": "Column to count (or * for all rows)"
    },
    "median": {
      "description": "Returns the median (middle) value.",
      "param_x": "Column to find median"
    },
    "stddev": {
      "description": "Calculates the standard deviation.",
      "param_x": "Column to calculate"
    },
    "ntile": {
      "description": "Divides rows into n equal groups (buckets). Useful for classifications.",
      "param_n": "Number of buckets (e.g., 5 for quintiles)"
    },
    "percent_rank": {
      "description": "Returns the percentile rank (0 to 1) of each row.",
      "param_none": "No parameters - use with OVER(ORDER BY column)"
    },
    "row_number": {
      "description": "Assigns a unique sequential number to each row.",
      "param_none": "No parameters - use with OVER(ORDER BY column)"
    },
    "lag": {
      "description": "Returns the value from a previous row.",
      "param_x": "Column to get value from",
      "param_n": "Number of rows back (default: 1)"
    },
    "lead": {
      "description": "Returns the value from a following row.",
      "param_x": "Column to get value from",
      "param_n": "Number of rows ahead (default: 1)"
    },
    "st_area": {
      "description": "Calculates the area of a geometry (in CRS units, e.g., m² for metric projections).",
      "param_g": "Geometry column"
    },
    "st_length": {
      "description": "Calculates the length of a line geometry.",
      "param_g": "Geometry column"
    },
    "st_centroid": {
      "description": "Returns the center point of a geometry.",
      "param_g": "Geometry column"
    },
    "st_buffer": {
      "description": "Creates a buffer zone around a geometry.",
      "param_g": "Geometry column",
      "param_dist": "Buffer distance (in CRS units)"
    },
    "st_distance": {
      "description": "Calculates the distance between two geometries.",
      "param_a": "First geometry",
      "param_b": "Second geometry"
    },
    "coalesce": {
      "description": "Returns the first non-null value from a list of values.",
      "param_values": "Values to check (returns first non-null)"
    },
    "nullif": {
      "description": "Returns null if two values are equal, otherwise returns the first value.",
      "param_a": "Value to return",
      "param_b": "Value to compare"
    },
    "case": {
      "description": "Conditional expression that returns different values based on conditions.",
      "param_none": "CASE WHEN condition THEN result ... ELSE default END"
    }
  }
}
```

```json
// i18n/locales/de/formula.json
{
  "formula_builder": "Formel-Editor",
  "functions": "Funktionen",
  "fields": "Felder",
  "preview": "Vorschau",
  "preview_result": "Vorschau ({{count}} Zeilen)",
  "result_type": "Ergebnistyp",
  "categories": {
    "math": "Mathematik",
    "string": "Text",
    "date": "Datum & Zeit",
    "aggregate": "Aggregation",
    "window": "Fenster",
    "spatial": "Räumlich",
    "conditional": "Bedingt"
  },
  "fn": {
    "abs": {
      "description": "Gibt den absoluten (positiven) Wert einer Zahl zurück.",
      "param_x": "Der numerische Wert"
    },
    "round": {
      "description": "Rundet eine Zahl auf eine bestimmte Anzahl von Dezimalstellen.",
      "param_x": "Die zu rundende Zahl",
      "param_d": "Anzahl der Dezimalstellen (Standard: 0)"
    },
    "floor": {
      "description": "Rundet eine Zahl auf die nächste ganze Zahl ab.",
      "param_x": "Die abzurundende Zahl"
    },
    "ceil": {
      "description": "Rundet eine Zahl auf die nächste ganze Zahl auf.",
      "param_x": "Die aufzurundende Zahl"
    },
    "sqrt": {
      "description": "Gibt die Quadratwurzel einer Zahl zurück.",
      "param_x": "Die Zahl (muss nicht-negativ sein)"
    },
    "power": {
      "description": "Potenziert eine Zahl mit einem Exponenten.",
      "param_x": "Die Basiszahl",
      "param_y": "Der Exponent"
    },
    "ln": {
      "description": "Gibt den natürlichen Logarithmus (Basis e) einer Zahl zurück.",
      "param_x": "Die Zahl (muss positiv sein)"
    },
    "log10": {
      "description": "Gibt den Logarithmus zur Basis 10 einer Zahl zurück.",
      "param_x": "Die Zahl (muss positiv sein)"
    },
    "greatest": {
      "description": "Gibt den größten Wert aus einer Liste von Werten zurück.",
      "param_values": "Zwei oder mehr Werte zum Vergleichen"
    },
    "least": {
      "description": "Gibt den kleinsten Wert aus einer Liste von Werten zurück.",
      "param_values": "Zwei oder mehr Werte zum Vergleichen"
    },
    "length": {
      "description": "Gibt die Anzahl der Zeichen in einem Text zurück.",
      "param_s": "Der Eingabetext"
    },
    "lower": {
      "description": "Wandelt einen Text in Kleinbuchstaben um.",
      "param_s": "Der Eingabetext"
    },
    "upper": {
      "description": "Wandelt einen Text in Großbuchstaben um.",
      "param_s": "Der Eingabetext"
    },
    "concat": {
      "description": "Verkettet zwei oder mehr Texte miteinander.",
      "param_values": "Zu verkettende Texte"
    },
    "substring": {
      "description": "Extrahiert einen Teil eines Textes.",
      "param_s": "Der Eingabetext",
      "param_start": "Startposition (1-basiert)",
      "param_len": "Anzahl der zu extrahierenden Zeichen"
    },
    "replace": {
      "description": "Ersetzt Vorkommen eines Teilstrings durch einen anderen Text.",
      "param_s": "Der Eingabetext",
      "param_from": "Zu findender Teilstring",
      "param_to": "Ersatztext"
    },
    "year": {
      "description": "Extrahiert das Jahr aus einem Datum.",
      "param_d": "Der Datumswert"
    },
    "month": {
      "description": "Extrahiert den Monat (1-12) aus einem Datum.",
      "param_d": "Der Datumswert"
    },
    "day": {
      "description": "Extrahiert den Tag des Monats aus einem Datum.",
      "param_d": "Der Datumswert"
    },
    "date_diff": {
      "description": "Berechnet die Differenz zwischen zwei Daten.",
      "param_unit": "Einheit ('day', 'month', 'year')",
      "param_d1": "Startdatum",
      "param_d2": "Enddatum"
    },
    "sum": {
      "description": "Berechnet die Summe der Werte. Verwenden Sie OVER() für zeilenweise oder GROUP BY für Aggregation.",
      "param_x": "Zu summierende Spalte"
    },
    "avg": {
      "description": "Berechnet den Durchschnitt (Mittelwert) der Werte.",
      "param_x": "Spalte für Durchschnittsberechnung"
    },
    "min": {
      "description": "Gibt den Minimalwert zurück.",
      "param_x": "Spalte für Minimalwert"
    },
    "max": {
      "description": "Gibt den Maximalwert zurück.",
      "param_x": "Spalte für Maximalwert"
    },
    "count": {
      "description": "Zählt die Anzahl der nicht-null Werte.",
      "param_x": "Zu zählende Spalte (oder * für alle Zeilen)"
    },
    "median": {
      "description": "Gibt den Median (mittleren Wert) zurück.",
      "param_x": "Spalte für Medianberechnung"
    },
    "stddev": {
      "description": "Berechnet die Standardabweichung.",
      "param_x": "Zu berechnende Spalte"
    },
    "ntile": {
      "description": "Teilt Zeilen in n gleich große Gruppen (Buckets). Nützlich für Klassifikationen.",
      "param_n": "Anzahl der Buckets (z.B. 5 für Quintile)"
    },
    "percent_rank": {
      "description": "Gibt den Perzentilrang (0 bis 1) jeder Zeile zurück.",
      "param_none": "Keine Parameter - mit OVER(ORDER BY spalte) verwenden"
    },
    "row_number": {
      "description": "Weist jeder Zeile eine eindeutige fortlaufende Nummer zu.",
      "param_none": "Keine Parameter - mit OVER(ORDER BY spalte) verwenden"
    },
    "lag": {
      "description": "Gibt den Wert aus einer vorherigen Zeile zurück.",
      "param_x": "Spalte für Wertabfrage",
      "param_n": "Anzahl Zeilen zurück (Standard: 1)"
    },
    "lead": {
      "description": "Gibt den Wert aus einer nachfolgenden Zeile zurück.",
      "param_x": "Spalte für Wertabfrage",
      "param_n": "Anzahl Zeilen voraus (Standard: 1)"
    },
    "st_area": {
      "description": "Berechnet die Fläche einer Geometrie (in KBS-Einheiten, z.B. m² für metrische Projektionen).",
      "param_g": "Geometrie-Spalte"
    },
    "st_length": {
      "description": "Berechnet die Länge einer Liniengeometrie.",
      "param_g": "Geometrie-Spalte"
    },
    "st_centroid": {
      "description": "Gibt den Mittelpunkt einer Geometrie zurück.",
      "param_g": "Geometrie-Spalte"
    },
    "st_buffer": {
      "description": "Erstellt eine Pufferzone um eine Geometrie.",
      "param_g": "Geometrie-Spalte",
      "param_dist": "Pufferabstand (in KBS-Einheiten)"
    },
    "st_distance": {
      "description": "Berechnet den Abstand zwischen zwei Geometrien.",
      "param_a": "Erste Geometrie",
      "param_b": "Zweite Geometrie"
    },
    "coalesce": {
      "description": "Gibt den ersten nicht-null Wert aus einer Liste zurück.",
      "param_values": "Zu prüfende Werte (gibt ersten nicht-null zurück)"
    },
    "nullif": {
      "description": "Gibt null zurück wenn zwei Werte gleich sind, sonst den ersten Wert.",
      "param_a": "Zurückzugebender Wert",
      "param_b": "Vergleichswert"
    },
    "case": {
      "description": "Bedingter Ausdruck, der verschiedene Werte basierend auf Bedingungen zurückgibt.",
      "param_none": "CASE WHEN bedingung THEN ergebnis ... ELSE standard END"
    }
  }
}
```

---

## Function Reference Tables

The following tables provide a quick overview. **Full descriptions are in the i18n files above.**

### Math Functions

| Function | Syntax | Example |
|----------|--------|---------|
| `abs` | `abs(x)` | `abs("temperature")` |
| `round` | `round(x, d)` | `round("price", 2)` |
| `floor` | `floor(x)` | `floor("value")` |
| `ceil` | `ceil(x)` | `ceil("value")` |
| `trunc` | `trunc(x, d)` | `trunc("value", 2)` |
| `sqrt` | `sqrt(x)` | `sqrt("area")` |
| `power` | `power(x, y)` | `power("base", 2)` |
| `exp` | `exp(x)` | `exp("growth_rate")` |
| `ln` | `ln(x)` | `ln("value")` |
| `log10` | `log10(x)` | `log10("value")` |
| `log2` | `log2(x)` | `log2("value")` |
| `sign` | `sign(x)` | `sign("change")` |
| `greatest` | `greatest(a, b, ...)` | `greatest("a", "b", 0)` |
| `least` | `least(a, b, ...)` | `least("a", "b", 100)` |
| `pi` | `pi()` | `pi() * power("radius", 2)` |
| `sin`, `cos`, `tan` | `sin(x)` | `sin(radians("angle"))` |
| `radians`, `degrees` | `radians(x)` | `radians(90)` |

### String Functions

| Function | Syntax | Example |
|----------|--------|---------|
| `length` | `length(s)` | `length("name")` |
| `lower` | `lower(s)` | `lower("name")` |
| `upper` | `upper(s)` | `upper("code")` |
| `trim` | `trim(s)` | `trim("input")` |
| `ltrim`, `rtrim` | `ltrim(s)` | `ltrim("padded")` |
| `concat` | `concat(a, b, ...)` | `concat("first", ' ', "last")` |
| `concat_ws` | `concat_ws(sep, ...)` | `concat_ws(', ', "city", "country")` |
| `substring` | `substring(s, start, len)` | `substring("code", 1, 3)` |
| `left`, `right` | `left(s, n)` | `left("postal", 2)` |
| `replace` | `replace(s, from, to)` | `replace("text", 'old', 'new')` |
| `split_part` | `split_part(s, delim, n)` | `split_part("a-b-c", '-', 2)` |
| `strpos` | `strpos(s, sub)` | `strpos("hello", 'l')` |
| `contains` | `contains(s, sub)` | `contains("name", 'park')` |
| `starts_with` | `starts_with(s, pre)` | `starts_with("code", 'DE')` |
| `ends_with` | `ends_with(s, suf)` | `ends_with("file", '.csv')` |
| `lpad`, `rpad` | `lpad(s, len, pad)` | `lpad("id", 5, '0')` |
| `regexp_replace` | `regexp_replace(s, pat, rep)` | `regexp_replace("text", '\d+', '#')` |

### Date/Time Functions

| Function | Syntax | Example |
|----------|--------|---------|
| `current_date` | `current_date` | `current_date` |
| `current_timestamp` | `current_timestamp` | `current_timestamp` |
| `year` | `year(d)` | `year("created_at")` |
| `month` | `month(d)` | `month("date")` |
| `day` | `day(d)` | `day("date")` |
| `hour` | `hour(t)` | `hour("timestamp")` |
| `minute` | `minute(t)` | `minute("timestamp")` |
| `second` | `second(t)` | `second("timestamp")` |
| `dayofweek` | `dayofweek(d)` | `dayofweek("date")` |
| `dayofyear` | `dayofyear(d)` | `dayofyear("date")` |
| `week` | `week(d)` | `week("date")` |
| `quarter` | `quarter(d)` | `quarter("date")` |
| `date_part` | `date_part(unit, d)` | `date_part('year', "date")` |
| `date_trunc` | `date_trunc(unit, d)` | `date_trunc('month', "date")` |
| `date_diff` | `date_diff(unit, d1, d2)` | `date_diff('day', "start", "end")` |
| `date_add` | `date_add(d, interval)` | `date_add("date", INTERVAL 7 DAY)` |
| `make_date` | `make_date(y, m, d)` | `make_date(2024, 1, 15)` |
| `strftime` | `strftime(fmt, d)` | `strftime('%Y-%m', "date")` |

### Aggregate Functions

| Function | Syntax | Example |
|----------|--------|---------|
| `sum` | `sum(x)` | `SUM("population") OVER ()` |
| `avg` | `avg(x)` | `AVG("income")` |
| `min` | `min(x)` | `MIN("value")` |
| `max` | `max(x)` | `MAX("value")` |
| `count` | `count(x)` | `COUNT("id")` |
| `count(*)` | `count(*)` | `COUNT(*)` |
| `count(DISTINCT x)` | `count(DISTINCT x)` | `COUNT(DISTINCT "category")` |
| `stddev` | `stddev(x)` | `STDDEV("value")` |
| `variance` | `variance(x)` | `VARIANCE("value")` |
| `median` | `median(x)` | `median("income")` |
| `quantile_cont` | `quantile_cont(x, p)` | `quantile_cont("val", 0.75)` |
| `quantile_disc` | `quantile_disc(x, p)` | `quantile_disc("val", 0.5)` |
| `string_agg` | `string_agg(x, sep)` | `string_agg("name", ', ')` |
| `first` | `first(x)` | `first("name")` |
| `last` | `last(x)` | `last("name")` |

### Window Functions

| Function | Syntax | Example |
|----------|--------|---------|
| `ntile` | `ntile(n)` | `ntile(5) OVER (ORDER BY "value")` |
| `percent_rank` | `percent_rank()` | `percent_rank() OVER (ORDER BY "val")` |
| `cume_dist` | `cume_dist()` | `cume_dist() OVER (ORDER BY "val")` |
| `row_number` | `row_number()` | `row_number() OVER (ORDER BY "date")` |
| `rank` | `rank()` | `rank() OVER (ORDER BY "score" DESC)` |
| `dense_rank` | `dense_rank()` | `dense_rank() OVER (ORDER BY "score")` |
| `lag` | `lag(x, n)` | `lag("value", 1) OVER (ORDER BY "date")` |
| `lead` | `lead(x, n)` | `lead("value", 1) OVER (ORDER BY "date")` |
| `first_value` | `first_value(x)` | `first_value("val") OVER (ORDER BY "date")` |
| `last_value` | `last_value(x)` | `last_value("val") OVER (ORDER BY "date")` |

### Spatial Functions (DuckDB Spatial)

| Function | Syntax | Example |
|----------|--------|---------|
| `ST_Area` | `ST_Area(g)` | `ST_Area("geometry")` |
| `ST_Length` | `ST_Length(g)` | `ST_Length("geometry")` |
| `ST_Perimeter` | `ST_Perimeter(g)` | `ST_Perimeter("geometry")` |
| `ST_X`, `ST_Y` | `ST_X(g)` | `ST_X("geometry")` |
| `ST_Centroid` | `ST_Centroid(g)` | `ST_Centroid("geometry")` |
| `ST_PointOnSurface` | `ST_PointOnSurface(g)` | `ST_PointOnSurface("geometry")` |
| `ST_Buffer` | `ST_Buffer(g, dist)` | `ST_Buffer("geometry", 100)` |
| `ST_Envelope` | `ST_Envelope(g)` | `ST_Envelope("geometry")` |
| `ST_Simplify` | `ST_Simplify(g, tol)` | `ST_Simplify("geometry", 10)` |
| `ST_ConvexHull` | `ST_ConvexHull(g)` | `ST_ConvexHull("geometry")` |
| `ST_Transform` | `ST_Transform(g, from, to)` | `ST_Transform("geometry", 'EPSG:4326', 'EPSG:3857')` |
| `ST_NumPoints` | `ST_NumPoints(g)` | `ST_NumPoints("geometry")` |
| `ST_GeometryType` | `ST_GeometryType(g)` | `ST_GeometryType("geometry")` |
| `ST_IsValid` | `ST_IsValid(g)` | `ST_IsValid("geometry")` |
| `ST_IsEmpty` | `ST_IsEmpty(g)` | `ST_IsEmpty("geometry")` |
| `ST_Distance` | `ST_Distance(a, b)` | `ST_Distance("geom_a", "geom_b")` |
| `ST_Intersects` | `ST_Intersects(a, b)` | `ST_Intersects("geometry", "boundary")` |
| `ST_Contains` | `ST_Contains(a, b)` | `ST_Contains("polygon", "point")` |
| `ST_Within` | `ST_Within(a, b)` | `ST_Within("point", "polygon")` |

### Conditional Expressions

```sql
-- CASE expression
CASE 
    WHEN "population" > 1000000 THEN 'Large'
    WHEN "population" > 100000 THEN 'Medium'
    ELSE 'Small'
END

-- Null handling
coalesce("name", 'Unknown')
nullif("value", 0)
ifnull("field", 'default')

-- Simple conditional
if("value" > 0, 'Positive', 'Non-positive')
```

### Type Conversion

```sql
-- CAST syntax
CAST("text_number" AS INTEGER)
CAST("date_string" AS DATE)

-- DuckDB shorthand
"text_number"::INTEGER
"float_col"::VARCHAR

-- Allowed target types:
-- INTEGER, BIGINT, DOUBLE, FLOAT, DECIMAL
-- VARCHAR, TEXT
-- BOOLEAN
-- DATE, TIMESTAMP, TIME
```

## Forbidden Operations (Security)

The following are **NOT allowed** to prevent security issues and unintended consequences:

```sql
-- ❌ DDL/DML operations
SELECT, INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE

-- ❌ Database operations
ATTACH, DETACH, COPY, EXPORT, IMPORT

-- ❌ File system access
read_csv(), read_parquet(), read_json()
write_parquet(), write_csv()
glob(), list_files()

-- ❌ Subqueries
(SELECT ... FROM other_table)

-- ❌ Table references
other_table.column

-- ❌ System functions
current_schema(), current_database()
pg_*, duckdb_*

-- ❌ Statement separators
;

-- ❌ Comments (could hide malicious code)
--, /* */
```

## Expression Templates

Pre-built templates for common operations, showing real DuckDB syntax:

### Percent of Total
```sql
"${column}" / SUM("${column}") OVER () * 100
```

### Quantile Classification (5 classes)
```sql
ntile(5) OVER (ORDER BY "${column}")
```

### Percentile Rank
```sql
percent_rank() OVER (ORDER BY "${column}")
```

### Normalize to 0-1 Range
```sql
("${column}" - MIN("${column}") OVER ()) / 
(MAX("${column}") OVER () - MIN("${column}") OVER ())
```

### Z-Score (Standard Score)
```sql
("${column}" - AVG("${column}") OVER ()) / STDDEV("${column}") OVER ()
```

### Running Sum
```sql
SUM("${column}") OVER (ORDER BY "${order_column}")
```

### Year-over-Year Change
```sql
"${column}" - lag("${column}", 1) OVER (ORDER BY "${date_column}")
```

### Above/Below Median
```sql
CASE 
    WHEN "${column}" > median("${column}") OVER () THEN 'Above Median'
    ELSE 'Below Median'
END
```

### Population Density
```sql
"population" / (ST_Area("geometry") / 1000000)
```

### Distance from Centroid
```sql
ST_Distance(
    "geometry", 
    ST_Centroid(ST_Collect("geometry") OVER ())
)
```

## Backend Architecture

### Validation Flow

```
User Expression
       │
       ▼
┌──────────────────┐
│ Pattern Check    │ ← Regex for dangerous patterns (SELECT, FROM, etc.)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Parse with       │ ← sqlglot library
│ sqlglot          │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ AST Validation   │ ← Check functions against whitelist
│ - Functions      │ ← Check columns exist in schema
│ - Columns        │ ← Reject subqueries, table refs
│ - No subqueries  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ DuckDB Validate  │ ← DESCRIBE SELECT expr FROM table LIMIT 0
│ & Type Inference │   Returns result type
└────────┬─────────┘
         │
         ▼
    Valid Expression
    + Result Type
```

### API Endpoints

```
POST /api/v1/expression/validate
    Request:  { layer_id, expression }
    Response: { valid, error?, result_type? }

POST /api/v1/expression/preview
    Request:  { layer_id, expression, limit: 5 }
    Response: { columns, rows }

GET /api/v1/expression/functions
    Response: { categories: { Math: [...], String: [...], ... } }

GET /api/v1/expression/templates
    Response: { templates: [...] }
```

## Frontend Architecture

### UI Components (Modal Dialog)

The Formula Builder opens as a modal dialog (similar to Project Info), providing adequate space for the editor, function browser, and preview.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Formula Builder                                                          [X]  │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ "population" / "area_km2" * 1000                                        │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─── Functions ────────────────────┐  ┌─── Fields ──────────────────────┐  │
│  │ 🔍 Search functions...           │  │ 📊 population (INTEGER)        │  │
│  │                                  │  │ 📊 area_km2 (DOUBLE)           │  │
│  │ ▼ Math                           │  │ 📝 name (VARCHAR)              │  │
│  │   abs(x)                         │  │ 📅 created_at (TIMESTAMP)      │  │
│  │   round(x, d)       [ℹ️]         │  │ 📍 geometry (GEOMETRY)         │  │
│  │   floor(x)                       │  │                                │  │
│  │   ceil(x)                        │  │ Click field to insert          │  │
│  │   sqrt(x)                        │  │                                │  │
│  │                                  │  │                                │  │
│  │ ▶ String                         │  │                                │  │
│  │ ▶ Date & Time                    │  │                                │  │
│  │ ▶ Aggregate                      │  │                                │  │
│  │ ▶ Window                         │  │                                │  │
│  │ ▶ Spatial                        │  │                                │  │
│  └──────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                               │
│  ┌─ Function Help ───────────────────────────────────────────────────────┐   │
│  │ round(x, d)                                                           │   │
│  │ ──────────────────────────────────────────────────────────────────── │   │
│  │ Rounds a number to a specified number of decimal places.             │   │
│  │                                                                       │   │
│  │ Parameters:                                                           │   │
│  │   x      The number to round                                          │   │
│  │   d      Number of decimal places (default: 0)                        │   │
│  │                                                                       │   │
│  │ Example:  round("price", 2)  →  12.35                                │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  ┌─ Preview (5 rows) ─────────────────────────────────────────── [🔄] ────┐  │
│  │ population │ area_km2  │ Result      │                                 │  │
│  │ 52,000     │ 12.5      │ 4,160.00    │                                 │  │
│  │ 38,500     │ 8.2       │ 4,695.12    │                                 │  │
│  │ 125,000    │ 45.8      │ 2,729.26    │                                 │  │
│  │ 18,200     │ 4.1       │ 4,439.02    │                                 │  │
│  │ 67,300     │ 22.3      │ 3,017.94    │                                 │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  Result type: DOUBLE                                                          │
│                                                                               │
│                                                    [Cancel]    [Apply]        │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Function Help Panel

When a user clicks the [ℹ️] button or hovers over a function, the help panel shows:
- Function name and syntax
- Localized description (from i18n)
- Parameter list with descriptions
- Example code

```tsx
// components/map/common/FormulaBuilder/FunctionHelp.tsx
interface FunctionHelpProps {
  functionName: string;
}

const FunctionHelp: React.FC<FunctionHelpProps> = ({ functionName }) => {
  const { t } = useTranslation("formula");
  
  // Get function metadata from registry
  const func = FUNCTION_REGISTRY[functionName];
  
  return (
    <Box>
      <Typography variant="subtitle2" fontFamily="monospace">
        {func.syntax}
      </Typography>
      <Divider sx={{ my: 1 }} />
      <Typography variant="body2">
        {t(`fn.${functionName}.description`)}  {/* Localized description */}
      </Typography>
      
      <Typography variant="subtitle2" sx={{ mt: 2 }}>
        {t("parameters")}:
      </Typography>
      {func.parameters.map(param => (
        <Box key={param.name} sx={{ ml: 2 }}>
          <Typography variant="body2" component="span" fontFamily="monospace">
            {param.name}
          </Typography>
          <Typography variant="body2" component="span" color="text.secondary">
            {" — "}{t(`fn.${functionName}.param_${param.name}`)}
          </Typography>
        </Box>
      ))}
      
      <Typography variant="subtitle2" sx={{ mt: 2 }}>
        {t("example")}:
      </Typography>
      <Typography variant="body2" fontFamily="monospace" sx={{ bgcolor: "grey.100", p: 1 }}>
        {func.example}
      </Typography>
    </Box>
  );
};
```

### Trigger Component (for right panel)

In the narrow right panel config, show a compact trigger:

```
┌─────────────────────────────────┐
│ Custom Formula                  │
│ ┌─────────────────────────────┐ │
│ │ population / area_km2 * ... │ │  ← Shows truncated formula
│ └─────────────────────────────┘ │
│ [Edit Formula...]               │  ← Opens modal
└─────────────────────────────────┘
```

```tsx
// components/map/common/FormulaBuilder/FormulaTrigger.tsx
interface FormulaTriggerProps {
  expression: string;
  onEdit: () => void;
  label?: string;
}

const FormulaTrigger: React.FC<FormulaTriggerProps> = ({ expression, onEdit, label }) => {
  const { t } = useTranslation("formula");
  
  return (
    <Box>
      {label && <FormLabelHelper label={label} />}
      <TextField
        fullWidth
        size="small"
        value={expression || ""}
        placeholder={t("click_to_add_formula")}
        InputProps={{
          readOnly: true,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={onEdit} size="small">
                <Icon iconName={ICON_NAME.EDIT} />
              </IconButton>
            </InputAdornment>
          ),
        }}
        onClick={onEdit}
        sx={{ cursor: "pointer" }}
      />
      <Button size="small" onClick={onEdit} startIcon={<Icon iconName={ICON_NAME.FUNCTION} />}>
        {expression ? t("edit_formula") : t("add_formula")}
      </Button>
    </Box>
  );
};
```

### Technology Stack

| Component | Technology |
|-----------|------------|
| Editor | Monaco Editor (same as VS Code) |
| Syntax | SQL language mode |
| Autocomplete | Custom provider with columns + functions |
| Validation | Backend API call on debounced input |
| State | React state + React Query |

## Aggregation Builder (Separate UI)

For GROUP BY operations, use a structured form instead of free-form expressions:

```
┌─────────────────────────────────────────────────────────┐
│ Aggregation Builder                                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ METRICS                                                 │
│ ┌─────────────────────────────────────────────────────┐│
│ │ Function   Column          Alias                    ││
│ │ [SUM ▼]    [population ▼]  [total_population   ]    ││
│ │ [AVG ▼]    [income ▼]      [avg_income         ]    ││
│ │                                           [+ Add]   ││
│ └─────────────────────────────────────────────────────┘│
│                                                         │
│ GROUP BY (optional)                                    │
│ ┌─────────────────────────────────────────────────────┐│
│ │ [district ▼] [year ▼]                     [+ Add]   ││
│ └─────────────────────────────────────────────────────┘│
│                                                         │
│ FILTER (optional)                                      │
│ ┌─────────────────────────────────────────────────────┐│
│ │ [Existing Filter Builder - CQL2]                    ││
│ └─────────────────────────────────────────────────────┘│
│                                                         │
│ ORDER BY (optional)                                    │
│ ┌─────────────────────────────────────────────────────┐│
│ │ [total_population ▼] [DESC ▼]             [+ Add]   ││
│ └─────────────────────────────────────────────────────┘│
│                                                         │
│ LIMIT: [100        ]                                   │
│                                                         │
│ Preview:                                               │
│ ┌─────────────────────────────────────────────────────┐│
│ │ district    | total_population | avg_income         ││
│ │ North       | 523,000          | 45,200             ││
│ │ South       | 412,000          | 52,100             ││
│ │ East        | 687,000          | 38,900             ││
│ └─────────────────────────────────────────────────────┘│
│                                                         │
│ [Cancel]                               [Execute]       │
└─────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Backend Foundation
- [ ] Create expression validation module in goatlib
- [ ] Implement function whitelist registry
- [ ] Add sqlglot-based AST validation
- [ ] Create DuckDB type inference
- [ ] Add API endpoints (validate, preview, functions)

### Phase 2: Frontend Expression Builder
- [ ] Create Monaco Editor component with SQL mode
- [ ] Implement column autocomplete from layer schema
- [ ] Implement function autocomplete from registry
- [ ] Add real-time validation with debounce
- [ ] Add preview panel

### Phase 3: Aggregation Builder
- [ ] Create structured aggregation form component
- [ ] Implement metric builder (function + column)
- [ ] Add group by selector
- [ ] Integrate with existing filter builder
- [ ] Add preview with sample results

### Phase 4: Integration
- [ ] Add computed column tool in goatlib
- [ ] Integrate with dashboard widgets
- [ ] Add expression support for styling rules
- [ ] Documentation and user guide

## References

- [DuckDB SQL Reference](https://duckdb.org/docs/sql/introduction)
- [DuckDB Functions](https://duckdb.org/docs/sql/functions/overview)
- [DuckDB Window Functions](https://duckdb.org/docs/sql/window_functions)
- [DuckDB Spatial Extension](https://duckdb.org/docs/extensions/spatial)
- [sqlglot Documentation](https://sqlglot.com/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
