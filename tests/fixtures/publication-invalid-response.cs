using System;
using System.Runtime.InteropServices;

// Test-only incompatible producer: complete the real move, then violate the
// response contract. Never shipped as Arch's production publication helper.
public class InvalidPublicationResponse {
  [DllImport("kernel32.dll", EntryPoint = "MoveFileExW", CharSet = CharSet.Unicode,
    ExactSpelling = true, SetLastError = true)]
  private static extern bool Move(string source, string target, uint flags);

  public static int Main(string[] args) {
    if (args.Length != 2 || !Move(args[0], args[1], 0)) return 1;
#if WRONG_PROTOCOL
    Console.WriteLine("{\"protocol\":2,\"win32\":0}");
#else
    Console.WriteLine("{\"protocol\":1,\"win32\":0}");
    Console.Error.WriteLine("Injected unexpected diagnostic");
#endif
    return 0;
  }
}
