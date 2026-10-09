(() => {
  const codeInput = document.querySelector("#random-code");
  const copyButton = document.querySelector("#copy-random-code");
  const copyStatus = document.querySelector("#copy-code-status");
  const resetButton = document.querySelector("#reset-button");

  function updateCode() {
    codeInput.value = window.LightDiscGame.levelCode();
    copyStatus.textContent = "Select the code or use Copy.";
    copyStatus.classList.remove("is-error");
  }

  function fallbackCopy() {
    codeInput.focus();
    codeInput.select();
    const copied = document.execCommand("copy");
    codeInput.setSelectionRange(0, 0);
    return copied;
  }

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
