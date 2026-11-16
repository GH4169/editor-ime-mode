'use strict';
const vscode = require('vscode');
function activate(context) {
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
