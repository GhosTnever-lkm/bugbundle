# Changelog

## v1.0.10 — 2026-10-11

- Make bidi, control, and Unicode line-separator characters visible in sanitized filenames so uploaded-file labels cannot visually spoof their extensions.
- Preserve the visible escapes consistently in UI labels, report references, and ZIP filenames.
- Add regression coverage for bidi, newline, and C1 control characters.

## v1.0.9 — 2026-10-11

- Fix uploaded logs crashing automatic game detection by storing the text field consumed by report analysis.
- Load the tested canonical core module in the browser app instead of an outdated duplicate.
- Add a regression ensuring app and tests use the same core module; bump the app script URL to refresh cached clients.

## v1.0.8 — 2026-10-11

- Visibly escape invisible Unicode, control characters, and line separators in the mod-list portion of reports while preserving ordinary line breaks.
- Add a regression covering bidirectional text, tabs, carriage returns, and ANSI control characters.

## v1.0.7 — 2026-10-11

- Escape Markdown syntax, multiline breaks, and invisible Unicode controls in user-provided report fields and extracted evidence.
- Keep evidence filenames outside inline code spans so untrusted backticks cannot break report formatting.
- Add regressions for forged headings, links, emphasis, and bidirectional control characters.
- Publish a checksum-verified offline ZIP from the release workflow after tests and archive smoke checks.

## v1.0.6 — 2026-10-11

- Hide the empty preview state after loading a report so it does not overlap the live summary.
- Add a current interface screenshot and refresh the offline bundle instructions.


## v1.0.5 — 2026-10-11

- Remove HTTP URL user-info credentials during log redaction while preserving the public URL.
- Add regression coverage for credentials embedded in diagnostic log URLs.


## v1.0.4 — 2026-10-11

- Remove URL credentials and redact recognized secret query/fragment parameters from exported project context.
- Test that ordinary URL parameters such as `author` remain intact.


## v1.0.3 — 2026-10-11

- Add GitHub Funding metadata with verified Buy Me a Coffee and Gumroad links.

## v1.0.2

- Add README badges (CI, version, license) and a Support / Pro Version section with donate + contact links.
- Add `.gitignore` for Node and OS artifacts.

## v1.0.1

- Restore the GitHub Issue pack download action.
- Refresh the browser entry-point version so deployed pages load the updated handler.
- Publish a complete offline ZIP matching the current source.

## v1.0.0

- First public release of the local-first game and mod crash report builder.
