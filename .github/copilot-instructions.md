# Copilot instructions for `sgoley.github.io`

## Build, test, and run commands

### Static content generation (website repo root)

```bash
python3 scripts/generate_static_articles.py
```

This regenerates:

- `articles/posts/*.html` from `content/posts/*.md`
- `projects/*.html` from `content/projects/*.md`
- `articles.html` and `projects.html` index pages
- `assets/data/chat-context.json` from markdown + `prompts/default_system.txt`

### Linting

No dedicated linter command is currently configured in checked-in tooling.

## MCP setup in this repo

- Workspace Playwright MCP config is committed at `.vscode/mcp.json`.
- For Copilot CLI sessions outside VS Code, add the same server with:

```text
/mcp add
```

and configure:

- command: `npx`
- args: `@playwright/mcp@latest`

## High-level architecture

### 1) Static website + generated markdown pages

- Root HTML pages (`index.html`, `about.html`) are hand-authored static pages.
- `scripts/generate_static_articles.py` is the build step for markdown-driven content.
- Markdown source of truth lives in:
  - `content/posts/` -> generated into `articles/posts/`
  - `content/projects/` -> generated into `projects/`
- Prompt source of truth: `prompts/default_system.txt`
- The generator also refreshes top-level TOCs:
  - `articles.html`
  - `projects.html`
  - `assets/data/chat-context.json`

### 2) Markdown rendering pipeline (custom parser)

The generator includes custom parsing for:

- frontmatter metadata (`title`, `author`, `published`, `tags`)
- Obsidian/GitHub callouts (`> [!note]`, `> [!warning]`, etc.)
- fenced code blocks
- wikilinks across collections (`[[post-q&a]]`, `[[project-1]]`, optional alias/heading)
- markdown images
- link-hover image previews when markdown link title is an image URL

### 3) Native chat + Worker proxy

- `index.html` + `assets/js/site.js` + `assets/css/site.css` provide native in-page chat UI.
- `workers/openrouter-chat-proxy/` is the Cloudflare Worker proxy to OpenRouter.
- `assets/data/chat-context.json` is generated from markdown + prompt source and loaded by the native chat.

## Key conventions in this repository

1. **Treat generated files as build artifacts.**  
   Do not hand-edit `articles/**`, `projects/**`, `articles.html`, or `projects.html`; edit markdown source and rerun generator.

2. **Edit source, not generated output.**  
   Content edits belong in `content/**` and prompt edits in `prompts/default_system.txt`.

3. **Keep markdown references in wiki-link style when cross-linking content.**  
   Prefer `[[slug]]` / `[[path/to/slug]]` for internal links so the generator can remap paths correctly.

4. **Preserve frontmatter-driven metadata.**  
   Page header metadata in generated docs comes from frontmatter; avoid introducing alternate metadata patterns without updating parser logic.

5. **When changing generator behavior, regenerate immediately.**  
   Any parser/rendering update in `scripts/generate_static_articles.py` should be followed by regenerating and committing updated output files.
