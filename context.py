#!/usr/bin/env python3
"""Terminal Vim IBus compatibility, confined to one verified X11 terminal PID."""
import argparse, json, os, pathlib, subprocess, time, signal


def ancestors(pid):
    result = set()
    for _ in range(64):
        if pid < 2 or pid in result:
            break
        result.add(pid)
        try:
            pid = int(
                (pathlib.Path("/proc") / str(pid) / "stat")
                .read_text()
                .rsplit(")", 1)[1]
                .split()[1]
            )
        except (OSError, ValueError, IndexError):
            break
    return result


class Context:
    def __init__(self, vim_pid):
        self.vim_pid = vim_pid
        self.saved = None
        self.saved_ascii = None
        self.proxy = None

    def focused(self):
        try:
            window = subprocess.check_output(
                ["xdotool", "getactivewindow"], text=True, timeout=0.3
            ).strip()
            owner = int(
                subprocess.check_output(
                    ["xdotool", "getwindowpid", window], text=True, timeout=0.3
                )
            )
            return owner in ancestors(self.vim_pid)
        except (OSError, ValueError, subprocess.SubprocessError):
            return False

    def bus(self):
        if self.proxy is None:
            import gi

            gi.require_version("IBus", "1.0")
            from gi.repository import IBus

            IBus.init()
            self.proxy = IBus.Bus()
        return self.proxy

    def restrict(self):
        if not self.focused():
            self.restore()
            return
        try:
            bus = self.bus()
            engine = bus.get_global_engine()
            if engine is None:
                return
            name = engine.get_name()
            if name.startswith("xkb:") and self.saved is None:
                return
            if self.saved is None:
                self.saved = name
            # Only terminal Vim uses this compatibility switch. The GUI and Shell
            # backends never change the global IBus engine.
            bus.set_global_engine("xkb:us::eng")
        except (ImportError, ValueError, RuntimeError):
            self.restore()

    def restore(self):
        if self.saved:
            name = self.saved
            self.saved = None
            try:
                self.bus().set_global_engine(name)
            except (ImportError, ValueError, RuntimeError):
                pass


def watch(pid, state_path):
    context = Context(pid)
    running = True

    def stop(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        while running and pathlib.Path("/proc/%d" % pid).exists():
            try:
                state = json.loads(state_path.read_text())
                restricted = state["pid"] == pid and state.get("restricted", False)
            except (OSError, ValueError, KeyError):
                restricted = False
            if restricted:
                context.restrict()
            else:
                context.restore()
            time.sleep(0.1)
    finally:
        context.restore()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--watch", type=int, required=True)
    p.add_argument("--state", type=pathlib.Path, required=True)
    a = p.parse_args()
    if not os.environ.get("DISPLAY") or os.environ.get("TMUX") or os.environ.get("STY"):
        return
    watch(a.watch, a.state)


if __name__ == "__main__":
    main()
