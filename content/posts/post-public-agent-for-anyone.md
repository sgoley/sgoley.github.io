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

The website chat interface is a **single-screen, native in-page chat panel** on the homepage. It uses a modern dark theme, real-time streaming responses, and markdown-style rendering in assistant bubbles.

## What It Does

This is a **secure, content-aware assistant** that:

1. **Builds context from markdown files** in the repository `content/` directory
2. **Selects relevant documents** for each user question using keyword matching
3. **Sends grounded context + conversation history** to the model through the Worker proxy
4. **Maintains conversation history** to enable follow-up questions within the same session
5. **Never accesses** source code, secrets, or files outside the `content/` boundary for chat grounding

## Security & Scope

The chat interface enforces a **strict content boundary**:

- ✅ **Accessible**: All files matching `content/**/*.md`
- ❌ **Not accessible for grounding**: Source code, `.env` files, secrets, configuration files, or any path outside `content/`
- ✅ **Proxy key isolation**: OpenRouter API key lives in Cloudflare Worker secrets, never in browser JavaScript

This design ensures users can safely expose the chat widget publicly without revealing sensitive project information.

## Interaction Model

The assistant can:

1. **Search** relevant articles by keyword from user queries
2. **Attach** selected markdown excerpts to the system context
3. **Answer questions** grounded in those markdown files
4. **Remember context** across multiple messages in a session

## Features & Customization

- **Native UI**: no iframe required
- **Keyboard UX**: Enter sends, Shift+Enter adds a newline
- **Configurable model**: override model via page config or Worker defaults
- **Streaming replies**: token streaming from OpenRouter through the Worker proxy
- **Grounded context file**: generated from markdown + prompt template

## Learn More

For implementation details and deployment instructions, see this repository:

**→ [sgoley.github.io](https://github.com/sgoley/sgoley.github.io)**
