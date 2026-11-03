using System;
using System.IO;

// Test-only open handle without delete sharing. Never distributed with Arch.
public class PublicationHolder {
  public static void Main(string[] args) {
    using (var file = new FileStream(args[0], FileMode.Open, FileAccess.Read, FileShare.Read)) {
      Console.WriteLine("ready");
      Console.ReadLine();
    }
  }
}
