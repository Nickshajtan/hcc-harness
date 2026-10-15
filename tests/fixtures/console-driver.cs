using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;

// Tests real Windows console events in a separate, hidden console. No SendKeys or timing-only assertions.
class ConsoleDriver {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct StartupInfo {
    public int cb; public string reserved, desktop, title;
    public int x,y,xSize,ySize,xChars,yChars,fill,flags;
    public short show, reservedSize; public IntPtr reservedData, stdin, stdout, stderr;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct ProcessInfo { public IntPtr process, thread; public int pid, tid; }
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CreateProcess(string application, StringBuilder commandLine, IntPtr pa, IntPtr ta,
    bool inherit, uint flags, IntPtr env, string cwd, ref StartupInfo startup, out ProcessInfo info);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int id);
  [DllImport("kernel32.dll")] static extern bool FreeConsole();
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AttachConsole(int pid);
  [DllImport("kernel32.dll")] static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GenerateConsoleCtrlEvent(uint type, uint group);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr handle, out uint exit);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr handle, uint exit);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static string Quote(string text) { return "\"" + text.Replace("\"", "\\\"") + "\""; }
  static int Main(string[] args) {
    var startup = new StartupInfo(); startup.cb = Marshal.SizeOf(startup);
    startup.flags = 0x101; // STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW
    startup.show = 0; startup.stdin = GetStdHandle(-10); startup.stdout = GetStdHandle(-11); startup.stderr = GetStdHandle(-12);
    ProcessInfo child;
    SetConsoleCtrlHandler(IntPtr.Zero, false);
    var line = new StringBuilder(Quote(args[0]) + (args[1] == "-" ? "" : " " + Quote(args[1]) + " run claude --"));
    if (!CreateProcess(args[0], line, IntPtr.Zero, IntPtr.Zero, true, 0x10, IntPtr.Zero,
      Environment.CurrentDirectory, ref startup, out child)) throw new Exception("CreateProcess: " + Marshal.GetLastWin32Error());
    try {
      string log = Environment.GetEnvironmentVariable("FAKE_LOG");
      DateTime deadline = DateTime.UtcNow.AddSeconds(10);
      while (!File.Exists(log)) {
        if (DateTime.UtcNow > deadline) throw new Exception("Native never started");
        Thread.Sleep(20);
      }
      FreeConsole();
      if (!AttachConsole(child.pid)) throw new Exception("AttachConsole: " + Marshal.GetLastWin32Error());
      SetConsoleCtrlHandler(IntPtr.Zero, true);
      if (!GenerateConsoleCtrlEvent(uint.Parse(args[2]), 0)) throw new Exception("GenerateConsoleCtrlEvent failed");
      if (WaitForSingleObject(child.process, 10000) != 0) throw new Exception("Arch did not exit after console event");
      uint exit; GetExitCodeProcess(child.process, out exit);
      Console.WriteLine("driver exit=" + exit);
      return (int)exit;
    } finally {
      TerminateProcess(child.process, 255);
      CloseHandle(child.thread); CloseHandle(child.process);
    }
  }
}
