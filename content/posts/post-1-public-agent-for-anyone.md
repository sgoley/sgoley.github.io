---
title: Public agent for anyone
author: Scott Goley
status: published
published: 2026-05-09
tags: [openrouter, cloudflare-workers, agents]
---

# Building This Website Chat

This post explains how the website assistant works.

## Stack

- **Native JavaScript chat UI** embedded directly in the homepage
- **Cloudflare Worker** as the OpenRouter proxy backend
- **OpenRouter** as the LLM backend (supporting 200+ models)
- **Markdown files** as the content source (scoped to `/content` only)

## Overview

The website chat interface is a **homepage async workbench**. It combines a grounded chat panel, source cards, guided modes, and a handoff packet builder for visitors who want to leave useful context rather than only ask résumé-style questions.

## What It Does

This is a **secure, content-aware assistant** that:

1. **Builds context from markdown files** in the repository `content/` directory
2. **Selects relevant documents** for each user question using keyword matching
3. **Sends conversation history and mode** to the Worker, which owns prompt assembly and model selection
4. **Maintains conversation history** to enable follow-up questions within the same session
5. **Never accesses** source code, secrets, or files outside the `content/` boundary for chat grounding
6. **Exports or submits handoff packets** with explicit visitor consent

## Security & Scope

The chat interface enforces a **strict content boundary**:

- ✅ **Accessible**: All files matching `content/**/*.md`
- ❌ **Not accessible for grounding**: Source code, `.env` files, secrets, configuration files, or any path outside `content/`
- ✅ **Proxy key isolation**: OpenRouter API key lives in Cloudflare Worker secrets, never in browser JavaScript
- ✅ **Server-owned orchestration**: The browser does not choose the model or send arbitrary system prompts

This design ensures users can safely expose the chat widget publicly without revealing sensitive project information.

## Interaction Model

The assistant can:

1. **Search** relevant articles by keyword from user queries
2. **Ask the Worker to attach** selected markdown excerpts to the system context
3. **Answer questions** grounded in those markdown files
4. **Remember context** across multiple messages in a session
5. **Help draft reusable async handoffs** with goals, constraints, evidence, and open questions

## Features & Customization

- **Native UI**: no iframe required
- **Keyboard UX**: Enter sends, Shift+Enter adds a newline
- **Server-configured model**: the Worker chooses the allowed OpenRouter model
- **Streaming replies**: token streaming from OpenRouter through the Worker proxy
- **Grounded context file**: generated from markdown + prompt template
- **Source cards**: relevant article/project links are shown alongside answers
- **Feedback intake**: consented handoff packets can be copied, downloaded, stored in KV, or forwarded by webhook

## Learn More

For implementation details and deployment instructions, see this repository:

**→ <!---->**[**sgoley.github.io**](https://github.com/sgoley/sgoley.github.io)
