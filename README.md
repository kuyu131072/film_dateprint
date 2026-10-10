# Film Date Stamp

一个无需服务器的胶片相机日期戳工具。七段式数字、柔和光晕、按照片百分比计算的尺寸和边距均在浏览器 Canvas 中渲染；照片不会上传到服务器。

## 使用

下载仓库后，用新版 Edge 或 Chrome 打开 `index.html`。导入 JPG、JPEG、PNG 或 WebP 照片，调整日期戳，再导出 JPG、PNG 或批量 ZIP。

可手动输入日期，也可优先使用每张照片的 EXIF `DateTimeOriginal`；缺少拍摄日期时使用手动输入的日期。

## 文件

- `index.html`：界面结构
- `style.css`：界面样式
- `app.js`：七段式绘制、预览、EXIF、导出与批量处理

三个文件需保持在同一目录。项目无第三方依赖，也不需要构建步骤。

## 验证

- 打开 `index.html?selftest=1`：检查 6000 × 4000、3000 × 2000、1200 × 800 三种尺寸下，日期戳宽度为照片宽度的 18%，右边距为 4%，下边距为 5%。
- 打开 `index.html?integration=1`：检查图片导入、原尺寸 JPG/PNG 导出、EXIF 解析与回退、ZIP 打包。该测试会创建大画布，需要一定内存。

导出图片不会保留原照片的 EXIF 等元数据，请保留原片。
