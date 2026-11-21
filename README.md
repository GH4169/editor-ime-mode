# Vim 模式感知输入法

Code 用户运行副本在文件编辑区的 Vim Normal/Visual 模式下使用英文直输。Windows 助手暂时关闭当前键盘布局下的 IME，进入 Insert/Replace、焦点离开编辑区或切走窗口时恢复原先的 IME 状态。插件保留 Windows 当前的键盘布局和布局列表。

限制输入时，编辑区会暂时解除 Monaco EditContext 的绑定，英文按键进入 VSCodeVim 原 type 队列。微软拼音上报 `Process/229` 时，插件根据物理键恢复英文按键。关闭 Vim 或 `editorImeMode.enabled=false` 会恢复输入。

Leader ime 切命令/搜索限制，editorImeMode.enabled=false 关闭；GVim 本地 imdisable，终端 Vim 提供限定 X11 焦点的 IBus 兼容助手。

## 安装

这是独立 Git 仓库，可单独上传 GitHub。打包使用 Bash、Python 3 标准库；逻辑模块使用 Node 18+。Windows helper 用系统 .NET Framework C# 编译器构建，不下载外部程序。安装位置为实际运行 VS Code 窗口的 UI 端，当前部署目标为 Windows Code 1.145.2 + WSL Ubuntu 26.04。

```sh
# 先在 Windows PowerShell 执行 .\build-native.ps1
bash package.sh
code --install-extension dist/local.editor-ime-mode-0.2.1.vsix --force
```

Windows 上建议用 Windows Code CLI 安装。WSL 的 `code` 默认可能转交远程端，不要据此误判 UI 扩展安装位置。`package.json` 声明 `extensionKind: ["ui"]`。

`config/settings.json` 和 `config/keybindings.json` 是本功能配置片段，必须按键/映射合并，不能整份覆盖已有配置。完整键位与保留 JSONC 注释的合并、备份、回滚工具见同级独立仓库 `vscode-custom-keybindings`。安装后由用户在合适时机 Reload Window；本脚本不会重启编辑器。

`use-runtime.ps1` 将当前用户桌面、开始菜单和任务栏中指向系统原版的 Code 快捷方式改为用户运行副本，并在 `%LOCALAPPDATA%\editor-tools\shortcut-backups` 保存原 `.lnk` 和 manifest。不会打开窗口或改变焦点。系统 Code 可执行文件及文件关联未改。

## 测试

```sh
node --test test/*.test.js
```

联合回归：`cd ../vscode-custom-keybindings && bash test/run-integration.sh`。测试创建独立 Xvnc、用户配置、扩展目录和工作区；不使用登录态，不向日常桌面发送按键。Linux Code 测试运行副本与 VSCodeVim 1.32.4 的位置可通过 `EDITOR_TOOLS_TEST_CODE` / `EDITOR_TOOLS_TEST_VIM` 指定。

在 PowerShell 执行 `test\run-native.ps1`，用隐藏测试窗口验证 IME 开闭及恢复、重复恢复、键盘布局列表和前台焦点。Windows 中文组合输入由渲染层测试模拟。

2026-11-16 的联合结果：SV、Visual、分屏搜索、颜色标记次数/固定坐标、marker 一次撤销、Enter、快速分屏、Leader 共存、局部编辑区/终端限制均通过 Linux Code 1.145.2 集成检查。**这不等于 Windows 拼音和真实 Codex 提交已验收。** 原始结果在联合仓库的 `test-results/`，该目录不加入 Git。

2026-11-17：26 项隔离 Code 检查、5 项 IME 逻辑/补丁检查及 6 项 Windows 原生检查通过。新增模拟 `Process/229` + composition 验证 Normal 光标命令只执行一次，Insert 能输入中文，保留 `:w`、搜索回车、分屏和焦点行为。Windows 原生测试验证实际布局切换；微软拼音候选窗及其内部“中/英”状态还需用户真实输入验收，不能用模拟事件替代。

## 停用与卸载

```sh
code --uninstall-extension local.editor-ime-mode
```

在统一键位仓库执行受保护回滚，或仅删本仓库 config 中对应的键/映射。若安装后用户继续编辑了配置，回滚器拒绝覆盖后续修改，应根据备份合并恢复。

## 兼容范围和限制

Code 补丁只支持 1.145.2 / c4453f8ea430795f941c1b2ff6c9321135a74a02，并检查原校验和及结构。Windows 助手仅接受关联的前台 Code 窗口的编辑区请求，通过 IMM 控制和恢复可读取的 IME 状态。不同 TSF 输入法对 IMM 的支持有差异，编辑区同时在渲染层拦截组合输入。终端兼容助手支持恢复 IBus 引擎名称。

备份、测试日志、运行副本、VSIX、编译产物不纳入 Git。没有复制浏览器/Codex 凭据。源码按 MIT 许可提供。

## 用户运行副本

```sh
bash build-vscode.sh --source "<系统 Code 安装目录>" --destination "<新的用户运行副本目录>"
```

构建时复制运行文件，只修改目标目录，原安装不变。先应用本仓库补丁，再应用可选的同级 shell-ime 与 vscode-vim-navigation 补丁，各自更新产品校验和。导航补丁补上 Codex Webview 的焦点标识，供 Ctrl+H/L 往返使用；源码与独立 Git 历史保存在导航仓库。版本、commit、校验和或结构不匹配会失败，不能删除检查强行使用。

已有运行副本升级用 `node patch-code.js <副本 resources/app>`，会校验当前 checksum 并只替换 IME payload，保留 shell-ime/导航补丁；重复执行幂等。修改前应备份副本 workbench 和 product.json。原系统安装不作为该命令的升级目标。

当前 Windows 入口：`%LOCALAPPDATA%\editor-tools\code-ime.cmd`。先保存文件并完全退出全部 Code 窗口，再从该入口启动；已有主进程不会通过 Reload Window 切换二进制。用户运行副本与系统版共享配置和扩展，升级 Code 后须重新适配。

Vim/GVim：在 vimrc 中加存在性检查后 source `vim/editor-ime.vim`；用 `bin/gvim` 为单个进程设置 IBUS_DISABLE_SNOOPER。终端兼容脚本需要系统 GI/IBus 及 X11；WSLg 无可靠终端 PID 祖先时保持原行为。停用时移除 source 块，关闭用户副本并从系统入口重开即可。
