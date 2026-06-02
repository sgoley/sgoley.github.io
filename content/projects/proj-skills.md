---
title: Skills (Agentic Simulation + Tailscale Utilities)
author: Scott Goley
status: published
published: 2026-06-01
tags: [ai, llm, agent-skills, scenario-planning, game-theory, tailscale, devops]
---

# Skills (Agentic Simulation + Tailscale Utilities)

Repository: [github.com/sgoley/skills](https://github.com/sgoley/skills)

`skills` is a broader evolution of the earlier Tailscale-only skill pack: one repository that combines high-stakes decision and simulation workflows with practical infrastructure utility skills.

## What it does

* installs as a single package via `gh skill install sgoley/skills`
* provides reusable skill specs for both strategic preparation and day-to-day operations
* organizes guidance into two categories: `agentic-game-simulation/` and `utils/`
* includes structured workflows, required output formats, and practical command examples
* is designed for agents that support the Agent Skills format

## Repository structure

```text
skills/
├── agentic-game-simulation/
│   ├── write-character-sheet/
│   │   ├── SKILL.md
│   │   ├── REFERENCE.md
│   │   └── EXAMPLES.md
│   └── game-theory-scenario/
│       ├── SKILL.md
│       ├── REFERENCE.md
│       └── EXAMPLES.md
└── utils/
    ├── tailscale-cli/SKILL.md
    ├── tailscale-dns/SKILL.md
    ├── tailscale-exit-nodes/SKILL.md
    ├── tailscale-funnel/SKILL.md
    ├── tailscale-serve/SKILL.md
    └── tailscale-ssh/SKILL.md
```

## Core category: agentic-game-simulation

### `write-character-sheet`

A structured self-profiling workflow that runs an interview, captures constraints and context, and converts responses into evidence-weighted scores plus narrative guidance. Output includes core and derived stats, habits to keep/change, goals by horizon, resources/support, influential inputs, and daily structure.

### `game-theory-scenario`

A scenario-planning workflow for high-stakes interactions. It interviews for context and artifacts, maps actor incentives and pressure points, builds 3-6 branch pathways (cooperative, neutral, adversarial, mixed), and outputs a readiness pack with response menus, risk/escalation plans, and rehearsal drills.

## Utility category: Tailscale operations

| Skill | Focus |
|---|---|
| `tailscale-cli` | Device lifecycle, diagnostics, authentication, routes, certs, and core CLI workflows |
| `tailscale-dns` | MagicDNS, nameservers, split DNS, search domains, and DNS troubleshooting |
| `tailscale-exit-nodes` | Advertising and using exit nodes, LAN access options, and security tradeoffs |
| `tailscale-funnel` | Public sharing via encrypted tunnels, policy prerequisites, cert requirements, and port constraints |
| `tailscale-serve` | Internal tailnet sharing of files/services with status and access patterns |
| `tailscale-ssh` | SSH enablement, ACL-based authorization, check mode, and operational troubleshooting |

## End-to-end workflow

1. Build the **player model** with `/write-character-sheet`.
2. Build the **scenario map** with `/game-theory-scenario`.
3. Stress-test likely branches and prepare fallback moves.
4. Execute in the real world, then iterate your model.
5. Use utility skills (especially Tailscale) for secure networking and service exposure when needed.

## Why this project matters

Many assistants are good at abstract strategy or concrete commands, but not both in one reusable skillset. This repository intentionally combines:

* **human systems modeling** (incentives, behavior, constraints, branch logic)
* **infrastructure execution** (networking, access control, DNS, service sharing)

That makes `skills` useful as both a planning framework and an operator runbook library, with the Tailscale set now one utility slice of a larger agentic toolkit rather than the whole project.

## Related projects

* [[proj-homelab|Homelab Stacks (Public)]]
* [[proj-aperture-langfuse-relay|Aperture → Langfuse Relay]]
