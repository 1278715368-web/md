import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

Object.defineProperty(window, 'electronAPI', {
  configurable: true,
  value: {
    saveFile: vi.fn(async () => ({ success: true, filePath: '/tmp/test.md' })),
    getCurrentFilePath: vi.fn(async () => null),
    onMenuNewFile: vi.fn(),
    onFileOpened: vi.fn(),
    onMenuSaveFile: vi.fn(),
    onMenuSaveAsFile: vi.fn(),
    onMenuExportHtml: vi.fn(),
    openExternal: vi.fn(async () => undefined),
    removeAllListeners: vi.fn(),
  },
});

globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  return window.setTimeout(() => callback(performance.now()), 0);
};

globalThis.cancelAnimationFrame = (handle: number) => {
  window.clearTimeout(handle);
};
