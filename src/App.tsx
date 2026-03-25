import React, { useState, useEffect, useCallback, useRef } from 'react';
import MarkdownIt from 'markdown-it';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItTaskLists from 'markdown-it-task-lists';
import markdownItSub from 'markdown-it-sub';
import markdownItSup from 'markdown-it-sup';
import markdownItMark from 'markdown-it-mark';
import { full as markdownItEmojiFull } from 'markdown-it-emoji';
import Prism from 'prismjs';
import katex from 'katex';
import mermaid from 'mermaid';
import { load as loadYaml } from 'js-yaml';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'katex/dist/katex.min.css';

declare global {
  interface Window {
    electronAPI: {
      saveFile: (content: string, filePath?: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      getCurrentFilePath: () => Promise<string | null>;
      onMenuNewFile: (callback: () => void) => void;
      onFileOpened: (callback: (data: { filePath: string; content: string }) => void) => void;
      onMenuSaveFile: (callback: () => void) => void;
      onMenuSaveAsFile: (callback: () => void) => void;
      onMenuExportHtml: (callback: () => void) => void;
      openExternal: (url: string) => Promise<void>;
      removeAllListeners: (channel: string) => void;
    };
  }
}

type FrontMatterValue = string | number | boolean | null | FrontMatterValue[] | { [key: string]: unknown };

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const slugifyHeading = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const stringifyFrontMatterValue = (value: FrontMatterValue): string => {
  if (Array.isArray(value)) {
    return value.map(stringifyFrontMatterValue).join(', ');
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${key}: ${stringifyFrontMatterValue(nestedValue as FrontMatterValue)}`)
      .join(', ');
  }

  return value == null ? '' : String(value);
};

const extractFrontMatter = (source: string) => {
  const match = source.match(/^---\n([\s\S]*?)\n---\n*/);

  if (!match) {
    return {
      bodyContent: source,
      frontMatterHtml: '',
    };
  }

  const rawFrontMatter = match[1];
  const bodyContent = source.slice(match[0].length);

  try {
    const parsed = loadYaml(rawFrontMatter);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const rows = Object.entries(parsed as Record<string, FrontMatterValue>)
        .map(
          ([key, value]) =>
            `<div class="front-matter-row"><span class="front-matter-key">${escapeHtml(
              key
            )}</span><span class="front-matter-value">${escapeHtml(stringifyFrontMatterValue(value))}</span></div>`
        )
        .join('');

      return {
        bodyContent,
        frontMatterHtml: `<section class="front-matter"><h3>Front Matter</h3>${rows}</section>`,
      };
    }
  } catch {
    // Keep raw front matter visible if YAML parsing fails.
  }

  return {
    bodyContent,
    frontMatterHtml: `<section class="front-matter"><h3>Front Matter</h3><pre>${escapeHtml(rawFrontMatter)}</pre></section>`,
  };
};

const generateTOCHtml = (content: string): string => {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: { level: number; text: string; id: string }[] = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = slugifyHeading(text);
    headings.push({ level, text, id });
  }

  if (headings.length === 0) return '';

  let toc = '<div class="toc"><h3>Table of Contents</h3><ul>';
  headings.forEach((heading) => {
    const indent = '  '.repeat(heading.level - 1);
    toc += `${indent}<li class="toc-level-${heading.level}"><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`;
  });
  toc += '</ul></div>';

  return toc;
};

const renderInlineToc = (bodyContent: string, tocHtml: string) =>
  bodyContent.replace(/^\[toc\]\s*$/gim, tocHtml || '<div class="toc toc-empty"><h3>Table of Contents</h3><p>No headings yet.</p></div>');

const toggleTaskItemInContent = (source: string, taskIndex: number, checked: boolean) => {
  let currentIndex = -1;

  return source.replace(/^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX])\](\s+)/gm, (match, prefix, _marker, spacing) => {
    currentIndex += 1;
    if (currentIndex !== taskIndex) return match;
    return `${prefix}[${checked ? 'x' : ' '}]${spacing}`;
  });
};

const buildImageMarkdownPath = (filePath: string, currentDocumentPath: string | null) => {
  const normalizedFilePath = filePath.replaceAll('\\', '/');

  if (!currentDocumentPath) {
    return `file://${encodeURI(normalizedFilePath)}`;
  }

  const normalizedDocumentPath = currentDocumentPath.replaceAll('\\', '/');
  const documentDirectory = normalizedDocumentPath.slice(0, normalizedDocumentPath.lastIndexOf('/'));

  if (normalizedFilePath.startsWith(`${documentDirectory}/`)) {
    return encodeURI(normalizedFilePath.slice(documentDirectory.length + 1));
  }

  return `file://${encodeURI(normalizedFilePath)}`;
};

// KaTeX plugin for markdown-it
const katexPlugin = (md: MarkdownIt) => {
  const renderKatex = (tex: string, displayMode: boolean) => {
    try {
      return katex.renderToString(tex, { displayMode, throwOnError: false });
    } catch (err) {
      return `<span class="katex-error">${tex}</span>`;
    }
  };

  // Block math: $$...$$
  md.block.ruler.after('blockquote', 'katex_block', (state, start, end, silent) => {
    const pos = state.bMarks[start] + state.tShift[start];
    const max = state.eMarks[start];

    if (pos + 2 > max || state.src.slice(pos, pos + 2) !== '$$') return false;

    let found = false;
    let nextLine = start;

    while (nextLine < end) {
      nextLine++;
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];

      if (lineStart < lineEnd && state.tShift[nextLine] < state.blkIndent) break;

      if (state.src.slice(lineStart, lineEnd).includes('$$')) {
        found = true;
        break;
      }
    }

    if (!found || silent) return found;

    const content = state.src.slice(pos + 2, state.bMarks[nextLine] + state.tShift[nextLine]).trim();
    state.line = nextLine + 1;

    const token = state.push('katex_block', 'div', 0);
    token.content = content;
    token.map = [start, state.line];
    token.markup = '$$';

    return true;
  });

  md.renderer.rules.katex_block = (tokens, idx) => {
    return `<div class="katex-block">${renderKatex(tokens[idx].content, true)}</div>`;
  };

  // Inline math: $...$
  md.inline.ruler.after('escape', 'katex_inline', (state, silent) => {
    const pos = state.pos;
    const max = state.posMax;

    if (state.src[pos] !== '$' || pos + 1 >= max) return false;

    let found = false;
    let end = pos + 1;

    while (end < max) {
      if (state.src[end] === '$' && (end === pos + 1 || state.src[end - 1] !== '\\')) {
        found = true;
        break;
      }
      end++;
    }

    if (!found || end === pos + 1) return false;

    if (!silent) {
      const token = state.push('katex_inline', 'span', 0);
      token.content = state.src.slice(pos + 1, end);
      token.markup = '$';
    }

    state.pos = end + 1;
    return true;
  });

  md.renderer.rules.katex_inline = (tokens, idx) => {
    return renderKatex(tokens[idx].content, false);
  };
};

const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: function (str: string, lang: string): string {
    if (lang === 'mermaid') {
      return `<div class="mermaid">${md.utils.escapeHtml(str)}</div>`;
    }

    if (lang && Prism.languages[lang]) {
      try {
        return `<pre class="language-${lang}"><code>${Prism.highlight(str, Prism.languages[lang], lang)}</code></pre>`;
      } catch (__) {}
    }
    return `<pre class="language-text"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
})
  .use(katexPlugin)
  .use(markdownItFootnote)
  .use(markdownItTaskLists, { enabled: true, label: true, labelAfter: true })
  .use(markdownItSub)
  .use(markdownItSup)
  .use(markdownItMark)
  .use(markdownItEmojiFull);

const defaultContent = `---
title: MD Editor Feature Showcase
author: Codex
category: Product Demo
tags:
  - markdown
  - typora-like
  - electron
version: 1.1
published: true
---

[toc]

# Welcome to MD Editor

This starter document is a complete feature showcase. You can use it to verify rendering, editing interactions, export, and preview behavior in one place.

## Quick Tour

- **Split editing**: write Markdown on the left and preview on the right.
- **Theme switching**: try Light, Dark, and Sepia from the toolbar.
- **Font controls**: increase or decrease editor text size from the toolbar.
- **Export**: use the toolbar or menu to export HTML / Word / PDF.
- **Tabs**: press \`Cmd+N\` to create a new document without losing this one.

## Text Formatting

This line contains **bold**, *italic*, ~~strikethrough~~, ==highlight==, H~2~O, and x^2^.

You can also include inline code like \`const ready = true\`, emoji shortcodes such as :rocket: :sparkles: :white_check_mark:, and inline math like $E = mc^2$.

## Lists

### Ordered

1. Create content
2. Preview formatting
3. Export and share

### Unordered

- Project notes
- Writing ideas
  - Nested bullet
  - Another nested bullet

### Task List

- [x] White screen issue fixed
- [x] First \`Cmd+N\` content loss fixed
- [x] Markdown extensions enabled
- [ ] Table editing toolbar
- [ ] Preferences panel

Try clicking the task checkboxes in preview mode to update the source document.

## Links, Footnotes, and Quotes

Inline link: [OpenAI](https://openai.com)

Reference link: [Project Repo][repo]

Jump to a section: [See the Mermaid example](#mermaid-diagram)

Here is a footnote reference for the demo[^demo-note].

> “Good writing is clear thinking made visible.”
>
> This blockquote is here to verify spacing, typography, and theme contrast.

## Code Blocks

\`\`\`typescript
type ExportFormat = 'html' | 'pdf' | 'word';

function exportDocument(format: ExportFormat) {
  return \`Exporting current document as \${format}\`;
}

console.log(exportDocument('html'));
\`\`\`

\`\`\`bash
npm run build
npm run electron:build:mac
\`\`\`

## Math

Block math example:

$$
f(x) = \\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

Another example:

$$
\\mathrm{PMF}(k) = \\binom{n}{k} p^k (1-p)^{n-k}
$$

## Tables

| Capability | Status | Notes |
| :-- | :--: | --: |
| Basic Markdown | Ready | 100% |
| KaTeX | Ready | 100% |
| Mermaid | Ready | 100% |
| Table editor UI | Pending | 0% |

## Mermaid Diagram

\`\`\`mermaid
flowchart TD
    A[Open Document] --> B[Edit Markdown]
    B --> C[Live Preview]
    C --> D[Export]
    C --> E[Create New Tab]
    E --> F[Continue Writing]
\`\`\`

## Images and HTML

Markdown image example:

![Gradient Placeholder](https://dummyimage.com/960x320/e8e8ed/1d1d1f&text=MD+Editor+Preview)

Raw HTML still works: <u>underlined text</u>, <span style="color:#007aff;">colored text</span>, and <kbd>Cmd</kbd> + <kbd>N</kbd>.

## YAML Front Matter

This document begins with YAML Front Matter so you can verify the front matter renderer at the top of the preview.

## Suggested Manual Checks

- Toggle between editor / split / preview modes.
- Change theme and font size.
- Click task list items in preview.
- Command-click a link in preview.
- Paste or drag an image into the editor.
- Export this document as HTML, Word, and PDF.

---

Start editing below this line and use this file as a living smoke test for the editor.

[^demo-note]: Footnotes are now rendered in preview and appear at the end of the document.

[repo]: https://github.com/1278715368-web/md
`;

type Theme = 'light' | 'dark' | 'sepia';
type EditorFile = { path: string; content: string; name: string };
type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';
type SlashCommand = {
  id: string;
  label: string;
  keywords: string[];
  description: string;
  template: string;
};

type SlashMenuState = {
  start: number;
  end: number;
  query: string;
};

type TableCellGrid = string[][];
type TableSelection = {
  start: number;
  end: number;
};

const defaultFlowchartSource = `flowchart TD
    Start([Start]) --> Draft[Write content]
    Draft --> Review{Need review?}
    Review -->|Yes| Update[Revise document]
    Review -->|No| Publish([Publish])
    Update --> Publish
`;

const slashCommands: SlashCommand[] = [
  {
    id: 'code',
    label: '代码块',
    keywords: ['code', '代码', '代码块', 'snippet'],
    description: '插入通用代码块',
    template: '```text\n// code\n```\n',
  },
  {
    id: 'json',
    label: 'JSON 代码块',
    keywords: ['json', '接口', '数据'],
    description: '插入带 json 语言标记的代码块',
    template: '```json\n{\n  "name": "demo"\n}\n```\n',
  },
  {
    id: 'javascript',
    label: 'JavaScript 代码块',
    keywords: ['js', 'javascript'],
    description: '插入 JavaScript 代码块',
    template: '```javascript\nconsole.log("hello");\n```\n',
  },
  {
    id: 'typescript',
    label: 'TypeScript 代码块',
    keywords: ['ts', 'typescript'],
    description: '插入 TypeScript 代码块',
    template: '```typescript\nconst message: string = "hello";\n```\n',
  },
  {
    id: 'table',
    label: '表格',
    keywords: ['table', '表格', 'columns'],
    description: '插入 3 列 Markdown 表格',
    template: '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n',
  },
  {
    id: 'flowchart',
    label: '流程图',
    keywords: ['flowchart', '流程图', 'mermaid', 'diagram'],
    description: '插入 Mermaid 流程图模板',
    template: `\`\`\`mermaid\n${defaultFlowchartSource}\`\`\`\n`,
  },
];

const getFileName = (filePath: string | null) => {
  if (!filePath) return 'Untitled';
  return filePath.split('/').pop() || 'Untitled';
};

const getSlashMenuState = (value: string, cursorPosition: number): SlashMenuState | null => {
  const lineStart = value.lastIndexOf('\n', cursorPosition - 1) + 1;
  const lineContent = value.slice(lineStart, cursorPosition);
  const slashIndex = lineContent.lastIndexOf('/');

  if (slashIndex < 0) return null;

  const beforeSlash = lineContent.slice(0, slashIndex);
  if (beforeSlash.trim().length > 0) return null;

  const query = lineContent.slice(slashIndex + 1);
  if (/\s/.test(query)) return null;

  return {
    start: lineStart + slashIndex,
    end: cursorPosition,
    query,
  };
};

const downloadTextFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const createTableGrid = (rows: number, columns: number): TableCellGrid =>
  Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: columns }, (_, columnIndex) =>
      rowIndex === 0 ? `表头 ${columnIndex + 1}` : `内容 ${rowIndex}-${columnIndex + 1}`
    )
  );

const escapeTableCell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', '<br />');

const tableToMarkdown = (grid: TableCellGrid) => {
  if (grid.length === 0 || grid[0].length === 0) return '';

  const header = `| ${grid[0].map(escapeTableCell).join(' | ')} |`;
  const separator = `| ${grid[0].map(() => '---').join(' | ')} |`;
  const body = grid
    .slice(1)
    .map((row) => `| ${row.map(escapeTableCell).join(' | ')} |`)
    .join('\n');

  return `${header}\n${separator}${body ? `\n${body}` : ''}\n`;
};

const parseMarkdownTable = (block: string): TableCellGrid | null => {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;
  if (!lines.every((line) => /^\|.*\|$/.test(line))) return null;
  if (!/^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(lines[1])) return null;

  const parseRow = (line: string) =>
    line
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim().replaceAll('<br />', '\n').replaceAll('\\|', '|'));

  const header = parseRow(lines[0]);
  const body = lines.slice(2).map(parseRow);
  const width = header.length;

  if (width === 0) return null;

  return [header, ...body.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''))];
};

const findTableAroundCursor = (value: string, cursorPosition: number): TableSelection | null => {
  const lines = value.split('\n');
  let charIndex = 0;
  let cursorLine = Math.max(lines.length - 1, 0);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const nextIndex = charIndex + lines[lineIndex].length;
    if (cursorPosition <= nextIndex) {
      cursorLine = lineIndex;
      break;
    }
    charIndex = nextIndex + 1;
  }

  const isTableLine = (line: string) => /^\|.*\|$/.test(line.trim());
  if (!isTableLine(lines[cursorLine] ?? '')) return null;

  let startLine = cursorLine;
  let endLine = cursorLine;

  while (startLine > 0 && isTableLine(lines[startLine - 1])) startLine -= 1;
  while (endLine < lines.length - 1 && isTableLine(lines[endLine + 1])) endLine += 1;

  const block = lines.slice(startLine, endLine + 1).join('\n');
  if (!parseMarkdownTable(block)) return null;

  const start = lines.slice(0, startLine).reduce((sum, line) => sum + line.length + 1, 0);
  const end = lines.slice(0, endLine + 1).reduce((sum, line) => sum + line.length + 1, 0);

  return { start, end };
};

const extractMarkdownTables = (value: string): Array<{ selection: TableSelection; grid: TableCellGrid }> => {
  const lines = value.split('\n');
  const tables: Array<{ selection: TableSelection; grid: TableCellGrid }> = [];
  const isTableLine = (line: string) => /^\|.*\|$/.test(line.trim());

  let lineIndex = 0;
  let charOffset = 0;

  while (lineIndex < lines.length) {
    if (!isTableLine(lines[lineIndex])) {
      charOffset += lines[lineIndex].length + 1;
      lineIndex += 1;
      continue;
    }

    const startLine = lineIndex;
    let endLine = lineIndex;

    while (endLine + 1 < lines.length && isTableLine(lines[endLine + 1])) {
      endLine += 1;
    }

    const block = lines.slice(startLine, endLine + 1).join('\n');
    const grid = parseMarkdownTable(block);
    const blockLength = lines.slice(startLine, endLine + 1).reduce((sum, line) => sum + line.length + 1, 0);

    if (grid) {
      tables.push({
        selection: {
          start: charOffset,
          end: charOffset + blockLength,
        },
        grid,
      });
    }

    charOffset += blockLength;
    lineIndex = endLine + 1;
  }

  return tables;
};

const flowchartTemplates = [
  {
    id: 'approval',
    label: '审批流',
    source: `flowchart TD
    Submit([提交申请]) --> Manager{经理审批}
    Manager -->|通过| Finance[财务复核]
    Manager -->|驳回| Rework[修改后重新提交]
    Finance --> Archive([归档])
    Rework --> Submit
`,
  },
  {
    id: 'service',
    label: '服务调用',
    source: `flowchart LR
    Client[Web Client] --> Gateway[API Gateway]
    Gateway --> Auth[Auth Service]
    Gateway --> Order[Order Service]
    Order --> DB[(Database)]
    Order --> MQ[[Message Queue]]
`,
  },
  {
    id: 'publish',
    label: '内容发布',
    source: `flowchart TD
    Draft[草稿] --> Review{审核通过?}
    Review -->|是| Publish[发布]
    Review -->|否| Update[继续编辑]
    Publish --> Notify[通知订阅者]
    Update --> Draft
`,
  },
];

const SESSION_STORAGE_KEY = 'md-editor-session-v1';

type StoredSession = {
  content: string;
  currentFilePath: string | null;
  openFiles: EditorFile[];
  activeFileIndex: number;
  viewMode: 'split' | 'editor' | 'preview';
  theme: Theme;
  fontSize: number;
  showTOC: boolean;
};

const loadStoredSession = (): StoredSession | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
};

const persistStoredSession = (session: StoredSession) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to persist editor session', error);
  }
};

function App() {
  const initialSession = loadStoredSession();
  const [content, setContent] = useState(initialSession?.content ?? defaultContent);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(initialSession?.currentFilePath ?? null);
  const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview'>(initialSession?.viewMode ?? 'split');
  const [openFiles, setOpenFiles] = useState<EditorFile[]>(initialSession?.openFiles ?? []);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(initialSession?.activeFileIndex ?? -1);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [theme, setTheme] = useState<Theme>(initialSession?.theme ?? 'light');
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([initialSession?.content ?? defaultContent]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showTOC, setShowTOC] = useState(initialSession?.showTOC ?? true);
  const [fontSize, setFontSize] = useState(initialSession?.fontSize ?? 14);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const [lastAutosaveLabel, setLastAutosaveLabel] = useState('');
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [showFlowchartStudio, setShowFlowchartStudio] = useState(false);
  const [flowchartSource, setFlowchartSource] = useState(defaultFlowchartSource);
  const [flowchartSvg, setFlowchartSvg] = useState('');
  const [flowchartError, setFlowchartError] = useState('');
  const [showTableStudio, setShowTableStudio] = useState(false);
  const [tableGrid, setTableGrid] = useState<TableCellGrid>(() => createTableGrid(3, 3));
  const [tableSelection, setTableSelection] = useState<TableSelection | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const mermaidSequenceRef = useRef(0);
  const lastDiskSavedContentRef = useRef<Record<string, string>>({});

  const { bodyContent, frontMatterHtml } = extractFrontMatter(content);

  // Add headings with IDs for TOC
  const contentWithIds = bodyContent.replace(/^(#{1,6})\s+(.+)$/gm, (_match, hashes, text) => {
    const id = slugifyHeading(text);
    return `${hashes} <span id="${id}">${text}</span>`;
  });

  const toc = generateTOCHtml(bodyContent);
  const renderedHtml = `${frontMatterHtml}${md.render(renderInlineToc(contentWithIds, toc))}`;

  const buildFilesWithCurrentSnapshot = useCallback((): EditorFile[] => {
    const files = [...openFiles];

    if (activeFileIndex >= 0 && activeFileIndex < files.length) {
      files[activeFileIndex] = {
        ...files[activeFileIndex],
        path: currentFilePath ?? files[activeFileIndex].path,
        name: getFileName(currentFilePath ?? files[activeFileIndex].path),
        content,
      };
      return files;
    }

    return [{ path: currentFilePath ?? '', content, name: getFileName(currentFilePath) }, ...files];
  }, [openFiles, activeFileIndex, currentFilePath, content]);

  const updateActiveFileMetadata = useCallback((filePath: string) => {
    const fileName = getFileName(filePath);

    setCurrentFilePath(filePath);
    setOpenFiles((currentFiles) => {
      if (activeFileIndex < 0 || activeFileIndex >= currentFiles.length) return currentFiles;

      const nextFiles = [...currentFiles];
      nextFiles[activeFileIndex] = {
        ...nextFiles[activeFileIndex],
        path: filePath,
        name: fileName,
        content,
      };
      return nextFiles;
    });
  }, [activeFileIndex, content]);


  // Save to history
  const saveToHistory = useCallback((newContent: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newContent);
    if (newHistory.length > 100) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  useEffect(() => {
    const filesSnapshot = buildFilesWithCurrentSnapshot();
    const normalizedActiveIndex =
      activeFileIndex >= 0 ? activeFileIndex : filesSnapshot.length > 0 ? 0 : -1;

    persistStoredSession({
      content,
      currentFilePath,
      openFiles: filesSnapshot,
      activeFileIndex: normalizedActiveIndex,
      viewMode,
      theme,
      fontSize,
      showTOC,
    });
  }, [activeFileIndex, buildFilesWithCurrentSnapshot, content, currentFilePath, fontSize, showTOC, theme, viewMode]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const filesSnapshot = buildFilesWithCurrentSnapshot();
      persistStoredSession({
        content,
        currentFilePath,
        openFiles: filesSnapshot,
        activeFileIndex: activeFileIndex >= 0 ? activeFileIndex : filesSnapshot.length > 0 ? 0 : -1,
        viewMode,
        theme,
        fontSize,
        showTOC,
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeFileIndex, buildFilesWithCurrentSnapshot, content, currentFilePath, fontSize, showTOC, theme, viewMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;

    const filesSnapshot = buildFilesWithCurrentSnapshot();
    const filesNeedingDiskSave = filesSnapshot.filter(
      (file) => file.path && lastDiskSavedContentRef.current[file.path] !== file.content
    );

    if (filesNeedingDiskSave.length === 0) {
      if (content.trim().length > 0 || currentFilePath) {
        setAutosaveState('saved');
      }
      return;
    }

    setAutosaveState('saving');
    const timer = window.setTimeout(async () => {
      try {
        for (const file of filesNeedingDiskSave) {
          const result = await window.electronAPI.saveFile(file.content, file.path);
          if (!result.success || !result.filePath) {
            throw new Error(result.error || `Failed to auto-save ${file.path}`);
          }
          lastDiskSavedContentRef.current[result.filePath] = file.content;
        }

        setAutosaveState('saved');
        setLastAutosaveLabel(`已自动保存 ${new Date().toLocaleTimeString()}`);
      } catch (error) {
        console.error('Auto-save failed', error);
        setAutosaveState('error');
        setLastAutosaveLabel('自动保存失败');
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [buildFilesWithCurrentSnapshot, content, currentFilePath]);

  useEffect(() => {
    if (currentFilePath || content.trim().length === 0) return;

    setAutosaveState('saving');
    const timer = window.setTimeout(() => {
      setAutosaveState('saved');
      setLastAutosaveLabel('未命名草稿已保存在本地');
    }, 600);

    return () => window.clearTimeout(timer);
  }, [content, currentFilePath]);

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    saveToHistory(newContent);
    setSlashMenu(getSlashMenuState(newContent, e.target.selectionStart));
    setSelectedSlashIndex(0);
    setTableSelection(findTableAroundCursor(newContent, e.target.selectionStart));
  }, [saveToHistory]);

  const insertAtSelection = useCallback(
    (insertion: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + insertion + content.substring(end);
      setContent(newContent);
      saveToHistory(newContent);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + insertion.length;
      });
    },
    [content, saveToHistory]
  );

  const replaceRange = useCallback(
    (start: number, end: number, insertion: string) => {
      const newContent = content.slice(0, start) + insertion + content.slice(end);
      setContent(newContent);
      saveToHistory(newContent);

      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        const nextCursor = start + insertion.length;
        textarea.selectionStart = textarea.selectionEnd = nextCursor;
      });
    },
    [content, saveToHistory]
  );

  const filteredSlashCommands = slashMenu
    ? slashCommands.filter((command) => {
        const query = slashMenu.query.trim().toLowerCase();
        if (!query) return true;
        return (
          command.label.toLowerCase().includes(query) ||
          command.description.toLowerCase().includes(query) ||
          command.keywords.some((keyword) => keyword.toLowerCase().includes(query))
        );
      })
    : [];

  const applySlashCommand = useCallback(
    (command: SlashCommand) => {
      if (!slashMenu) return;
      replaceRange(slashMenu.start, slashMenu.end, command.template);
      setSlashMenu(null);
      setSelectedSlashIndex(0);
    },
    [replaceRange, slashMenu]
  );

  const insertFlowchartSnippet = useCallback((snippet: string) => {
    setFlowchartSource((current) => {
      const needsNewline = current.endsWith('\n') ? '' : '\n';
      return `${current}${needsNewline}${snippet}\n`;
    });
  }, []);

  const exportSvg = useCallback((svgMarkup: string, filename: string) => {
    downloadTextFile(filename, svgMarkup, 'image/svg+xml;charset=utf-8');
  }, []);

  const openTableStudioWithSelection = useCallback((selection: TableSelection) => {
    const parsed = parseMarkdownTable(content.slice(selection.start, selection.end));
    if (!parsed) return;

    setTableGrid(parsed);
    setTableSelection(selection);
    setShowTableStudio(true);
  }, [content]);

  const syncTableSelection = useCallback((cursorPosition: number) => {
    setTableSelection(findTableAroundCursor(content, cursorPosition));
  }, [content]);

  const handleTableCellChange = useCallback((rowIndex: number, columnIndex: number, value: string) => {
    setTableGrid((current) =>
      current.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex
          ? row.map((cell, currentColumnIndex) => (currentColumnIndex === columnIndex ? value : cell))
          : row
      )
    );
  }, []);

  const addTableRow = useCallback(() => {
    setTableGrid((current) => {
      const columns = current[0]?.length ?? 3;
      return [...current, Array.from({ length: columns }, (_, index) => `内容 ${current.length}-${index + 1}`)];
    });
  }, []);

  const removeTableRow = useCallback(() => {
    setTableGrid((current) => (current.length > 2 ? current.slice(0, -1) : current));
  }, []);

  const addTableColumn = useCallback(() => {
    setTableGrid((current) =>
      current.map((row, rowIndex) => [
        ...row,
        rowIndex === 0 ? `表头 ${row.length + 1}` : `内容 ${rowIndex}-${row.length + 1}`,
      ])
    );
  }, []);

  const removeTableColumn = useCallback(() => {
    setTableGrid((current) => (current[0]?.length > 1 ? current.map((row) => row.slice(0, -1)) : current));
  }, []);

  const applyTableToDocument = useCallback(() => {
    const markdown = tableToMarkdown(tableGrid);
    if (tableSelection) {
      replaceRange(tableSelection.start, tableSelection.end, markdown);
      setTableSelection(null);
      return;
    }

    insertAtSelection(markdown);
  }, [insertAtSelection, replaceRange, tableGrid, tableSelection]);

  const loadTableFromDocument = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const selection = findTableAroundCursor(content, textarea.selectionStart);
    if (!selection) return;

    openTableStudioWithSelection(selection);
  }, [content, openTableStudioWithSelection]);

  const exportFlowchartFromSource = useCallback(
    async (source: string, filename: string) => {
      try {
        const diagramId = `export-diagram-${Date.now()}`;
        const { svg } = await mermaid.render(diagramId, source);
        exportSvg(svg, filename);
      } catch (error) {
        console.error('Flowchart export failed', error);
      }
    },
    [exportSvg]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenu && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSlashIndex((current) => (current + 1) % filteredSlashCommands.length);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSlashIndex((current) => (current - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        applySlashCommand(filteredSlashCommands[selectedSlashIndex] ?? filteredSlashCommands[0]);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenu(null);
        setSelectedSlashIndex(0);
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newContent);
      saveToHistory(newContent);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
    
    // Cmd + F for find
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      setShowFindReplace(true);
    }
    
    // Cmd + Z for undo
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setContent(history[newIndex]);
      }
    }
    
    // Cmd + Shift + Z for redo
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setContent(history[newIndex]);
      }
    }
  }, [applySlashCommand, content, filteredSlashCommands, history, historyIndex, saveToHistory, selectedSlashIndex, slashMenu]);

  // Find and replace
  const handleFind = useCallback(() => {
    if (!findText) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = content.indexOf(findText, textarea.selectionEnd);
    if (start !== -1) {
      textarea.focus();
      textarea.setSelectionRange(start, start + findText.length);
    } else {
      // Wrap around
      const wrapStart = content.indexOf(findText);
      if (wrapStart !== -1) {
        textarea.focus();
        textarea.setSelectionRange(wrapStart, wrapStart + findText.length);
      }
    }
  }, [findText, content]);

  const handleReplace = useCallback(() => {
    if (!findText) return;
    const newContent = content.replace(findText, replaceText);
    setContent(newContent);
    saveToHistory(newContent);
  }, [findText, replaceText, content, saveToHistory]);

  const handleReplaceAll = useCallback(() => {
    if (!findText) return;
    const newContent = content.split(findText).join(replaceText);
    setContent(newContent);
    saveToHistory(newContent);
  }, [findText, replaceText, content, saveToHistory]);

  // Image paste handler
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;

        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64 = event.target?.result as string;
          const imageMarkdown = `![Pasted Image](${base64})`;
          
          if (textareaRef.current) {
            insertAtSelection(imageMarkdown);
          }
        };
        reader.readAsDataURL(blob);
      }
    }
  }, [insertAtSelection]);

  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const nextSlashState = getSlashMenuState(textarea.value, textarea.selectionStart);
    setSlashMenu(nextSlashState);
    setSelectedSlashIndex(0);
    syncTableSelection(textarea.selectionStart);
  }, [syncTableSelection]);

  const handleEditorSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const nextSlashState = getSlashMenuState(textarea.value, textarea.selectionStart);
    setSlashMenu(nextSlashState);
    setSelectedSlashIndex(0);
    syncTableSelection(textarea.selectionStart);
  }, [syncTableSelection]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      const imageFiles = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
      if (imageFiles.length === 0) return;

      e.preventDefault();
      const markdown = imageFiles
        .map((file) => {
          const fileWithPath = file as File & { path?: string };
          const imagePath = fileWithPath.path
            ? buildImageMarkdownPath(fileWithPath.path, currentFilePath)
            : URL.createObjectURL(file);
          return `![${file.name}](${imagePath})`;
        })
        .join('\n');

      insertAtSelection(markdown);
    },
    [currentFilePath, insertAtSelection]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    if (Array.from(e.dataTransfer.items).some((item) => item.type.startsWith('image/'))) {
      e.preventDefault();
    }
  }, []);

  // Export to Word
  const exportToWord = useCallback(() => {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Exported Document</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
    code { font-family: 'SF Mono', Monaco, monospace; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
  </style>
</head>
<body>
${renderedHtml}
</body>
</html>`;
    
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.doc';
    a.click();
    URL.revokeObjectURL(url);
  }, [renderedHtml]);

  const exportHtml = useCallback(() => {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Exported Document</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
    code { font-family: 'SF Mono', Monaco, monospace; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
  </style>
</head>
<body>
${renderedHtml}
</body>
</html>`;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.html';
    a.click();
    URL.revokeObjectURL(url);
  }, [renderedHtml]);

  useEffect(() => {
    if (!showFlowchartStudio) return;

    let cancelled = false;

    const renderStudioFlowchart = async () => {
      try {
        const diagramId = `studio-diagram-${Date.now()}`;
        const { svg } = await mermaid.render(diagramId, flowchartSource);
        if (cancelled) return;
        setFlowchartSvg(svg);
        setFlowchartError('');
      } catch (error) {
        if (cancelled) return;
        setFlowchartSvg('');
        setFlowchartError(error instanceof Error ? error.message : '流程图渲染失败');
      }
    };

    renderStudioFlowchart();

    return () => {
      cancelled = true;
    };
  }, [flowchartSource, showFlowchartStudio]);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'neutral',
    });
  }, []);

  useEffect(() => {
    if (viewMode === 'editor') return;

    const previewElement = previewRef.current;
    if (!previewElement) return;

    const mermaidNodes = Array.from(previewElement.querySelectorAll('.mermaid'));
    if (mermaidNodes.length === 0) return;

    let cancelled = false;

    const renderMermaid = async () => {
      try {
        mermaidNodes.forEach((node) => {
          const element = node as HTMLElement;
          if (!element.id) {
            mermaidSequenceRef.current += 1;
            element.id = `mermaid-diagram-${mermaidSequenceRef.current}`;
          }
        });

        await mermaid.run({ nodes: mermaidNodes as HTMLElement[] });
      } catch (error) {
        if (!cancelled) {
          mermaidNodes.forEach((node) => {
            node.classList.add('mermaid-error');
          });
          console.error('Mermaid render failed', error);
        }
      }
    };

    renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [renderedHtml, viewMode]);

  const handlePreviewChange = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      const target = e.target as HTMLInputElement | null;
      if (!target || target.type !== 'checkbox' || !target.classList.contains('task-list-item-checkbox')) {
        return;
      }

      const checkboxes = Array.from(
        previewRef.current?.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox') ?? []
      );
      const taskIndex = checkboxes.indexOf(target);
      if (taskIndex < 0) return;

      const newContent = toggleTaskItemInContent(content, taskIndex, target.checked);
      setContent(newContent);
      saveToHistory(newContent);
    },
    [content, saveToHistory]
  );

  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const exportButton = (e.target as HTMLElement).closest('[data-export-mermaid]') as HTMLButtonElement | null;
    if (exportButton) {
      e.preventDefault();
      const source = exportButton.getAttribute('data-source');
      if (source) {
        void exportFlowchartFromSource(source, 'flowchart.svg');
      }
      return;
    }

    const anchor = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    if (href.startsWith('#')) {
      e.preventDefault();
      const target = previewRef.current?.querySelector(href);
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    if ((e.metaKey || e.ctrlKey) && typeof window !== 'undefined' && window.electronAPI) {
      e.preventDefault();
      void window.electronAPI.openExternal(anchor.href);
    }
  }, [exportFlowchartFromSource]);

  const handlePreviewDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const flowchartBlock = (e.target as HTMLElement).closest('.mermaid-block') as HTMLElement | null;
    if (flowchartBlock) {
      const exportButton = flowchartBlock.querySelector<HTMLButtonElement>('[data-source]');
      const source = exportButton?.getAttribute('data-source');
      if (source) {
        setFlowchartSource(source);
        setShowFlowchartStudio(true);
      }
      return;
    }

    const tableElement = (e.target as HTMLElement).closest('table') as HTMLTableElement | null;
    if (!tableElement || !previewRef.current?.contains(tableElement)) return;

    const tables = extractMarkdownTables(content);
    const tableIndex = Array.from(previewRef.current.querySelectorAll('table')).indexOf(tableElement);
    const matchedTable = tables[tableIndex];
    if (!matchedTable) return;

    setTableGrid(matchedTable.grid);
    setTableSelection(matchedTable.selection);
    setShowTableStudio(true);
  }, [content]);

  useEffect(() => {
    if (!previewRef.current) return;

    const mermaidBlocks = Array.from(previewRef.current.querySelectorAll('.mermaid')) as HTMLElement[];
    mermaidBlocks.forEach((block, index) => {
      const source = block.textContent ?? '';
      const wrapper = block.parentElement;
      if (!wrapper || wrapper.classList.contains('mermaid-block')) return;

      const container = document.createElement('div');
      container.className = 'mermaid-block';

      const toolbar = document.createElement('div');
      toolbar.className = 'mermaid-block-toolbar';

      const badge = document.createElement('span');
      badge.className = 'mermaid-block-label';
      badge.textContent = `Flowchart ${index + 1}`;

      const button = document.createElement('button');
      button.className = 'mermaid-export-btn';
      button.type = 'button';
      button.textContent = '导出 SVG';
      button.setAttribute('data-export-mermaid', 'true');
      button.setAttribute('data-source', source);

      toolbar.appendChild(badge);
      toolbar.appendChild(button);

      wrapper.insertBefore(container, block);
      container.appendChild(toolbar);
      container.appendChild(block);
    });
  }, [renderedHtml, viewMode]);

  // File operations
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onMenuNewFile(() => {
        const newFile = { path: '', content: '', name: 'Untitled' };
        const newFiles = [...buildFilesWithCurrentSnapshot(), newFile];
        setOpenFiles(newFiles);
        setActiveFileIndex(newFiles.length - 1);
        setContent('');
        setCurrentFilePath(null);
      });

      window.electronAPI.onFileOpened(({ content: fileContent, filePath }) => {
        const fileName = getFileName(filePath);
        const files = buildFilesWithCurrentSnapshot();
        const existingIndex = files.findIndex(f => f.path === filePath);
        lastDiskSavedContentRef.current[filePath] = fileContent;
        
        if (existingIndex >= 0) {
          setActiveFileIndex(existingIndex);
          setOpenFiles(files);
          setContent(files[existingIndex].content);
        } else {
          const newFiles = [...files, { path: filePath, content: fileContent, name: fileName }];
          setOpenFiles(newFiles);
          setActiveFileIndex(newFiles.length - 1);
          setContent(fileContent);
        }
        setCurrentFilePath(filePath);
        
        // Add to recent files
        const newRecent = [filePath, ...recentFiles.filter(f => f !== filePath)].slice(0, 10);
        setRecentFiles(newRecent);
      });

      window.electronAPI.onMenuSaveFile(async () => {
        if (typeof window !== 'undefined' && window.electronAPI) {
          const result = await window.electronAPI.saveFile(content, currentFilePath || undefined);
          if (result.success && result.filePath) {
            lastDiskSavedContentRef.current[result.filePath] = content;
            updateActiveFileMetadata(result.filePath);
            setAutosaveState('saved');
            setLastAutosaveLabel(`已保存 ${new Date().toLocaleTimeString()}`);
          }
        }
      });

      window.electronAPI.onMenuSaveAsFile(async () => {
        if (typeof window !== 'undefined' && window.electronAPI) {
          const result = await window.electronAPI.saveFile(content);
          if (result.success && result.filePath) {
            lastDiskSavedContentRef.current[result.filePath] = content;
            updateActiveFileMetadata(result.filePath);
            setAutosaveState('saved');
            setLastAutosaveLabel(`已保存 ${new Date().toLocaleTimeString()}`);
          }
        }
      });

      window.electronAPI.onMenuExportHtml(() => {
        exportHtml();
      });

      return () => {
        window.electronAPI.removeAllListeners('menu-new-file');
        window.electronAPI.removeAllListeners('file-opened');
        window.electronAPI.removeAllListeners('menu-save-file');
        window.electronAPI.removeAllListeners('menu-save-as-file');
        window.electronAPI.removeAllListeners('menu-export-html');
      };
    }
  }, [content, currentFilePath, recentFiles, exportHtml, buildFilesWithCurrentSnapshot, updateActiveFileMetadata]);

  const handleFileSwitch = useCallback((index: number) => {
    if (index >= 0 && index < openFiles.length && index !== activeFileIndex) {
      if (activeFileIndex >= 0 && activeFileIndex < openFiles.length) {
        const updatedFiles = [...openFiles];
        updatedFiles[activeFileIndex] = {
          ...updatedFiles[activeFileIndex],
          content: content
        };
        setOpenFiles(updatedFiles);
      }
      
      setActiveFileIndex(index);
      setContent(openFiles[index].content);
      setCurrentFilePath(openFiles[index].path);
    }
  }, [openFiles, activeFileIndex, content]);

  const handleFileClose = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFiles = openFiles.filter((_, i) => i !== index);
    setOpenFiles(newFiles);
    
    if (newFiles.length === 0) {
      setActiveFileIndex(-1);
      setContent('');
      setCurrentFilePath(null);
    } else if (index === activeFileIndex) {
      const newIndex = index > 0 ? index - 1 : 0;
      setActiveFileIndex(newIndex);
      setContent(newFiles[newIndex].content);
      setCurrentFilePath(newFiles[newIndex].path);
    } else if (index < activeFileIndex) {
      setActiveFileIndex(activeFileIndex - 1);
    }
  }, [openFiles, activeFileIndex]);

  const themeClass = theme === 'dark' ? 'dark' : theme === 'sepia' ? 'sepia' : '';

  return (
    <div className={`app ${themeClass}`}>
      <div className="titlebar"></div>
      
      {/* File Tabs */}
      {openFiles.length > 0 && (
        <div className="file-tabs">
          {openFiles.map((file, index) => (
            <div
              key={`${file.path}-${index}`}
              className={`file-tab ${index === activeFileIndex ? 'active' : ''}`}
              onClick={() => handleFileSwitch(index)}
            >
              <span className="file-name">{file.name}</span>
              <button
                className="close-tab"
                onClick={(e) => handleFileClose(index, e)}
                title="Close file"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left" data-testid="toolbar-left">
          <div className="view-mode-buttons" data-testid="view-mode-buttons">
            <button
              data-testid="view-editor"
              className={`view-btn ${viewMode === 'editor' ? 'active' : ''}`}
              onClick={() => setViewMode('editor')}
              title="Editor only"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="4" y1="5" x2="12" y2="5" stroke="currentColor" strokeWidth="1"/>
                <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1"/>
                <line x1="4" y1="11" x2="10" y2="11" stroke="currentColor" strokeWidth="1"/>
              </svg>
            </button>
            <button
              data-testid="view-split"
              className={`view-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => setViewMode('split')}
              title="Split view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
            <button
              data-testid="view-preview"
              className={`view-btn ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => setViewMode('preview')}
              title="Preview only"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M4 6 L7 9 L4 12" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="8" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
          </div>
          
          <button
            data-testid="toggle-find-replace"
            className="toolbar-btn"
            onClick={() => setShowFindReplace(!showFindReplace)}
            title="Find & Replace (Cmd+F)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="7" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>

          <button
            data-testid="toggle-toc"
            className="toolbar-btn"
            onClick={() => setShowTOC(!showTOC)}
            title="Table of Contents"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <line x1="3" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="3" y1="8" x2="10" y2="8" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="3" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>

          <button
            data-testid="toggle-table-studio"
            className="toolbar-btn"
            onClick={() => {
              setShowTableStudio((current) => !current);
              if (!showTableStudio) {
                loadTableFromDocument();
              }
            }}
            title="Table Studio"
          >
            表格
          </button>

          <select
            data-testid="theme-select"
            className="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            title="Theme"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="sepia">Sepia</option>
          </select>

          <div className="font-size-control">
            <button data-testid="font-size-decrease" onClick={() => setFontSize(Math.max(10, fontSize - 1))}>-</button>
            <span data-testid="font-size-value">{fontSize}px</span>
            <button data-testid="font-size-increase" onClick={() => setFontSize(Math.min(24, fontSize + 1))}>+</button>
          </div>
        </div>

        <div className="toolbar-right" data-testid="toolbar-right">
          <button
            data-testid="export-html"
            className="toolbar-btn"
            onClick={exportHtml}
            title="Export HTML"
          >
            HTML
          </button>
          <button
            data-testid="export-word"
            className="toolbar-btn"
            onClick={exportToWord}
            title="Export Word"
          >
            Word
          </button>
        </div>
      </div>

      {/* Find Replace Panel */}
      {showFindReplace && (
        <div className="find-replace-panel" data-testid="find-replace-panel">
          <div className="find-row">
            <input
              data-testid="find-input"
              type="text"
              placeholder="Find..."
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFind()}
            />
            <button data-testid="find-next" onClick={handleFind}>Find</button>
            <button data-testid="close-find-replace" onClick={() => setShowFindReplace(false)}>×</button>
          </div>
          <div className="replace-row">
            <input
              data-testid="replace-input"
              type="text"
              placeholder="Replace..."
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
            />
            <button data-testid="replace-once" onClick={handleReplace}>Replace</button>
            <button data-testid="replace-all" onClick={handleReplaceAll}>Replace All</button>
          </div>
        </div>
      )}

      <div className="editor-container">
        <div className={`editor-layout ${viewMode}`}>
          {(viewMode === 'editor' || viewMode === 'split') && (
            <div className="editor-pane">
              <textarea
                ref={textareaRef}
                data-testid="markdown-editor"
                className="markdown-editor"
                value={content}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                onClick={handleEditorClick}
                onPaste={handlePaste}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onSelect={handleEditorSelect}
                placeholder="Start writing your markdown here..."
                spellCheck={false}
                style={{ fontSize: `${fontSize}px` }}
              />
              {slashMenu && (
                <div className="slash-menu" data-testid="slash-menu">
                  <div className="slash-menu-header">输入 `/` 快速插入</div>
                  {filteredSlashCommands.length > 0 ? (
                    filteredSlashCommands.map((command, index) => (
                      <button
                        key={command.id}
                        type="button"
                        data-testid={`slash-command-${command.id}`}
                        className={`slash-menu-item ${index === selectedSlashIndex ? 'active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applySlashCommand(command);
                        }}
                      >
                        <span className="slash-menu-label">{command.label}</span>
                        <span className="slash-menu-description">{command.description}</span>
                      </button>
                    ))
                  ) : (
                    <div className="slash-menu-empty">没有匹配的插入项</div>
                  )}
                </div>
              )}
            </div>
          )}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className="preview-pane">
              {showTOC && toc && (
                <div data-testid="toc-container" dangerouslySetInnerHTML={{ __html: toc }} />
              )}
              <div
                ref={previewRef}
                data-testid="markdown-preview"
                className="markdown-body"
                onClick={handlePreviewClick}
                onChange={handlePreviewChange}
                onDoubleClick={handlePreviewDoubleClick}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </div>
          )}
        </div>
      </div>

      {showTableStudio && (
        <div className="table-studio" data-testid="table-studio">
          <div className="table-studio-header">
            <div>
              <h3>表格工作台</h3>
              <p>可视化编辑表头和单元格，插入新表格或覆盖当前光标所在的 Markdown 表格。</p>
            </div>
            <div className="table-studio-actions">
              <button data-testid="table-import-current" type="button" className="toolbar-btn" onClick={loadTableFromDocument}>
                导入当前表格
              </button>
              <button data-testid="table-apply" type="button" className="toolbar-btn" onClick={applyTableToDocument}>
                {tableSelection ? '更新文档表格' : '插入表格'}
              </button>
              <button data-testid="table-close" type="button" className="toolbar-btn" onClick={() => setShowTableStudio(false)}>
                关闭
              </button>
            </div>
          </div>

          <div className="table-studio-toolbar">
            <button data-testid="table-add-row" type="button" className="toolbar-btn" onClick={addTableRow}>加一行</button>
            <button data-testid="table-remove-row" type="button" className="toolbar-btn" onClick={removeTableRow}>减一行</button>
            <button data-testid="table-add-column" type="button" className="toolbar-btn" onClick={addTableColumn}>加一列</button>
            <button data-testid="table-remove-column" type="button" className="toolbar-btn" onClick={removeTableColumn}>减一列</button>
            <button data-testid="table-reset" type="button" className="toolbar-btn" onClick={() => setTableGrid(createTableGrid(3, 3))}>重置</button>
          </div>

          <div className="table-studio-grid" data-testid="table-studio-grid">
            <table className="table-studio-table" data-testid="table-studio-table">
              <tbody>
                {tableGrid.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {row.map((cell, columnIndex) => (
                      <td key={`cell-${rowIndex}-${columnIndex}`}>
                        <input
                          data-testid={`table-cell-${rowIndex}-${columnIndex}`}
                          className={`table-studio-input ${rowIndex === 0 ? 'header-cell' : ''}`}
                          value={cell}
                          onChange={(e) => handleTableCellChange(rowIndex, columnIndex, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button
        data-testid="toggle-flowchart-studio"
        className="flowchart-studio-toggle"
        type="button"
        onClick={() => setShowFlowchartStudio((current) => !current)}
      >
        {showFlowchartStudio ? '关闭流程图工作台' : '打开流程图工作台'}
      </button>

      {showFlowchartStudio && (
        <div className="flowchart-studio" data-testid="flowchart-studio">
          <div className="flowchart-studio-header">
            <div>
              <h3>流程图工作台</h3>
              <p>本地编写 Mermaid 流程图，使用模板和组件库，插入文档或单独导出 SVG。</p>
            </div>
            <div className="flowchart-studio-actions">
              <button data-testid="flowchart-insert" type="button" className="toolbar-btn" onClick={() => insertAtSelection(`\`\`\`mermaid\n${flowchartSource}\`\`\`\n`)}>
                插入文档
              </button>
              <button data-testid="flowchart-export-svg" type="button" className="toolbar-btn" onClick={() => exportSvg(flowchartSvg, 'flowchart.svg')} disabled={!flowchartSvg}>
                导出 SVG
              </button>
            </div>
          </div>

          <div className="flowchart-template-grid" data-testid="flowchart-template-grid">
            {flowchartTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                data-testid={`flowchart-template-${template.id}`}
                className="flowchart-template-card"
                onClick={() => setFlowchartSource(template.source)}
              >
                <span className="flowchart-template-title">{template.label}</span>
                <span className="flowchart-template-caption">加载模板</span>
              </button>
            ))}
          </div>

          <div className="flowchart-component-bar" data-testid="flowchart-component-bar">
            <button data-testid="flowchart-snippet-process" type="button" className="toolbar-btn" onClick={() => insertFlowchartSnippet('    NodeA[Process Step]')}>
              处理块
            </button>
            <button data-testid="flowchart-snippet-decision" type="button" className="toolbar-btn" onClick={() => insertFlowchartSnippet('    Decision{Decision?}')}>
              判断块
            </button>
            <button data-testid="flowchart-snippet-start" type="button" className="toolbar-btn" onClick={() => insertFlowchartSnippet('    Start([Start])')}>
              开始/结束
            </button>
            <button data-testid="flowchart-snippet-subgraph" type="button" className="toolbar-btn" onClick={() => insertFlowchartSnippet('    subgraph SubProcess[Sub Process]\n        Step1[Task]\n    end')}>
              子流程
            </button>
            <button data-testid="flowchart-snippet-link" type="button" className="toolbar-btn" onClick={() => insertFlowchartSnippet('    NodeA --> NodeB')}>
              连线
            </button>
            <button data-testid="flowchart-snippet-database" type="button" className="toolbar-btn" onClick={() => insertFlowchartSnippet('    DB[(Database)]')}>
              数据库
            </button>
            <button data-testid="flowchart-snippet-queue" type="button" className="toolbar-btn" onClick={() => insertFlowchartSnippet('    Queue[[Queue]]')}>
              队列
            </button>
            <button data-testid="flowchart-snippet-io" type="button" className="toolbar-btn" onClick={() => insertFlowchartSnippet('    Note[/Manual Input/]')}>
              输入输出
            </button>
            <button data-testid="flowchart-snippet-service" type="button" className="toolbar-btn" onClick={() => insertFlowchartSnippet('    Service{{Service}}')}>
              服务
            </button>
            <button data-testid="flowchart-snippet-dashed" type="button" className="toolbar-btn" onClick={() => insertFlowchartSnippet('    NodeA -.-> NodeB')}>
              虚线
            </button>
            <button data-testid="flowchart-snippet-conditional" type="button" className="toolbar-btn" onClick={() => insertFlowchartSnippet('    NodeA -->|通过| NodeB')}>
              条件线
            </button>
          </div>

          <div className="flowchart-studio-layout">
            <textarea
              data-testid="flowchart-editor"
              className="flowchart-editor"
              value={flowchartSource}
              onChange={(e) => setFlowchartSource(e.target.value)}
              spellCheck={false}
            />
            <div className="flowchart-preview" data-testid="flowchart-preview">
              {flowchartError ? (
                <div className="flowchart-error">{flowchartError}</div>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: flowchartSvg }} />
              )}
            </div>
          </div>
        </div>
      )}
      
      <div className="status-bar">
        <span className="file-path">{currentFilePath || 'Untitled draft'}</span>
        <span className="autosave-label">
          {autosaveState === 'saving' && 'Saving...'}
          {autosaveState === 'saved' && (lastAutosaveLabel || (currentFilePath ? '已自动保存到文件' : '草稿已保存在本地'))}
          {autosaveState === 'error' && '自动保存失败，请立即手动保存'}
          {autosaveState === 'idle' && (currentFilePath ? '等待保存' : '未命名文档')}
        </span>
        <span className="view-mode-label">
          {viewMode === 'editor' && 'Editor Only'}
          {viewMode === 'split' && 'Split View'}
          {viewMode === 'preview' && 'Preview Only'}
        </span>
        <span className="history-label">
          History: {historyIndex + 1}/{history.length}
        </span>
      </div>
    </div>
  );
}

export default App;
