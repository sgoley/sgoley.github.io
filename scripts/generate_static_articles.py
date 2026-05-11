#!/usr/bin/env python3
from __future__ import annotations

import html
import posixpath
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Dict, List

IFRAME_SHORTCODE_PATTERN = re.compile(r"^\{\{<\s*iframe\s+(.+?)\s*>\}\}$")
IFRAME_ATTR_PATTERN = re.compile(
    r"""([A-Za-z][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))"""
)


@dataclass
class StaticDoc:
    kind: str
    section: str
    title: str
    source_path: Path
    output_path: Path
    output_relative: Path
    path_prefix: str
    href: str
    excerpt: str
    body_markdown: str
    metadata: Dict[str, Any]


def _first_title(markdown_text: str, fallback: str) -> str:
    for line in markdown_text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return fallback


def _parse_frontmatter(markdown_text: str) -> tuple[Dict[str, Any], str]:
    """Extract simple YAML front matter and return (metadata, remaining markdown)."""
    if not markdown_text.startswith("---"):
        return {}, markdown_text

    parts = markdown_text.split("\n---\n", 1)
    if len(parts) != 2:
        return {}, markdown_text

    frontmatter_raw = parts[0][3:]
    remaining_md = parts[1]

    metadata: Dict[str, Any] = {}
    for line in frontmatter_raw.strip().split("\n"):
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()

        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1]
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
        elif value.startswith("[") and value.endswith("]"):
            value = [v.strip().strip("'\"") for v in value[1:-1].split(",")]

        metadata[key] = value

    return metadata, remaining_md


def _clean_excerpt_line(line: str) -> str:
    stripped = line.strip()
    if IFRAME_SHORTCODE_PATTERN.match(stripped):
        return ""
    if stripped.startswith(">"):
        stripped = re.sub(r"^>\s?", "", stripped).strip()
    if re.match(r"^\[![A-Za-z0-9_-]+\]", stripped):
        return ""

    def replace_wikilink(match: re.Match[str]) -> str:
        target = match.group(1).strip()
        alias = (match.group(3) or "").strip()
        label = alias or target.rsplit("/", 1)[-1]
        return label

    stripped = re.sub(r"\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]", replace_wikilink, stripped)
    return stripped


def _excerpt(markdown_text: str, max_chars: int = 180) -> str:
    cleaned: List[str] = []
    for line in markdown_text.splitlines():
        stripped = _clean_excerpt_line(line)
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


def _normalize_wikilink_target(target: str) -> str:
    normalized = target.strip().replace("\\", "/").lstrip("/")
    if normalized.endswith(".md"):
        normalized = normalized[:-3]
    return normalized.lower()


def _slugify_fragment(fragment: str) -> str:
    slug = html.unescape(fragment).strip().lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug)
    return slug


def _looks_like_image_url(value: str) -> bool:
    return bool(re.search(r"\.(png|jpe?g|gif|webp|svg)(\?.*)?$", value.strip(), re.IGNORECASE))


def _autolink_external_urls(text: str) -> str:
    url_pattern = re.compile(r"https?://[^\s<>'\"]+")
    parts = re.split(r"(<[^>]+>)", text)
    out: List[str] = []
    in_code = False

    def replace_url(match: re.Match[str]) -> str:
        full = match.group(0)
        url = full
        trailing = ""
        while url and url[-1] in ".,:;!?":
            trailing = url[-1] + trailing
            url = url[:-1]
        if not url:
            return full
        return (
            f'<a href="{html.escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">'
            f"{html.escape(url)}</a>{trailing}"
        )

    for part in parts:
        if part.startswith("<"):
            lowered = part.lower()
            if lowered.startswith("<code") or lowered.startswith("<pre"):
                in_code = True
            elif lowered.startswith("</code") or lowered.startswith("</pre"):
                in_code = False
            out.append(part)
            continue

        if in_code:
            out.append(part)
            continue

        out.append(url_pattern.sub(replace_url, part))

    return "".join(out)


def _build_doc_indexes(
    docs: List[StaticDoc],
) -> tuple[Dict[str, StaticDoc], Dict[str, List[StaticDoc]]]:
    by_source_key: Dict[str, StaticDoc] = {}
    by_slug: Dict[str, List[StaticDoc]] = {}

    for doc in docs:
        source_key = doc.source_path.with_suffix("").as_posix().lower()
        by_source_key[source_key] = doc
        slug = doc.source_path.stem.lower()
        by_slug.setdefault(slug, []).append(doc)

    return by_source_key, by_slug


def _make_link_resolver(
    current_doc: StaticDoc,
    by_source_key: Dict[str, StaticDoc],
    by_slug: Dict[str, List[StaticDoc]],
) -> Callable[[str, str | None], str | None]:
    def resolve_link(target: str, fragment: str | None = None) -> str | None:
        normalized = _normalize_wikilink_target(target)
        if not normalized:
            return None

        chosen: StaticDoc | None = None
        if normalized in by_source_key:
            chosen = by_source_key[normalized]
        elif "/" not in normalized:
            same_section_key = f"{current_doc.section}/{normalized}"
            if same_section_key in by_source_key:
                chosen = by_source_key[same_section_key]
            else:
                candidates = by_slug.get(normalized, [])
                if len(candidates) == 1:
                    chosen = candidates[0]
                elif len(candidates) > 1:
                    same_section = [doc for doc in candidates if doc.section == current_doc.section]
                    if len(same_section) == 1:
                        chosen = same_section[0]

        if not chosen:
            return None

        from_dir = PurePosixPath(current_doc.output_relative.as_posix()).parent
        to_path = PurePosixPath(chosen.output_relative.as_posix())
        href = posixpath.relpath(str(to_path), start=str(from_dir))

        if fragment:
            anchor = _slugify_fragment(fragment)
            if anchor:
                href += f"#{anchor}"

        return href

    return resolve_link


def _inline_html(raw_text: str, resolve_link: Callable[[str, str | None], str | None]) -> str:
    text = html.escape(raw_text)

    def replace_wikilink(match: re.Match[str]) -> str:
        target = html.unescape(match.group(1)).strip()
        fragment = html.unescape(match.group(2)).strip() if match.group(2) else None
        alias = html.unescape(match.group(3)).strip() if match.group(3) else None
        label = alias or target.rsplit("/", 1)[-1]
        href = resolve_link(target, fragment)
        if not href:
            return html.escape(label)
        return f'<a href="{html.escape(href, quote=True)}">{html.escape(label)}</a>'

    text = re.sub(r"\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]", replace_wikilink, text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", text)

    def replace_markdown_image(match: re.Match[str]) -> str:
        alt_text = html.unescape(match.group(1))
        src = html.unescape(match.group(2)).strip()
        title = html.unescape(match.group(3)).strip() if match.group(3) else ""
        title_attr = f' title="{html.escape(title, quote=True)}"' if title else ""
        return (
            f'<img src="{html.escape(src, quote=True)}" '
            f'alt="{html.escape(alt_text, quote=True)}"{title_attr}>'
        )

    def replace_markdown_link(match: re.Match[str]) -> str:
        label = match.group(1)
        href = html.unescape(match.group(2)).strip()
        title = html.unescape(match.group(3)).strip() if match.group(3) else ""

        extra_attrs = ""
        if title:
            if _looks_like_image_url(title):
                extra_attrs = (
                    f' class="link-preview" data-preview-image="{html.escape(title, quote=True)}"'
                )
            else:
                extra_attrs = f' title="{html.escape(title, quote=True)}"'

        return f'<a href="{html.escape(href, quote=True)}"{extra_attrs}>{label}</a>'

    text = re.sub(
        r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)",
        replace_markdown_image,
        text,
    )
    text = re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)",
        replace_markdown_link,
        text,
    )
    text = _autolink_external_urls(text)
    return text


def _parse_shortcode_attrs(raw_attrs: str) -> Dict[str, str] | None:
    attrs: Dict[str, str] = {}
    cursor = 0

    for match in IFRAME_ATTR_PATTERN.finditer(raw_attrs):
        if raw_attrs[cursor : match.start()].strip():
            return None
        key = match.group(1).lower()
        value = match.group(2) or match.group(3) or match.group(4) or ""
        attrs[key] = html.unescape(value).strip()
        cursor = match.end()

    if raw_attrs[cursor:].strip():
        return None

    return attrs


def _render_iframe_shortcode(raw_attrs: str) -> str | None:
    attrs = _parse_shortcode_attrs(raw_attrs)
    if attrs is None:
        return None

    src = attrs.get("src", "").strip()
    if not src:
        return None

    if not re.match(r"^(https?://|/|\.{1,2}/)", src):
        return None

    title = attrs.get("title", "Embedded demo")
    height_value = attrs.get("height", "760")
    try:
        height = int(height_value)
    except ValueError:
        return None
    height = max(320, min(height, 1800))

    return (
        '<div class="embed-frame-wrap">'
        f'<iframe class="embed-frame" src="{html.escape(src, quote=True)}" '
        f'title="{html.escape(title, quote=True)}" loading="lazy" '
        f'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen '
        f'style="height: {height}px;"></iframe>'
        "</div>"
    )


def markdown_to_html(
    markdown_text: str,
    resolve_link: Callable[[str, str | None], str | None],
    *,
    allow_iframe_embed: bool = False,
) -> str:
    lines = markdown_text.splitlines()
    out: List[str] = []
    paragraph_buffer: List[str] = []
    in_code = False
    code_buffer: List[str] = []
    list_mode: str | None = None

    def flush_paragraph() -> None:
        nonlocal paragraph_buffer
        if paragraph_buffer:
            out.append(f"<p>{_inline_html(' '.join(paragraph_buffer), resolve_link)}</p>")
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

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            flush_paragraph()
            close_list()
            if in_code:
                out.append(f"<pre><code>{html.escape(chr(10).join(code_buffer))}</code></pre>")
                code_buffer = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue

        if in_code:
            code_buffer.append(line)
            i += 1
            continue

        if stripped.startswith(">"):
            flush_paragraph()
            close_list()

            quote_lines: List[str] = []
            while i < len(lines):
                quote_line = lines[i]
                quote_stripped = quote_line.strip()
                if not quote_stripped.startswith(">"):
                    break
                quote_lines.append(re.sub(r"^\s*>\s?", "", quote_line))
                i += 1

            if quote_lines:
                first_line = quote_lines[0].strip()
                callout_match = re.match(r"^\[!([A-Za-z0-9_-]+)\][+-]?\s*(.*)$", first_line)
                quote_markdown = "\n".join(quote_lines).strip()

                if callout_match:
                    callout_type = callout_match.group(1).lower()
                    callout_title = (
                        callout_match.group(2).strip() or callout_match.group(1).capitalize()
                    )
                    callout_body_markdown = "\n".join(quote_lines[1:]).strip()
                    callout_body_html = (
                        markdown_to_html(
                            callout_body_markdown,
                            resolve_link,
                            allow_iframe_embed=allow_iframe_embed,
                        )
                        if callout_body_markdown
                        else ""
                    )

                    out.append(f'<aside class="callout callout-{callout_type}">')
                    out.append(f'<p class="callout-title">{_inline_html(callout_title, resolve_link)}</p>')
                    if callout_body_html:
                        out.append(f'<div class="callout-body">{callout_body_html}</div>')
                    out.append("</aside>")
                elif quote_markdown:
                    out.append(
                        "<blockquote>"
                        f"{markdown_to_html(quote_markdown, resolve_link, allow_iframe_embed=allow_iframe_embed)}"
                        "</blockquote>"
                    )
            continue

        if not stripped:
            flush_paragraph()
            close_list()
            i += 1
            continue

        if allow_iframe_embed:
            iframe_match = IFRAME_SHORTCODE_PATTERN.match(stripped)
            if iframe_match:
                iframe_html = _render_iframe_shortcode(iframe_match.group(1))
                if iframe_html:
                    flush_paragraph()
                    close_list()
                    out.append(iframe_html)
                    i += 1
                    continue

        header_match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if header_match:
            flush_paragraph()
            close_list()
            level = len(header_match.group(1))
            out.append(f"<h{level}>{_inline_html(header_match.group(2).strip(), resolve_link)}</h{level}>")
            i += 1
            continue

        ul_match = re.match(r"^[-*+]\s+(.+)$", stripped)
        if ul_match:
            flush_paragraph()
            open_list("ul")
            out.append(f"<li>{_inline_html(ul_match.group(1).strip(), resolve_link)}</li>")
            i += 1
            continue

        ol_match = re.match(r"^\d+\.\s+(.+)$", stripped)
        if ol_match:
            flush_paragraph()
            open_list("ol")
            out.append(f"<li>{_inline_html(ol_match.group(1).strip(), resolve_link)}</li>")
            i += 1
            continue

        close_list()
        paragraph_buffer.append(stripped)
        i += 1

    flush_paragraph()
    close_list()
    if in_code:
        out.append(f"<pre><code>{html.escape(chr(10).join(code_buffer))}</code></pre>")
    return "\n".join(out)


def _render_metadata(metadata: Dict[str, Any]) -> str:
    if not metadata:
        return ""

    meta_parts: List[str] = []
    if "author" in metadata:
        meta_parts.append(f"By {html.escape(str(metadata['author']))}")
    if "published" in metadata:
        meta_parts.append(f"Published {html.escape(str(metadata['published']))}")

    if not meta_parts and "tags" not in metadata:
        return ""

    out = ['<div class="article-metadata">']
    if meta_parts:
        out.append("  " + " · ".join(meta_parts))
    if "tags" in metadata:
        tags = metadata["tags"]
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        if tags:
            tag_html = " ".join(f'<span class="tag">{html.escape(str(tag))}</span>' for tag in tags)
            out.append(f'  <div class="tags">{tag_html}</div>')
    out.append("</div>")
    return "\n".join(out)


def render_doc_page(doc: StaticDoc, body_html: str) -> str:
    eyebrow = "Article" if doc.kind == "article" else "Project"
    metadata_html = _render_metadata(doc.metadata)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(doc.title)} - Scott Goley</title>
  <meta name="description" content="{html.escape(doc.excerpt, quote=True)}">
  <link rel="stylesheet" href="{doc.path_prefix}assets/css/site.css">
</head>
<body>
  <header class="site-header">
    <div class="container nav-wrap">
      <a class="brand" href="{doc.path_prefix}index.html">Scott Goley</a>
      <nav class="site-nav" aria-label="Main navigation">
        <a href="{doc.path_prefix}index.html">Home</a>
        <a href="{doc.path_prefix}about.html">About</a>
        <a href="{doc.path_prefix}projects.html">Projects</a>
        <a href="{doc.path_prefix}articles.html">Articles</a>
      </nav>
    </div>
  </header>

  <main class="container stack">
    <section class="panel article-header">
      <p class="eyebrow">{eyebrow}</p>
      <h1>{html.escape(doc.title)}</h1>
      {metadata_html}
    </section>

    <article class="panel article-prose">
{body_html}
    </article>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>(c) <span data-year></span> Scott Goley</p>
    </div>
  </footer>

  <script src="{doc.path_prefix}assets/js/site.js"></script>
</body>
</html>
"""


def render_collection_index(
    docs: List[StaticDoc],
    *,
    page_title: str,
    meta_description: str,
    eyebrow: str,
    heading: str,
    intro: str,
    cta_text: str,
) -> str:
    cards: List[str] = []
    for doc in docs:
        summary = doc.excerpt or "No summary available yet."
        cards.append(
            f"""      <article class="card">
        <h2>{html.escape(doc.title)}</h2>
        <p>{html.escape(summary)}</p>
        <a href="{html.escape(doc.href, quote=True)}">{html.escape(cta_text)} -&gt;</a>
      </article>"""
        )
    cards_html = "\n".join(cards)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(page_title)} - Scott Goley</title>
  <meta name="description" content="{html.escape(meta_description, quote=True)}">
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
      <p class="eyebrow">{html.escape(eyebrow)}</p>
      <h1>{html.escape(heading)}</h1>
      <p>{intro}</p>
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


def _collect_docs(
    repo_root: Path,
    *,
    section: str,
    output_root_name: str,
    keep_section_path_in_output: bool,
    kind: str,
) -> List[StaticDoc]:
    content_root = repo_root / "streamlit" / "content"
    source_root = content_root / section
    if not source_root.exists():
        return []

    markdown_files = sorted(source_root.rglob("*.md"))
    docs: List[StaticDoc] = []

    for markdown_file in markdown_files:
        relative_to_content = markdown_file.relative_to(content_root)
        relative_to_section = markdown_file.relative_to(source_root)

        if keep_section_path_in_output:
            output_file = repo_root / output_root_name / relative_to_content.with_suffix(".html")
        else:
            output_file = repo_root / output_root_name / relative_to_section.with_suffix(".html")

        output_relative = output_file.relative_to(repo_root)
        path_prefix = "../" * (len(output_relative.parts) - 1)

        markdown_text = markdown_file.read_text(encoding="utf-8")
        metadata, body_markdown = _parse_frontmatter(markdown_text)

        title = str(
            metadata.get("title")
            or _first_title(body_markdown, fallback=markdown_file.stem.replace("-", " ").title())
        )
        body_markdown = _strip_leading_h1(body_markdown)

        docs.append(
            StaticDoc(
                kind=kind,
                section=section,
                title=title,
                source_path=relative_to_content,
                output_path=output_file,
                output_relative=output_relative,
                path_prefix=path_prefix,
                href=output_relative.as_posix(),
                excerpt=_excerpt(body_markdown),
                body_markdown=body_markdown,
                metadata=metadata,
            )
        )

    return docs


def _cleanup_stale_html(managed_root: Path, expected_files: set[Path]) -> int:
    if not managed_root.exists():
        return 0

    removed = 0
    for html_file in managed_root.rglob("*.html"):
        if html_file not in expected_files:
            html_file.unlink()
            removed += 1

    for child in sorted(managed_root.rglob("*"), reverse=True):
        if child.is_dir() and not any(child.iterdir()):
            child.rmdir()

    return removed


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]

    articles = _collect_docs(
        repo_root,
        section="posts",
        output_root_name="articles",
        keep_section_path_in_output=True,
        kind="article",
    )
    projects = _collect_docs(
        repo_root,
        section="projects",
        output_root_name="projects",
        keep_section_path_in_output=False,
        kind="project",
    )

    all_docs = [*articles, *projects]
    by_source_key, by_slug = _build_doc_indexes(all_docs)

    removed_articles = _cleanup_stale_html(
        repo_root / "articles",
        {doc.output_path for doc in articles},
    )
    removed_projects = _cleanup_stale_html(
        repo_root / "projects",
        {doc.output_path for doc in projects},
    )

    for doc in all_docs:
        resolver = _make_link_resolver(doc, by_source_key, by_slug)
        body_html = markdown_to_html(
            doc.body_markdown,
            resolver,
            allow_iframe_embed=doc.kind == "project",
        )
        doc.output_path.parent.mkdir(parents=True, exist_ok=True)
        doc.output_path.write_text(render_doc_page(doc, body_html), encoding="utf-8")

    (repo_root / "articles.html").write_text(
        render_collection_index(
            articles,
            page_title="Articles",
            meta_description="Generated article index from streamlit/content/posts markdown files.",
            eyebrow="Writing",
            heading="Articles and notes",
            intro="These pages are generated from markdown files in <code>streamlit/content/posts</code>.",
            cta_text="Read article",
        ),
        encoding="utf-8",
    )

    (repo_root / "projects.html").write_text(
        render_collection_index(
            projects,
            page_title="Projects",
            meta_description="Generated project index from streamlit/content/projects markdown files.",
            eyebrow="Projects",
            heading="Project walkthroughs and builds",
            intro="These pages are generated from markdown files in <code>streamlit/content/projects</code>.",
            cta_text="Open project",
        ),
        encoding="utf-8",
    )

    print(f"Generated {len(articles)} article pages into articles/")
    print(f"Generated {len(projects)} project pages into projects/")
    if removed_articles or removed_projects:
        print(
            f"Removed stale pages: articles={removed_articles}, projects={removed_projects}"
        )
    print("Updated articles.html and projects.html indexes")


if __name__ == "__main__":
    main()
