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
