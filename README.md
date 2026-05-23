# sgoley.github.io

Static personal website (HTML/CSS/JS) with:

- Generated article and project pages from markdown content
- Native in-page chat UI powered by an OpenRouter backend proxy (Cloudflare Worker)

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
- **Frontend chat client**: `assets/js/site.js` (native embedded chat)
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

## Local workflow

1. Edit markdown in `content/**` and prompt text in `prompts/default_system.txt`.
2. Regenerate static output:
   ```bash
   python3 scripts/generate_static_articles.py
   ```
3. Commit both source and generated files:
   - `content/**`
   - `prompts/default_system.txt`
   - `articles/**`, `projects/**`, `articles.html`, `projects.html`
   - `assets/data/chat-context.json`

## Native chat setup (Cloudflare Worker + OpenRouter)

### 1) Deploy the Worker

From `workers/openrouter-chat-proxy/`:

```bash
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler deploy
```

Optional vars in `wrangler.toml`:

- `OPENROUTER_MODEL`
- `OPENROUTER_SITE_TITLE`
- `ALLOWED_ORIGINS` (comma-separated)

### 2) Point the website chat to your Worker

Set `data-chat-endpoint` in `index.html`:

```html
<div data-chat-endpoint="https://YOUR-WORKER.workers.dev/chat"></div>
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
