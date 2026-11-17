#!/usr/bin/env python3
"""Copy a matching Code runtime. Source files are never patched or linked writable."""
import argparse, json, pathlib, subprocess, shutil, os

p = argparse.ArgumentParser()
p.add_argument("--source", required=True, type=pathlib.Path)
p.add_argument("--destination", required=True, type=pathlib.Path)
args = p.parse_args()
source = args.source.resolve()
dest = args.destination.resolve()
if source == dest or source in dest.parents:
    raise SystemExit("Destination must be outside the source installation")
apps = [
    q.parent
    for q in source.rglob("product.json")
    if q.parent.name == "app"
    and (q.parent / "out/vs/workbench/workbench.desktop.main.js").exists()
]
if len(apps) != 1:
    raise SystemExit("Cannot identify one Code app directory")
app = apps[0]
product = json.loads((app / "product.json").read_text())
if (
    product.get("version") != "1.145.2"
    or product.get("commit") != "c4453f8ea430795f941c1b2ff6c9321135a74a02"
):
    raise SystemExit("Unsupported Code version/commit; source preserved")
if dest.exists():
    raise SystemExit(
        "Destination already exists; choose a new directory instead of overwriting it"
    )
dest.mkdir(parents=True)
try:
    shutil.copytree(source, dest, dirs_exist_ok=True, symlinks=True)
    target = dest / app.relative_to(source)
    subprocess.run(
        ["node", str(pathlib.Path(__file__).with_name("patch-code.js")), str(target)],
        check=True,
    )
    shell = pathlib.Path(__file__).parent.parent / "shell-ime/patch-code.js"
    if shell.exists():
        subprocess.run(["node", str(shell), str(target)], check=True)
    navigation = pathlib.Path(__file__).parent.parent / "vscode-vim-navigation/patch-code.js"
    patches = ["editor-ime-mode", "shell-ime"]
    if navigation.exists():
        subprocess.run(["node", str(navigation), str(target)], check=True)
        patches.append("vim-navigation")
    (dest / "EDITOR_TOOLS_RUNTIME.json").write_text(
        json.dumps(
            {
                "source": str(source),
                "version": product["version"],
                "commit": product["commit"],
                "patches": patches,
            },
            indent=2,
        )
    )
    print(dest)
except BaseException:
    print(
        "Build failed. The partial destination is retained for inspection; do not start it."
    )
    raise
