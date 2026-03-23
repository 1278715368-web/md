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

const getFileName = (filePath: string | null) => {
  if (!filePath) return 'Untitled';
  return filePath.split('/').pop() || 'Untitled';
};

function App() {
  const [content, setContent] = useState(defaultContent);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview'>('split');
  const [openFiles, setOpenFiles] = useState<EditorFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [theme, setTheme] = useState<Theme>('light');
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([defaultContent]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showTOC, setShowTOC] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const mermaidSequenceRef = useRef(0);

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


  // Save to history
  const saveToHistory = useCallback((newContent: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newContent);
    if (newHistory.length > 100) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    saveToHistory(newContent);
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
  }, [content, history, historyIndex, saveToHistory]);

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
  }, []);

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
            setCurrentFilePath(result.filePath);
          }
        }
      });

      window.electronAPI.onMenuSaveAsFile(async () => {
        if (typeof window !== 'undefined' && window.electronAPI) {
          const result = await window.electronAPI.saveFile(content);
          if (result.success && result.filePath) {
            setCurrentFilePath(result.filePath);
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
  }, [content, currentFilePath, recentFiles, exportHtml, buildFilesWithCurrentSnapshot]);

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
        <div className="toolbar-left">
          <div className="view-mode-buttons">
            <button
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

          <select
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
            <button onClick={() => setFontSize(Math.max(10, fontSize - 1))}>-</button>
            <span>{fontSize}px</span>
            <button onClick={() => setFontSize(Math.min(24, fontSize + 1))}>+</button>
          </div>
        </div>

        <div className="toolbar-right">
          <button
            className="toolbar-btn"
            onClick={exportHtml}
            title="Export HTML"
          >
            HTML
          </button>
          <button
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
        <div className="find-replace-panel">
          <div className="find-row">
            <input
              type="text"
              placeholder="Find..."
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFind()}
            />
            <button onClick={handleFind}>Find</button>
            <button onClick={() => setShowFindReplace(false)}>×</button>
          </div>
          <div className="replace-row">
            <input
              type="text"
              placeholder="Replace..."
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
            />
            <button onClick={handleReplace}>Replace</button>
            <button onClick={handleReplaceAll}>Replace All</button>
          </div>
        </div>
      )}

      <div className="editor-container">
        <div className={`editor-layout ${viewMode}`}>
          {(viewMode === 'editor' || viewMode === 'split') && (
            <div className="editor-pane">
              <textarea
                ref={textareaRef}
                className="markdown-editor"
                value={content}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                placeholder="Start writing your markdown here..."
                spellCheck={false}
                style={{ fontSize: `${fontSize}px` }}
              />
            </div>
          )}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className="preview-pane">
              {showTOC && toc && (
                <div dangerouslySetInnerHTML={{ __html: toc }} />
              )}
              <div
                ref={previewRef}
                className="markdown-body"
                onClick={handlePreviewClick}
                onChange={handlePreviewChange}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </div>
          )}
        </div>
      </div>
      
      {currentFilePath && (
        <div className="status-bar">
          <span className="file-path">{currentFilePath}</span>
          <span className="view-mode-label">
            {viewMode === 'editor' && 'Editor Only'}
            {viewMode === 'split' && 'Split View'}
            {viewMode === 'preview' && 'Preview Only'}
          </span>
          <span className="history-label">
            History: {historyIndex + 1}/{history.length}
          </span>
        </div>
      )}
    </div>
  );
}

export default App;
