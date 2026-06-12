---
title: Marker
author: Scott Goley
status: published
published: 2026-06-02
tags: [homelab, ebooks, markdown, fastapi, python, automation]
---

# Marker

Repository: `/Users/admin/Storage/Git/homelab/marker`

Marker is a small FastAPI app for turning local ebook/library files into Markdown. It scans a configured library, lets you browse and filter files in the browser, queues conversion jobs, and writes Markdown into a matching output tree while keeping the source folder structure intact.

## What it supports

* PDF conversion with `marker-pdf` when available, with `pypdf` fallback
* EPUB conversion via `ebooklib`
* MOBI/AZW3 conversion via Calibre's `ebook-convert`
* DOCX conversion via `pandoc`
* Plain text, Markdown, and HTML sources

## How it works

1. Scan the ebook library root for supported files.
2. Filter, sort, and select files in the web UI.
3. Queue conversion jobs through the API.
4. Write Markdown output to a mirrored directory layout.
5. Store job history and local service state on disk.

## Repository shape

| Area | Purpose |
|---|---|
| `run.py` | Uvicorn entrypoint |
| `service/` | FastAPI routes, scanner, queue, conversion, and writer logic |
| `web/` | Browser UI |
| `data/` | Local job history/state |
| `output/` | Converted Markdown output |

## Why it matters

Marker makes a homelab ebook library searchable and exportable without manually copying content between tools. It is especially useful when you want a local-first conversion workflow that preserves organization and keeps the generated Markdown on your own storage.

## Related projects

* [[proj-homelab|Homelab Stacks (Public)]]
