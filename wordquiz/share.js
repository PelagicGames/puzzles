// Copyright (C) 2026 Pelagic Games

/**
 * Share overlay for Word Quiz. Builds "ask for help" text for unsolved puzzles and
 * "challenge" text for solved ones, each with a direct link to the puzzle, and
 * turns it into web share links for common apps. Instagram has no web share
 * address, so its button copies the message for pasting into a story or chat.
 * The DOM part is optional so the message builders can be tested under Node.
 */

(() => {
  const root = typeof window !== "undefined" ? window : globalThis;
  const POS_NAMES = { n: "noun", v: "verb", a: "adjective" };
  const SNIPPET_LENGTH = 90;

  /**
   * @param {string} clue - Bank clue with {} blank markers.
   * @returns {string} Short single-line clue with blanks shown as underscores.
   */
  function clueSnippet(clue) {
    const text = clue.replace(/\{\}/g, "___");
    if (text.length <= SNIPPET_LENGTH) return text;
    return `${text.slice(0, SNIPPET_LENGTH).replace(/\s+\S*$/, "")}\u2026`;
  }

  /**
   * @param {Object} options - Message inputs.
   * @param {{pos: string, clue: string}} options.puzzle - Bank entry.
   * @param {number} options.length - Answer length.
   * @param {boolean} options.solved - Challenge wording when true, help wording otherwise.
   * @param {number} [options.attempts] - Guesses taken this visit, mentioned in challenges.
   * @param {string} options.url - Direct puzzle link.
   * @returns {{title: string, text: string, url: string}} Share payload.
   */
  function shareMessage({ puzzle, length, solved, attempts, url }) {
    const description = `${length}-letter ${POS_NAMES[puzzle.pos] || "word"}: \u201c${clueSnippet(puzzle.clue)}\u201d`;
    if (solved) {
      const tries = attempts ? ` in ${attempts} ${attempts === 1 ? "try" : "tries"}` : "";
      return {
        title: "Word Quiz challenge",
        text: `I solved this Word Quiz${tries}. Can you? \ud83e\udde0\n${description}\n${"\ud83d\udfe9".repeat(length)}`,
        url
      };
    }
    return {
      title: "Help me with this Word Quiz",
      text: `Can you help me crack this Word Quiz? \ud83e\udd14\n${description}\n${"\u2b1c".repeat(length)}`,
      url
    };
  }

  /**
   * @param {{title: string, text: string, url: string}} message - Share payload.
   * @returns {{id: string, label: string, href?: string, copy?: boolean, note?: string}[]}
   * Share destinations: links open in a new tab; copy entries use the clipboard.
   */
  function shareTargets({ title, text, url }) {
    const encode = encodeURIComponent;
    const full = `${text}\n${url}`;
    return [
      { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${encode(full)}` },
      { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encode(url)}` },
      { id: "instagram", label: "Instagram", copy: true, note: "Message copied. Paste it into an Instagram story or chat." },
      { id: "x", label: "X", href: `https://x.com/intent/post?text=${encode(text)}&url=${encode(url)}` },
      { id: "teams", label: "Teams", href: `https://teams.microsoft.com/share?href=${encode(url)}&msgText=${encode(text)}` },
      { id: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${encode(url)}&text=${encode(text)}` },
      { id: "reddit", label: "Reddit", href: `https://www.reddit.com/submit?url=${encode(url)}&title=${encode(title)}` },
      { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encode(url)}` },
      { id: "email", label: "Email", href: `mailto:?subject=${encode(title)}&body=${encode(full)}` },
      { id: "sms", label: "Text message", href: `sms:?&body=${encode(full)}` },
      { id: "copy", label: "Copy message", copy: true, note: "Message and link copied." }
    ];
  }

  /**
   * @param {string} text - Text to place on the clipboard.
   * @returns {Promise<void>} Resolves once copied; uses a hidden textarea where the async API is unavailable.
   */
  async function copyText(text) {
    if (navigator.clipboard && root.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  /**
   * Wires the share dialog markup in puzzle.html.
   * @param {HTMLDialogElement} dialog - Dialog containing the elements referenced below.
   * @returns {{open: (message: {title: string, text: string, url: string}) => void}} Opener.
   */
  function bindDialog(dialog) {
    const heading = dialog.querySelector("#share-heading");
    const preview = dialog.querySelector("#share-preview");
    const targets = dialog.querySelector("#share-targets");
    const nativeButton = dialog.querySelector("#share-native");
    const note = dialog.querySelector("#share-note");
    let current = null;

    dialog.addEventListener("click", (event) => {
      // Clicking the backdrop (the dialog element itself) closes the overlay.
      if (event.target === dialog) dialog.close();
    });
    // Native Escape handling can be suppressed by embedding browsers, so close explicitly.
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dialog.close();
      }
    });
    nativeButton.addEventListener("click", () => {
      if (!current) return;
      navigator.share(current).catch(() => {});
    });

    /**
     * @param {{title: string, text: string, url: string}} message - Share payload.
     * @returns {void} Rebuilds the destinations and shows the dialog.
     */
    function open(message) {
      current = message;
      heading.textContent = message.title;
      preview.textContent = `${message.text}\n${message.url}`;
      note.textContent = "";
      nativeButton.hidden = typeof navigator.share !== "function";
      targets.replaceChildren(...shareTargets(message).map((target) => {
        const element = document.createElement(target.href ? "a" : "button");
        element.className = `share-target share-${target.id}`;
        element.textContent = target.label;
        if (target.href) {
          element.href = target.href;
          if (!/^(mailto|sms):/.test(target.href)) {
            element.target = "_blank";
            element.rel = "noopener noreferrer";
          }
        } else {
          element.type = "button";
          element.addEventListener("click", () => {
            copyText(`${message.text}\n${message.url}`)
              .then(() => { note.textContent = target.note; })
              .catch(() => { note.textContent = "Copying failed; select the message above and copy it instead."; });
          });
        }
        return element;
      }));
      dialog.showModal();
    }

    return { open };
  }

  root.WordQuizShare = { bindDialog, clueSnippet, shareMessage, shareTargets };
  if (typeof module !== "undefined") module.exports = root.WordQuizShare;
})();
