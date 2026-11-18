"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { patch, VERSION, COMMIT } = require("../patch-code");
const crypto = require('node:crypto');
const workbench = 'vs/workbench/workbench.desktop.main.js';
const checksum = (text) => crypto.createHash('sha256').update(text).digest('base64').replace(/=+$/, '');
test("unknown Code version is rejected before reading or writing its workbench", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ime-guard-"));
  try {
    const product = { version: "1.999.0", commit: "unknown" };
    fs.writeFileSync(path.join(dir, "product.json"), JSON.stringify(product));
    assert.throws(() => patch(dir), /Unsupported/);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(dir, "product.json"))),
      product,
    );
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test('IME runtime upgrades retain other patches and are idempotent; damaged payloads are rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ime-upgrade-'));
  const file = path.join(dir, 'out', workbench);
  const productFile = path.join(dir, 'product.json');
  const source = 'function context(a,k,v){a.get(s).createKey(String(k),n(v))}' +
    'const cmd=he("commandService"),kb=he("keybindingService");' +
    'this._viewController.emitKeyUp(new Keyboard(e));/* unrelated navigation patch */';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const write = (text) => {
    fs.writeFileSync(file, text);
    fs.writeFileSync(productFile, JSON.stringify({
      version: VERSION, commit: COMMIT, checksums: { [workbench]: checksum(text) },
    }));
  };
  try {
    write(source);
    patch(dir);
    const latest = fs.readFileSync(file, 'utf8');
    assert.match(latest, /editorImeMode.setInputRestricted/);
    assert.match(latest, /unrelated navigation patch/);
    patch(dir);
    assert.equal(fs.readFileSync(file, 'utf8'), latest);
    const begin = latest.indexOf('/* editor-ime-mode verified patch */');
    const old = latest.slice(0, begin) + '/* editor-ime-mode verified patch */\nold renderer\n\n' +
      '/* shell-ime verified patch */\nother renderer\n';
    write(old);
    patch(dir);
    const upgraded = fs.readFileSync(file, 'utf8');
    assert.ok(!upgraded.includes('old renderer'));
    assert.ok(upgraded.endsWith('/* shell-ime verified patch */\nother renderer\n'));
    patch(dir);
    assert.equal(fs.readFileSync(file, 'utf8'), upgraded);
    fs.appendFileSync(file, 'unverified mutation');
    assert.throws(() => patch(dir), /checksum mismatch/);
    assert.equal(fs.readFileSync(file, 'utf8'), upgraded + 'unverified mutation');
  } finally { fs.rmSync(dir, { recursive: true }); }
});
