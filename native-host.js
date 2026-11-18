'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function startNativeHost(output) {
  if (process.platform !== 'win32') return;
  const executable = [
    path.join(__dirname, 'native', 'editor-ime-host.exe'),
    path.join(__dirname, 'build', 'editor-ime-host.exe'),
  ].find((file) => fs.existsSync(file));
  if (!executable) throw new Error('Windows IME helper is missing; reinstall Editor IME Mode.');
  const child = spawn(executable, [String(process.pid)], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let ready = false;
  child.on('exit', (code) => {
    ready = false;
    if (code) output.appendLine('Windows IME helper exited: ' + code);
  });
  child.on('error', (error) => output.appendLine(error.message));
  child.stdout.on('data', (data) => {
    ready = true;
    output.appendLine(String(data).trim());
  });
  child.stderr.on('data', (data) => output.appendLine(String(data).trim()));
  child.stdin.on('error', (error) => output.appendLine(error.message));
  return {
    set(restricted) {
      if (!child.killed && child.stdin.writable)
        child.stdin.write(restricted ? 'restrict\n' : 'restore\n');
    },
    inspect: () => ({ running: child.exitCode === null, ready }),
    dispose() {
      // EOF restores the captured window before the helper exits.
      child.stdin.end();
    },
  };
}
module.exports = { startNativeHost };
