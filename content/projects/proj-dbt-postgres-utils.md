---
title: dbt Postgres Utils
author: Scott Goley
status: published
published: 2026-05-11
tags: [dbt, dbt-core, postgres, analytics-engineering, data-platform]
---

# dbt Postgres Utils

Repository: [github.com/sgoley/dbt-postgres-utils](https://github.com/sgoley/dbt-postgres-utils)  
Upstream ecosystem: [dbt-labs/dbt-core](https://github.com/dbt-labs/dbt-core)

`dbt_postgres_utils` is a **dbt package for PostgreSQL-focused operational macros** that sit around normal model builds: indexing, RBAC, constraints, custom SQL types, extensions, materialized views, FDW helpers, and date utilities.

## What this package provides

### Performance + storage helpers

* `index` / `uindex` for index creation (including advanced index options)
* materialized view support + refresh helpers

### Security + permissions (RBAC)

* role/user creation helpers
* grant/revoke macros for schema and relation privileges
* convenience helpers for target-schema permission management in dbt runs

### Database administration in dbt workflows

* extension management (`create_extension`, `drop_extension`)
* custom type creation (`enum`, `composite`, `domain`)
* key/constraint helpers (`primary`, `unique`, `foreign key`)
* FDW macros for foreign server + mapping + schema import

### Cross-dialect utility macros

* portable date helpers like `dateadd`, `datediff`, and date-spine/date-dim patterns

## Why this is useful for dbt-core users

In many analytics stacks, dbt models are only part of the operational story. This package helps keep PostgreSQL-specific governance and optimization logic **inside dbt-native workflows** rather than scattering ad hoc SQL scripts outside the project.

## Typical usage pattern

Use macros in:

* `on-run-start`
* `on-run-end`
* model `post_hook` blocks

That allows teams to co-locate data modeling and database-operational logic in one package-based workflow.

## Installation

Use dbt Hub package metadata for current versions:

```yaml
packages:
  - package: sgoley/postgres_utils
    version: [">=0.1.0", "<1.0.0"]
```

Then:

```bash
dbt deps
```

## Related projects

* [[proj-dbt-holidates|dbt Holidates]]
