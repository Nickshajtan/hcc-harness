using System;
using System.IO;

// Test-only open handle without delete sharing. Never distributed with Arch.
public class PublicationHolder {
  public static void Main(string[] args) {
    using (var file = new FileStream(args[0], FileMode.Open, FileAccess.Read, FileShare.Read)) {
      Console.WriteLine("ready");
      if (Console.ReadLine() != "release") throw new InvalidOperationException("Expected release");
    }
    // Test-owned cleanup, after the parent has checked preservation. A successful
    // namespace deletion is the release barrier, not process exit alone.
    File.Delete(args[0]);
    Console.WriteLine("released");
    if (Console.ReadLine() != "exit") throw new InvalidOperationException("Expected exit");
  }
}
