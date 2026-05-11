# Copilot instructions for `sgoley.github.io`

## Build, test, and run commands

### Static content generation (website repo root)

```bash
python3 scripts/generate_static_articles.py
```

This regenerates:

- `articles/posts/*.html` from `streamlit/content/posts/*.md`
- `projects/*.html` from `streamlit/content/projects/*.md`
- `articles.html` and `projects.html` index pages

### Streamlit app local run

```bash
cd streamlit
source .venv/bin/activate
streamlit run src/app.py
```

### Streamlit tests (from `streamlit/`)

Run full suite:

```bash
source .venv/bin/activate
pytest -q
```

Run one test:

```bash
source .venv/bin/activate
pytest -q tests/test_content_service.py::test_list_and_get_articles
```

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
- Markdown source of truth lives in the `streamlit` submodule:
  - `streamlit/content/posts/` -> generated into `articles/posts/`
  - `streamlit/content/projects/` -> generated into `projects/`
- The generator also refreshes top-level TOCs:
  - `articles.html`
  - `projects.html`

### 2) Markdown rendering pipeline (custom parser)

The generator includes custom parsing for:

- frontmatter metadata (`title`, `author`, `published`, `tags`)
- Obsidian/GitHub callouts (`> [!note]`, `> [!warning]`, etc.)
- fenced code blocks
- wikilinks across collections (`[[post-q&a]]`, `[[project-1]]`, optional alias/heading)
- markdown images
- link-hover image previews when markdown link title is an image URL

### 3) Embedded Streamlit chat app (separate repo, checked in as submodule)

- `streamlit/src/app.py` wires UI + services and is embedded by `index.html`.
- `ContentService` enforces a strict `content/**` boundary.
- `ChatService` uses tool-calling (`lookup_articles`, `get_article`) to ground answers in markdown.
- `SafetyService` applies prompt-injection and blocked-term checks before LLM calls.

### 4) Cross-repo CI automation

- In `streamlit` repo: `.github/workflows/dispatch-website-regeneration.yml` dispatches `streamlit-content-updated`.
- In website repo: `.github/workflows/generate-static-articles.yml` receives dispatch, updates submodule SHA, regenerates static pages, and commits generated output.

## Key conventions in this repository

1. **Treat generated files as build artifacts.**  
   Do not hand-edit `articles/**`, `projects/**`, `articles.html`, or `projects.html`; edit markdown source and rerun generator.

2. **`streamlit/` is a git submodule, not a normal folder.**  
   Content and app changes usually happen in the streamlit repo; website repo then tracks the updated submodule pointer.

3. **Keep markdown references in wiki-link style when cross-linking content.**  
   Prefer `[[slug]]` / `[[path/to/slug]]` for internal links so the generator can remap paths correctly.

4. **Preserve frontmatter-driven metadata.**  
   Page header metadata in generated docs comes from frontmatter; avoid introducing alternate metadata patterns without updating parser logic.

5. **When changing generator behavior, regenerate immediately.**  
   Any parser/rendering update in `scripts/generate_static_articles.py` should be followed by regenerating and committing updated output files.
