#!/usr/bin/env bash
set -euo pipefail
root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
bash "$root_dir/package.sh"
printf 'Install the VSIX on the GUI host and merge config/settings.json.\n'
printf 'Build a matching runtime with: bash build-vscode.sh --source <Code installation> --destination <new user directory>\n'
printf 'Save and completely exit Code before starting the new runtime.\n'
