# Film Date Stamp

一个无需服务器的胶片相机日期戳工具。七段式数字、柔和光晕、按照片百分比计算的尺寸和边距均在浏览器 Canvas 中渲染；照片不会上传到服务器。

## Windows 版

从 [Releases](https://github.com/kuyu131072/film_dateprint/releases) 下载 `FilmDateStamp-v1.0.0-win-x64.exe`，双击即可打开独立窗口。EXE 包含 .NET 运行时及页面资源；电脑需安装 Microsoft Edge WebView2 Runtime。首次运行会把内嵌页面资源释放到用户的 `%LOCALAPPDATA%\FilmDateStamp` 目录。导出时会弹出 Windows 保存对话框。

该 EXE 尚未进行代码签名，Windows SmartScreen 可能显示未知发布者提示。

## 使用

下载仓库后，用新版 Edge 或 Chrome 打开 `index.html`。导入 JPG、JPEG、PNG 或 WebP 照片，调整日期戳，再导出 JPG、PNG 或批量 ZIP。

可手动输入日期，也可优先使用每张照片的 EXIF `DateTimeOriginal`；缺少拍摄日期时使用手动输入的日期。

## 文件

- `index.html`：界面结构
- `style.css`：界面样式
- `app.js`：七段式绘制、预览、EXIF、导出与批量处理
- `desktop/`：Windows WebView2 封装项目

三个文件需保持在同一目录。项目无第三方依赖，也不需要构建步骤。

## 验证

- 打开 `index.html?selftest=1`：检查 6000 × 4000、3000 × 2000、1200 × 800 三种尺寸下，日期戳宽度为照片宽度的 18%，右边距为 4%，下边距为 5%。
- 打开 `index.html?integration=1`：检查图片导入、原尺寸 JPG/PNG 导出、EXIF 解析与回退、ZIP 打包。该测试会创建大画布，需要一定内存。

导出图片不会保留原照片的 EXIF 等元数据，请保留原片。

## 构建 Windows EXE

在 Windows 上安装 .NET 9 SDK 后运行：

```powershell
dotnet publish desktop/FilmDateStamp.csproj -c Release -r win-x64 -o publish
```

构建结果为 `publish/FilmDateStamp.exe`。项目使用 `Microsoft.Web.WebView2` NuGet 包，版本见项目文件。
