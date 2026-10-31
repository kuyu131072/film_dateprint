using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FilmDateStamp;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainWindow());
    }
}

internal sealed class MainWindow : Form
{
    private const string Host = "film-date-stamp.local";
    private readonly WebView2 webView = new() { Dock = DockStyle.Fill };

    public MainWindow()
    {
        Text = "Film Date Stamp";
        Width = 1440;
        Height = 900;
        MinimumSize = new Size(800, 600);
        StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(webView);
        Shown += async (_, _) => await InitializeAsync();
    }

    private async Task InitializeAsync()
    {
        try
        {
            string root = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FilmDateStamp");
            string appFolder = Path.Combine(root, "app-v1.0.0");
            Directory.CreateDirectory(appFolder);
            Extract("index.html", appFolder);
            Extract("style.css", appFolder);
            Extract("app.js", appFolder);

            var environment = await CoreWebView2Environment.CreateAsync(
                userDataFolder: Path.Combine(root, "webview2"));
            await webView.EnsureCoreWebView2Async(environment);
            webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                Host, appFolder, CoreWebView2HostResourceAccessKind.Allow);
            webView.CoreWebView2.DownloadStarting += (_, args) =>
            {
                using var save = new SaveFileDialog
                {
                    Title = "保存日期戳照片",
                    FileName = Path.GetFileName(args.ResultFilePath),
                    Filter = "所有文件 (*.*)|*.*",
                    OverwritePrompt = true
                };
                if (save.ShowDialog(this) == DialogResult.OK)
                    args.ResultFilePath = save.FileName;
                else
                    args.Cancel = true;
            };
            webView.CoreWebView2.NavigationStarting += (_, args) =>
            {
                if (!args.Uri.StartsWith($"https://{Host}/", StringComparison.OrdinalIgnoreCase))
                    args.Cancel = true;
            };
            webView.Source = new Uri($"https://{Host}/index.html");
        }
        catch (Exception error)
        {
            MessageBox.Show(this,
                "无法启动应用。请确认已安装 Microsoft Edge WebView2 Runtime。\n\n" + error.Message,
                "Film Date Stamp", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private static void Extract(string fileName, string folder)
    {
        using Stream input = typeof(Program).Assembly.GetManifestResourceStream(
            "FilmDateStamp." + fileName)
            ?? throw new InvalidOperationException("缺少嵌入资源：" + fileName);
        using FileStream output = File.Create(Path.Combine(folder, fileName));
        input.CopyTo(output);
    }
}
