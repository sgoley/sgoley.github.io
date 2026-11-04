#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import os
import posixpath
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Dict, List

IFRAME_SHORTCODE_PATTERN = re.compile(r"^\{\{<\s*iframe\s+(.+?)\s*>\}\}$")
IFRAME_ATTR_PATTERN = re.compile(
    r"""([A-Za-z][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))"""
)
GTM_CONTAINER_ID = "GTM-TK7DSRV"
GTM_HEAD_SNIPPET = (
    "<!-- Google Tag Manager -->\n"
    "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n"
    "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n"
    "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n"
    f"'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n"
    f"}})(window,document,'script','dataLayer','{GTM_CONTAINER_ID}');</script>\n"
    "<!-- End Google Tag Manager -->"
)
GTM_BODY_SNIPPET = (
    "<!-- Google Tag Manager (noscript) -->\n"
    f'<noscript><iframe src="https://www.googletagmanager.com/ns.html?id={GTM_CONTAINER_ID}"\n'
    'height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n'
    "<!-- End Google Tag Manager (noscript) -->"
)
GA_MEASUREMENT_ID = "G-BFSYS2PX3G"
GA_HEAD_SNIPPET = (
    "<!-- Google tag (gtag.js) -->\n"
    f'<script async src="https://www.googletagmanager.com/gtag/js?id={GA_MEASUREMENT_ID}"></script>\n'
    "<script>\n"
    "  window.dataLayer = window.dataLayer || [];\n"
    "  function gtag(){dataLayer.push(arguments);}\n"
    "  gtag('js', new Date());\n"
    "\n"
    f"  gtag('config', '{GA_MEASUREMENT_ID}');\n"
    "</script>"
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
    stripped = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", stripped)
    stripped = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", stripped)
    stripped = re.sub(r"`([^`]+)`", r"\1", stripped)
    stripped = re.sub(r"\*\*([^*]+)\*\*", r"\1", stripped)
    stripped = re.sub(r"\*([^*]+)\*", r"\1", stripped)
    stripped = re.sub(r"\s+", " ", stripped).strip()
    return stripped


def _excerpt(markdown_text: str, max_chars: int = 180) -> str:
    cleaned: List[str] = []
    for line in markdown_text.splitlines():
        stripped = _clean_excerpt_line(line)
        if not stripped or stripped.startswith("#") or re.match(r"^([-*+]|\d+\.)\s+", stripped):
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
    stashed: List[str] = []

    def stash(html_content: str) -> str:
        stashed.append(html_content)
        return f"@@STASHEDHTML{len(stashed) - 1}@@"

    # 1. Stash and compile code spans
    def replace_code_span(match: re.Match[str]) -> str:
        return stash(f"<code>{match.group(1)}</code>")
    text = re.sub(r"`([^`]+)`", replace_code_span, text)

    # 2. Stash and compile wikilinks
    def replace_wikilink(match: re.Match[str]) -> str:
        target = html.unescape(match.group(1)).strip()
        fragment = html.unescape(match.group(2)).strip() if match.group(2) else None
        alias = html.unescape(match.group(3)).strip() if match.group(3) else None
        label = alias or target.rsplit("/", 1)[-1]
        href = resolve_link(target, fragment)
        if not href:
            return html.escape(label)
        return stash(f'<a href="{html.escape(href, quote=True)}">{html.escape(label)}</a>')
    text = re.sub(r"\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]", replace_wikilink, text)

    # 3. Stash and compile markdown images
    def replace_markdown_image(match: re.Match[str]) -> str:
        alt_text = html.unescape(match.group(1))
        src = html.unescape(match.group(2)).strip()
        title = html.unescape(match.group(3)).strip() if match.group(3) else ""
        title_attr = f' title="{html.escape(title, quote=True)}"' if title else ""
        img_html = (
            f'<img src="{html.escape(src, quote=True)}" '
            f'alt="{html.escape(alt_text, quote=True)}"{title_attr}>'
        )
        return stash(img_html)
    text = re.sub(
        r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)",
        replace_markdown_image,
        text,
    )

    # 4. Stash and compile markdown links
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

        # Check if it is a footnote link (e.g. starts with #user-content-fn- or matches [number](#...))
        is_footnote = href.startswith("#user-content-fn-") or (
            label.isdigit() and href.startswith("#") and "fn" in href
        )

        link_html = f'<a href="{html.escape(href, quote=True)}"{extra_attrs}>{label}</a>'
        if is_footnote:
            link_html = f"<sup>{link_html}</sup>"
        return stash(link_html)
    text = re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)",
        replace_markdown_link,
        text,
    )

    # 5. Parse bold & italics using * and _
    # Note: Because links, images, and code spans are stashed, they are protected.
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"__([^_]+)__", r"<strong>\1</strong>", text)
    text = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", text)
    text = re.sub(r"_([^_]+)_", r"<em>\1</em>", text)

    # 6. Autolink external URLs
    text = _autolink_external_urls(text)

    # 7. Restore stashed elements in reverse order to handle nesting
    for idx in reversed(range(len(stashed))):
        text = text.replace(f"@@STASHEDHTML{idx}@@", stashed[idx])

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


def _split_table_row(row: str) -> List[str]:
    normalized = row.strip()
    if normalized.startswith("|"):
        normalized = normalized[1:]
    if normalized.endswith("|"):
        normalized = normalized[:-1]
    return [cell.strip() for cell in normalized.split("|")]


def _is_table_delimiter(row: str) -> bool:
    cells = _split_table_row(row)
    if not cells:
        return False
    return all(re.match(r"^:?-{3,}:?$", cell) for cell in cells)


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

        if i + 1 < len(lines) and "|" in stripped and _is_table_delimiter(lines[i + 1]):
            flush_paragraph()
            close_list()

            header_cells = _split_table_row(stripped)
            i += 2  # skip header + delimiter

            body_rows: List[List[str]] = []
            while i < len(lines):
                row_line = lines[i].strip()
                if not row_line or "|" not in row_line:
                    break
                body_rows.append(_split_table_row(row_line))
                i += 1

            out.append("<table>")
            out.append("<thead><tr>")
            out.extend(f"<th>{_inline_html(cell, resolve_link)}</th>" for cell in header_cells)
            out.append("</tr></thead>")
            if body_rows:
                out.append("<tbody>")
                for row in body_rows:
                    out.append("<tr>")
                    out.extend(f"<td>{_inline_html(cell, resolve_link)}</td>" for cell in row)
                    out.append("</tr>")
                out.append("</tbody>")
            out.append("</table>")
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


GITHUB_URL = "https://github.com/sgoley"
GITHUB_USERNAME = "sgoley"
LINKEDIN_URL = "https://www.linkedin.com/in/sgoley/"

_LANGUAGE_COLORS = {
    "python": "#3572A5",
    "typescript": "#3178c6",
    "javascript": "#f1e05a",
    "go": "#00ADD8",
    "swift": "#F05138",
    "html": "#e34c26",
    "css": "#563d7c",
    "shell": "#89e051",
    "jupyter notebook": "#DA5B0B",
    "dockerfile": "#384d54",
    "ruby": "#701516",
    "rust": "#dea584",
    "lua": "#000080",
    "sql": "#e38c00",
    "plpgsql": "#336790",
}


def _gh_request(url: str, *, api: bool = True) -> Any:
    headers = {
        "User-Agent": "sgoley-github-io-generator",
        "Accept": "application/vnd.github+json" if api else "text/html",
    }
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token and api:
        headers["Authorization"] = f"Bearer {token}"
    if not api:
        headers["User-Agent"] = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
        )
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw) if api else raw


def _fetch_contributions(username: str) -> Dict[str, Any]:
    page = _gh_request(
        f"https://github.com/users/{username}/contributions", api=False
    )
    counts: Dict[str, int] = {}
    for tip_for, tip_text in re.findall(
        r'<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)</tool-tip>', page
    ):
        count_match = re.search(r"([\d,]+)\s+contributions?", tip_text)
        counts[tip_for] = int(count_match.group(1).replace(",", "")) if count_match else 0

    cells: Dict[tuple[int, int], Dict[str, Any]] = {}
    for tag in re.findall(r"<td\b[^>]*ContributionCalendar-day[^>]*>", page):
        cell_id = re.search(r'id="contribution-day-component-(\d+)-(\d+)"', tag)
        date_match = re.search(r'data-date="([\d-]+)"', tag)
        level_match = re.search(r'data-level="(\d)"', tag)
        if not (cell_id and date_match and level_match):
            continue
        day, week = int(cell_id.group(1)), int(cell_id.group(2))
        cells[(week, day)] = {
            "date": date_match.group(1),
            "level": int(level_match.group(1)),
            "count": counts.get(f"contribution-day-component-{day}-{week}", 0),
        }

    if not cells:
        return {"total": 0, "weeks": []}

    max_week = max(w for w, _ in cells)
    weeks: List[List[Dict[str, Any]]] = []
    total = 0
    for week in range(max_week + 1):
        column = []
        for day in range(7):
            cell = cells.get((week, day))
            column.append(cell)
            if cell:
                total += cell["count"]
        weeks.append(column)
    return {"total": total, "weeks": weeks}


def _fetch_latest_run(owner: str, repo: str, default_branch: str) -> Dict[str, Any] | None:
    try:
        data = _gh_request(
            f"https://api.github.com/repos/{owner}/{repo}/actions/runs"
            f"?per_page=1&branch={default_branch}"
        )
    except (OSError, urllib.error.URLError, json.JSONDecodeError):
        return None
    runs = data.get("workflow_runs") or []
    if not runs:
        return None
    run = runs[0]
    return {
        "name": run.get("name") or "CI",
        "status": run.get("status") or "",
        "conclusion": run.get("conclusion") or "",
        "url": run.get("html_url") or "",
    }


def _fetch_github_profile(
    username: str, ci_repo_names: set[str] | None = None
) -> Dict[str, Any]:
    user = _gh_request(f"https://api.github.com/users/{username}")

    repos: List[Dict[str, Any]] = []
    for page in range(1, 4):
        batch = _gh_request(
            f"https://api.github.com/users/{username}/repos"
            f"?per_page=100&type=owner&sort=pushed&page={page}"
        )
        if not batch:
            break
        repos.extend(batch)
        if len(batch) < 100:
            break

    slim_repos = []
    for repo in repos:
        slim_repos.append(
            {
                "name": repo.get("name") or "",
                "description": repo.get("description") or "",
                "url": repo.get("html_url") or "",
                "stars": repo.get("stargazers_count") or 0,
                "forks": repo.get("forks_count") or 0,
                "language": repo.get("language") or "",
                "updated_at": repo.get("pushed_at") or repo.get("updated_at") or "",
                "default_branch": repo.get("default_branch") or "main",
                "fork": bool(repo.get("fork")),
                "archived": bool(repo.get("archived")),
            }
        )

    wanted = ci_repo_names or set()
    for repo in slim_repos:
        if repo["name"].lower() in wanted:
            repo["latest_run"] = _fetch_latest_run(
                username, repo["name"], repo["default_branch"]
            )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "user": {
            "login": user.get("login") or username,
            "name": user.get("name") or "",
            "bio": user.get("bio") or "",
            "avatar_url": user.get("avatar_url") or "",
            "followers": user.get("followers") or 0,
            "following": user.get("following") or 0,
            "public_repos": user.get("public_repos") or 0,
            "location": user.get("location") or "",
            "company": user.get("company") or "",
            "blog": user.get("blog") or "",
            "created_at": user.get("created_at") or "",
            "html_url": user.get("html_url") or GITHUB_URL,
        },
        "repos": slim_repos,
        "total_stars": sum(r["stars"] for r in slim_repos if not r["fork"]),
        "contributions": _fetch_contributions(username),
    }


def _load_or_fetch_github_profile(
    repo_root: Path, ci_repo_names: set[str] | None = None
) -> Dict[str, Any]:
    cache_path = repo_root / "assets" / "data" / "github-profile.json"
    try:
        profile = _fetch_github_profile(GITHUB_USERNAME, ci_repo_names)
    except Exception as exc:  # network down, rate-limited, markup changed
        print(f"GitHub fetch failed ({exc}); using cached profile if present.")
        if cache_path.exists():
            return json.loads(cache_path.read_text(encoding="utf-8"))
        return {"generated_at": "", "user": {}, "repos": [], "total_stars": 0,
                "contributions": {"total": 0, "weeks": []}}

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return profile


def _repo_lookup(profile: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    return {
        str(repo.get("name", "")).lower(): repo
        for repo in profile.get("repos") or []
        if repo.get("name")
    }


def _repo_name_from_url(url: str) -> str:
    match = re.search(r"github\.com/[\w.-]+/([\w.-]+)", url)
    return match.group(1).lower() if match else ""


def _relative_updated(iso_date: str) -> str:
    if not iso_date:
        return ""
    try:
        when = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
    except ValueError:
        return ""
    days = (datetime.now(timezone.utc) - when).days
    if days < 1:
        return "Updated today"
    if days == 1:
        return "Updated yesterday"
    if days < 30:
        return f"Updated {days} days ago"
    return f"Updated {when.strftime('%b %-d')}"


def _content_group(doc: StaticDoc) -> str:
    explicit = str(doc.metadata.get("group", "")).strip().lower()
    if explicit in {"experience", "writing"}:
        return explicit
    stem = doc.source_path.stem.lower()
    if stem == "edu" or stem.startswith("exp-"):
        return "experience"
    return "writing"


def _featured_rank(doc: StaticDoc) -> int:
    raw = str(doc.metadata.get("featured", "")).strip()
    if not raw or raw.lower() in {"false", "0", "no"}:
        return 0
    try:
        return int(raw)
    except ValueError:
        return 0


def _shelf(doc: StaticDoc) -> str:
    shelf = str(doc.metadata.get("shelf", "")).strip().lower()
    if shelf in {"open", "install", "read"}:
        return shelf
    return "read"


def _doc_eyebrow(doc: StaticDoc) -> str:
    if doc.kind == "project":
        return "Project"
    if _content_group(doc) == "experience":
        return "Experience"
    return "Writing"


def render_site_header(prefix: str = "") -> str:
    return f"""<header class="site-header">
    <div class="container nav-wrap">
      <a class="brand" href="{prefix}index.html">Scott Goley</a>
      <div class="nav-cluster">
        <details class="nav-menu" open>
          <summary aria-label="Menu"><svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75Zm0 5A.75.75 0 0 1 1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1-.75-.75Z"/></svg></summary>
          <nav class="site-nav" aria-label="Main navigation">
            <a data-nav="work" href="{prefix}index.html">Work</a>
            <a data-nav="repos" href="{prefix}repositories.html">Repositories</a>
            <a data-nav="experience" href="{prefix}experience.html">Experience</a>
            <a data-nav="writing" href="{prefix}articles.html">Writing</a>
            <a data-nav="ask" href="{prefix}ask.html">Ask</a>
          </nav>
        </details>
        <nav class="site-links" aria-label="Profiles">
          <a href="{GITHUB_URL}">GitHub</a>
          <a href="{LINKEDIN_URL}">LinkedIn</a>
        </nav>
      </div>
    </div>
  </header>"""


def render_site_footer(prefix: str = "") -> str:
    return f"""  <footer class="site-footer">
    <div class="container">
      <p>(c) <span data-year></span> Scott Goley</p>
    </div>
  </footer>

  <script src="{prefix}assets/js/site.js?v=3"></script>"""


def _page_shell(
    *,
    title: str,
    description: str,
    body: str,
    prefix: str = "",
) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <meta name="description" content="{html.escape(description, quote=True)}">
  <link rel="stylesheet" href="{prefix}assets/css/site.css">
  {GTM_HEAD_SNIPPET}
  {GA_HEAD_SNIPPET}
</head>
<body>
  {GTM_BODY_SNIPPET}
  {render_site_header(prefix)}

{body}

  {render_site_footer(prefix)}
</body>
</html>
"""


def _is_external(url: str) -> bool:
    return url.startswith("http://") or url.startswith("https://")


_ICON_ARROW_RIGHT = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'stroke-linejoin="round" aria-hidden="true" focusable="false">'
    '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>'
)
_ICON_ARROW_UP_RIGHT = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'stroke-linejoin="round" aria-hidden="true" focusable="false">'
    '<path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>'
)


def _anchor(href: str, label: str, primary: bool = False) -> str:
    external = _is_external(href)
    extra = ' target="_blank" rel="noopener noreferrer"' if external else ""
    icon = _ICON_ARROW_UP_RIGHT if external else _ICON_ARROW_RIGHT
    variant = "card-btn-primary" if primary else "card-btn-outline"
    return (
        f'<a class="card-btn {variant}" href="{html.escape(href, quote=True)}"{extra}>'
        f"{html.escape(label)}{icon}</a>"
    )


def render_summary_card(doc: StaticDoc, cta: str) -> str:
    summary = str(doc.metadata.get("outcome") or doc.excerpt or "No summary available yet.")
    return f"""      <article class="card">
        <h2>{html.escape(doc.title)}</h2>
        <p>{html.escape(summary)}</p>
        <div class="card-links"><a class="card-btn card-btn-outline" href="{html.escape(doc.href, quote=True)}">{html.escape(cta)}{_ICON_ARROW_RIGHT}</a></div>
      </article>"""


def render_redirect(target: str, title: str) -> str:
    safe_target = html.escape(target, quote=True)
    safe_title = html.escape(title)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url={safe_target}">
  <link rel="canonical" href="{safe_target}">
  <title>{safe_title}</title>
</head>
<body>
  <p><a href="{safe_target}">{safe_title}</a></p>
</body>
</html>
"""


def render_doc_page(doc: StaticDoc, body_html: str) -> str:
    eyebrow = _doc_eyebrow(doc)
    metadata_html = _render_metadata(doc.metadata)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(doc.title)} - Scott Goley</title>
  <meta name="description" content="{html.escape(doc.excerpt, quote=True)}">
  <link rel="stylesheet" href="{doc.path_prefix}assets/css/site.css">
  {GTM_HEAD_SNIPPET}
  {GA_HEAD_SNIPPET}
</head>
<body>
  {GTM_BODY_SNIPPET}
  {render_site_header(doc.path_prefix)}

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

  {render_site_footer(doc.path_prefix)}
</body>
</html>
"""


def _cards_grid(cards: List[str]) -> str:
    if not cards:
        return ""
    return f"""    <section class="grid two-col">
{chr(10).join(cards)}
    </section>"""


_ICON_REPO = (
    '<svg class="gh-ic" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    '<path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 '
    "0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 "
    "0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9Zm10.5-1V9h-8c-.356 0-.694.074-1 "
    ".208V2.5a1 1 0 0 1 1-1h8ZM5 12.25v3.25a.25.25 0 0 0 .4.2l1.45-1.087a.25.25 "
    '0 0 1 .3 0L8.6 15.7a.25.25 0 0 0 .4-.2v-3.25a.25.25 0 0 0-.25-.25h-3.5a.25.25 0 0 0-.25.25Z"/></svg>'
)
_ICON_STAR = (
    '<svg class="gh-ic" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    '<path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 '
    "1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 "
    '0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>'
)
_ICON_FORK = (
    '<svg class="gh-ic" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    '<path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 '
    "2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 "
    "0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 "
    '0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 '
    '8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg>'
)
_ICON_PEOPLE = (
    '<svg class="gh-ic" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    '<path d="M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 '
    "0 1 1-1.482.235 4.001 4.001 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 "
    "0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.93 2.372 "
    "5.512 5.512 0 0 1 2.166 2.508.75.75 0 0 1-.31 1.005l-.19.098a.75.75 0 0 1-.832-.154 "
    'A4.01 4.01 0 0 0 11 8.5c-.35 0-.68.045-1 .13V4Z"/></svg>'
)
_ICON_CHECK = (
    '<svg class="gh-ic" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    '<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 '
    "9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 "
    '0 0 1 1.06 0Z"/></svg>'
)
_ICON_X = (
    '<svg class="gh-ic" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    '<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 '
    "1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 "
    '1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>'
)
_ICON_DOT = (
    '<svg class="gh-ic" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    '<circle cx="8" cy="8" r="5"/></svg>'
)


def _doc_repo(doc: StaticDoc, repos: Dict[str, Dict[str, Any]]) -> Dict[str, Any] | None:
    explicit = str(doc.metadata.get("repo") or "").strip().lower()
    if explicit:
        return repos.get(explicit)
    proof = str(doc.metadata.get("proof_url") or "")
    return repos.get(_repo_name_from_url(proof))


def _doc_badge(doc: StaticDoc, repo: Dict[str, Any] | None) -> str:
    if repo is not None:
        return "Public"
    label = str(doc.metadata.get("proof_label") or "").lower()
    if label in {"live", "diagram"}:
        return "Site"
    return "Private"


def _ci_chip(repo: Dict[str, Any] | None) -> str:
    run = (repo or {}).get("latest_run")
    if not run:
        return ""
    status = str(run.get("status") or "")
    conclusion = str(run.get("conclusion") or "")
    name = html.escape(str(run.get("name") or "CI"))
    if status != "completed":
        icon, cls, text = _ICON_DOT, "gh-ci-pending", "running"
    elif conclusion == "success":
        icon, cls, text = _ICON_CHECK, "gh-ci-pass", "passing"
    elif conclusion in {"failure", "timed_out", "startup_failure"}:
        icon, cls, text = _ICON_X, "gh-ci-fail", "failing"
    else:
        icon, cls, text = _ICON_DOT, "gh-ci-neutral", html.escape(conclusion or "—")
    url = html.escape(str(run.get("url") or ""), quote=True)
    title = html.escape(f"{run.get('name')}: {status}/{conclusion}", quote=True)
    return f'<a class="gh-ci {cls}" href="{url}" title="{title}" target="_blank" rel="noopener noreferrer">{icon}{name} {text}</a>'


def _repo_meta(repo: Dict[str, Any] | None) -> str:
    if not repo:
        return ""
    parts: List[str] = []
    lang = str(repo.get("language") or "")
    if lang:
        color = _LANGUAGE_COLORS.get(lang.lower(), "var(--muted)")
        parts.append(
            f'<span class="gh-lang"><span class="gh-dot" style="background:{color}"></span>'
            f"{html.escape(lang)}</span>"
        )
    stars = int(repo.get("stars") or 0)
    if stars:
        parts.append(f"{_ICON_STAR}{stars}")
    forks = int(repo.get("forks") or 0)
    if forks:
        parts.append(f"{_ICON_FORK}{forks}")
    updated = _relative_updated(str(repo.get("updated_at") or ""))
    if updated:
        parts.append(html.escape(updated))
    return "".join(f'<span class="gh-meta-item">{p}</span>' for p in parts)


def _display_name(doc: StaticDoc, repo: Dict[str, Any] | None) -> str:
    if repo:
        return f"sgoley/{repo['name']}"
    return doc.title


def render_pinned_card(doc: StaticDoc, repos: Dict[str, Dict[str, Any]]) -> str:
    repo = _doc_repo(doc, repos)
    label = str(doc.metadata.get("proof_label") or "Read").strip() or "Read"
    proof = str(doc.metadata.get("proof_url") or doc.href).strip() or doc.href
    outcome = str(doc.metadata.get("outcome") or doc.excerpt or "No summary available yet.")
    links = [_anchor(proof, label, primary=True)]
    if proof.rstrip("/") != doc.href.rstrip("/"):
        links.append(_anchor(doc.href, "Note"))
    meta = _repo_meta(repo) + _ci_chip(repo)
    meta_html = f'<div class="gh-card-meta">{meta}</div>' if meta else ""
    return f"""      <article class="gh-card">
        <div class="gh-card-head">
          {_ICON_REPO}<a class="gh-card-title" href="{html.escape(proof, quote=True)}">{html.escape(_display_name(doc, repo))}</a>
          <span class="gh-badge">{_doc_badge(doc, repo)}</span>
        </div>
        <p class="gh-card-desc">{html.escape(outcome)}</p>
        {meta_html}
        <div class="card-links">{"".join(links)}</div>
      </article>"""


def render_repo_row(doc: StaticDoc, repos: Dict[str, Dict[str, Any]]) -> str:
    repo = _doc_repo(doc, repos)
    label = str(doc.metadata.get("proof_label") or "Read").strip() or "Read"
    proof = str(doc.metadata.get("proof_url") or doc.href).strip() or doc.href
    outcome = str(doc.metadata.get("outcome") or doc.excerpt or "No summary available yet.")
    links = [_anchor(proof, label, primary=True)]
    if proof.rstrip("/") != doc.href.rstrip("/"):
        links.append(_anchor(doc.href, "Note"))
    meta = _repo_meta(repo) + _ci_chip(repo)
    meta_html = f'<div class="gh-card-meta">{meta}</div>' if meta else ""
    return f"""      <div class="gh-repo">
        <div class="gh-repo-head">
          {_ICON_REPO}<a class="gh-repo-name" href="{html.escape(proof, quote=True)}">{html.escape(_display_name(doc, repo))}</a>
          <span class="gh-badge">{_doc_badge(doc, repo)}</span>
          <span class="gh-repo-actions">{"".join(links)}</span>
        </div>
        <p class="gh-repo-desc">{html.escape(outcome)}</p>
        {meta_html}
      </div>"""


def render_contrib_graph(profile: Dict[str, Any]) -> str:
    contrib = profile.get("contributions") or {}
    weeks = contrib.get("weeks") or []
    if not weeks:
        return ""

    month_labels: List[str] = []
    prev_label_col = -3
    prev_month = -1
    for col, week in enumerate(weeks):
        first = next((c for c in week if c), None)
        if not first:
            month_labels.append("<span></span>")
            continue
        month = int(first["date"][5:7])
        if month != prev_month and col - prev_label_col >= 3:
            month_labels.append(
                f"<span>{html.escape(datetime.strptime(first['date'], '%Y-%m-%d').strftime('%b'))}</span>"
            )
            prev_label_col = col
            prev_month = month
        else:
            month_labels.append("<span></span>")
            if month != prev_month:
                prev_month = month

    week_html: List[str] = []
    for week in weeks:
        cells = "".join(
            f'<span class="gh-day" data-level="{cell["level"]}" '
            f'title="{cell["count"]} contribution{"s" if cell["count"] != 1 else ""} '
            f'on {cell["date"]}"></span>'
            if cell
            else '<span class="gh-day gh-day-empty"></span>'
            for cell in week
        )
        week_html.append(f'<div class="gh-week">{cells}</div>')

    total = contrib.get("total") or 0
    total_html = f"{total:,} contributions in the last year" if total else "Contributions in the last year"
    return f"""      <section class="gh-contribs">
        <div class="gh-contribs-head">
          <h2>{html.escape(total_html)}</h2>
          <a href="{GITHUB_URL}" target="_blank" rel="noopener noreferrer">@{GITHUB_USERNAME}</a>
        </div>
        <div class="gh-graph-scroll">
          <div class="gh-months">{"".join(month_labels)}</div>
          <div class="gh-graph">{"".join(week_html)}</div>
        </div>
        <div class="gh-legend">
          <span>Less</span>
          <span class="gh-day" data-level="0"></span><span class="gh-day" data-level="1"></span><span class="gh-day" data-level="2"></span><span class="gh-day" data-level="3"></span><span class="gh-day" data-level="4"></span>
          <span>More</span>
        </div>
      </section>"""


def render_profile_sidebar(profile: Dict[str, Any]) -> str:
    user = profile.get("user") or {}
    avatar = str(user.get("avatar_url") or "")
    login = str(user.get("login") or GITHUB_USERNAME)
    name = str(user.get("name") or "").strip()
    if not name or name.lower() == login.lower():
        name = "Scott Goley"
    bio = str(user.get("bio") or "Data, analytics, and AI systems.")
    profile_url = str(user.get("html_url") or GITHUB_URL)
    generated = str(profile.get("generated_at") or "")
    generated_note = ""
    if generated:
        try:
            generated_note = datetime.fromisoformat(generated).strftime("%b %-d, %Y")
        except ValueError:
            generated_note = ""

    facts: List[str] = []
    if user.get("company"):
        facts.append(f"<li>{html.escape(str(user['company']))}</li>")
    if user.get("location"):
        facts.append(f"<li>{html.escape(str(user['location']))}</li>")
    if user.get("blog"):
        blog = str(user["blog"])
        facts.append(
            f'<li><a href="{html.escape(blog, quote=True)}" target="_blank" rel="noopener noreferrer">{html.escape(blog.replace("https://", "").replace("http://", ""))}</a></li>'
        )
    if user.get("created_at"):
        try:
            joined = datetime.fromisoformat(
                str(user["created_at"]).replace("Z", "+00:00")
            ).strftime("%b %Y")
            facts.append(f"<li>Joined {html.escape(joined)}</li>")
        except ValueError:
            pass
    if user.get("public_repos"):
        facts.append(f"<li>{int(user['public_repos'])} public repos</li>")

    stats_html = ""
    if user:
        stats_html = f"""        <div class="gh-stats">
          {_ICON_PEOPLE}<strong>{int(user.get('followers') or 0)}</strong> followers
          · <strong>{int(user.get('following') or 0)}</strong> following
          · {_ICON_STAR}<strong>{int(profile.get('total_stars') or 0)}</strong>
        </div>"""

    return f"""    <aside class="gh-sidebar">
      <img class="gh-avatar" src="{html.escape(avatar, quote=True)}" alt="{html.escape(name, quote=True)}" width="296" height="296">
      <h1 class="gh-name">{html.escape(name)}</h1>
      <p class="gh-handle">{html.escape(login)}</p>
      <p class="gh-bio">{html.escape(bio)}</p>
      <a class="btn btn-ghost gh-follow" href="{html.escape(profile_url, quote=True)}" target="_blank" rel="noopener noreferrer">Follow on GitHub</a>
{stats_html}
      <ul class="gh-facts">{"".join(facts)}</ul>
      <p class="gh-note">
        This site <em>is</em> a repo — <a href="https://github.com/sgoley/sgoley.github.io" target="_blank" rel="noopener noreferrer">sgoley/sgoley.github.io</a>.
        Everything above the fold is rendered from the GitHub API{f' as of {generated_note}' if generated_note else ''}.
      </p>
    </aside>"""


def render_work_page(projects: List[StaticDoc], profile: Dict[str, Any]) -> str:
    repos = _repo_lookup(profile)
    featured = sorted(
        (doc for doc in projects if _featured_rank(doc) > 0),
        key=_featured_rank,
    )
    featured_ids = {doc.href for doc in featured}
    shelves = [
        ("open", "Open it", "Product sites and live analyses."),
        ("install", "Install it", "Packages and small services."),
        ("read", "Read it", "How a system is built. Some of these repositories stay private."),
    ]
    shelf_html: List[str] = []
    for key, heading, lede in shelves:
        rows = [
            render_repo_row(doc, repos)
            for doc in projects
            if doc.href not in featured_ids and _shelf(doc) == key
        ]
        if not rows:
            continue
        shelf_html.append(
            f"""      <section class="shelf">
        <h2>{html.escape(heading)}</h2>
        <p class="lede">{html.escape(lede)}</p>
        <div class="gh-repo-list">
{chr(10).join(rows)}
        </div>
      </section>"""
        )

    pinned = "\n".join(render_pinned_card(doc, repos) for doc in featured)
    contrib = render_contrib_graph(profile)
    body = f"""  <main class="container">
    <div class="gh-layout">
{render_profile_sidebar(profile)}
      <div class="gh-main">
      <section class="gh-readme">
        <div class="gh-readme-head">{_ICON_REPO}<span>sgoley</span><span class="gh-sep">/</span><strong>README.md</strong></div>
        <div class="gh-readme-body">
          <h2>A workbench, rendered as a GitHub profile</h2>
          <p>This site presents my work the way GitHub would — but it isn't GitHub, and the site itself is a repo too.</p>
          <ul class="gh-readme-list">
            <li>📌 <strong>Pinned</strong> — the four projects worth opening first; shelves below group the rest: live apps, packages, write-ups.</li>
            <li>🗃️ <strong>Repositories</strong> — every public repo on github.com/sgoley with a one-line explainer, searchable and filterable.</li>
            <li>💼 <strong>Experience</strong> &amp; <strong>Writing</strong> — the résumé and the essays.</li>
            <li>💬 <strong>Ask</strong> — a chat box that answers questions using this site's own content.</li>
            <li>🟩 <strong>Real data</strong> — every star, language, CI chip, and green square comes from the GitHub API at build time.</li>
          </ul>
        </div>
      </section>

      <section class="shelf">
        <h2>Pinned</h2>
        <section class="grid two-col">
{pinned}
        </section>
      </section>
{contrib}
{chr(10).join(shelf_html)}
      </div>
    </div>
  </main>"""
    return _page_shell(
        title="Scott Goley",
        description="Public work by Scott Goley: data packages, tools, and a homelab.",
        body=body,
    )


def _repo_doc_map(
    projects: List[StaticDoc], repos: Dict[str, Dict[str, Any]]
) -> Dict[str, StaticDoc]:
    mapping: Dict[str, StaticDoc] = {}
    for doc in projects:
        repo = _doc_repo(doc, repos)
        if repo and repo["name"].lower() not in mapping:
            mapping[repo["name"].lower()] = doc
    return mapping


_REPO_EXPLAINERS = {
    "sgoley.github.io": "Source for this site — markdown content in, generated pages and a GitHub-powered profile out.",
    "sgoley": "The README shown at the top of github.com/sgoley.",
    "bqrest": "A thin Go client for calling BigQuery's REST API without the full SDK.",
    "skills": "Skill specs for decision simulations and Tailscale operations, installed as one package.",
    "lake-sort": "Sorts dropzone files into a partitioned lake or Iceberg table, as a job an orchestrator can call.",
    "interactive-docs-chat-template": "Starter template for embedding an LLM chat box into a docs or static site.",
    "simple-contact": "A static contact-card page.",
    "personal-contact": "A static personal contact page.",
    "home-slice-mcp": "An MCP server exposing homelab service status and tools to an assistant.",
    "llm-exports-mcp": "An MCP server that turns LLM chat exports into a queryable database.",
    "ccdb-sdk": "A small Python SDK for a card-database API.",
    "publish-resume-pro": "Publishes a résumé as a formatted page.",
    "stlt-lottery-heatmap": "Streamlit doodle: lottery draw frequencies as a heatmap.",
    "stlt-baby-kcal": "Streamlit doodle: baby feeding and calorie tracker.",
    "stlt-baby-bet": "Streamlit doodle: a friendly bet tracker for baby stats.",
    "stlt-login-form-test-app": "Test app for the st-login-form Streamlit auth component.",
    "stlt-doodles": "Grab-bag of small Streamlit visualizations.",
    "stlt-address-autofill": "Streamlit doodle: address autocomplete backed by a geocoding API.",
    "stlt-gfc-explorer": "Streamlit explorer for a public dataset.",
    "stlt-protein-calc": "Streamlit doodle: protein and macro calculator.",
    "stlt-csv-explorer": "Streamlit doodle: drop in a CSV and explore it.",
    "stlt-market-matrix": "Streamlit re-creation of the stock-market returns matrix.",
    "shppt-data-stack": "Example modern data stack built for a demo company.",
}


def _repo_explainer(repo: Dict[str, Any], doc: StaticDoc | None) -> str:
    override = _REPO_EXPLAINERS.get(str(repo.get("name") or "").lower())
    if override:
        return override
    if doc is not None:
        return str(doc.metadata.get("outcome") or doc.excerpt or "")
    desc = str(repo.get("description") or "").strip()
    if desc:
        return desc
    if repo.get("fork"):
        return "Forked repository — see upstream for details."
    return "No description on GitHub yet."


def render_repo_card(repo: Dict[str, Any], doc: StaticDoc | None) -> str:
    name = str(repo.get("name") or "")
    url = str(repo.get("url") or GITHUB_URL)
    badge = "Fork" if repo.get("fork") else ("Archive" if repo.get("archived") else "Public")
    explainer = _repo_explainer(repo, doc)
    links = [_anchor(url, "Source", primary=True)]
    if doc is not None:
        links.append(_anchor(doc.href, "Note"))
    meta = _repo_meta(repo) + _ci_chip(repo)
    meta_html = f'<div class="gh-card-meta">{meta}</div>' if meta else ""
    lang_tag = (str(repo.get("language") or "other")).lower().replace(" ", "-") or "other"
    search_text = html.escape(
        f"{name} {repo.get('description') or ''} {explainer}".lower(), quote=True
    )
    return f"""      <article class="gh-card article-card" data-tags="{html.escape(lang_tag, quote=True)}" data-search="{search_text}">
        <div class="gh-card-head">
          {_ICON_REPO}<a class="gh-card-title" href="{html.escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">sgoley/{html.escape(name)}</a>
          <span class="gh-badge">{badge}</span>
        </div>
        <p class="gh-card-desc">{html.escape(explainer)}</p>
        {meta_html}
        <div class="card-links">{"".join(links)}</div>
      </article>"""


def render_repositories_page(projects: List[StaticDoc], profile: Dict[str, Any]) -> str:
    repos = _repo_lookup(profile)
    doc_by_repo = _repo_doc_map(projects, repos)
    all_repos = sorted(
        profile.get("repos") or [],
        key=lambda r: str(r.get("updated_at") or ""),
        reverse=True,
    )

    lang_counts: Dict[str, int] = {}
    for repo in all_repos:
        lang = str(repo.get("language") or "other")
        lang_counts[lang] = lang_counts.get(lang, 0) + 1
    top_langs = [
        lang for lang, _ in sorted(lang_counts.items(), key=lambda kv: -kv[1]) if lang != "other"
    ][:7]
    chips = ['<button class="tag active" data-filter="all">All</button>']
    chips += [
        f'<button class="tag" data-filter="{html.escape(lang.lower().replace(" ", "-"), quote=True)}">{html.escape(lang)}</button>'
        for lang in top_langs
    ]

    cards = "\n".join(
        render_repo_card(repo, doc_by_repo.get(str(repo.get("name") or "").lower()))
        for repo in all_repos
    )
    body = f"""  <main class="container stack">
    <section class="panel">
      <p class="eyebrow">Repositories</p>
      <h1>Repositories <span class="gh-count">{len(all_repos)}</span></h1>
      <p class="lede">Every public repository on github.com/sgoley, newest pushes first.
      Repositories with a Note link have a project write-up on this site.</p>
      <input class="gh-search" type="search" placeholder="Find a repository..." aria-label="Find a repository" data-repo-search>
      <div class="tag-row">{"".join(chips)}</div>
    </section>
    <section class="grid two-col" data-repo-list>
{cards}
    </section>
  </main>"""
    return _page_shell(
        title="Repositories - Scott Goley",
        description="Every public repository by Scott Goley on GitHub.",
        body=body,
    )


def render_experience_page(docs: List[StaticDoc], intro_html: str) -> str:
    cards = _cards_grid([render_summary_card(doc, "Read") for doc in docs])
    body = f"""  <main class="container stack">
    <section class="panel">
      <p class="eyebrow">Experience</p>
      <h1>Experience</h1>
      <div class="article-prose">
{intro_html}
      </div>
    </section>
{cards}
  </main>"""
    return _page_shell(
        title="Experience - Scott Goley",
        description="Education and work experience.",
        body=body,
    )


def render_writing_page(docs: List[StaticDoc]) -> str:
    cards = _cards_grid([render_summary_card(doc, "Read") for doc in docs])
    body = f"""  <main class="container stack">
    <section class="panel">
      <p class="eyebrow">Writing</p>
      <h1>Writing</h1>
      <p class="lede">Essays. The job timeline is on Experience.</p>
    </section>
{cards}
  </main>"""
    return _page_shell(
        title="Writing - Scott Goley",
        description="Essays by Scott Goley.",
        body=body,
    )


def _experience_intro_html(repo_root: Path) -> str:
    path = repo_root / "content" / "experience.md"
    if not path.exists():
        return "<p>Education and roles.</p>"
    _metadata, body = _parse_frontmatter(path.read_text(encoding="utf-8"))
    return markdown_to_html(body, lambda _target, label: label)


def _load_system_prompt_template(repo_root: Path) -> str:
    prompt_path = repo_root / "prompts" / "default_system.txt"
    if prompt_path.exists():
        return prompt_path.read_text(encoding="utf-8").strip()
    return (
        "You are the personal website assistant for Scott Goley's website.\n"
        "Ground answers in markdown content from content/."
    )


def _build_catalog_lines(docs: List[StaticDoc]) -> str:
    if not docs:
        return "- No markdown files are currently available."
    lines = []
    for doc in docs:
        pub_date = doc.metadata.get("published", "")
        date_str = f", date: {pub_date}" if pub_date else ""
        lines.append(
            f"- {doc.title} (slug: {doc.source_path.with_suffix('').as_posix()}, path: {doc.source_path.as_posix()}{date_str})"
        )
    return "\n".join(lines)


def _write_chat_context_payload(repo_root: Path, docs: List[StaticDoc]) -> None:
    prompt_template = _load_system_prompt_template(repo_root)
    catalog_lines = _build_catalog_lines(docs)
    system_prompt = (
        prompt_template.replace("{{ARTICLE_CATALOG}}", catalog_lines)
        if "{{ARTICLE_CATALOG}}" in prompt_template
        else f"{prompt_template}\n\nAvailable projects, articles, and posts:\n{catalog_lines}"
    )

    payload = {
        "system_prompt_template": prompt_template,
        "system_prompt": system_prompt,
        "documents": [
            {
                "kind": doc.kind,
                "title": doc.title,
                "source_path": doc.source_path.as_posix(),
                "slug": doc.source_path.with_suffix("").as_posix(),
                "href": doc.href,
                "excerpt": doc.excerpt,
                "markdown": doc.body_markdown,
                "published": str(doc.metadata.get("published", "")),
            }
            for doc in docs
        ],
    }

    output_path = repo_root / "assets" / "data" / "chat-context.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _collect_docs(
    repo_root: Path,
    *,
    section: str,
    output_root_name: str,
    keep_section_path_in_output: bool,
    kind: str,
) -> List[StaticDoc]:
    content_root = repo_root / "content"
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
        if str(metadata.get("status", "")).lower() == "draft":
            continue

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

    experience_docs = [doc for doc in articles if _content_group(doc) == "experience"]
    writing_docs = [doc for doc in articles if _content_group(doc) == "writing"]

    ci_repo_names = {
        name
        for doc in projects
        for name in (
            str(doc.metadata.get("repo") or "").strip().lower()
            or _repo_name_from_url(str(doc.metadata.get("proof_url") or "")),
        )
        if name
    }
    github_profile = _load_or_fetch_github_profile(repo_root, ci_repo_names)

    (repo_root / "index.html").write_text(
        render_work_page(projects, github_profile), encoding="utf-8"
    )
    (repo_root / "repositories.html").write_text(
        render_repositories_page(projects, github_profile), encoding="utf-8"
    )
    (repo_root / "experience.html").write_text(
        render_experience_page(experience_docs, _experience_intro_html(repo_root)),
        encoding="utf-8",
    )
    (repo_root / "articles.html").write_text(render_writing_page(writing_docs), encoding="utf-8")
    (repo_root / "projects.html").write_text(
        render_redirect("index.html", "Work"),
        encoding="utf-8",
    )
    (repo_root / "about.html").write_text(
        render_redirect("experience.html", "Experience"),
        encoding="utf-8",
    )
    _write_chat_context_payload(repo_root, all_docs)

    print(f"Generated {len(articles)} article pages into articles/")
    print(f"Generated {len(projects)} project pages into projects/")
    print(f"Experience entries: {len(experience_docs)}; writing entries: {len(writing_docs)}")
    if removed_articles or removed_projects:
        print(
            f"Removed stale pages: articles={removed_articles}, projects={removed_projects}"
        )
    print("Updated index.html, experience.html, articles.html, projects.html, about.html, and chat context")


if __name__ == "__main__":
    main()
