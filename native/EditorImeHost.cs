using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// This helper never activates a window or sends keyboard/mouse input.
// Only the foreground Code process related to this extension host is eligible.
internal static class EditorImeHost
{
    private const uint WmImeControl = 0x0283;
    private const int GetConversionMode = 0x0001;
    private const int SetConversionMode = 0x0002;
    private const int GetOpenStatus = 0x0005;
    private const int SetOpenStatus = 0x0006;

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    private struct GuiInfo
    {
        public int Size, Flags;
        public IntPtr Active, Focus, Capture, MenuOwner, MoveSize, Caret;
        public Rect CaretRect;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessEntry
    {
        public uint Size, Usage, Pid;
        public IntPtr Heap;
        public uint Module, Threads, ParentPid;
        public int Priority;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Name;
    }
    private sealed class Snapshot
    {
        public IntPtr Window, Focus, Layout;
        public uint Thread;
        public bool Open;
        public int Conversion, Sentence;
        public bool HasContext, HasConversion;
    }
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] private static extern IntPtr GetKeyboardLayout(uint thread);
    [DllImport("user32.dll")] private static extern bool GetGUIThreadInfo(uint thread, ref GuiInfo info);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    [DllImport("imm32.dll")] private static extern IntPtr ImmGetContext(IntPtr window);
    [DllImport("imm32.dll")] private static extern bool ImmReleaseContext(IntPtr window, IntPtr context);
    [DllImport("imm32.dll")] private static extern bool ImmGetOpenStatus(IntPtr context);
    [DllImport("imm32.dll")] private static extern bool ImmSetOpenStatus(IntPtr context, bool open);
    [DllImport("imm32.dll")] private static extern bool ImmGetConversionStatus(IntPtr context, out int conversion, out int sentence);
    [DllImport("imm32.dll")] private static extern bool ImmSetConversionStatus(IntPtr context, int conversion, int sentence);
    [DllImport("imm32.dll")] private static extern IntPtr ImmGetDefaultIMEWnd(IntPtr window);
    [DllImport("kernel32.dll")] private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool Process32First(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool Process32Next(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);

    private static int desired;
    private static HashSet<uint> codeProcesses;
    private static Snapshot saved;
    private static bool Send(IntPtr window, uint message, IntPtr wParam, IntPtr lParam, out IntPtr result)
    {
        result = IntPtr.Zero;
        return window != IntPtr.Zero && SendMessageTimeout(window, message, wParam, lParam, 2, 100, out result) != IntPtr.Zero;
    }
    private static bool Send(IntPtr window, uint message, IntPtr wParam, IntPtr lParam)
    {
        IntPtr result;
        return Send(window, message, wParam, lParam, out result);
    }
    private static Dictionary<uint, ProcessEntry> Processes()
    {
        var entries = new Dictionary<uint, ProcessEntry>();
        IntPtr handle = CreateToolhelp32Snapshot(2, 0);
        if (handle == new IntPtr(-1)) return entries;
        try
        {
            var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf(typeof(ProcessEntry)) };
            if (Process32First(handle, ref entry))
                do { entries[entry.Pid] = entry; } while (Process32Next(handle, ref entry));
        }
        finally { CloseHandle(handle); }
        return entries;
    }
    private static HashSet<uint> CodeAncestors(uint hostPid)
    {
        var result = new HashSet<uint>();
        var entries = Processes();
        var seen = new HashSet<uint>();
        ProcessEntry entry;
        while (seen.Add(hostPid) && entries.TryGetValue(hostPid, out entry))
        {
            if (string.Equals(entry.Name, "Code.exe", StringComparison.OrdinalIgnoreCase)) result.Add(hostPid);
            hostPid = entry.ParentPid;
        }
        return result;
    }
    private static Snapshot Capture(IntPtr window, IntPtr focus, uint thread, IntPtr layout)
    {
        var state = new Snapshot { Window = window, Focus = focus, Thread = thread, Layout = layout };
        IntPtr context = ImmGetContext(focus);
        if (context != IntPtr.Zero)
        {
            state.HasContext = true;
            state.Open = ImmGetOpenStatus(context);
            state.HasConversion = ImmGetConversionStatus(context, out state.Conversion, out state.Sentence);
            ImmReleaseContext(focus, context);
            return state;
        }

        // The owning IME window can respond when IMM does not expose a
        // context to this process.
        IntPtr ime = ImmGetDefaultIMEWnd(focus), result;
        if (Send(ime, WmImeControl, new IntPtr(GetOpenStatus), IntPtr.Zero, out result))
        {
            state.HasContext = true;
            state.Open = result != IntPtr.Zero;
        }
        if (Send(ime, WmImeControl, new IntPtr(GetConversionMode), IntPtr.Zero, out result))
        {
            state.HasConversion = true;
            state.Conversion = result.ToInt32();
        }
        return state;
    }
    private static void SetImeState(Snapshot state, bool restore)
    {
        bool open = restore && state.Open;
        bool openSet = false;
        bool conversionSet = !restore || !state.HasConversion;
        IntPtr context = ImmGetContext(state.Focus);
        if (context != IntPtr.Zero)
        {
            openSet = ImmGetOpenStatus(context) == open || ImmSetOpenStatus(context, open);
            if (!conversionSet)
                conversionSet = ImmSetConversionStatus(context, state.Conversion, state.Sentence);
            ImmReleaseContext(state.Focus, context);
        }
        if (openSet && conversionSet) return;

        IntPtr ime = ImmGetDefaultIMEWnd(state.Focus);
        if (!openSet) Send(ime, WmImeControl, new IntPtr(SetOpenStatus), new IntPtr(open ? 1 : 0));
        if (!conversionSet) Send(ime, WmImeControl, new IntPtr(SetConversionMode), new IntPtr(state.Conversion));
    }
    private static void Restrict(IntPtr window, uint thread)
    {
        var info = new GuiInfo { Size = Marshal.SizeOf(typeof(GuiInfo)) };
        GetGUIThreadInfo(thread, ref info);
        IntPtr focus = info.Focus == IntPtr.Zero ? window : info.Focus;
        IntPtr layout = GetKeyboardLayout(thread);

        if (saved != null && (saved.Focus != focus || saved.Layout != layout))
            Restore();
        if (saved == null || !saved.HasContext)
            saved = Capture(window, focus, thread, layout);
        if (saved.HasContext)
            SetImeState(saved, restore: false);
    }
    private static void Restore()
    {
        var state = saved;
        saved = null;
        if (state == null || !state.HasContext || !IsWindow(state.Window)) return;

        // When the user selects another layout, the saved IME state belongs
        // to the previous one and must not be applied to the new IME.
        uint pid;
        if (!IsWindow(state.Focus) || GetWindowThreadProcessId(state.Focus, out pid) != state.Thread ||
            GetKeyboardLayout(state.Thread) != state.Layout) return;

        SetImeState(state, restore: true);
    }
    private static int Main(string[] args)
    {
        try
        {
            codeProcesses = CodeAncestors(uint.Parse(args[0]));
            if (codeProcesses.Count == 0) throw new InvalidOperationException("No related Code process found.");
            Console.OutputEncoding = new UTF8Encoding(false);
            Console.WriteLine("Windows IME helper ready (foreground Code only).");
            var input = new Thread(() => {
                string line;
                while ((line = Console.ReadLine()) != null)
                    Interlocked.Exchange(ref desired, line == "restrict" ? 1 : 0);
                Interlocked.Exchange(ref desired, -1);
            });
            input.IsBackground = true;
            input.Start();
            while (Volatile.Read(ref desired) >= 0)
            {
                uint pid;
                IntPtr window = GetForegroundWindow();
                uint thread = GetWindowThreadProcessId(window, out pid);
                bool active = Volatile.Read(ref desired) == 1 && codeProcesses.Contains(pid);
                if (saved != null && (!active || saved.Window != window))
                {
                    Restore();
                    // A new foreground window must receive its own renderer request.
                    Interlocked.CompareExchange(ref desired, 0, 1);
                    active = false;
                }
                if (active) Restrict(window, thread);
                Thread.Sleep(35);
            }
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
        finally { Restore(); }
    }
}
