/* Installed only into a verified user runtime, never the system application. */
globalThis.__editorImeMode = (() => {
  let mode = 'Normal',
    enabled = true,
    commandLineEnglish = true,
    vimActive = true;
  let held = null, nativeRestricted, nativeBridge, lastNativeUpdate = 0;
  const nativeWindows = globalThis.navigator?.platform === 'Win32';
  const restricted = () =>
    enabled &&
    vimActive &&
    !['Insert', 'Replace', 'Disabled'].includes(mode) &&
    (!['SearchInProgressMode', 'CommandlineInProgress'].includes(mode) ||
      commandLineEnglish);
  function notifyNative(value) {
    const bridge = globalThis.__editorToolsImeRestricted;
    if (typeof bridge !== 'function') return;
    if (nativeRestricted === value && nativeBridge === bridge &&
        (!value || Date.now() - lastNativeUpdate < 500)) return;
    nativeRestricted = value;
    nativeBridge = bridge;
    lastNativeUpdate = Date.now();
    bridge(value)?.catch?.(() => {});
  }
  function restore() {
    notifyNative(false);
    const state = held;
    held = null;
    if (!state) return;
    if (state.editContext && !state.element.editContext)
      state.element.editContext = state.editContext;
    if (state.readOnly !== undefined) state.element.readOnly = state.readOnly;
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
    if (held?.element !== element) {
      if (held) restore();
      held = {
        element,
        readOnly: 'readOnly' in element ? element.readOnly : undefined,
      };
    }
    notifyNative(true);
    // EditContext delivers IME text straight to Monaco. Detach it while Vim
    // handles keys here so the editor stays English even if an IME ignores IMM.
    if (element.editContext) {
      held.editContext = element.editContext;
      element.editContext = null;
    }
    if (held.readOnly !== undefined) element.readOnly = true;
  }
  document.addEventListener('focusin', update, true);
  document.addEventListener('focusout', () => queueMicrotask(update), true);
  window.addEventListener('blur', restore);
  window.addEventListener('focus', update);
  // Monaco can replace its input or reattach EditContext without a focus event.
  setInterval(update, 100);
  function printable(event) {
    if (event.key.length === 1 && event.key.charCodeAt(0) < 128 && !event.isComposing)
      return event.key;
    // Windows IMEs may report Process/229 even when the physical key is ASCII.
    if (!(event.key === 'Process' || event.keyCode === 229 || event.isComposing))
      return;
    if (/^Key[A-Z]$/.test(event.code)) {
      const letter = event.code.slice(3);
      return event.shiftKey !== !!event.getModifierState?.('CapsLock')
        ? letter : letter.toLowerCase();
    }
    const keys = {
      Digit1: '1!', Digit2: '2@', Digit3: '3#', Digit4: '4$', Digit5: '5%',
      Digit6: '6^', Digit7: '7&', Digit8: '8*', Digit9: '9(', Digit0: '0)',
      Minus: '-_', Equal: '=+', BracketLeft: '[{', BracketRight: ']}',
      Backslash: '\\|', Semicolon: ';:', Quote: "'\"", Backquote: '`~',
      Comma: ',<', Period: '.>', Slash: '/?', Space: '  ',
    };
    return keys[event.code]?.[event.shiftKey ? 1 : 0];
  }
  // Bypassing IME must still enter VSCodeVim's serialized type command.
  document.addEventListener(
    'keydown',
    (event) => {
      update();
      if (
        !held ||
        !restricted() ||
        event.target !== held.element ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      )
        return;
      const text = printable(event);
      // Registered workbench/Vim keybindings (including Enter) retain priority.
      if (
        text === undefined ||
        typeof globalThis.__editorToolsType !== 'function' ||
        globalThis.__editorToolsHasKeybinding?.(event)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      globalThis.__editorToolsType(text);
    },
    true
  );
  for (const name of ['compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input']) {
    document.addEventListener(name, (event) => {
      update();
      if (!held || event.target !== held.element || !restricted()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }
  return {
    set(key, value) {
      if (key === 'vim.mode') mode = value;
      if (key === 'vim.active') vimActive = !!value;
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
      vimActive,
      nativeWindows,
      restricted: restricted(),
      held: !!held,
      nativeRestricted: nativeRestricted === true,
    }),
  };
})();
