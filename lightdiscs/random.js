// Copyright (C) 2026 Pelagic Games
/**
 * Random-page code sharing controls for random.html, after lightdiscs.js.
 * Reads the board's generated level code and writes the read-only field/status.
 * Copy uses the clipboard API with a selection-based fallback; Reset's board
 * listener is registered first, so this listener reads the newly generated code.
 */

(() => {
  const codeInput = document.querySelector("#random-code");
  const copyButton = document.querySelector("#copy-random-code");
  const copyStatus = document.querySelector("#copy-code-status");
  const resetButton = document.querySelector("#reset-button");

  /**
   * Refresh the displayed code and clear the previous copy result.
   * @returns {void}
   */
  function updateCode() {
    codeInput.value = window.LightDiscGame.levelCode();
    copyStatus.textContent = "Select the code or use Copy.";
    copyStatus.classList.remove("is-error");
  }

  /**
   * Focus/select the code and attempt legacy clipboard copying; alters selection.
   * @returns {boolean} Whether execCommand reports a successful copy.
   */
  function fallbackCopy() {
    codeInput.focus();
    codeInput.select();
    const copied = document.execCommand("copy");
    codeInput.setSelectionRange(0, 0);
    return copied;
  }

  /**
   * Write the clipboard, retry using selection on failure and report the outcome.
   * @returns {Promise<void>} Resolves after the attempt and status update.
   */
  async function copyCode() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(codeInput.value);
      } else if (!fallbackCopy()) {
        throw new Error("The browser did not copy the code.");
      }
      copyStatus.textContent = "Level code copied.";
      copyStatus.classList.remove("is-error");
    } catch (error) {
      if (fallbackCopy()) {
        copyStatus.textContent = "Level code copied.";
        copyStatus.classList.remove("is-error");
        return;
      }
      copyStatus.textContent = `Copy failed: ${error.message}`;
      copyStatus.classList.add("is-error");
    }
  }

  copyButton.addEventListener("click", copyCode);
  resetButton.addEventListener("click", updateCode);
  updateCode();
})();
