---
title: RSS Box
author: Scott Goley
status: published
published: 2026-06-02
tags: [rss, inbox, react, fastify, postgres, redis, ai]
---

# RSS Box

Repository: `/Users/admin/Storage/Git/homelab/rss-box`

RSS Box is a private monorepo for an inbox-style RSS and content processing app. It combines a Fastify API, a React/Vite web app, Postgres, Redis, and background jobs so feeds and other inbound sources can be collected, processed, and surfaced in one place.

## What it includes

* `packages/api` for feed ingestion, email/newsletter parsing, job orchestration, and content processing
* `packages/web` for the browser UI
* Postgres for durable application data
* Redis + BullMQ for queues and asynchronous work
* Optional OpenRouter integration for AI-assisted processing

## Deployment shape

The repo is built around Docker Compose. The API container depends on Postgres and Redis, and the stack is configured through environment variables for database, queue, API key, and encryption settings.

## Why it matters

RSS Box is the kind of tool that turns a noisy stream of feeds, newsletters, and inbound articles into a manageable personal workflow. It centralizes reading, triage, and processing behind one local app instead of spreading that work across multiple services.

## Related projects

* [[proj-homelab|Homelab Stacks (Public)]]
