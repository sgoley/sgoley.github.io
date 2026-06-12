---
title: Homelab Stacks (Public)
author: Scott Goley
status: published
published: 2026-05-11
tags: [homelab, docker, caddy, tailscale, infrastructure, devops]
---

# Homelab Stacks (Public)

Repository: [github.com/sgoley/homelab-stacks-public](https://github.com/sgoley/homelab-stacks-public)

This document is a reader-focused overview of the stack in a homelab stack definition repository (non-public).  
It explains how traffic flows across LAN and remote (Tailnet) access, how services are connected, and what each container does — without publishing secrets, environment values, or explicit port mappings.

---

## 1) What this stack is

This is a single-host Docker Compose homelab that runs:

- Home automation
- Workflow orchestration and automation
- Secure managed file transfer (SFTP)
- [Internal operations tools](https://github.com/sgoley/maitredb)
- AI tooling + observability
- [Private networking/access via Tailscale](https://github.com/sgoley/skills)

Design goals:

1. One Compose file as source of truth
2. Reverse-proxy-first access pattern through Caddy
3. LAN + Tailnet reachability with the same internal DNS names
4. Minimal direct service exposure
5. Host-attached storage shared over SMB for LAN/Tailnet file access

---

## 2) Topology at a glance

```text
                                ┌───────────────────────────────┐
                                │         Tailnet (WAN)         │
                                │  Laptops / phones / remote PC │
                                └───────────────┬───────────────┘
                                                │
                                      (encrypted mesh VPN)
                                                │
┌───────────────────────────────┐               │              ┌───────────────────────────────┐
│            LAN                │               │              │      External Tailnet Node    │
│   Home devices + desktops     │               │              │       (Tailscale Aperture)    │
└───────────────┬───────────────┘               │              └───────────────┬───────────────┘
                │                               │                              │
        (local DNS rewrite)             (split DNS + subnet route)             │
                │                               │                              │
                └───────────────┬───────────────┴───────────────┬──────────────┘
                                │                               │
                         ┌──────▼───────────────────────────────▼──────┐
                         │           Homelab Host (Docker)             │
                         │                                              │
                         │  Caddy (primary ingress)                    │
                         │  + app containers on shared Docker network  │
                         │                                              │
                         │  Tailnet-native sidecars:                   │
                         │   - Golink                                  │
                         │   - Aperture→Langfuse relay                 │
                         └──────────────────────────────────────────────┘
```

---

## 3) Access model (LAN + remote)

### LAN path

```text
LAN Client
   -> local DNS wildcard for *.homelab.internal
   -> Caddy ingress on homelab host
   -> target container service
```

### Remote path (via Tailscale)

```text
Remote Tailnet Client
   -> Tailnet Split DNS for homelab.internal
   -> subnet route to home LAN
   -> Caddy ingress on homelab host
   -> target container service
```

### SMB file-share path (via Samba)

```text
LAN or Tailnet Client (Finder/Cyberduck)
   -> SMB to homelab host LAN IP
   -> Samba container (host networking)
   -> /mnt/data/{documents,shares,backups}
```

### Tailnet-native path (does not require Caddy)

```text
Tailnet Client / Tailnet Service
   -> MagicDNS name of tsnet service
   -> Golink OR Aperture→Langfuse relay
```

---

## 4) Service routing map

```text
                   ┌──────────────────────┐
                   │        Caddy         │
                   │   reverse proxy +    │
                   │  policy enforcement  │
                   └───────┬──────────────┘
                           │
       ┌───────────────────┼───────────────────────────────────────────────┐
       │                   │                                               │
   ha.homelab.internal  airflow.homelab.internal                    n8n.homelab.internal
       │                   │                                               │
  Home Assistant       Airflow API server                         n8n editor/admin
                                                                  (Tailnet-auth gated)
       │
       ├── n8n-webhook.homelab.internal -> n8n webhook handlers (path-restricted)
       ├── portainer.homelab.internal   -> Portainer
       ├── sftpgo.homelab.internal      -> SFTPGo web/admin surface (network-restricted)
       ├── uptime.homelab.internal      -> Uptime Kuma
       ├── subnotes.homelab.internal    -> Subnotes frontend
       ├── subnotes-api.homelab.internal-> Subnotes backend
       ├── subnotes-pb.homelab.internal -> Subnotes PocketBase
       ├── opencode.homelab.internal    -> OpenCode (network-restricted)
       ├── langfuse.homelab.internal    -> Langfuse web (network-restricted)
       └── ollama.homelab.internal      -> Ollama (optional profile)
```

---

## 5) Full container inventory (current Compose)

> Scope: all containers defined in `docker-compose.yml` in this repo.

| Container | Role | Exposure pattern |
|---|---|---|
| `homeassistant` | Home automation core | Via Caddy hostname |
| `airflow-postgres` | Airflow metadata DB | Internal only |
| `airflow-init` | Airflow bootstrap/migrations | Internal one-shot job |
| `airflow-apiserver` | Airflow API/UI backend | Via Caddy hostname |
| `airflow-scheduler` | Airflow scheduling | Internal only |
| `airflow-dag-processor` | Airflow DAG parsing | Internal only |
| `airflow-triggerer` | Airflow async trigger service | Internal only |
| `n8n-postgres` | n8n DB | Internal only |
| `n8n` | Automation engine | Via Caddy hostname(s) |
| `portainer` | Docker management UI | Via Caddy hostname |
| `sftpgo` | Managed SFTP service for workflow file exchange | SFTP endpoint + restricted Caddy hostname |
| `uptime-kuma` | Monitoring UI/check engine | Via Caddy hostname |
| `caddy` | Reverse proxy ingress | Primary entrypoint |
| `watchtower` | Automated image update runner | Internal daemon |
| `samba` | SMB/CIFS file sharing for host storage | LAN IP over SMB (reachable remotely via Tailnet subnet route) |
| `opencode` | Headless coding/web assistant service | Via restricted Caddy route |
| `langfuse-postgres` | Langfuse DB | Internal only |
| `langfuse-clickhouse` | Langfuse analytics store | Internal only |
| `langfuse-redis` | Langfuse cache/queue backend | Internal only |
| `langfuse-minio` | Langfuse object storage backend | Internal only |
| `langfuse-worker` | Langfuse async workers | Internal only |
| `langfuse-web` | Langfuse web/API surface | Via restricted Caddy route |
| [`aperture-langfuse-relay`](https://github.com/sgoley/unofficial-ts-aperture-langfuse-relay) | Receives Aperture hooks, forwards ingestion to Langfuse | Tailnet-native endpoint |
| `golink` | Private tailnet shortlinks | Tailnet-native endpoint |
| `ollama` *(optional)* | Local model serving | Via Caddy hostname (when enabled) |
| [`subnotes-pocketbase`](https://github.com/sgoley/sub-notes-public) | Subnotes data backend | Via Caddy hostname |
| [`subnotes-backend`](https://github.com/sgoley/sub-notes-public) | Subnotes API/transcript processing | Via Caddy hostname |
| [`subnotes-frontend`](https://github.com/sgoley/sub-notes-public) | Subnotes UI | Via Caddy hostname |

---

## 6) Internal service mesh (Docker network view)

```text
                    ┌───────────────────────────────────────────────┐
                    │          Shared Docker network                │
                    │                  "homelab"                    │
                    └───────────────────────────────────────────────┘

  [Ingress/Edge]         [Automation]             [AI / Observability]         [Content Apps]
  ───────────────        ────────────             ────────────────────         ──────────────
  Caddy                 Airflow API              Langfuse Web                  Subnotes Frontend
  Watchtower            Airflow Scheduler        Langfuse Worker               Subnotes Backend
  Portainer             Airflow DAG Proc         Langfuse Postgres             Subnotes PocketBase
  SFTPGo
  Uptime Kuma           Airflow Triggerer        Langfuse ClickHouse
  Home Assistant*       Airflow Postgres         Langfuse Redis
  n8n + n8n-postgres                            Langfuse MinIO
                                                OpenCode
                                                Ollama (optional)
                                                Aperture→Langfuse relay

  *Home Assistant uses host networking, but still participates in the overall ingress model.
```

---

## 7) Tailnet routes and roles

```text
                           Tailnet
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
   Host subnet-router     Caddy tsnet node     Golink tsnet node
   (advertises home LAN)  (auth-aware ingress) (private shortlinks)
                              │
                              └───────────────┐
                                              │
                                  Aperture→Langfuse relay tsnet node
                                  (webhook receiver for Aperture)
```

What this enables:

1. Remote clients can resolve and reach internal app hostnames over Tailnet.
2. Certain services can be reached as direct Tailnet nodes (Golink, relay) without passing through Caddy.
3. Sensitive app surfaces can require tailnet identity policy before access.

---

## 8) Golink shortcuts currently enabled

These private shortlinks are served by the `golink` Tailnet-native service and resolve to internal app URLs.

| Short | Destination |
|---|---|
| `airflow` | `https://airflow.homelab.internal` |
| `ha` | `https://ha.homelab.internal` |
| `langfuse` | `https://langfuse.homelab.internal` |
| `lf` | `https://langfuse.homelab.internal` |
| `n8n` | `https://n8n.homelab.internal` |
| `ollama` | `https://ollama.homelab.internal` |
| `port` | `https://portainer.homelab.internal` |
| `portainer` | `https://portainer.homelab.internal` |
| `sftp` | `https://sftpgo.homelab.internal/` |
| `sftpgo` | `https://sftpgo.homelab.internal/` |
| `subnotes` | `https://subnotes.homelab.internal/` |
| `uptime` | `https://uptime.homelab.internal` |

---

## 9) AI observability pipeline (Aperture -> relay -> Langfuse)

```text
Model client(s) -> Tailscale Aperture -> webhook event
                                      -> Aperture→Langfuse relay (tailnet endpoint)
                                      -> Langfuse ingestion API
                                      -> Langfuse storage backends
                                         (Postgres + ClickHouse + Redis + MinIO)
                                      -> Langfuse UI/API
```

Why this split exists:

- Keeps Aperture integration decoupled from Langfuse internals.
- Allows strict private transport over Tailnet.
- Preserves event context for tracing/evaluation workflows.

---

## 10) Security posture (public-safe summary)

- Secret values are stored outside Git in local runtime configuration.
- Most services are not directly exposed; Caddy is the primary ingress layer.
- App-level route controls are applied for higher-risk surfaces.
- Tailnet is used for private remote access and policy-based identity controls.
- Update automation is handled by an in-stack updater container.

---

## 11) Operational behavior

- A single Compose command brings the stack up/down.
- Stateful components persist data in named volumes.
- Host USB storage is mounted at `/mnt/data` (exFAT) and exported through Samba shares.
- Optional workloads (like local model serving) are profile-gated.
- Health checks and dependency gates coordinate startup order for core services.

---

## 12) Migration in progress

- Alertanything is being phased out in favor of changedetection.io for web/page monitoring.
- This transition is in progress; update the public routing and inventory sections once changedetection.io is present in the active Compose stack and reverse-proxy map.

---

## 13) Reader takeaway

This homelab is built as a private-first, reverse-proxied, Tailnet-enabled application platform: one host, many services, one ingress model, and a clear split between internal-only backends and user-facing entrypoints.

## Related projects

* [[proj-marker|Marker]]
* [[proj-rss-box|RSS Box]]
