using System;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Microsoft.Win32;

[assembly: AssemblyTitle("牛来盯盘安装程序")]
[assembly: AssemblyDescription("把牛来带回桌面")]
[assembly: AssemblyCompany("牛来")]
[assembly: AssemblyProduct("牛来盯盘")]
[assembly: AssemblyVersion("1.4.0.0")]
[assembly: AssemblyFileVersion("1.4.0.1")]

namespace Niulai.Setup {
  internal sealed class Installer {
    Window window;
    string[] metadata;
    string installPath;
    string logPath;
    bool busy, complete, preview;
    int pose;
    readonly Stopwatch clock = Stopwatch.StartNew();
    BitmapSource[] images;
    DispatcherTimer animation;
    CancellationTokenSource cancellation;
    volatile bool backendStarted;

    T UI<T>(string name) where T : class { return window.FindName(name) as T; }
    static Stream Resource(string name) { return Assembly.GetExecutingAssembly().GetManifestResourceStream(name); }
    static string Text(string name) { using (var input = new StreamReader(Resource(name), Encoding.UTF8)) return input.ReadToEnd(); }
    static string Hash(Stream stream) { using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant(); }
    void Log(string text) { try { File.AppendAllText(logPath, DateTimeOffset.Now.ToString("o") + " " + text + Environment.NewLine, Encoding.UTF8); } catch { } }

    [STAThread]
    static int Main(string[] args) {
      try {
        var setup = new Installer();
        setup.metadata = Text("metadata").Trim().Split('\n').Select(s => s.Trim()).ToArray();
        // Extracting is useful for offline inspection and verifies the exact embedded backend.
        if (args.Length == 2 && args[0] == "--extract-payload") {
          string target = Path.GetFullPath(args[1]);
          using (var source = Resource("payload")) {
            if (Hash(source) != setup.metadata[1]) return 2;
            source.Position = 0;
            using (var output = new FileStream(target, FileMode.CreateNew)) source.CopyTo(output);
          }
          return 0;
        }
        bool created;
        using (var mutex = new Mutex(true, "Local\\Niulai.Setup." + setup.metadata[3], out created)) {
          if (!created) { MessageBox.Show("牛来的安装程序已经打开了。", "牛来盯盘"); return 3; }
          var app = new Application();
          app.DispatcherUnhandledException += (sender, error) => {
            setup.Log(error.Exception.ToString());
            MessageBox.Show("安装暂时遇到问题，请重新打开安装程序。\n" + error.Exception.Message, "牛来盯盘");
            error.Handled = true;
          };
          setup.Initialize(args);
          return app.Run(setup.window);
        }
      } catch (Exception error) {
        MessageBox.Show("安装程序无法启动：\n" + error.Message, "牛来盯盘");
        return 1;
      }
    }

    void Initialize(string[] args) {
      string logs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Niulai", "Installer", "logs");
      Directory.CreateDirectory(logs);
      logPath = Path.Combine(logs, "setup-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".log");
      using (var source = Resource("view")) window = (Window)XamlReader.Load(source);
      double scale = Math.Min(1, Math.Min((SystemParameters.WorkArea.Width - 24) / 920, (SystemParameters.WorkArea.Height - 24) / 600));
      window.Width = 920 * scale; window.Height = 600 * scale;
      UI<TextBlock>("Version").Text = "v" + metadata[0];
      using (var source = Resource("icon")) {
        var icon = new BitmapImage(); icon.BeginInit(); icon.CacheOption = BitmapCacheOption.OnLoad; icon.StreamSource = source; icon.EndInit();
        UI<Image>("BrandIcon").Source = icon;
      }
      using (var source = Resource("actions")) {
        var bitmap = new BitmapImage(); bitmap.BeginInit(); bitmap.CacheOption = BitmapCacheOption.OnLoad; bitmap.StreamSource = source; bitmap.EndInit(); bitmap.Freeze();
        images = new BitmapSource[3];
        for (int n = 0; n < 3; n++) { images[n] = new CroppedBitmap(bitmap, new Int32Rect(n * bitmap.PixelWidth / 3, 0, bitmap.PixelWidth / 3, bitmap.PixelHeight)); images[n].Freeze(); }
      }
      SetPose(0);
      string saved = ExistingPath();
      UI<TextBox>("InstallPath").Text = saved ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", metadata[4]);
      var pathArg = args.FirstOrDefault(a => a.StartsWith("--install-dir="));
      if (pathArg != null) UI<TextBox>("InstallPath").Text = pathArg.Substring("--install-dir=".Length);
      if (args.Contains("--no-desktop-shortcut")) UI<CheckBox>("DesktopShortcut").IsChecked = false;
      if (saved != null) UI<TextBlock>("PathNote").Text = "更新已有安装，保留自选和设置";
      UI<Button>("CloseButton").Click += (s, e) => window.Close();
      UI<Button>("Minimize").Click += (s, e) => window.WindowState = WindowState.Minimized;
      UI<Grid>("TitleBar").MouseLeftButtonDown += (s, e) => { if (e.OriginalSource is TextBlock || e.OriginalSource is Grid || e.OriginalSource is Border) window.DragMove(); };
      UI<Button>("Browse").Click += (s, e) => Browse();
      UI<Button>("Primary").Click += async (s, e) => { if (complete) Finish(); else await Install(); };
      window.PreviewKeyDown += (s, e) => { if (e.Key == Key.Escape && !busy) window.Close(); };
      window.Closing += (s, e) => {
        if (!busy) return;
        e.Cancel = true;
        if (backendStarted) UI<TextBlock>("ProgressDetail").Text = "正在写入程序，请稍等安装完成。";
        else { cancellation.Cancel(); UI<TextBlock>("ProgressDetail").Text = "正在取消准备…"; }
      };
      animation = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(33) };
      animation.Tick += (s, e) => Animate();
      animation.Start();
      window.Closed += (s, e) => animation.Stop();
      var previewArg = args.FirstOrDefault(a => a.StartsWith("--preview="));
      if (previewArg != null) {
        preview = true;
        if (previewArg.EndsWith("installing")) { SetInstalling(); UpdateProgress("正在把牛来搬进桌面…", "安装中", "牛来正在推着进度条往前走。", -1); }
        else if (previewArg.EndsWith("complete")) ShowComplete();
        UI<TextBlock>("Version").Text += " · 界面预览";
      }
      var exportArg = args.FirstOrDefault(a => a.StartsWith("--export-preview="));
      if (preview && exportArg != null) {
        string output = Path.GetFullPath(exportArg.Substring("--export-preview=".Length));
        // Render the actual XAML and assets without installing or capturing the desktop.
        animation.Stop();
        window.ShowActivated = false; window.ShowInTaskbar = false; window.Opacity = 0;
        if (previewArg.EndsWith("installing")) { UI<ProgressBar>("Progress").IsIndeterminate = false; UI<ProgressBar>("Progress").Value = 62; }
        window.ContentRendered += (s, e) => window.Dispatcher.BeginInvoke(new Action(() => {
          window.UpdateLayout();
          var view = (FrameworkElement)window.Content;
          var bitmap = new RenderTargetBitmap((int)Math.Ceiling(window.Width * 2), (int)Math.Ceiling(window.Height * 2), 192, 192, PixelFormats.Pbgra32);
          bitmap.Render(view);
          var png = new PngBitmapEncoder(); png.Frames.Add(BitmapFrame.Create(bitmap));
          using (var file = new FileStream(output, FileMode.Create)) png.Save(file);
          window.Close();
        }), DispatcherPriority.ApplicationIdle);
      }
      // Integration tests use a separately built app ID, exe name and shortcuts.
      // They exercise this same install pipeline without controlling the desktop.
      if (args.Contains("--verify-install") && metadata[3] == "07e165b0-2bd2-4147-9ba3-6ba1d9fea9f1") {
        window.ShowActivated = false; window.ShowInTaskbar = false; window.Opacity = 0;
        window.ContentRendered += async (s, e) => {
          await Install();
          Log("Integration result: " + (complete ? "success" : "failure") + "; " + UI<TextBlock>("Error").Text);
          Application.Current.Shutdown(complete ? 0 : 21);
        };
      }
      Log("Opened. Preview=" + preview);
    }

    string ExistingPath() {
      using (var key = Registry.CurrentUser.OpenSubKey("Software\\" + metadata[3])) {
        var path = key == null ? null : key.GetValue("InstallLocation") as string;
        return path != null && File.Exists(Path.Combine(path, metadata[6])) ? path : null;
      }
    }

    void Browse() {
      using (var dialog = new System.Windows.Forms.FolderBrowserDialog()) {
        dialog.Description = "选择牛来的安装文件夹";
        dialog.SelectedPath = UI<TextBox>("InstallPath").Text;
        dialog.ShowNewFolderButton = true;
        if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK) {
          string selected = dialog.SelectedPath;
          if (!File.Exists(Path.Combine(selected, metadata[6])) && Path.GetFileName(selected) != "牛来盯盘") selected = Path.Combine(selected, "牛来盯盘");
          UI<TextBox>("InstallPath").Text = selected;
        }
      }
    }

    void SetPose(int index) { pose = index; UI<Image>("Cow").Source = images[index]; }
    void Animate() {
      if (!SystemParameters.ClientAreaAnimation || window.WindowState == WindowState.Minimized) return;
      double t = clock.Elapsed.TotalSeconds;
      var transforms = (TransformGroup)UI<Grid>("CowGroup").RenderTransform;
      ((RotateTransform)transforms.Children[1]).Angle = Math.Sin(t * (pose == 1 ? 3.6 : 1.9)) * (pose == 1 ? 1.7 : 1.05);
      var translation = (TranslateTransform)transforms.Children[2];
      translation.Y = Math.Sin(t * (pose == 2 ? 4.8 : 2.1)) * (pose == 2 ? 4 : 2.3);
      translation.X = pose == 1 ? Math.Sin(t * 3.6) * 5 : 0;
    }

    void ValidatePath(string target) {
      if (!Environment.Is64BitOperatingSystem) throw new InvalidOperationException("这个版本需要 64 位 Windows。");
      if (string.IsNullOrWhiteSpace(target) || !Path.IsPathRooted(target) || target.StartsWith("\\\\") || target.IndexOfAny(new[] { '"', '\r', '\n' }) >= 0) throw new InvalidOperationException("请选择本机磁盘上的完整安装路径。");
      string full = Path.GetFullPath(target).TrimEnd(Path.DirectorySeparatorChar);
      if (full.Length < 5 || full.Length > 170 || full.Equals(Path.GetPathRoot(full).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("请使用磁盘内的独立文件夹，路径不超过 170 个字符。");
      foreach (var blocked in new[] { Environment.GetFolderPath(Environment.SpecialFolder.Windows), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) }) {
        if (!string.IsNullOrEmpty(blocked) && (full.Equals(blocked, StringComparison.OrdinalIgnoreCase) || full.StartsWith(blocked + "\\", StringComparison.OrdinalIgnoreCase))) throw new InvalidOperationException("请安装到当前用户可以写入的文件夹。");
      }
      if (File.Exists(full)) throw new InvalidOperationException("安装位置是一个文件，请选择文件夹。");
      if (Directory.Exists(full)) {
        if ((File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("请选择普通文件夹，不能使用链接目录。");
        if (Directory.EnumerateFileSystemEntries(full).Any() && (!File.Exists(Path.Combine(full, metadata[6])) || !File.Exists(Path.Combine(full, "resources", "app.asar")))) throw new InvalidOperationException("这个文件夹已有其他内容，请为牛来选择一个独立文件夹。");
      }
      string parent = full;
      while (!Directory.Exists(parent)) parent = Path.GetDirectoryName(parent);
      if ((File.GetAttributes(parent) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("请选择普通文件夹，不能使用链接目录。");
      string probe = Path.Combine(parent, ".niulai-write-test-" + Guid.NewGuid().ToString("N"));
      using (File.Create(probe)) { } File.Delete(probe);
      long required = long.Parse(metadata[5]) + 128L * 1024 * 1024;
      if (new DriveInfo(Path.GetPathRoot(full)).AvailableFreeSpace < required) throw new InvalidOperationException("安装磁盘空间不足，请更换安装位置或释放空间。");
      if (new DriveInfo(Path.GetPathRoot(Path.GetTempPath())).AvailableFreeSpace < long.Parse(metadata[2]) * 3) throw new InvalidOperationException("系统临时磁盘空间不足，请先释放一些空间。");
      using (var machine = Registry.LocalMachine.OpenSubKey("Software\\" + metadata[3])) if (machine != null && machine.GetValue("InstallLocation") != null) throw new InvalidOperationException("已有面向所有用户的安装，请先从系统设置卸载该版本，再重新安装。");
      using (var installed = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + metadata[3])) {
        Version old, current;
        if (installed != null && Version.TryParse(installed.GetValue("DisplayVersion") as string, out old) && Version.TryParse(metadata[0], out current) && old > current) throw new InvalidOperationException("电脑上已有更新的牛来版本，请使用更新的安装程序。");
      }
      foreach (var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(metadata[6]))) { process.Dispose(); throw new InvalidOperationException("牛来盯盘正在运行，请先从程序中退出，再开始安装。"); }
      installPath = full;
    }

    void SetInstalling() {
      UI<StackPanel>("Options").Visibility = Visibility.Collapsed;
      UI<StackPanel>("ProgressPanel").Visibility = Visibility.Visible;
      UI<TextBlock>("Step").Text = "02 / 牛来搬家中";
      UI<TextBlock>("Heading").Text = "稍等，\n牛来正在赶来。";
      UI<TextBlock>("Description").Text = "一会儿就好。\n桌面搭子，马上就位。";
      UI<TextBlock>("ArtTitle").Text = "马上，上桌。";
      UI<TextBlock>("SpeechText").Text = "我来推一把！";
      UI<TextBlock>("ActionCaption").Text = "嘿咻，把牛气推到你面前。";
      UI<Button>("Primary").Content = "正在安装…";
      UI<Button>("Primary").IsEnabled = false;
      UI<TextBlock>("ButtonNote").Text = "安装完成后，就可以见面了。";
      SetPose(1);
    }

    void UpdateProgress(string label, string value, string detail, double progress) {
      window.Dispatcher.Invoke(() => {
        UI<TextBlock>("ProgressLabel").Text = label;
        UI<TextBlock>("ProgressValue").Text = value;
        UI<TextBlock>("ProgressDetail").Text = detail;
        UI<ProgressBar>("Progress").IsIndeterminate = progress < 0 && SystemParameters.ClientAreaAnimation;
        if (progress >= 0) UI<ProgressBar>("Progress").Value = progress;
      });
    }

    async Task Install() {
      if (busy || preview) return;
      UI<TextBlock>("Error").Visibility = Visibility.Collapsed;
      try { ValidatePath(UI<TextBox>("InstallPath").Text.Trim()); }
      catch (Exception error) { ShowError(error.Message); return; }
      bool desktop = UI<CheckBox>("DesktopShortcut").IsChecked == true;
      busy = true; backendStarted = false;
      cancellation = new CancellationTokenSource();
      SetInstalling();
      string temp = Path.Combine(Path.GetTempPath(), "NiulaiSetup-" + Guid.NewGuid().ToString("N"));
      try {
        await Task.Run(() => {
          Directory.CreateDirectory(temp);
          string payload = Path.Combine(temp, "setup.exe");
          using (var source = Resource("payload")) using (var output = new FileStream(payload, FileMode.CreateNew, FileAccess.Write)) {
            long done = 0; var buffer = new byte[1024 * 1024]; int count;
            while ((count = source.Read(buffer, 0, buffer.Length)) > 0) {
              cancellation.Token.ThrowIfCancellationRequested();
              output.Write(buffer, 0, count); done += count;
              double ratio = (double)done / long.Parse(metadata[2]);
              UpdateProgress("正在准备安装文件", Math.Round(ratio * 100) + "%", "牛来正在收拾行李。", ratio * 100);
            }
          }
          UpdateProgress("正在检查安装文件", "校验中", "确保带来的每一件行李都完好。", -1);
          using (var input = File.OpenRead(payload)) if (Hash(input) != metadata[1]) throw new InvalidOperationException("安装文件校验失败，请重新下载安装程序。");
          cancellation.Token.ThrowIfCancellationRequested();
          backendStarted = true;
          Log("Installing to " + installPath + "; desktop=" + desktop);
          UpdateProgress("正在把牛来搬进桌面", "安装中", "正在写入程序并创建开始菜单入口，请稍等。", -1);
          // A child-only environment variable preserves Unicode and spaces
          // without relying on electron-builder's StdUtils /D tokenization.
          var start = new ProcessStartInfo(payload, "/S /currentuser" + (desktop ? "" : " --no-desktop-shortcut")) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = temp };
          start.EnvironmentVariables["NIULAI_INSTALL_DIR"] = installPath;
          using (var process = Process.Start(start)) {
            process.WaitForExit(); Log("Backend exit " + process.ExitCode);
            if (process.ExitCode == 23) throw new InvalidOperationException("牛来盯盘正在运行，请先退出程序，再重试安装。");
            if (process.ExitCode != 0) throw new InvalidOperationException("安装未完成（代码 " + process.ExitCode + "），请检查安装位置后重试。");
          }
          string[] files = Text("files").Trim().Split('\n'); int verified = 0;
          foreach (string line in files) {
            string[] row = line.TrimEnd('\r').Split('\t');
            string file = Path.Combine(installPath, row[0].Replace('/', Path.DirectorySeparatorChar));
            if (!File.Exists(file) || new FileInfo(file).Length != long.Parse(row[1])) throw new InvalidOperationException("程序文件不完整，请重新运行安装程序。缺少：" + row[0]);
            using (var input = File.OpenRead(file)) if (Hash(input) != row[2]) throw new InvalidOperationException("程序文件验证失败：" + row[0] + "，请重新安装。");
            verified++;
            UpdateProgress("正在确认牛来已就位", verified + " / " + files.Length, "检查已安装的程序文件。", (double)verified / files.Length * 100);
          }
          if (!File.Exists(Path.Combine(installPath, "Uninstall " + metadata[6]))) throw new InvalidOperationException("卸载程序未正确写入，请重新安装。");
          Log("All " + files.Length + " official files verified.");
        });
        ShowComplete();
      } catch (OperationCanceledException) { RestoreOptions(); ShowError("已取消安装准备。你可以随时重新开始。"); Log("Preparation cancelled"); }
      catch (Exception error) { RestoreOptions(); ShowError(error.Message); Log(error.ToString()); }
      finally {
        busy = false; backendStarted = false;
        try { if (Directory.Exists(temp)) Directory.Delete(temp, true); } catch (Exception error) { Log("Temp cleanup: " + error.Message); }
        cancellation.Dispose(); cancellation = null;
      }
    }

    void RestoreOptions() {
      UI<StackPanel>("ProgressPanel").Visibility = Visibility.Collapsed;
      UI<StackPanel>("Options").Visibility = Visibility.Visible;
      UI<TextBlock>("Step").Text = "01 / 接牛来回家";
      UI<TextBlock>("Heading").Text = "再试一下，\n牛来等着你。";
      UI<TextBlock>("Description").Text = "确认安装位置，然后重新开始。";
      UI<TextBlock>("ArtTitle").Text = "牛气满满。";
      UI<TextBlock>("SpeechText").Text = "不着急，我在。";
      UI<Button>("Primary").Content = "重新安装   →";
      UI<Button>("Primary").IsEnabled = true;
      UI<TextBlock>("ButtonNote").Text = "准备好了，随时出发。";
      SetPose(0);
    }
    void ShowError(string text) { UI<TextBlock>("Error").Text = text; UI<TextBlock>("Error").Visibility = Visibility.Visible; }
    void ShowComplete() {
      complete = true;
      UI<StackPanel>("Options").Visibility = Visibility.Collapsed;
      UI<StackPanel>("ProgressPanel").Visibility = Visibility.Collapsed;
      UI<StackPanel>("DonePanel").Visibility = Visibility.Visible;
      UI<TextBlock>("Step").Text = "03 / 牛来已到家";
      UI<TextBlock>("Heading").Text = "安装完成。\n牛来，陪你上桌。";
      UI<TextBlock>("Description").Text = "行情有起伏，陪伴一直在。\n现在，和牛来打个招呼吧。";
      UI<TextBlock>("ArtTitle").Text = "牛来啦！";
      UI<TextBlock>("SpeechText").Text = "就位，开盘见！";
      UI<TextBlock>("ActionCaption").Text = "桌面搭子，正式报到。";
      UI<Button>("Primary").Content = "完成   ✓";
      UI<Button>("Primary").IsEnabled = true;
      UI<TextBlock>("ButtonNote").Text = "祝你今天，也牛气满满。";
      SetPose(2);
    }
    void Finish() {
      if (preview) { window.Close(); return; }
      if (UI<CheckBox>("LaunchAfter").IsChecked == true) {
        try { Process.Start(new ProcessStartInfo(Path.Combine(installPath, metadata[6])) { UseShellExecute = true, WorkingDirectory = installPath }); }
        catch (Exception error) { ShowError("已安装成功，但启动未完成：" + error.Message); Log(error.ToString()); return; }
      }
      window.Close();
    }
  }
}
