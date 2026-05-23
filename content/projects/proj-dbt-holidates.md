---
title: dbt Holidates
author: Scott Goley
status: published
published: 2026-05-11
tags: [dbt, dbt-core, holidays, calendar, analytics-engineering, date-dimension]
---

# dbt Holidates

Repository: [github.com/sgoley/dbt-holidates](https://github.com/sgoley/dbt-holidates)  
Upstream ecosystem: [dbt-labs/dbt-core](https://github.com/dbt-labs/dbt-core)

`dbt_holidates` is a dbt package that ships **ready-to-use holiday calendar models** plus a compile-time macro for generating holiday rows across configurable year ranges.

## Included calendars

* US Government holidays
* US Bank holidays
* US Market holidays
* Canada holidays
* China holidays
* unified `holidays` model (all calendars)

All models share a consistent schema, so they can be joined or unioned safely in downstream marts.

## Core use cases

1. Add holiday/observed-day flags to date dimensions
2. Exclude holidays from business-day and SLA calculations
3. Build multi-calendar analytics for global operations
4. Reuse a single canonical package across multiple dbt projects

## Package behavior

* Default generation range: 2000-2035
* Year range is configurable via project vars
* Destination database/schema is configurable via vars
* Macro access: `dbt_holidates.get_holidays(...)`

## Install and run

```yaml
packages:
  - git: "https://github.com/sgoley/dbt-holidates.git"
    revision: v1.0.0
```

```bash
dbt deps
dbt run --select dbt_holidates
dbt test --select dbt_holidates
```

## Why this matters for dbt-core projects

Holiday logic is one of the most repeated bits of analytics plumbing. This package standardizes that logic in a dbt-native way, reducing duplicated business-date SQL and improving consistency across reporting and operations models.

## Related projects

* [[proj-dbt-postgres-utils|dbt Postgres Utils]]
