# sgoley.github.io

Static personal website (HTML/CSS/JS) with:

- Generated article and project pages from markdown content
- Native async workbench powered by an OpenRouter backend proxy (Cloudflare Worker)
- Consented handoff/feedback packets for visitors who want to leave reusable context

## Architecture

- **Static site**: root pages (`index.html`, `about.html`, `projects.html`, `articles.html`)
- **Markdown source of truth**:
  - `content/posts/*.md`
  - `content/projects/*.md`
- **Prompt template**: `prompts/default_system.txt`
- **Generator**: `scripts/generate_static_articles.py`
  - builds `articles/**` and `projects/**`
  - updates `articles.html` and `projects.html`
  - builds chat context file: `assets/data/chat-context.json`
- **Frontend chat client**: `assets/js/site.js` (guided chat, source cards, packet builder)
- **OpenRouter proxy**: `workers/openrouter-chat-proxy/` (Cloudflare Worker)

## Markdown authoring support

Generated pages support:

- Headings, paragraphs, lists, blockquotes, code fences
- Callouts (`> [!note]`, `> [!warning]`, etc.)
- Links and images
- Tables (pipe-table markdown)
- Wikilinks across docs (for example `[[post-q&a]]`)
- Project iframe shortcode:

```md
{{< iframe src="https://example.com/live-demo" title="Live demo" height="860" >}}
```

## Run locally

1. Generate static pages from markdown:
   ```bash
   python3 scripts/generate_static_articles.py
   ```
2. Serve the repo root with a local static server:
   ```bash
   python3 -m http.server 8000
   ```
3. Open:
   - `http://localhost:8000/`
   - `http://localhost:8000/articles.html`
   - `http://localhost:8000/projects.html`

### Local editing workflow

1. Edit markdown in `content/**` and prompt text in `prompts/default_system.txt`.
2. Re-run:
   ```bash
   python3 scripts/generate_static_articles.py
   ```
3. Refresh the browser.
4. Commit both source and generated files:
   - `content/**`
   - `prompts/default_system.txt`
   - `articles/**`, `projects/**`, `articles.html`, `projects.html`
   - `assets/data/chat-context.json`

### Chat while running locally

- The homepage chat defaults to `/chat`, which is not provided by `python3 -m http.server`.
- To use chat locally, pass a live Worker endpoint in the URL:
  - `http://localhost:8000/?chat_api=https://YOUR-WORKER.workers.dev/chat`

## Native chat setup (Cloudflare Worker + OpenRouter)

### 1) Deploy the Worker

From `workers/openrouter-chat-proxy/`:

```bash
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler deploy
```

Optional vars/bindings in `wrangler.toml`:

- `OPENROUTER_MODEL`
- `OPENROUTER_SITE_TITLE`
- `PUBLIC_SITE_URL`
- `ALLOWED_ORIGINS` (comma-separated)
- `CHAT_CONTEXT_URL`
- `TURNSTILE_SECRET_KEY` secret for server-side challenge verification
- `RATE_LIMIT_KV` binding for per-IP hourly caps
- `FEEDBACK_KV` binding for consented handoff packet storage
- `FEEDBACK_WEBHOOK_URL` secret/var for forwarding consented packets

### 2) Point the website chat to your Worker

Set `data-chat-endpoint` in `index.html`:

```html
<div data-chat-endpoint="https://YOUR-WORKER.workers.dev/chat"></div>
```

Set `data-feedback-endpoint` to the same Worker with `/feedback` when packet
submission should be enabled:

```html
<div data-feedback-endpoint="https://YOUR-WORKER.workers.dev/feedback"></div>
```

Or override at runtime with:

- `?chat_api=https://YOUR-WORKER.workers.dev/chat`

## GitHub Pages deploy

1. Push repository to GitHub.
2. In **Settings -> Pages**:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`

## Automation

Workflow `.github/workflows/generate-static-articles.yml` regenerates static pages and chat context on pushes to:

- `content/**`
- `prompts/**`
- `scripts/generate_static_articles.py`
