# sgoley.github.io

Static personal website (HTML/CSS/JS) with:

- Generated article pages from markdown content
- An embedded Streamlit chat app (hosted separately)

## Architecture

- **Static site**: root HTML pages (`index.html`, `about.html`, `projects.html`, `articles.html`)
- **Generated articles**: `articles/` (built from markdown)
- **Article source markdown**: `streamlit/content/`
- **Generator**: `scripts/generate_static_articles.py`
- **Embedded app**: Streamlit URL in `index.html` (`data-streamlit-url`)

## Prerequisites

- Python 3.10+ (for article generation script)
- Git

## Local workflow

1. Edit markdown in `streamlit/content/` (usually `streamlit/content/posts/*.md`).
2. Regenerate static pages:
   ```bash
   python3 scripts/generate_static_articles.py
   ```
3. Commit both:
   - content changes in `streamlit/content/`
   - generated output in `articles/` and `articles.html`

## CI-to-CI automation (streamlit -> website)

This repo now includes cross-repo automation:

- `streamlit-openrouter-chat-embed` pushes to `content/**` trigger a dispatch event
- this repo receives that dispatch, updates `streamlit` submodule to the exact SHA
- runs `python3 scripts/generate_static_articles.py`
- commits/pushes updated `streamlit` pointer + generated `articles/**` + `articles.html`

### Required secret (in streamlit repo)

In `sgoley/streamlit-openrouter-chat-embed`, add repository secret:

- `WEBSITE_REPO_DISPATCH_TOKEN`

Token requirements:

- can call `repository_dispatch` on `sgoley/sgoley.github.io`
- fine-grained PAT: access to repository `sgoley.github.io` with **Contents: Read and write** and **Metadata: Read**

### Required setting (in website repo)

In `sgoley/sgoley.github.io`:

- **Settings -> Actions -> General -> Workflow permissions**
- set to **Read and write permissions**

This lets the generator workflow commit/push regenerated files.

## Important: `streamlit/` is a separate repo

`streamlit/` points to its own project:

- https://github.com/sgoley/streamlit-openrouter-chat-embed

If you want this repo to **include** `streamlit/` while keeping it separately versioned, use a **git submodule** (recommended).

### Recommended submodule setup

If starting fresh:

```bash
git submodule add https://github.com/sgoley/streamlit-openrouter-chat-embed.git streamlit
git commit -m "Add streamlit app as submodule"
```

For new clones:

```bash
git clone <your-website-repo-url>
cd <repo>
git submodule update --init --recursive
```

If `streamlit/` already exists locally as its own cloned repo, convert it before first push:

```bash
# optional: back up local uncommitted streamlit changes first
mv streamlit ../streamlit-backup
git submodule add https://github.com/sgoley/streamlit-openrouter-chat-embed.git streamlit
git commit -m "Track streamlit app as submodule"
```

Then copy any needed local changes from `../streamlit-backup` into `streamlit/`, commit in the streamlit repo, and update the submodule pointer in this repo.

## Deploy static site to GitHub Pages

1. Push this repository to GitHub.
2. In GitHub: **Settings -> Pages**.
3. Under **Build and deployment**, choose:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (or your default branch)
   - **Folder**: `/ (root)`
4. Save and wait for Pages deploy.

### URL behavior

- If repo is named `<username>.github.io`, site URL is:
  - `https://<username>.github.io`
- Otherwise:
  - `https://<username>.github.io/<repo-name>/`

## Deploy Streamlit app to Streamlit Community Cloud

Use the separate repo:

- https://github.com/sgoley/streamlit-openrouter-chat-embed

Deployment settings:

- **Main file path**: `src/app.py`
- **Python dependencies**: `requirements.txt`
- **Secrets / env vars**: set in Streamlit Cloud (at minimum `OPENROUTER_API_KEY`)

Reference env variables are documented in:

- `streamlit/.env.example`

## Connect deployed Streamlit app to this site

Set the iframe source in `index.html`:

```html
<iframe data-streamlit-url="https://YOUR-APP.streamlit.app/?embed=true"></iframe>
```

Or pass at runtime:

- `?streamlit=https://YOUR-APP.streamlit.app`

Then commit and push `index.html` so GitHub Pages serves the updated embed URL.
