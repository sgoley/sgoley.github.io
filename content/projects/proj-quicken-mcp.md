---
title: Quicken MCP Server
author: Scott Goley
status: published
published: 2026-11-01
tags: [python, mcp, duckdb, quicken, personal-finance]
featured: 3
shelf: install
part: Built
outcome: Turns a local Quicken export into a DuckDB database an assistant can query, with SQL limited to SELECT.
proof_label: Source
proof_url: https://github.com/sgoley/quicken-mcp-server
---

# Quicken MCP Server

Repository: [github.com/sgoley/quicken-mcp-server](https://github.com/sgoley/quicken-mcp-server)

A containerized MCP server that loads a Quicken QIF export into DuckDB and exposes the result as tools: list accounts, list and search transactions, category summaries, and a SQL tool.

The SQL tool accepts `SELECT` only. The database stays in memory for the process. Transports are stdio and server-sent events, so a local assistant can talk to the export without a hosted copy of the books.
