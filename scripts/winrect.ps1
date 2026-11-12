Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class WR {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public static string Find() {
    string best = "none";
    int bestArea = 0;
    EnumWindows((h, p) => {
      var sb = new StringBuilder(256); GetWindowTextW(h, sb, 256);
      if (!sb.ToString().Contains("大肥鱼音乐管家")) return true;
      if (!IsWindowVisible(h)) return true;
      RECT r; GetWindowRect(h, out r);
      int area = (r.R - r.L) * (r.B - r.T);
      if (area <= bestArea) return true;
      bestArea = area;
      best = r.L + "," + r.T + "," + (r.R - r.L) + "," + (r.B - r.T);
      return true;
    }, IntPtr.Zero);
    return best;
  }
}
"@
[WR]::Find()