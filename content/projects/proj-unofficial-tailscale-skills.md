---
title: Unofficial Tailscale Skills
author: Scott Goley
status: published
published: 2026-05-27
tags: [tailscale, ai, llm, agent-skills, networking, devops, homelab]
---

# Unofficial Tailscale Skills

Repository: [github.com/sgoley/unofficial-tailscale-skills](https://github.com/sgoley/unofficial-tailscale-skills)

A comprehensive collection of Agent Skills for working with Tailscale services. The skills follow the [Agent Skills specification](https://agentskills.io/specification) and provide detailed guidance for common Tailscale networking tasks across any AI agent or coding assistant that supports the format.

## What it does

* installs as a single package via `gh skill install -g sgoley/unofficial-tailscale-skills`
* provides structured, reusable instructions for six core Tailscale features
* works with Claude Code, Codex CLI, OpenCode, and any agent supporting the Agent Skills spec
* includes troubleshooting guidance and real-world command examples per skill
* cross-references related features across skills

## Available skills

| Skill | Purpose |
|---|---|
| `tailscale-ssh` | Manage Tailscale SSH — enable servers, access controls, check mode |
| `tailscale-dns` | Configure MagicDNS, nameservers, search domains, DNS-over-HTTPS |
| `tailscale-funnel` | Share local services to the public internet via encrypted tunnels |
| `tailscale-cli` | Device management, diagnostics, HTTPS certificates, tab completion |
| `tailscale-serve` | Serve files and services internally over the tailnet via HTTP |
| `tailscale-exit-nodes` | Route all traffic through another tailnet node |

## Skill format

Each skill is a `SKILL.md` file with:

```text
unofficial-tailscale-skills/
├── tailscale-ssh/SKILL.md
├── tailscale-dns/SKILL.md
├── tailscale-funnel/SKILL.md
├── tailscale-cli/SKILL.md
├── tailscale-serve/SKILL.md
└── tailscale-exit-nodes/SKILL.md
```

Each file includes YAML frontmatter (name, description, compatibility), step-by-step instructions with examples, common use cases, and troubleshooting sections.

## Installation

```bash
# GitHub Copilot CLI
gh skill install -g sgoley/unofficial-tailscale-skills

# Claude Code — copy to /.claude in project root
# Codex CLI  — copy to ~/.codex/skills/tailscale-*
# OpenCode   — clone to ~/.opencode/skills/unofficial-tailscale-skills
```

## Why this project matters

AI agents working with infrastructure tasks frequently need Tailscale context: SSH access configuration, DNS routing, service sharing, and exit node setup. Rather than re-explaining these concepts in every project prompt, this package makes that knowledge reusable and composable.

It also serves as a reference implementation of the Agent Skills spec applied to a real-world networking tool.

## Related projects

* [[proj-homelab|Homelab Stacks (Public)]]
* [[proj-aperture-langfuse-relay|Aperture → Langfuse Relay]]
