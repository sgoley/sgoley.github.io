---
title: Public agent for anyone
author: Scott Goley
status: published
published: 2026-05-09
tags: [streamlit, openrouter, agents]
---

# Building This Website Chat

This post explains how the website assistant works.

## Stack

- **Streamlit** for the responsive, embedded UI
- **OpenRouter** as the LLM backend (supporting 200+ models)
- **Markdown files** as the content source (scoped to `/content` directory only)

## Overview

The website chat interface is a **single-screen, embeddable chat widget** designed to be integrated into static websites via an `<iframe>`. It provides an iMessage-style conversation UI with blue user bubbles and dark gray assistant bubbles, all styled with a modern dark theme.

## What It Does

This is a **secure, content-aware assistant** that:

1. **Indexes all markdown files** in the repository's `content/` directory
2. **Searches for relevant articles** based on user questions using keyword matching
3. **Fetches full article content** when needed to provide grounded, contextual answers
4. **Maintains conversation history** to enable follow-up questions within the same session
5. **Never accesses** source code, environment secrets, or files outside the `/content` boundary

## Security & Scope

The chat interface enforces a **strict content boundary**:

- ✅ **Accessible**: All files matching `content/**/*.md`
- ❌ **Not accessible**: Source code, `.env` files, secrets, configuration files, or any path outside `content/`
- ✅ **Startup validation**: If `CONTENT_DIR` is misconfigured, the app fails fast with a clear error

This design ensures users can safely expose the chat widget publicly without revealing sensitive project information.

## Interaction Model

The assistant can:

1. **Search** relevant articles by keyword from user queries
2. **Retrieve** full article content by file slug  
3. **Answer questions** grounded in the retrieved markdown files
4. **Remember context** across multiple messages in a session

## Features & Customization

- **Iframe-ready**: Embed via `https://YOUR-STREAMLIT-APP.streamlit.app/?embed=true`
- **Configurable LLM**: Switch models via `OPENROUTER_MODEL` env var
- **Content limit controls**: Set `MAX_ARTICLE_CONTEXT_CHARS` to control context window
- **Safety modes**: Optional content filtering with configurable blocked terms
- **Message limits**: User input and context are size-limited to prevent abuse

## Learn More

For detailed documentation, implementation details, and deployment instructions, visit the GitHub repository:

**→ [streamlit-openrouter-chat-embed](https://github.com/sgoley/streamlit-openrouter-chat-embed)**

The repo includes setup guides, environment configuration examples, embedding instructions, and contribution guidelines.
