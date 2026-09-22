(() => {
  const applyTheme = () => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved ? saved === "dark" : prefersDark;
    document.documentElement.classList.toggle("light", !isDark);
  };

  const setTheme = (dark) => {
    document.documentElement.classList.toggle("light", !dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  };

  applyTheme();

  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".site-nav a").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === current || (current === "" && href === "index.html")) {
      link.classList.add("active");
    }
  });

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  const chatRoot = document.getElementById("native-chat");
  if (chatRoot) {
    const params = new URLSearchParams(window.location.search);
    const endpointFromParam = (params.get("chat_api") || "").trim();
    const endpointFromData = (chatRoot.dataset.chatEndpoint || "").trim();
    const endpoint = endpointFromParam || endpointFromData;
    const model = (chatRoot.dataset.chatModel || "openai/gpt-oss-120b").trim();
    const note = document.getElementById("chat-note");
    const thread = document.getElementById("chat-thread");
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");
    const endpointPlaceholder = "YOUR-CLOUDFLARE-WORKER-URL";
    let chatContext = null;
    const history = [];

    const setEmptyState = () => {
      if (!thread || thread.childElementCount > 0) {
        return;
      }
      const empty = document.createElement("p");
      empty.className = "chat-empty";
      empty.textContent = "Ask a question to start the conversation.";
      thread.appendChild(empty);
    };

    const clearEmptyState = () => {
      if (!thread) {
        return;
      }
      thread.querySelectorAll(".chat-empty").forEach((node) => node.remove());
    };

    const renderMarkdown = (rawMarkdown) => {
      if (!rawMarkdown) return "";

      const codeBlocks = [];
      let text = String(rawMarkdown).replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        const escapedCode = code
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        codeBlocks.push(`<pre><code class="${lang ? `language-${lang}` : ""}">${escapedCode}</code></pre>`);
        return `\n\n@@CODE_BLOCK_${idx}@@\n\n`;
      });

      text = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const inlineFormat = (str) => {
        const inlineCode = [];
        let s = str.replace(/`([^`]+)`/g, (_, code) => {
          const idx = inlineCode.length;
          inlineCode.push(`<code>${code}</code>`);
          return `@@INLINE_CODE_${idx}@@`;
        });

        const links = [];
        s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+|#[^\s)]+)\)/g, (_, label, url) => {
          const idx = links.length;
          links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
          return `@@LINK_${idx}@@`;
        });

        s = s.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
          let trailing = "";
          while (url && ".,:;!?".includes(url.slice(-1))) {
            trailing = url.slice(-1) + trailing;
            url = url.slice(0, -1);
          }
          const idx = links.length;
          links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
          return `@@LINK_${idx}@@${trailing}`;
        });

        s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
        s = s.replace(/(^|[^\*])\*([^*]+)\*([^\*]|$)/g, "$1<em>$2</em>$3");
        s = s.replace(/(^|[^_])_([^_]+)_([^_]|$)/g, "$1<em>$2</em>$3");
        s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");

        s = s.replace(/@@LINK_(\d+)@@/g, (_, idx) => links[Number(idx)] || "");
        s = s.replace(/@@INLINE_CODE_(\d+)@@/g, (_, idx) => inlineCode[Number(idx)] || "");
        return s;
      };

      const lines = text.split("\n");
      const outputBlocks = [];
      let currentList = null;
      let currentQuote = null;
      let inTable = false;
      let tableLines = [];

      const flushList = () => {
        if (!currentList) return;
        const tag = currentList.type;
        const itemsHtml = currentList.items.map((it) => `<li>${inlineFormat(it)}</li>`).join("");
        outputBlocks.push(`<${tag}>${itemsHtml}</${tag}>`);
        currentList = null;
      };

      const flushQuote = () => {
        if (!currentQuote) return;
        outputBlocks.push(`<blockquote>${inlineFormat(currentQuote.join(" "))}</blockquote>`);
        currentQuote = null;
      };

      const flushTable = () => {
        if (!inTable || tableLines.length === 0) {
          inTable = false;
          tableLines = [];
          return;
        }
        if (tableLines.length >= 2) {
          const splitRow = (row) => {
            let clean = row.trim();
            if (clean.startsWith("|")) clean = clean.slice(1);
            if (clean.endsWith("|")) clean = clean.slice(0, -1);
            return clean.split("|").map((cell) => cell.trim());
          };
          const headerRow = splitRow(tableLines[0]);
          const isSep = /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(tableLines[1].trim());
          if (isSep) {
            let tableHtml = '<div class="chat-table-wrap"><table><thead><tr>';
            headerRow.forEach((h) => {
              tableHtml += `<th>${inlineFormat(h)}</th>`;
            });
            tableHtml += '</tr></thead><tbody>';
            const dataRows = tableLines.slice(2).map(splitRow);
            dataRows.forEach((row) => {
              if (row.length === 1 && row[0] === "") return;
              tableHtml += '<tr>';
              for (let i = 0; i < headerRow.length; i++) {
                tableHtml += `<td>${inlineFormat(row[i] || "")}</td>`;
              }
              tableHtml += '</tr>';
            });
            tableHtml += '</tbody></table></div>';
            outputBlocks.push(tableHtml);
            inTable = false;
            tableLines = [];
            return;
          }
        }
        tableLines.forEach((l) => outputBlocks.push(`<p>${inlineFormat(l)}</p>`));
        inTable = false;
        tableLines = [];
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith("@@CODE_BLOCK_") && trimmed.endsWith("@@")) {
          flushList();
          flushQuote();
          flushTable();
          const match = trimmed.match(/@@CODE_BLOCK_(\d+)@@/);
          if (match) {
            outputBlocks.push(codeBlocks[Number(match[1])] || "");
          }
          continue;
        }

        if (trimmed.startsWith("|") && (trimmed.endsWith("|") || trimmed.includes("|"))) {
          flushList();
          flushQuote();
          inTable = true;
          tableLines.push(trimmed);
          continue;
        } else if (inTable) {
          flushTable();
        }

        if (!trimmed) {
          flushList();
          flushQuote();
          continue;
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
          flushList();
          flushQuote();
          const level = Math.min(6, headingMatch[1].length + 2);
          outputBlocks.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
          continue;
        }

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
          flushList();
          flushQuote();
          outputBlocks.push("<hr>");
          continue;
        }

        if (trimmed.startsWith("&gt;") || trimmed.startsWith(">")) {
          flushList();
          const quoteText = trimmed.replace(/^(&gt;|>)\s?/, "");
          if (!currentQuote) currentQuote = [];
          currentQuote.push(quoteText);
          continue;
        } else if (currentQuote) {
          flushQuote();
        }

        const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/);
        if (ulMatch) {
          if (!currentList || currentList.type !== "ul") {
            flushList();
            currentList = { type: "ul", items: [] };
          }
          currentList.items.push(ulMatch[1]);
          continue;
        }

        const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
        if (olMatch) {
          if (!currentList || currentList.type !== "ol") {
            flushList();
            currentList = { type: "ol", items: [] };
          }
          currentList.items.push(olMatch[1]);
          continue;
        }

        flushList();
        outputBlocks.push(`<p>${inlineFormat(trimmed)}</p>`);
      }

      flushList();
      flushQuote();
      flushTable();

      return outputBlocks.join("");
    };

    const appendMessage = (role, text) => {
      if (!thread) {
        return null;
      }
      clearEmptyState();
      const bubble = document.createElement("div");
      bubble.className =
        role === "user"
          ? "chat-message chat-message-user"
          : "chat-message chat-message-assistant";
      if (role === "user") {
        bubble.textContent = text;
      } else {
        bubble.innerHTML = renderMarkdown(text);
      }
      thread.appendChild(bubble);
      thread.scrollTop = thread.scrollHeight;
      return bubble;
    };

    const setFormBusy = (busy) => {
      if (form) {
        form.querySelectorAll("button, textarea").forEach((node) => {
          node.disabled = busy;
        });
      }
    };

    const tokenize = (value) =>
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length > 2);

    const selectRelevantDocs = (query, docs, maxDocs = 4) => {
      if (!Array.isArray(docs) || docs.length === 0) {
        return [];
      }
      const terms = tokenize(query);
      if (terms.length === 0) {
        return docs.slice(0, maxDocs);
      }
      return docs
        .map((doc) => {
          const title = (doc.title || "").toLowerCase();
          const source = (doc.source_path || "").toLowerCase();
          const body = (doc.markdown || "").toLowerCase();
          let score = 0;
          terms.forEach((term) => {
            score += title.includes(term) ? 6 : 0;
            score += source.includes(term) ? 3 : 0;
            score += Math.min(4, body.split(term).length - 1);
          });
          return { score, doc };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxDocs)
        .map((item) => item.doc);
    };

    const buildSystemPrompt = (query) => {
      const docs = selectRelevantDocs(query, chatContext?.documents || []);
      const basePrompt =
        chatContext?.system_prompt ||
        "You are the personal website assistant. Ground answers in provided markdown excerpts.";
      if (docs.length === 0) {
        return basePrompt;
      }
      const excerptBlock = docs
        .map((doc) => {
          const body = String(doc.markdown || "").slice(0, 5000);
          return [
            `Title: ${doc.title || "Untitled"}`,
            `Path: ${doc.source_path || "unknown"}`,
            `Public Link: https://scottgoley.com/${doc.href || ""}`,
            "Markdown:",
            body,
          ].join("\n");
        })
        .join("\n\n---\n\n");
      return `${basePrompt}\n\nContext excerpts:\n${excerptBlock}`;
    };

    const streamAssistantReply = async (response, onChunk) => {
      const reader = response.body?.getReader();
      if (!reader) {
        const payload = await response.json();
        const content =
          payload?.choices?.[0]?.message?.content ||
          payload?.choices?.[0]?.delta?.content ||
          "";
        if (content) {
          onChunk(content);
        }
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          rawEvent
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .forEach((line) => {
              const data = line.slice(5).trim();
              if (!data || data === "[DONE]") {
                return;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed?.error?.message) {
                  throw new Error(parsed.error.message);
                }
                const delta =
                  parsed?.choices?.[0]?.delta?.content ||
                  parsed?.choices?.[0]?.message?.content ||
                  "";
                if (delta) {
                  onChunk(delta);
                }
              } catch (error) {
                if (error instanceof Error) {
                  throw error;
                }
              }
            });
          boundary = buffer.indexOf("\n\n");
        }
      }
    };

    const loadContext = async () => {
      const contextParam = (params.get("chat_context") || "").trim();
      const contextUrl = contextParam || "assets/data/chat-context.json";
      const response = await fetch(contextUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Unable to load context (${response.status})`);
      }
      chatContext = await response.json();
    };

    const endpointMissing = !endpoint || endpoint.includes(endpointPlaceholder);
    if (endpointMissing) {
      if (note) {
        note.hidden = false;
      }
      setFormBusy(true);
      setEmptyState();
    } else {
      if (note) {
        note.hidden = true;
      }
      setEmptyState();
      loadContext().catch((error) => {
        const message = error instanceof Error ? error.message : "Unable to load chat context.";
        appendMessage("assistant", `Context load warning: ${message}`);
      });
    }

    if (form && input && !endpointMissing) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const userText = input.value.trim();
        if (!userText) {
          return;
        }

        appendMessage("user", userText);
        history.push({ role: "user", content: userText });
        input.value = "";
        setFormBusy(true);

        const assistantBubble = appendMessage("assistant", "...");
        let assistantText = "";

        try {
          const systemPrompt = buildSystemPrompt(userText);
          const messageWindow = history.slice(-10);
          const payload = {
            model,
            stream: true,
            messages: [{ role: "system", content: systemPrompt }, ...messageWindow],
          };

          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const detail = await response.text();
            throw new Error(detail || `Request failed (${response.status})`);
          }

          await streamAssistantReply(response, (chunk) => {
            assistantText += chunk;
            if (assistantBubble) {
              assistantBubble.innerHTML = renderMarkdown(assistantText || "...");
              thread.scrollTop = thread.scrollHeight;
            }
          });

          assistantText = assistantText.trim() || "I wasn't able to generate a response.";
        } catch (error) {
          assistantText =
            error instanceof Error
              ? `Request error: ${error.message}`
              : "Request error: unknown failure.";
        } finally {
          if (assistantBubble) {
            assistantBubble.innerHTML = renderMarkdown(assistantText);
            thread.scrollTop = thread.scrollHeight;
          }
          history.push({ role: "assistant", content: assistantText });
          setFormBusy(false);
          input.focus();
        }
      });
    }
  }

  const tagButtons = document.querySelectorAll(".tag[data-filter]");
  if (tagButtons.length > 0) {
    tagButtons.forEach((button) => {
      button.addEventListener("click", () => {
        tagButtons.forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");

        const filter = button.dataset.filter;
        document.querySelectorAll(".article-card").forEach((card) => {
          if (filter === "all") {
            card.removeAttribute("hidden");
            return;
          }
          const tags = (card.getAttribute("data-tags") || "").split(/\s+/);
          if (tags.includes(filter)) {
            card.removeAttribute("hidden");
          } else {
            card.setAttribute("hidden", "hidden");
          }
        });
      });
    });
  }

  const previewLinks = document.querySelectorAll("a.link-preview[data-preview-image]");
  if (previewLinks.length > 0) {
    const overlay = document.createElement("div");
    overlay.className = "link-preview-overlay";
    overlay.hidden = true;

    const previewImage = document.createElement("img");
    previewImage.alt = "Link preview";
    overlay.appendChild(previewImage);
    document.body.appendChild(overlay);

    const placeOverlay = (event) => {
      const gap = 14;
      const width = overlay.offsetWidth || 320;
      const height = overlay.offsetHeight || 220;
      let left = event.clientX + gap;
      let top = event.clientY + gap;

      if (left + width > window.innerWidth - 8) {
        left = event.clientX - width - gap;
      }
      if (top + height > window.innerHeight - 8) {
        top = event.clientY - height - gap;
      }

      overlay.style.left = `${Math.max(8, left)}px`;
      overlay.style.top = `${Math.max(8, top)}px`;
    };

    const hideOverlay = () => {
      overlay.hidden = true;
      previewImage.removeAttribute("src");
    };

    previewLinks.forEach((link) => {
      const previewSrc = link.getAttribute("data-preview-image");
      if (!previewSrc) {
        return;
      }

      link.addEventListener("mouseenter", (event) => {
        previewImage.src = previewSrc;
        overlay.hidden = false;
        placeOverlay(event);
      });

      link.addEventListener("mousemove", (event) => {
        if (!overlay.hidden) {
          placeOverlay(event);
        }
      });

      link.addEventListener("mouseleave", hideOverlay);
      link.addEventListener("blur", hideOverlay);
    });
  }

  const nav = document.querySelector(".site-nav");
  if (nav) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "theme-toggle";
    toggle.setAttribute("aria-label", "Toggle theme");
    toggle.textContent = "◐";
    toggle.addEventListener("click", () => {
      const isDark = !document.documentElement.classList.contains("light");
      setTheme(!isDark);
    });
    nav.appendChild(toggle);
  }
})();
