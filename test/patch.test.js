"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { patch } = require("../patch-code");
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
