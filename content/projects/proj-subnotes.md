---
title: Sub Notes (Public)
author: Scott Goley
status: published
published: 2026-05-11
tags: [ai, notes, youtube, substack, obsidian, docker, react, bun]
---

# Sub Notes (Public)

Repository: [github.com/sgoley/sub-notes-public](https://github.com/sgoley/sub-notes-public)

Sub Notes is a self-hosted, single-user application that ingests YouTube content, generates AI summaries, and syncs output into an Obsidian vault.

## What it does

* subscribe to channels/feeds or process individual URLs
* generate markdown summaries with Gemini
* auto-tag summaries for organization and retrieval
* track token usage/cost metadata
* optionally sync summaries into local Obsidian notes

## Architecture

```text
docker-compose.yml
├── pocketbase   :7070   SQLite-backed data + admin
├── backend      :3333   Bun API + processing pipeline
└── frontend     :9090   React SPA served by nginx
```

## Tech stack

### Frontend

* React + TypeScript + Vite
* Tailwind + shadcn/ui
* TanStack Query + React Router

### Backend

* Bun + TypeScript
* YouTube metadata/transcript handling
* Gemini API integration
* Obsidian file writing workflows

### Data layer

* PocketBase (SQLite) with collections for subscriptions, summaries, tags, and settings
* status lifecycle for generation (`pending -> processing -> completed/failed`)

## Why this project matters

This repo is a practical example of a lightweight personal knowledge pipeline:

1. ingest external media sources,
2. transform into structured markdown artifacts,
3. push outputs into a local notes system for long-term use.

It also demonstrates a clean split between UI, processing API, and local-first persistence with simple Docker deployment.

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

Then open:

* app: `http://localhost:9090`
* PocketBase admin: `http://localhost:7070/_/`

## Related projects

* [[proj-homelab|Homelab Stacks (Public)]]
