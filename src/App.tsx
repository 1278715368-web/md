import React, { useState, useEffect, useCallback, useRef } from 'react';
import MarkdownIt from 'markdown-it';
import Prism from 'prismjs';
import katex from 'katex';
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
      removeAllListeners: (channel: string) => void;
    };
  }
}

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

    if (!found || silent || end === pos + 1) return found;

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
    if (lang && Prism.languages[lang]) {
      try {
        return `<pre class="language-${lang}"><code>${Prism.highlight(str, Prism.languages[lang], lang)}</code></pre>`;
      } catch (__) {}
    }
    return `<pre class="language-text"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
}).use(katexPlugin);

const defaultContent = `# Welcome to MD Editor

A beautiful Markdown editor inspired by Typora.

## Features

- **WYSIWYG Editing**: Write markdown with real-time preview
- **Syntax Highlighting**: Code blocks with syntax highlighting
- **macOS Native**: Designed following Apple's Human Interface Guidelines
- **Dark Mode**: Supports system dark mode
- **Export**: Export to HTML and PDF

## Markdown Examples

### Text Formatting

This is **bold text**, this is *italic text*, and this is ~~strikethrough~~.

### Code Blocks

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\`

### Math Formulas

Inline math: $E = mc^2$

Block math:
$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

### Lists

1. First item
2. Second item
3. Third item

- Unordered item
- Another item
  - Nested item

### Task Lists

- [x] Create the editor
- [ ] Add more features
- [ ] Publish to App Store

### Tables

| Feature | Status |
|---------|--------|
| Markdown | ✅ |
| Export | ✅ |
| Themes | 🚧 |

### Blockquotes

> "The best way to predict the future is to create it."
> — Peter Drucker

### Links and Images

[Visit GitHub](https://github.com)

---

Start writing your markdown here!
`;

// Generate TOC from markdown
const generateTOC = (content: string): string => {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: { level: number; text: string; id: string }[] = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text.toLowerCase().replace(/[^\w]+/g, '-');
    headings.push({ level, text, id });
  }

  if (headings.length === 0) return '';

  let toc = '<div class="toc"><h3>Table of Contents</h3><ul>';
  headings.forEach(h => {
    const indent = '  '.repeat(h.level - 1);
    toc += `${indent}<li><a href="#${h.id}">${h.text}</a></li>`;
  });
  toc += '</ul></div>';

  return toc;
};

type Theme = 'light' | 'dark' | 'sepia';

function App() {
  const [content, setContent] = useState(defaultContent);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview'>('split');
  const [openFiles, setOpenFiles] = useState<Array<{path: string, content: string, name: string}>>([]);
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

  // Add headings with IDs for TOC
  const contentWithIds = content.replace(/^(#{1,6})\s+(.+)$/gm, (_match, hashes, text) => {
    const id = text.toLowerCase().replace(/[^\w]+/g, '-');
    return `${hashes} <span id="${id}">${text}</span>`;
  });

  const toc = generateTOC(content);
  const renderedHtml = md.render(contentWithIds);


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

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newContent);
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
  }, [content, history, historyIndex]);

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
          
          const textarea = textareaRef.current;
          if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newContent = content.substring(0, start) + imageMarkdown + content.substring(end);
            setContent(newContent);
            saveToHistory(newContent);
            
            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd = start + imageMarkdown.length;
            }, 0);
          }
        };
        reader.readAsDataURL(blob);
      }
    }
  }, [content, saveToHistory]);

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

  // File operations
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onMenuNewFile(() => {
        const newFile = { path: '', content: '', name: 'Untitled' };
        const newFiles = [...openFiles, newFile];
        setOpenFiles(newFiles);
        setActiveFileIndex(newFiles.length - 1);
        setContent('');
        setCurrentFilePath(null);
      });

      window.electronAPI.onFileOpened(({ content: fileContent, filePath }) => {
        const fileName = filePath.split('/').pop() || 'Untitled';
        const existingIndex = openFiles.findIndex(f => f.path === filePath);
        
        if (existingIndex >= 0) {
          setActiveFileIndex(existingIndex);
          setContent(openFiles[existingIndex].content);
        } else {
          const newFiles = [...openFiles, { path: filePath, content: fileContent, name: fileName }];
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
  }, [content, currentFilePath, openFiles, recentFiles, exportHtml]);

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
                className="markdown-body"
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