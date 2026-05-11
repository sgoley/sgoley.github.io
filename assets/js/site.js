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

  const embed = document.getElementById("streamlit-embed");
  if (embed) {
    const params = new URLSearchParams(window.location.search);
    const fromParam = params.get("streamlit");
    const fromData = embed.dataset.streamlitUrl || "";
    const base = (fromParam || fromData).trim();
    const note = document.getElementById("embed-note");
    const placeholder = "YOUR-STREAMLIT-APP";

    if (!base || base.includes(placeholder)) {
      if (note) {
        note.hidden = false;
      }
    } else {
      const hasQuery = base.includes("?");
      embed.src = `${base}${hasQuery ? "&" : "?"}embed=true`;
      if (note) {
        note.hidden = true;
      }
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
