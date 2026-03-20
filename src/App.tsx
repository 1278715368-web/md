import React, { useState, useEffect, useCallback, useRef } from 'react';
import MarkdownIt from 'markdown-it';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';

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
});

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

function App() {
  const [content, setContent] = useState(defaultContent);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview'>('split');
  const [openFiles, setOpenFiles] = useState<Array<{path: string, content: string, name: string}>>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const renderedHtml = md.render(content);

  useEffect(() => {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(darkModeQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    darkModeQuery.addEventListener('change', handler);
    return () => darkModeQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onMenuNewFile(() => {
        setContent(defaultContent);
        setCurrentFilePath(null);
      });

      window.electronAPI.onFileOpened(({ content: fileContent, filePath }) => {
        setContent(fileContent);
        setCurrentFilePath(filePath);
      });

      window.electronAPI.onMenuSaveFile(async () => {
        await saveFile();
      });

      window.electronAPI.onMenuSaveAsFile(async () => {
        await saveFileAs();
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
  }, [content, currentFilePath]);

  const saveFile = useCallback(async () => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.saveFile(content, currentFilePath || undefined);
      if (result.success && result.filePath) {
        setCurrentFilePath(result.filePath);
      }
    }
  }, [content, currentFilePath]);

  const saveFileAs = useCallback(async () => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.saveFile(content);
      if (result.success && result.filePath) {
        setCurrentFilePath(result.filePath);
      }
    }
  }, [content]);

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

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  }, []);

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
  }, [content]);

  const handleFileOpen = useCallback((filePath: string, fileContent: string) => {
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
  }, [openFiles]);

  const handleFileSwitch = useCallback((index: number) => {
    if (index >= 0 && index < openFiles.length && index !== activeFileIndex) {
      // 先保存当前文件的内容
      if (activeFileIndex >= 0 && activeFileIndex < openFiles.length) {
        const updatedFiles = [...openFiles];
        updatedFiles[activeFileIndex] = {
          ...updatedFiles[activeFileIndex],
          content: content
        };
        setOpenFiles(updatedFiles);
      }
      
      // 切换到新文件
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
        handleFileOpen(filePath, fileContent);
      });

      window.electronAPI.onMenuSaveFile(async () => {
        await saveFile();
      });

      window.electronAPI.onMenuSaveAsFile(async () => {
        await saveFileAs();
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
  }, [content, currentFilePath, handleFileOpen]);

  return (
    <div className={`app ${isDarkMode ? 'dark' : 'light'}`}>
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

      {/* View Mode Toolbar */}
      <div className="toolbar">
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
      </div>

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
                placeholder="Start writing your markdown here..."
                spellCheck={false}
              />
            </div>
          )}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className="preview-pane">
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
        </div>
      )}
    </div>
  );
}

export default App;