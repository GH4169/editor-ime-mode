/* Installed only into a verified user runtime, never the system application. */
globalThis.__editorImeMode = (() => {
  let mode = 'Normal',
    enabled = true,
    commandLineEnglish = true;
  const saved = new WeakMap();
  let held = null;
  const restricted = () =>
    enabled &&
    !['Insert', 'Replace', 'Disabled'].includes(mode) &&
    (!['SearchInProgressMode', 'CommandlineInProgress'].includes(mode) ||
      commandLineEnglish);
  function restore() {
    if (!held) return;
    const state = saved.get(held);
    if (state) {
      if (state.editContext) held.editContext = state.editContext;
      if (state.readOnly !== undefined) held.readOnly = state.readOnly;
      saved.delete(held);
    }
    held = null;
  }
  function update() {
    const element = document.activeElement;
    const editor =
      element instanceof HTMLElement &&
      !!element.closest('.monaco-editor') &&
      !!element.closest('.part.editor') &&
      !element.closest('.find-widget,.rename-box,.suggest-widget') &&
      (element.matches('textarea.inputarea') ||
        element.classList.contains('native-edit-context'));
    if (!editor || !document.hasFocus() || !restricted()) {
      restore();
      return;
    }
    if (held !== element) {
      restore();
      saved.set(element, {
        editContext: element.editContext,
        readOnly: 'readOnly' in element ? element.readOnly : undefined,
      });
      held = element;
    }
    if (element.editContext) element.editContext = null;
    if ('readOnly' in element) element.readOnly = true;
  }
  document.addEventListener('focusin', update, true);
  document.addEventListener('focusout', () => queueMicrotask(update), true);
  window.addEventListener('blur', restore);
  window.addEventListener('focus', update);
  // Bypassing IME must still enter VSCodeVim's serialized type command.
  document.addEventListener(
    'keydown',
    (event) => {
      update();
      if (
        !held ||
        !restricted() ||
        event.target !== held ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.isComposing
      )
        return;
      // Registered workbench/Vim keybindings (including Enter) retain priority.
      if (
        event.key.length !== 1 ||
        event.key.charCodeAt(0) > 127 ||
        globalThis.__editorToolsHasKeybinding?.(event)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      globalThis.__editorToolsType?.(event.key);
    },
    true
  );
  return {
    set(key, value) {
      if (key === 'vim.mode') mode = value;
      if (key === 'editorImeMode.enabled') enabled = !!value;
      if (key === 'editorImeMode.commandLineEnglish')
        commandLineEnglish = !!value;
      update();
    },
    restore,
    inspect: () => ({
      mode,
      enabled,
      commandLineEnglish,
      restricted: restricted(),
      held: !!held,
    }),
  };
})();
