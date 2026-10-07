# BugBundle

**Prepare a useful game or mod bug report without sending your logs to a service.** BugBundle gathers selected text logs, versions, a mod list, and reproduction steps into a Markdown report or ZIP bundle. Files are read, redacted, previewed, and packaged in your browser.

> BugBundle is a report-preparation tool. It does not upload or diagnose logs, and its signature hints are not a root-cause analysis. Review every generated report before sharing it.

## Open the app

**Use BugBundle online:** https://ghostnever-lkm.github.io/bugbundle/

**Download for offline use:** [BugBundle v1.0.0 ZIP](https://github.com/GhosTnever-lkm/bugbundle/releases/latest/download/BugBundle-v1.0.0.zip). Extract it and open `index.html`.

![CI](https://github.com/GhosTnever-lkm/bugbundle/actions/workflows/ci.yml/badge.svg)

Or open `index.html` in a recent browser, or serve this directory with any static web server. There is no build step, package install, server API, or account. The example works without selecting a file.

## What it does

- Reads selected text logs and report files in the browser (up to 8 MB per file and 25 MB total).
- Tries to identify Minecraft, Hearts of Iron IV, Stellaris, Skyrim / Bethesda, Unity, and Unreal logs.
- Extracts a small set of common version fields, error lines, and heuristic starting checks.
- Masks several common token and credential formats, email addresses, user-folder paths, and optionally detected IPv4 addresses in the text that is exported.
- Shows the cleaned log preview and a count of replaced items before export.
- Produces `bug-report.md` or a ZIP containing that report and sanitized copies of the selected text files.
- Includes English and Russian interfaces.

## Privacy and limitations

All processing is client-side. The app contains no analytics, external fonts, or third-party scripts. It does not send files to the GitHub Pages host or to an AI service. GitHub Pages serves only the static app files when you open the hosted version.

Redaction is pattern-based and cannot guarantee that all sensitive information is found. Check the preview and downloaded bundle yourself. Selected `.dmp` and other binary crash dumps are intentionally not accepted as text logs. Large log sets beyond the limits are rejected. The hints are common-pattern matches, can be wrong, and cannot confirm a cause. Mod formats, game logs, and loader versions vary. Do not use the output as proof that a file is safe or as a substitute for a game's own support instructions.

## Development

The app uses native browser JavaScript modules and has no runtime dependencies. Core tests use Node.js's built-in test runner: run `npm test`. Serve the folder locally, edit `index.html`, `styles.css`, or `src/`, and reload the page. GitHub Actions runs the core tests for pushes and pull requests.

## Локальный запуск

Открой `index.html` в современном браузере или запусти любой статический веб-сервер в этой папке. Сборка и установка пакетов не нужны. Пример отчёта работает без выбора файла.

BugBundle собирает текстовые логи, версии, список модов и шаги воспроизведения в Markdown-отчёт или ZIP. Файлы обрабатываются только в браузере. Программа не отправляет логи и не определяет настоящую причину сбоя. Проверка личных данных основана на шаблонах и не гарантирует, что найдёт каждую чувствительную строку. Перед публикацией проверь предпросмотр и скачанный пакет самостоятельно.

Интерфейс принимает до 8 МБ на файл и до 25 МБ файлов всего. Двоичные дампы памяти не поддерживаются. Подсказки по сигнатурам ошибок — ориентир для дальнейшей проверки, а не подтверждённый диагноз.

## License

MIT. See [LICENSE](LICENSE).
