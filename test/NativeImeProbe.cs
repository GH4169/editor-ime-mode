using System;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Creates only an invisible native window, never activates it, and never changes
// the foreground application's layout. Exercises the real helper against Win32.
internal static class NativeImeProbe
{
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] private static extern IntPtr GetKeyboardLayout(uint thread);
    [DllImport("user32.dll")] private static extern int GetKeyboardLayoutList(int count, [Out] IntPtr[] layouts);
    [DllImport("user32.dll")] private static extern IntPtr ActivateKeyboardLayout(IntPtr layout, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr LoadKeyboardLayout(string id, uint flags);
    private static Type helper = typeof(EditorImeHost);
    private static object Call(string method, params object[] args)
    {
        return helper.GetMethod(method, BindingFlags.NonPublic | BindingFlags.Static).Invoke(null, args);
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
            CreateHandle(new CreateParams { Caption = "Isolated IME test (never shown)", X = -32000, Y = -32000 });
        }
        public void Dispose() { DestroyHandle(); }
    }
    [STAThread]
    private static int Main()
    {
        IntPtr foreground = GetForegroundWindow();
        uint foregroundPid;
        uint foregroundThread = GetWindowThreadProcessId(foreground, out foregroundPid);
        IntPtr foregroundLayout = GetKeyboardLayout(foregroundThread);
        IntPtr original = GetKeyboardLayout(0);
        try
        {
            IntPtr english = LoadKeyboardLayout("00000409", 0);
            helper.GetField("english", BindingFlags.NonPublic | BindingFlags.Static).SetValue(null, english);
            var layouts = new IntPtr[GetKeyboardLayoutList(0, null)];
            GetKeyboardLayoutList(layouts.Length, layouts);
            IntPtr alternate = original;
            foreach (var layout in layouts)
                if ((layout.ToInt64() & 0xffff) != 0x0409) { alternate = layout; break; }
            using (var window = new HiddenWindow())
            {
                uint pid;
                uint thread = GetWindowThreadProcessId(window.Handle, out pid);
                ActivateKeyboardLayout(alternate, 0);
                Check(GetKeyboardLayout(thread) == alternate, "invisible test thread starts with its own layout");
                Call("Restrict", window.Handle, thread);
                Check((GetKeyboardLayout(thread).ToInt64() & 0xffff) == 0x0409, "native helper forces English on the test window");
                Call("Restore");
                Check(GetKeyboardLayout(thread) == alternate, "native helper restores the captured keyboard layout");
                Call("Restore");
                Check(GetKeyboardLayout(thread) == alternate, "repeated restore preserves the layout");
            }
            if (GetForegroundWindow() == foreground)
                Check(GetKeyboardLayout(foregroundThread) == foregroundLayout, "foreground application's input method is unchanged");
            Check(GetForegroundWindow() == foreground, "test never takes foreground focus");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        finally { Call("Restore"); ActivateKeyboardLayout(original, 0); }
    }
}
