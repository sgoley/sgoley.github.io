(() => {
  const root = document.documentElement;
  const navWrap = document.querySelector(".nav-wrap");
  const themeStorageKey = "sgoley-theme";
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const readStoredTheme = () => {
    try {
      return localStorage.getItem(themeStorageKey);
    } catch (error) {
      console.warn("Unable to read saved theme preference.", error);
      return null;
    }
  };

  const writeStoredTheme = (theme) => {
    try {
      localStorage.setItem(themeStorageKey, theme);
    } catch (error) {
      console.warn("Unable to save theme preference.", error);
    }
  };

  const applyTheme = (theme) => {
    const normalizedTheme = theme === "light" ? "light" : "dark";
    root.dataset.theme = normalizedTheme;

    const toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      const nextTheme = normalizedTheme === "dark" ? "light" : "dark";
      const icon = toggle.querySelector(".theme-toggle-icon");
      const label = toggle.querySelector(".theme-toggle-label");
      if (icon) {
        icon.textContent = normalizedTheme === "dark" ? "☾" : "☀";
      }
      if (label) {
        label.textContent = `Switch to ${nextTheme} mode`;
      }
      toggle.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
      toggle.setAttribute("title", `Switch to ${nextTheme} mode`);
    }
  };

  const savedTheme = readStoredTheme();
  const hasSavedTheme = savedTheme === "dark" || savedTheme === "light";
  const preferredTheme = mediaQuery.matches ? "dark" : "light";
  applyTheme(hasSavedTheme ? savedTheme : preferredTheme);

  if (navWrap) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "theme-toggle";
    toggle.setAttribute("data-theme-toggle", "");
    toggle.innerHTML =
      '<span class="theme-toggle-icon" aria-hidden="true"></span><span class="theme-toggle-label visually-hidden"></span>';
    toggle.addEventListener("click", () => {
      const currentTheme = root.dataset.theme === "light" ? "light" : "dark";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      writeStoredTheme(nextTheme);
    });
    navWrap.appendChild(toggle);
    applyTheme(root.dataset.theme);
  }

  if (!hasSavedTheme) {
    mediaQuery.addEventListener("change", (event) => {
      applyTheme(event.matches ? "dark" : "light");
    });
  }

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
    const feedbackFromParam = (params.get("feedback_api") || "").trim();
    const feedbackFromData = (chatRoot.dataset.feedbackEndpoint || "").trim();
    const note = document.getElementById("chat-note");
    const thread = document.getElementById("chat-thread");
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");
    const sourceCards = document.getElementById("source-cards");
    const modeButtons = document.querySelectorAll("[data-chat-mode]");
    const promptButtons = document.querySelectorAll("[data-prompt]");
    const handoffForm = document.getElementById("handoff-form");
    const handoffStatus = document.getElementById("handoff-status");
    const endpointPlaceholder = "YOUR-CLOUDFLARE-WORKER-URL";
    const configuredEndpoint = endpointFromParam || endpointFromData;
    const configuredFeedbackEndpoint = feedbackFromParam || feedbackFromData;
    const looksLikeDomain = (value) =>
      /^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value);
    const normalizeEndpoint = (value) => {
      const trimmed = String(value || "").trim();
      if (!trimmed || trimmed.includes(endpointPlaceholder)) {
        return "";
      }

      let candidate = trimmed;
      if (!/^https?:\/\//i.test(candidate) && !candidate.startsWith("/")) {
        candidate = looksLikeDomain(candidate)
          ? `https://${candidate}`
          : `/${candidate.replace(/^\/+/, "")}`;
      }

      try {
        const url = candidate.startsWith("/")
          ? new URL(candidate, window.location.origin)
          : new URL(candidate);
        if (!url.pathname || url.pathname === "/") {
          url.pathname = "/chat";
        }
        return url.toString();
      } catch {
        return "";
      }
    };
    const endpoint = normalizeEndpoint(configuredEndpoint) || `${window.location.origin}/chat`;
    const feedbackEndpoint =
      normalizeEndpoint(configuredFeedbackEndpoint) ||
      endpoint.replace(/\/chat\/?$/i, "/feedback");
    let chatContext = null;
    const history = [];
    let currentMode = "discover";
    let lastRelevantDocs = [];
    const draftStorageKey = "sgoley-async-handoff-v1";
    const draftTtlMs = 7 * 24 * 60 * 60 * 1000;
    const sessionId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const escapeHtml = (value) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

    const renderInlineMarkdown = (value) => {
      let html = escapeHtml(value);
      html = html.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );
      html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
      html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      return html;
    };

    const renderAssistantMarkdown = (markdownText) => {
      const lines = String(markdownText || "").replace(/\r/g, "").split("\n");
      const out = [];
      let inCode = false;
      let codeLines = [];
      let paragraphLines = [];
      let listType = null;

      const closeList = () => {
        if (listType) {
          out.push(`</${listType}>`);
          listType = null;
        }
      };

      const flushParagraph = () => {
        if (paragraphLines.length === 0) {
          return;
        }
        out.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
        paragraphLines = [];
      };

      const openList = (nextType) => {
        if (listType !== nextType) {
          closeList();
          out.push(`<${nextType}>`);
          listType = nextType;
        }
      };

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("```")) {
          flushParagraph();
          closeList();
          if (inCode) {
            out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
            inCode = false;
            codeLines = [];
          } else {
            inCode = true;
          }
          return;
        }

        if (inCode) {
          codeLines.push(line);
          return;
        }

        if (!trimmed) {
          flushParagraph();
          closeList();
          return;
        }

        const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
        if (unordered) {
          flushParagraph();
          openList("ul");
          out.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);
          return;
        }

        const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
        if (ordered) {
          flushParagraph();
          openList("ol");
          out.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
          return;
        }

        closeList();
        paragraphLines.push(trimmed);
      });

      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      }
      flushParagraph();
      closeList();
      return out.join("\n");
    };

    const setEmptyState = () => {
      if (!thread || thread.childElementCount > 0) {
        return;
      }
      const empty = document.createElement("p");
      empty.className = "chat-empty";
      empty.textContent = "Pick a starter or ask what context would be useful.";
      thread.appendChild(empty);
    };

    const clearEmptyState = () => {
      if (!thread) {
        return;
      }
      thread.querySelectorAll(".chat-empty").forEach((node) => node.remove());
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
      bubble.textContent = text;
      thread.appendChild(bubble);
      thread.scrollTop = thread.scrollHeight;
      return bubble;
    };

    const renderSourceCards = (docs) => {
      if (!sourceCards) {
        return;
      }
      sourceCards.innerHTML = "";
      if (!docs.length) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "No close source matches yet.";
        sourceCards.appendChild(empty);
        return;
      }
      docs.forEach((doc) => {
        const link = document.createElement("a");
        link.className = "source-card";
        link.href = doc.href || "#";
        link.innerHTML = `${escapeHtml(doc.title || "Untitled")}<span>${escapeHtml(doc.kind || "source")} · ${escapeHtml(doc.source_path || "")}</span>`;
        sourceCards.appendChild(link);
      });
    };

    const renderAssistantBubble = (bubble, text, finalize = false) => {
      if (!bubble) {
        return;
      }
      if (!finalize) {
        bubble.textContent = text;
        return;
      }
      if (text.startsWith("Request error:")) {
        bubble.innerHTML = `<p class="chat-error">${escapeHtml(text)}</p>`;
        return;
      }
      bubble.innerHTML = renderAssistantMarkdown(text);
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
              } catch {
                return;
              }
            });
          boundary = buffer.indexOf("\n\n");
        }
      }
    };

    const parseHttpError = async (response) => {
      const statusLabel = `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
      const raw = (await response.text()).trim();
      if (!raw) {
        return `Request failed (${statusLabel})`;
      }

      try {
        const parsed = JSON.parse(raw);
        const fromJson = parsed?.error?.message || parsed?.error || parsed?.message;
        if (fromJson) {
          return `${fromJson} (${statusLabel})`;
        }
      } catch {
        // ignore non-JSON payloads
      }

      const textOnly = raw
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (textOnly) {
        return `${textOnly} (${statusLabel})`;
      }
      return `Request failed (${statusLabel})`;
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

    const formToFields = () => {
      if (!(handoffForm instanceof HTMLFormElement)) {
        return {};
      }
      const data = new FormData(handoffForm);
      return {
        name: String(data.get("name") || "").trim(),
        contact: String(data.get("contact") || "").trim(),
        stage: String(data.get("stage") || "exploring").trim(),
        goal: String(data.get("goal") || "").trim(),
        context: String(data.get("context") || "").trim(),
        evidence: String(data.get("evidence") || "").trim(),
        consent: data.get("consent") === "yes",
      };
    };

    const buildPacket = () => {
      const fields = formToFields();
      return {
        schema: "sgoley.async-handoff.v1",
        session_id: sessionId,
        created_at: new Date().toISOString(),
        source_url: window.location.href,
        mode: currentMode,
        fields,
        sources: lastRelevantDocs.map((doc) => ({
          title: doc.title || "",
          href: doc.href || "",
          kind: doc.kind || "",
          source_path: doc.source_path || "",
        })),
        transcript: history.slice(-20),
      };
    };

    const setHandoffStatus = (message, isError = false) => {
      if (!handoffStatus) {
        return;
      }
      handoffStatus.textContent = message;
      handoffStatus.classList.toggle("chat-error", isError);
    };

    const saveDraft = () => {
      if (!handoffForm) {
        return;
      }
      try {
        localStorage.setItem(
          draftStorageKey,
          JSON.stringify({
            expires_at: Date.now() + draftTtlMs,
            fields: formToFields(),
          }),
        );
      } catch (error) {
        console.warn("Unable to save handoff draft.", error);
      }
    };

    const restoreDraft = () => {
      if (!(handoffForm instanceof HTMLFormElement)) {
        return;
      }
      try {
        const raw = localStorage.getItem(draftStorageKey);
        if (!raw) {
          return;
        }
        const draft = JSON.parse(raw);
        if (!draft?.expires_at || draft.expires_at < Date.now()) {
          localStorage.removeItem(draftStorageKey);
          return;
        }
        const fields = draft.fields || {};
        Object.entries(fields).forEach(([key, value]) => {
          const field = handoffForm.elements.namedItem(key);
          if (field instanceof HTMLInputElement && field.type === "checkbox") {
            field.checked = Boolean(value);
          } else if (
            field instanceof HTMLInputElement ||
            field instanceof HTMLTextAreaElement ||
            field instanceof HTMLSelectElement
          ) {
            field.value = String(value || "");
          }
        });
      } catch (error) {
        console.warn("Unable to restore handoff draft.", error);
      }
    };

    const copyPacket = async () => {
      const packet = buildPacket();
      const serialized = JSON.stringify(packet, null, 2);
      await navigator.clipboard.writeText(serialized);
      setHandoffStatus("Copied handoff packet to clipboard.");
    };

    const downloadPacket = () => {
      const packet = buildPacket();
      const blob = new Blob([JSON.stringify(packet, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `async-handoff-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setHandoffStatus("Downloaded handoff packet JSON.");
    };

    const sendPacket = async () => {
      const packet = buildPacket();
      if (!packet.fields.consent) {
        setHandoffStatus("Check the consent box before sending context to Scott.", true);
        return;
      }
      const response = await fetch(feedbackEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packet }),
      });
      if (!response.ok) {
        throw new Error(await parseHttpError(response));
      }
      const result = await response.json();
      if (!result.stored && !result.forwarded) {
        setHandoffStatus(
          `Packet accepted by the endpoint, but storage/forwarding is not configured. Copy or download it as a fallback. Reference: ${result.id || "not available"}.`,
          true,
        );
        return;
      }
      const stored = result.stored ? "stored" : "accepted";
      const forwarded = result.forwarded ? " and forwarded" : "";
      setHandoffStatus(`Packet ${stored}${forwarded}. Reference: ${result.id || "not available"}.`);
    };

    if (note) {
      if (!configuredEndpoint || configuredEndpoint.includes(endpointPlaceholder)) {
        note.hidden = false;
        note.innerHTML =
          'Using default <code>/chat</code> on this domain. Override with <code>?chat_api=https://your-worker.workers.dev/chat</code>.';
      } else if (!normalizeEndpoint(configuredEndpoint)) {
        note.hidden = false;
        note.innerHTML =
          "Configured chat endpoint is invalid. Fix <code>data-chat-endpoint</code> or use <code>?chat_api=...</code>.";
      } else {
        note.hidden = true;
      }
    }

    setEmptyState();
    loadContext().catch((error) => {
      const message = error instanceof Error ? error.message : "Unable to load chat context.";
      appendMessage("assistant", `Context load warning: ${message}`);
    });

    restoreDraft();
    if (handoffForm) {
      handoffForm.addEventListener("input", saveDraft);
      handoffForm.addEventListener("change", saveDraft);
      handoffForm.querySelector("[data-copy-packet]")?.addEventListener("click", () => {
        copyPacket().catch((error) => {
          setHandoffStatus(error instanceof Error ? error.message : "Unable to copy packet.", true);
        });
      });
      handoffForm.querySelector("[data-download-packet]")?.addEventListener("click", downloadPacket);
      handoffForm.querySelector("[data-send-packet]")?.addEventListener("click", () => {
        setHandoffStatus("Sending packet...");
        sendPacket().catch((error) => {
          setHandoffStatus(error instanceof Error ? error.message : "Unable to send packet.", true);
        });
      });
      handoffForm.querySelector("[data-clear-packet]")?.addEventListener("click", () => {
        handoffForm.reset();
        localStorage.removeItem(draftStorageKey);
        setHandoffStatus("Draft cleared from this browser.");
      });
    }

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        currentMode = button.getAttribute("data-chat-mode") || "discover";
        modeButtons.forEach((candidate) => candidate.classList.remove("active"));
        button.classList.add("active");
        if (input) {
          input.placeholder =
            currentMode === "brief"
              ? "Describe the handoff you want drafted..."
              : currentMode === "feedback"
                ? "Leave feedback or suggest future content..."
                : "Ask about fit, projects, or what context to leave...";
        }
      });
    });

    promptButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (!input) {
          return;
        }
        input.value = button.getAttribute("data-prompt") || "";
        input.focus();
      });
    });

    if (form && input) {
      const submitFromKeyboard = () => {
        if (typeof form.requestSubmit === "function") {
          form.requestSubmit();
          return;
        }
        const submitButton = form.querySelector('button[type="submit"], button:not([type])');
        if (submitButton instanceof HTMLElement) {
          submitButton.click();
          return;
        }
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      };

      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
          return;
        }
        if (event.shiftKey || event.isComposing || event.repeat) {
          return;
        }
        event.preventDefault();
        submitFromKeyboard();
      });

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
          lastRelevantDocs = selectRelevantDocs(userText, chatContext?.documents || []);
          renderSourceCards(lastRelevantDocs);
          const messageWindow = history.slice(-10);
          const payload = {
            stream: true,
            mode: currentMode,
            messages: messageWindow,
          };

          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const detail = await parseHttpError(response);
            throw new Error(detail);
          }

          await streamAssistantReply(response, (chunk) => {
            assistantText += chunk;
            renderAssistantBubble(assistantBubble, assistantText || "...", false);
          });

          assistantText = assistantText.trim() || "I wasn't able to generate a response.";
        } catch (error) {
          assistantText =
            error instanceof Error
              ? `Request error: ${error.message}`
              : "Request error: unknown failure.";
        } finally {
          renderAssistantBubble(assistantBubble, assistantText, true);
          history.push({ role: "assistant", content: assistantText });
          setFormBusy(false);
          input.focus();
        }
      });
    } else {
      setFormBusy(true);
      appendMessage("assistant", "Chat input is unavailable on this page.");
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
})();
