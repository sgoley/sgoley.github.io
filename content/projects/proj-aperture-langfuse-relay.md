---
title: Aperture → Langfuse Relay
author: Scott Goley
status: published
published: 2026-05-27
tags: [go, tailscale, langfuse, aperture, ai, observability, docker, homelab]
---

# Aperture → Langfuse Relay

Repository: [github.com/sgoley/unofficial-ts-aperture-langfuse-relay](https://github.com/sgoley/unofficial-ts-aperture-langfuse-relay)

A compact Go service that runs inside a Tailscale tailnet and translates [Aperture](https://tailscale.com/aperture) webhook payloads into [Langfuse](https://langfuse.com) ingestion events. This allows AI observability traces to flow from Aperture's LLM proxy through a private tailnet endpoint into a self-hosted Langfuse instance — without exposing any service to the public internet.

## What it does

* accepts Aperture webhook calls at `POST /hooks/aperture`
* optionally validates incoming requests with `Authorization: Bearer <APERTURE_API_KEY>`
* maps each Aperture request into a `trace-create` + `generation-create` event pair
* preserves full request/response context for meaningful Langfuse traces
* queues events in-memory, returns `202` immediately, then forwards async to Langfuse
* retries transient Langfuse failures (`429`/`5xx`) with bounded exponential backoff
* joins the tailnet directly via embedded `tsnet` — no separate `tailscaled` required

## Architecture

```text
Model clients
    -> Tailscale Aperture (LLM proxy)
        -> webhook event
            -> aperture-langfuse-relay  (tsnet tailnet node)
                -> in-memory queue + worker pool
                    -> Langfuse /api/public/ingestion
                        -> Postgres + ClickHouse + Redis + MinIO
                            -> Langfuse UI / evaluations
```

The relay joins the tailnet as a named `tsnet` node so Aperture can reach it over MagicDNS (`http://<TSNET_HOSTNAME>:8080/hooks/aperture`) without exposing anything to the public internet.

## Deployment options

| Mode | When to use |
|---|---|
| Docker Compose + tsnet | Recommended — runs as a private tailnet node in a container |
| Host process (systemd) + tsnet | VM or bare metal with a process manager |
| Host `tailscaled` + Funnel | Public endpoint; acceptable only with `APERTURE_API_KEY` rotation |

### Docker Compose (recommended)

```bash
cp .env.example .env
# set LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, APERTURE_API_KEY, TS_AUTHKEY
docker compose up -d --build
docker compose logs -f
```

tsnet identity is stored in a persistent volume (`tsnet-state`) so the node stays registered across restarts.

## Tech stack

* **Go** — single binary, multi-stage Docker build
* **tsnet** — embedded Tailscale client; no host `tailscaled` dependency
* In-memory queue with configurable worker pool (`WORKER_COUNT`, `QUEUE_SIZE`)
* Retry logic with jitter/backoff (`RETRY_MAX_ATTEMPTS`, `RETRY_BASE_DELAY`, `RETRY_MAX_DELAY`)
* Health endpoints: `/healthz` (process alive) and `/readyz` (relay usable + tsnet backend running)

## Key environment variables

| Variable | Purpose | Default |
|---|---|---|
| `TSNET_ENABLED` | Run as embedded tailnet node | `true` |
| `TSNET_HOSTNAME` | Node name in the tailnet | — |
| `TSNET_STATE_DIR` | Persistent identity directory | `./.tsnet` |
| `TS_AUTHKEY` | Non-interactive auth for first boot | — |
| `APERTURE_API_KEY` | Optional shared secret for incoming hooks | — |
| `LANGFUSE_PUBLIC_KEY` | Langfuse API credential | required |
| `LANGFUSE_SECRET_KEY` | Langfuse API credential | required |
| `LISTEN_ADDR` | Bind address | `:8080` |
| `QUEUE_SIZE` | In-memory event queue depth | `100` |
| `WORKER_COUNT` | Async forwarding workers | `2` |

## Aperture configuration

```json
"hooks": {
  "langfuse-relay": {
    "url": "http://aperture-langfuse-relay:8080/hooks/aperture",
    "apikey": "<same-value-as-APERTURE_API_KEY>",
    "authorization": "bearer",
    "timeout": "10s"
  }
}
```

## Why this project matters

Langfuse is the observability layer for an LLM usage stack; Aperture is Tailscale's LLM proxy. The two products don't integrate natively, and a direct public webhook between them would expose the Langfuse ingestion API. This relay keeps the path private by running inside the tailnet, adds a sensible queue-and-retry layer in front of Langfuse, and requires no changes to either Aperture or Langfuse configuration beyond adding a webhook target.

It is a practical example of using `tsnet` to embed a Tailscale node directly in an application — no host daemon, no sidecar, no port forwarding.

## Related projects

* [[proj-homelab|Homelab Stacks (Public)]]
* [[proj-unofficial-tailscale-skills|Unofficial Tailscale Skills]]
