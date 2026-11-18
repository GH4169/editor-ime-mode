'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const VERSION = '1.145.2',
  COMMIT = 'c4453f8ea430795f941c1b2ff6c9321135a74a02';
const MARKER = '/* editor-ime-mode verified patch */';
const END = '/* editor-ime-mode end */';
function patch(app) {
  const productPath = path.join(app, 'product.json'),
    product = JSON.parse(fs.readFileSync(productPath));
  if (product.version !== VERSION || product.commit !== COMMIT)
    throw new Error(
      'Unsupported Code build; requires ' + VERSION + ' / ' + COMMIT
    );
  const file = path.join(app, 'out/vs/workbench/workbench.desktop.main.js');
  let source = fs.readFileSync(file, 'utf8');
  const expected = product.checksums['vs/workbench/workbench.desktop.main.js'];
  const digest = crypto
    .createHash('sha256')
    .update(source)
    .digest('base64')
    .replace(/=+$/, '');
  if (digest !== expected)
    throw new Error(
      'Workbench checksum mismatch; refusing to patch an unknown runtime'
    );
  const renderer = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
  const bridge = 'globalThis.__editorToolsImeRestricted=r=>editorToolsCommands.executeCommand("editorImeMode.setInputRestricted",r);';
  if (source.includes(MARKER)) {
    const start = source.indexOf(MARKER);
    const nextPatch = source.indexOf('/* shell-ime verified patch */', start);
    const endMarker = source.indexOf(END, start);
    const end = endMarker >= 0 ? endMarker + END.length :
      nextPatch >= 0 ? nextPatch : source.length;
    if (!source.includes(bridge)) {
      const anchor = 'globalThis.__editorToolsType=t=>editorToolsCommands.executeCommand("type",{text:t});';
      if (source.split(anchor).length !== 2)
        throw new Error('Verified IME command bridge is unavailable');
      source = source.replace(anchor, anchor + bridge);
    }
    // Recompute offsets after adding the command bridge before the payload.
    const updatedStart = source.indexOf(MARKER);
    const shift = updatedStart - start;
    source = source.slice(0, updatedStart) + MARKER + '\n' + renderer + '\n' + END +
      source.slice(end + shift);
  } else {
    const context = source.match(
      /function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)\)\{\2\.get\(([\w$]+)\)\.createKey\(String\(\3\),([\w$]+)\(\4\)\)\}/
    );
    const command = source.match(/([\w$]+)=he\("commandService"\)/);
    const keybinding = source.match(/([\w$]+)=he\("keybindingService"\)/);
    if (!context || !command || !keybinding)
      throw new Error(
        'Verified context/command/keybinding structures are unavailable'
      );
    const [original, name, access, key, value, service, normalize] = context;
    const keyboard = source.match(
      /this\._viewController\.emitKeyUp\(new ([\w$]+)\(/
    );
    if (!keyboard)
      throw new Error('Verified keyboard event wrapper is unavailable');
    const replacement = `function ${name}(${access},${key},${value}){${access}.get(${service}).createKey(String(${key}),${normalize}(${value}));const editorToolsCommands=${access}.get(${command[1]}),editorToolsKeys=${access}.get(${keybinding[1]});globalThis.__editorToolsType=t=>editorToolsCommands.executeCommand("type",{text:t});${bridge}globalThis.__editorToolsHasKeybinding=e=>{try{return !!editorToolsKeys.softDispatch(new ${keyboard[1]}(e),e.target).commandId}catch{return true}};globalThis.__editorImeMode?.set(String(${key}),${value})}`;
    source = source.replace(original, replacement);
    // Register once after the workbench module initializes. Its capture listener
    // reaches the original type route; no second extension registers `type`.
    source +=
      '\n' + MARKER + '\n' + renderer + '\n' + END + '\n';
  }
  product.checksums['vs/workbench/workbench.desktop.main.js'] = crypto
    .createHash('sha256')
    .update(source)
    .digest('base64')
    .replace(/=+$/, '');
  fs.writeFileSync(file + '.editor-ime.tmp', source);
  fs.renameSync(file + '.editor-ime.tmp', file);
  fs.writeFileSync(productPath + '.editor-ime.tmp', JSON.stringify(product, null, 2));
  fs.renameSync(productPath + '.editor-ime.tmp', productPath);
}
if (require.main === module) patch(process.argv[2]);
module.exports = { patch, VERSION, COMMIT };
