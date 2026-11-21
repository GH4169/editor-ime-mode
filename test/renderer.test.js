"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs");
test("IME context is restored on mode changes and blur; only file input is limited", () => {
  const handlers = {},
    win = {};
  class Element {}
  const originalContext = {};
  const editor = Object.assign(new Element(), {
    editContext: originalContext,
    closest: (selector) =>
      [".monaco-editor", ".part.editor"].includes(selector) ? {} : null,
    matches: () => false,
    classList: { contains: (s) => s === "native-edit-context" },
  });
  const document = {
    activeElement: editor,
    hasFocus: () => true,
    addEventListener: (event, handler) => (handlers[event] = handler),
  };
  const sandbox = {
    document,
    window: { addEventListener: (name, fn) => (win[name] = fn) },
    HTMLElement: Element,
    queueMicrotask: (fn) => fn(),
    setInterval: () => {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(require.resolve("../renderer"), "utf8"),
    sandbox,
  );
  sandbox.__editorImeMode.set("vim.mode", "Normal");
  assert.equal(editor.editContext, null);
  sandbox.__editorImeMode.set("vim.mode", "Insert");
  assert.equal(editor.editContext, originalContext);
  sandbox.__editorImeMode.set("vim.mode", "Normal");
  win.blur();
  assert.equal(editor.editContext, originalContext);
  sandbox.__editorImeMode.set("editorImeMode.commandLineEnglish", false);
  sandbox.__editorImeMode.set("vim.mode", "SearchInProgressMode");
  assert.equal(editor.editContext, originalContext);
  document.activeElement = Object.assign(new Element(), {
    closest: () => null,
  });
  handlers.focusin();
  assert.equal(sandbox.__editorImeMode.inspect().held, false);
});

function fixture(platform) {
  const handlers = {}, typed = [], native = [];
  let interval;
  class Element {}
  const context = {};
  const editor = Object.assign(new Element(), {
    editContext: context,
    readOnly: false,
    closest: (selector) =>
      [".monaco-editor", ".part.editor"].includes(selector) ? {} : null,
    matches: (selector) => selector === "textarea.inputarea",
    classList: { contains: () => false },
  });
  const document = {
    activeElement: editor,
    hasFocus: () => true,
    addEventListener: (name, handler) => (handlers[name] = handler),
  };
  const sandbox = {
    document,
    window: { addEventListener: () => {} },
    navigator: { platform },
    HTMLElement: Element,
    queueMicrotask: (fn) => fn(),
    setInterval: (fn) => (interval = fn),
    __editorToolsType: (text) => typed.push(text),
    __editorToolsImeRestricted: (value) => native.push(value),
    __editorToolsHasKeybinding: () => false,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve("../renderer"), "utf8"), sandbox);
  const api = sandbox.__editorImeMode;
  const dispatch = (name, properties = {}) => {
    const event = {
      target: document.activeElement, key: '', code: '',
      shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
      isComposing: false,
      preventDefault() { this.prevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
      ...properties,
    };
    handlers[name](event);
    return event;
  };
  return { api, sandbox, editor, context, document, typed, native, dispatch, tick: () => interval() };
}

test("Windows Normal and Visual use ASCII commands and block both IME input paths", () => {
  const f = fixture('Win32');
  assert.equal(f.api.inspect().nativeWindows, true);
  f.api.set('vim.mode', 'Normal');
  assert.deepEqual(f.native, [true]);
  assert.equal(f.editor.editContext, null);
  assert.equal(f.editor.readOnly, true);
  assert.equal(f.dispatch('keydown', { key: 'Process', keyCode: 229, code: 'KeyH' }).stopped, true);
  f.api.set('vim.mode', 'Visual');
  assert.equal(f.editor.editContext, null);
  assert.equal(f.editor.readOnly, true);
  assert.deepEqual(f.native, [true]);
  for (const properties of [
    { key: 'Process', code: 'Digit5', isComposing: true, shiftKey: true },
    { key: 'Process', code: 'Semicolon', isComposing: true, shiftKey: true },
    { key: 'Process', code: 'KeyV', shiftKey: true },
  ]) assert.equal(f.dispatch('keydown', properties).stopped, true);
  assert.deepEqual(f.typed, ['h', '%', ':', 'V']);
  assert.equal(f.dispatch('beforeinput', { data: '中文', isComposing: true }).stopped, true);
  assert.equal(f.dispatch('compositionstart').stopped, true);
  assert.deepEqual(f.typed, ['h', '%', ':', 'V']);
  assert.equal(f.dispatch('keydown', { key: 'a', ctrlKey: true }).stopped, undefined);
  f.sandbox.__editorToolsHasKeybinding = () => true;
  assert.equal(f.dispatch('keydown', { key: ' ', code: 'Space' }).stopped, undefined);
  assert.equal(f.dispatch('keydown', { key: 'Enter', code: 'Enter' }).stopped, undefined);
  f.api.set('vim.mode', 'Insert');
  assert.equal(f.editor.editContext, f.context);
  assert.equal(f.editor.readOnly, false);
  assert.equal(f.dispatch('beforeinput', { data: '中文', isComposing: true }).stopped, undefined);
  assert.equal(f.dispatch('keydown', { key: 'Process', code: 'KeyI', isComposing: true }).stopped, undefined);
  assert.deepEqual(f.native, [true, false]);
});

test('Windows restores the latest Monaco EditContext after it is replaced in Visual', () => {
  const f = fixture('Win32');
  f.api.set('vim.mode', 'Visual');
  const replacementContext = {};
  f.editor.editContext = replacementContext;
  f.tick();
  assert.equal(f.editor.editContext, null);
  f.api.set('vim.mode', 'Insert');
  assert.equal(f.editor.editContext, replacementContext);
});

test("Normal restriction follows actual file focus, Vim enablement and reattached EditContext", () => {
  const f = fixture();
  f.api.set('vim.mode', 'Normal');
  f.editor.editContext = {};
  f.tick();
  assert.equal(f.editor.editContext, null);
  f.api.set('vim.active', false);
  assert.equal(f.editor.readOnly, false);
  f.api.set('vim.active', true);
  assert.equal(f.editor.readOnly, true);
  f.api.set('vim.mode', 'SearchInProgressMode');
  f.api.set('editorImeMode.commandLineEnglish', false);
  assert.equal(f.editor.readOnly, false);
  f.api.set('vim.mode', 'Normal');
  f.document.activeElement = { closest: () => null };
  f.dispatch('focusin');
  assert.equal(f.editor.readOnly, false);
  assert.equal(f.api.inspect().nativeRestricted, false);
  f.document.activeElement = f.editor;
  f.dispatch('focusin');
  assert.equal(f.api.inspect().nativeRestricted, true);
  f.api.set('editorImeMode.enabled', false);
  assert.equal(f.editor.readOnly, false);
  assert.equal(f.api.inspect().nativeRestricted, false);
});
