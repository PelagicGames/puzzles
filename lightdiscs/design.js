(() => {
  const input = document.querySelector("#puzzle-code-input");
  const setButton = document.querySelector("#set-layout-button");
  const status = document.querySelector("#code-status");
  const helpButton = document.querySelector("#code-help-button");
  const helpDialog = document.querySelector("#code-help-dialog");
  const helpClose = document.querySelector("#code-help-close");
  const { formatPuzzleCode, validatePuzzleCode } = window.LightDiscPuzzleCode;

  function inputText() {
    return input.textContent.replace(/\u00a0/g, " ");
  }

  function caretOffset() {
    const selection = window.getSelection();
    if (!selection.rangeCount || !input.contains(selection.anchorNode)) return inputText().length;
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(input);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
  }

  function setCaret(offset) {
    const selection = window.getSelection();
    const range = document.createRange();
    const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let node = walker.nextNode();
    while (node && remaining > node.data.length) {
      remaining -= node.data.length;
      node = walker.nextNode();
    }
    if (!node) {
      range.selectNodeContents(input);
      range.collapse(false);
    } else {
      range.setStart(node, Math.min(remaining, node.data.length));
      range.collapse(true);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function renderCode(code, diagnostics = []) {
    input.replaceChildren();
    if (diagnostics.length === 0) {
      input.textContent = code;
      return;
    }

    const ranges = diagnostics
      .map(({ start, end }) => ({ start, end }))
      .sort((left, right) => left.start - right.start);
    let offset = 0;
    ranges.forEach(({ start, end }) => {
      const rangeStart = Math.max(offset, start);
      const rangeEnd = Math.max(rangeStart, end);
      if (rangeStart > offset) input.append(document.createTextNode(code.slice(offset, rangeStart)));
      const invalid = document.createElement("mark");
      invalid.className = "invalid-code";
      invalid.textContent = code.slice(rangeStart, rangeEnd) || " ";
      input.append(invalid);
      offset = rangeEnd;
    });
    if (offset < code.length) input.append(document.createTextNode(code.slice(offset)));
  }

  function formatInput() {
    const current = inputText();
    const oldOffset = caretOffset();
    const formatted = formatPuzzleCode(current);
    if (formatted === current && !input.querySelector(".invalid-code")) return;
    renderCode(formatted);
    setCaret(Math.min(formatted.length, oldOffset + formatted.length - current.length));
  }

  function applyCode() {
    const result = validatePuzzleCode(inputText());
    renderCode(result.code, result.diagnostics);
    if (!result.definition) {
      input.setAttribute("aria-invalid", "true");
      status.classList.add("is-error");
      status.textContent = result.diagnostics.map(({ message }) => message).join(" ");
      return;
    }

    input.removeAttribute("aria-invalid");
    status.classList.remove("is-error");
    window.LightDiscGame.applyPuzzleCode(result.code);
    status.textContent = "Layout set. Triangle positions and rotations were preserved.";
  }

  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    status.classList.remove("is-error");
    status.textContent = "Edit or paste a complete code.";
    formatInput();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyCode();
    }
  });
  input.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    selection.deleteFromDocument();
    const node = document.createTextNode(text);
    const range = selection.getRangeAt(0);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
  });
  setButton.addEventListener("click", applyCode);
  helpButton.addEventListener("click", () => helpDialog.showModal());
  helpClose.addEventListener("click", () => helpDialog.close());
  helpDialog.addEventListener("click", (event) => {
    if (event.target === helpDialog) helpDialog.close();
  });
})();
