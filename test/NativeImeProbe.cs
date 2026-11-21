using System;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Exercises the real helper with a private IME context on an invisible window.
internal static class NativeImeProbe
{
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] private static extern IntPtr GetKeyboardLayout(uint thread);
    [DllImport("user32.dll")] private static extern int GetKeyboardLayoutList(int count, [Out] IntPtr[] layouts);
    [DllImport("imm32.dll")] private static extern IntPtr ImmCreateContext();
    [DllImport("imm32.dll")] private static extern bool ImmDestroyContext(IntPtr context);
    [DllImport("imm32.dll")] private static extern IntPtr ImmAssociateContext(IntPtr window, IntPtr context);
    [DllImport("imm32.dll")] private static extern bool ImmGetOpenStatus(IntPtr context);
    [DllImport("imm32.dll")] private static extern bool ImmSetOpenStatus(IntPtr context, bool open);

    private static readonly Type Helper = typeof(EditorImeHost);
    private static object Call(string method, params object[] args)
    {
        return Helper.GetMethod(method, BindingFlags.NonPublic | BindingFlags.Static).Invoke(null, args);
    }
    private static IntPtr[] GetLayouts()
    {
        var layouts = new IntPtr[GetKeyboardLayoutList(0, null)];
        int count = GetKeyboardLayoutList(layouts.Length, layouts);
        return layouts.Take(count).OrderBy(layout => layout.ToInt64()).ToArray();
    }
    private static void Check(bool value, string description)
    {
        if (!value) throw new Exception(description);
        Console.WriteLine("PASS " + description);
    }
    private sealed class HiddenWindow : NativeWindow, IDisposable
    {
        internal HiddenWindow()
        {
            CreateHandle(new CreateParams { Caption = "Isolated IME test", X = -32000, Y = -32000 });
        }
        public void Dispose() { DestroyHandle(); }
    }
    private static void VerifyImeRestore(IntPtr window, uint thread, IntPtr layout, bool wasOpen)
    {
        IntPtr context = ImmCreateContext();
        if (context == IntPtr.Zero) throw new Exception("Could not create a private IME context");
        IntPtr previous = ImmAssociateContext(window, context);
        try
        {
            if (!ImmSetOpenStatus(context, wasOpen) || ImmGetOpenStatus(context) != wasOpen)
                throw new Exception("Could not set the initial IME state");

            Call("Restrict", window, thread);
            Check(!ImmGetOpenStatus(context), "restricted editor uses direct input");
            Check(GetKeyboardLayout(thread) == layout, "restriction preserves the editor keyboard layout");

            if (!ImmSetOpenStatus(context, true))
                throw new Exception("Could not simulate reopening the IME");
            Call("Restrict", window, thread);
            Check(!ImmGetOpenStatus(context), "reopening the IME during restriction is reversed");

            Call("Restore");
            Check(ImmGetOpenStatus(context) == wasOpen, "restore recovers the original IME state (" + wasOpen + ")");
            Call("Restore");
            Check(ImmGetOpenStatus(context) == wasOpen, "repeated restore preserves the IME state");
            Check(GetKeyboardLayout(thread) == layout, "restore preserves the editor keyboard layout");
        }
        finally
        {
            Call("Restore");
            ImmAssociateContext(window, previous);
            ImmDestroyContext(context);
        }
    }

    [STAThread]
    private static int Main()
    {
        IntPtr foreground = GetForegroundWindow();
        uint foregroundPid;
        uint foregroundThread = GetWindowThreadProcessId(foreground, out foregroundPid);
        IntPtr foregroundLayout = GetKeyboardLayout(foregroundThread);
        var originalLayouts = GetLayouts();
        try
        {
            using (var window = new HiddenWindow())
            {
                uint pid;
                uint thread = GetWindowThreadProcessId(window.Handle, out pid);
                IntPtr layout = GetKeyboardLayout(thread);
                VerifyImeRestore(window.Handle, thread, layout, true);
                VerifyImeRestore(window.Handle, thread, layout, false);
            }
            Check(originalLayouts.SequenceEqual(GetLayouts()), "Windows keyboard layout list is unchanged");
            if (GetForegroundWindow() == foreground)
                Check(GetKeyboardLayout(foregroundThread) == foregroundLayout, "foreground application's input method is unchanged");
            Check(GetForegroundWindow() == foreground, "test never takes foreground focus");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
