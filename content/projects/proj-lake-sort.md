---
title: lake-sort
author: Scott Goley
status: published
published: 2026-11-01
tags: [python, data-lake, iceberg, airflow, ingestion]
featured: 2
shelf: install
part: Built
outcome: Sorts dropzone files into a partitioned lake or Iceberg table, as a job an orchestrator can call.
proof_label: Source
proof_url: https://github.com/sgoley/lake-sort
---

# lake-sort

Repository: [github.com/sgoley/lake-sort](https://github.com/sgoley/lake-sort)

`lake-sort` reads flat files from a dropzone and writes them into a partitioned layout, or straight into an Iceberg table. It is a Python function meant to sit inside Airflow, Prefect, or Dagster, not a service you log into.

The config is a typed job: source URI, destination, how partitions are derived from columns or from the filename, and what happens to a file that fails. Formats include CSV, JSON, Parquet, and ORC. Filesystems go through `fsspec`, so the same job can target S3, GCS, Azure, or a local path.

Failed files can be moved to a dead-letter location with a sidecar error record. The run returns a manifest of what was written.
