# Repository guidance

- Keep this a static, offline-capable HTML/CSS/JavaScript app. Do not add a server or paid API dependency for image processing.
- Keep preview and export on the same `renderPhoto` and `renderStamp` code path. Export at each photo's original resolution without cropping.
- Calculate stamp width and margins as percentages of that photo's dimensions. The default visible stamp width is 18%, with 4% right and 5% bottom margins.
- Read EXIF `DateTimeOriginal` for capture dates; if missing, use the manual date. Do not substitute the file modification time.
- Before shipping changes, run `node --check app.js`, then open `index.html?selftest=1` and `index.html?integration=1` in a modern browser. Keep the three specified resolutions covered.
- Do not commit user photos, generated exports, browser profiles, or temporary test files.
- The Windows wrapper lives in `desktop/`. Keep its embedded resources aligned with the root HTML, CSS, and JavaScript files. Test startup for both the self-contained win-x64 EXE and the smaller framework-dependent variant before updating a release; document the runtime requirement for the latter.
