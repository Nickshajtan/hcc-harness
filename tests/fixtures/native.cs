using System;
using System.IO;
using System.Text;
using System.Threading;

public class FakeNative {
  static string Quote(string value) {
    var b = new StringBuilder("\"");
    foreach (char c in value) {
      if (c == '"' || c == '\\') { b.Append('\\'); b.Append(c); }
      else if (c < 32) b.Append("\\u" + ((int)c).ToString("x4"));
      else b.Append(c);
    }
    return b.Append('"').ToString();
  }
  public static int Main(string[] args) {
    var fields = new string[args.Length];
    for (int i = 0; i < args.Length; i++) fields[i] = Quote(args[i]);
    string log = Environment.GetEnvironmentVariable("FAKE_LOG");
    string json = "{\"args\":[" + string.Join(",", fields) + "],\"cwd\":" + Quote(Environment.CurrentDirectory) +
      ",\"demo\":" + Quote(Environment.GetEnvironmentVariable("ARCH_DEMO") ?? "") + ",\"pid\":" + System.Diagnostics.Process.GetCurrentProcess().Id + "}";
    if (log != null) File.AppendAllText(log, json + "\n", new UTF8Encoding(false));
    Console.WriteLine(json);
    Console.Error.WriteLine("native stderr");
    if (Environment.GetEnvironmentVariable("FAKE_STDIN") == "1") Console.Write(Console.In.ReadToEnd());
    if (Environment.GetEnvironmentVariable("FAKE_WAIT") == "1") Thread.Sleep(60000);
    return int.Parse(Environment.GetEnvironmentVariable("FAKE_EXIT") ?? "0");
  }
}
