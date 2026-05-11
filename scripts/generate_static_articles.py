#!/usr/bin/env python3
from __future__ import annotations

import html
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Any


@dataclass
class Article:
    title: str
    source_path: Path
    output_path: Path
    output_relative: Path
    path_prefix: str
    href: str
    excerpt: str
    body_html: str
    metadata: Dict[str, Any]


def _first_title(markdown_text: str, fallback: str) -> str:
    for line in markdown_text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return fallback


def _parse_frontmatter(markdown_text: str) -> tuple[Dict[str, Any], str]:
    """Extract YAML front matter and return (metadata dict, remaining markdown)."""
    lines = markdown_text.split("\n", 1)[0]
    if not markdown_text.startswith("---"):
        return {}, markdown_text
    
    # Find the closing ---
    parts = markdown_text.split("\n---\n", 1)
    if len(parts) != 2:
        return {}, markdown_text
    
    frontmatter_raw = parts[0][3:]  # Remove opening ---
    remaining_md = parts[1]
    
    metadata = {}
    for line in frontmatter_raw.strip().split("\n"):
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        
        # Remove quotes if present
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1]
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
        # Parse lists like [a, b, c]
        elif value.startswith("[") and value.endswith("]"):
            value = [v.strip().strip("'\"") for v in value[1:-1].split(",")]
        
        metadata[key] = value
    
    return metadata, remaining_md


def _excerpt(markdown_text: str, max_chars: int = 180) -> str:
    cleaned = []
    for line in markdown_text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("- ") or re.match(
            r"^\d+\.\s+", stripped
        ):
            continue
        cleaned.append(stripped)
    text = " ".join(cleaned).strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def _strip_leading_h1(markdown_text: str) -> str:
    lines = markdown_text.splitlines()
    for idx, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("# "):
            next_idx = idx + 1
            if next_idx < len(lines) and not lines[next_idx].strip():
                next_idx += 1
            return "\n".join(lines[next_idx:])
        break
    return markdown_text


def _inline_html(raw_text: str) -> str:
    text = html.escape(raw_text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", text)
    text = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda m: f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>',
        text,
    )
    return text


def markdown_to_html(markdown_text: str) -> str:
    lines = markdown_text.splitlines()
    out: List[str] = []
    paragraph_buffer: List[str] = []
    in_code = False
    code_buffer: List[str] = []
    list_mode: str | None = None

    def flush_paragraph() -> None:
        nonlocal paragraph_buffer
        if paragraph_buffer:
            out.append(f"<p>{_inline_html(' '.join(paragraph_buffer))}</p>")
            paragraph_buffer = []

    def close_list() -> None:
        nonlocal list_mode
        if list_mode == "ul":
            out.append("</ul>")
        elif list_mode == "ol":
            out.append("</ol>")
        list_mode = None

    def open_list(mode: str) -> None:
        nonlocal list_mode
        if list_mode != mode:
            close_list()
            out.append(f"<{mode}>")
            list_mode = mode

    for line in lines:
        if line.strip().startswith("```"):
            flush_paragraph()
            close_list()
            if in_code:
                out.append(f"<pre><code>{html.escape(chr(10).join(code_buffer))}</code></pre>")
                code_buffer = []
                in_code = False
            else:
                in_code = True
            continue

        if in_code:
            code_buffer.append(line)
            continue

        stripped = line.strip()
        if not stripped:
            flush_paragraph()
            close_list()
            continue

        header_match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if header_match:
            flush_paragraph()
            close_list()
            level = len(header_match.group(1))
            out.append(f"<h{level}>{_inline_html(header_match.group(2).strip())}</h{level}>")
            continue

        ul_match = re.match(r"^[-*+]\s+(.+)$", stripped)
        if ul_match:
            flush_paragraph()
            open_list("ul")
            out.append(f"<li>{_inline_html(ul_match.group(1).strip())}</li>")
            continue

        ol_match = re.match(r"^\d+\.\s+(.+)$", stripped)
        if ol_match:
            flush_paragraph()
            open_list("ol")
            out.append(f"<li>{_inline_html(ol_match.group(1).strip())}</li>")
            continue

        close_list()
        paragraph_buffer.append(stripped)

    flush_paragraph()
    close_list()
    if in_code:
        out.append(f"<pre><code>{html.escape(chr(10).join(code_buffer))}</code></pre>")
    return "\n".join(out)


def render_article_page(article: Article) -> str:
    # Build metadata section HTML
    metadata_html = ""
    if article.metadata:
        meta_parts = []
        if "author" in article.metadata:
            meta_parts.append(f"By {html.escape(article.metadata['author'])}")
        if "published" in article.metadata:
            meta_parts.append(f"Published {html.escape(str(article.metadata['published']))}")
        
        metadata_html += "<div class=\"article-metadata\">\n"
        metadata_html += "  " + " · ".join(meta_parts) + "\n"
        
        if "tags" in article.metadata:
            tags = article.metadata["tags"]
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",")]
            tag_html = " ".join(f"<span class=\"tag\">{html.escape(tag)}</span>" for tag in tags)
            metadata_html += f"  <div class=\"tags\">{tag_html}</div>\n"
        
        metadata_html += "</div>"
    
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(article.title)} - Scott Goley</title>
  <meta name="description" content="{html.escape(article.excerpt, quote=True)}">
  <link rel="stylesheet" href="{article.path_prefix}assets/css/site.css">
</head>
<body>
  <header class="site-header">
    <div class="container nav-wrap">
      <a class="brand" href="{article.path_prefix}index.html">Scott Goley</a>
      <nav class="site-nav" aria-label="Main navigation">
        <a href="{article.path_prefix}index.html">Home</a>
        <a href="{article.path_prefix}about.html">About</a>
        <a href="{article.path_prefix}projects.html">Projects</a>
        <a href="{article.path_prefix}articles.html">Articles</a>
      </nav>
    </div>
  </header>

  <main class="container stack">
    <section class="panel article-header">
      <p class="eyebrow">Article</p>
      <h1>{html.escape(article.title)}</h1>
      {metadata_html}
    </section>

    <article class="panel article-prose">
{article.body_html}
    </article>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>(c) <span data-year></span> Scott Goley</p>
    </div>
  </footer>

  <script src="{article.path_prefix}assets/js/site.js"></script>
</body>
</html>
"""


def render_articles_index(articles: List[Article]) -> str:
    cards = []
    for article in articles:
        cards.append(
            f"""      <article class="card">
        <h2>{html.escape(article.title)}</h2>
        <p>{html.escape(article.excerpt)}</p>
        <a href="{html.escape(article.href, quote=True)}">Read article -&gt;</a>
      </article>"""
        )
    cards_html = "\n".join(cards)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Articles - Scott Goley</title>
  <meta name="description" content="Generated article index from streamlit/content markdown files.">
  <link rel="stylesheet" href="assets/css/site.css">
</head>
<body>
  <header class="site-header">
    <div class="container nav-wrap">
      <a class="brand" href="index.html">Scott Goley</a>
      <nav class="site-nav" aria-label="Main navigation">
        <a href="index.html">Home</a>
        <a href="about.html">About</a>
        <a href="projects.html">Projects</a>
        <a href="articles.html">Articles</a>
      </nav>
    </div>
  </header>

  <main class="container stack">
    <section class="panel">
      <p class="eyebrow">Writing</p>
      <h1>Articles and notes</h1>
      <p>These pages are generated from markdown files in <code>streamlit/content</code>.</p>
    </section>

    <section class="grid two-col">
{cards_html}
    </section>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>(c) <span data-year></span> Scott Goley</p>
    </div>
  </footer>

  <script src="assets/js/site.js"></script>
</body>
</html>
"""


def collect_articles(repo_root: Path) -> List[Article]:
    source_root = repo_root / "streamlit" / "content"
    output_root = repo_root / "articles"
    markdown_files = sorted(source_root.rglob("*.md"))
    articles: List[Article] = []

    for markdown_file in markdown_files:
        relative_md = markdown_file.relative_to(source_root)
        output_file = output_root / relative_md.with_suffix(".html")
        output_relative = output_file.relative_to(repo_root)
        path_prefix = "../" * (len(output_relative.parts) - 1)
        markdown_text = markdown_file.read_text(encoding="utf-8")
        
        # Parse front matter and remaining markdown
        metadata, body_markdown = _parse_frontmatter(markdown_text)
        
        # Get title from metadata or from first H1 in markdown
        title = metadata.get("title") or _first_title(body_markdown, fallback=markdown_file.stem.replace("-", " ").title())
        
        body_markdown = _strip_leading_h1(body_markdown)
        article = Article(
            title=title,
            source_path=relative_md,
            output_path=output_file,
            output_relative=output_relative,
            path_prefix=path_prefix,
            href=output_relative.as_posix(),
            excerpt=_excerpt(body_markdown),
            body_html=markdown_to_html(body_markdown),
            metadata=metadata,
        )
        articles.append(article)

    return articles


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    output_root = repo_root / "articles"
    output_root.mkdir(parents=True, exist_ok=True)

    articles = collect_articles(repo_root)
    for article in articles:
        article.output_path.parent.mkdir(parents=True, exist_ok=True)
        article.output_path.write_text(render_article_page(article), encoding="utf-8")

    (repo_root / "articles.html").write_text(
        render_articles_index(articles),
        encoding="utf-8",
    )

    print(f"Generated {len(articles)} article pages into {output_root.relative_to(repo_root)}")
    print("Updated articles.html index")


if __name__ == "__main__":
    main()
