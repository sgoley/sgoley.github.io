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
})();
