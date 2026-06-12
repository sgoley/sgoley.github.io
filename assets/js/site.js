(() => {
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
              assistantBubble.textContent = assistantText || "...";
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
            assistantBubble.textContent = assistantText;
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
})();
