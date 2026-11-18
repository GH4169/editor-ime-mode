'use strict';
const vscode = require('vscode');
const { startNativeHost } = require('./native-host');
function activate(context) {
  const output = vscode.window.createOutputChannel('Editor IME Mode');
  context.subscriptions.push(output);
  let nativeHost;
  try {
    nativeHost = startNativeHost(output);
    if (nativeHost) context.subscriptions.push(nativeHost);
  } catch (error) {
    output.appendLine(error.message);
    vscode.window.showErrorMessage(error.message);
  }
  let restricted = false;
  let commandLineEnglish = vscode.workspace
    .getConfiguration('editorImeMode')
    .get('commandLineEnglish', true);
  const publish = () =>
    Promise.all([
      vscode.commands.executeCommand(
        'setContext',
        'editorImeMode.commandLineEnglish',
        commandLineEnglish
      ),
      vscode.commands.executeCommand(
        'setContext',
        'editorImeMode.enabled',
        vscode.workspace.getConfiguration('editorImeMode').get('enabled', true)
      ),
    ]);
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'editorImeMode.setInputRestricted',
      (value) => {
        restricted = value === true && vscode.window.state.focused &&
          vscode.workspace.getConfiguration('editorImeMode').get('enabled', true);
        nativeHost?.set(restricted);
      }
    ),
    vscode.commands.registerCommand('editorImeMode.inspect', () => ({
      restricted,
      native: nativeHost?.inspect(),
    })),
    vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused) {
        restricted = false;
        nativeHost?.set(false);
      }
    }),
    vscode.commands.registerCommand(
      'editorImeMode.toggleCommandLineEnglish',
      async () => {
        commandLineEnglish = !commandLineEnglish;
        await publish();
        vscode.window.setStatusBarMessage(
          commandLineEnglish ? 'IME: 命令/搜索英文' : 'IME: 命令/搜索跟随系统',
          2500
        );
      }
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('editorImeMode')) publish();
    })
  );
  publish();
}
module.exports = { activate };
