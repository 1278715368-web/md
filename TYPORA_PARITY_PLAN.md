# Typora Feature Parity Plan

Last updated: 2026-03-23

## Priority 0: Markdown syntax compatibility

- [x] Task lists: render GitHub-style task list syntax and support preview interaction
- [x] Footnotes: support `[^id]` references and footnote definitions
- [x] `[toc]` syntax: render inline table of contents block from document headings
- [x] YAML Front Matter: detect front matter and render it without breaking the body
- [x] Highlight syntax: support `==highlight==`
- [x] Subscript syntax: support `H~2~O`
- [x] Superscript syntax: support `x^2^`
- [x] Emoji shortcodes: support `:smile:`
- [x] Mermaid code fences: render diagrams instead of plain code blocks

## Priority 1: Editing and preview workflow

- [x] Task list interaction: clicking a preview checkbox updates markdown source
- [x] Link interaction: command-click links in preview to open targets
- [x] Image drag and drop: dropping image files inserts markdown image syntax
- [x] TOC experience: keep existing side TOC and make inline `[toc]` consistent with it

## Priority 2: Typora-like enhancement gaps

- [ ] Table editing toolbar and row/column actions
- [ ] Inline element source/edit expansion workflow
- [ ] Slash/insert style helpers for tables, formulas, diagrams
- [ ] Preferences panel for optional markdown extensions

## Overall test status

- [x] `npm run build`
- [x] `npm run electron:build:mac`
- [x] Packaged app launch smoke test

## Progress log

- [x] White screen in packaged build fixed
- [x] First `Cmd+N` no longer loses the current document content
- [x] Priority 0 syntax compatibility pass completed
- [x] Priority 1 editing workflow pass completed
- [ ] Priority 2 advanced editor enhancements pending
- [x] End-to-end build and packaged app smoke test completed
