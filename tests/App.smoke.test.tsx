import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    run: vi.fn(async () => undefined),
    render: vi.fn(async (_id: string, source: string) => ({
      svg: `<svg data-testid="mock-mermaid-svg" data-source="${source.replaceAll('"', '&quot;')}"></svg>`,
    })),
  },
}));

vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn((tex: string) => `<span data-testid="mock-katex">${tex}</span>`),
  },
}));

import App from '../src/App';

const setTextareaValue = (element: HTMLTextAreaElement, value: string, cursor = value.length) => {
  fireEvent.change(element, {
    target: {
      value,
      selectionStart: cursor,
      selectionEnd: cursor,
    },
  });
};

describe('App smoke tests', () => {
  beforeEach(() => {
    window.localStorage.clear();
    render(<App />);
  });

  it('supports slash commands, find/replace, theme and view switching', async () => {
    const editor = screen.getByTestId('markdown-editor') as HTMLTextAreaElement;
    setTextareaValue(editor, '/json');

    expect(screen.getByTestId('slash-menu')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('slash-command-json'));
    await waitFor(() => expect(editor.value).toContain('```json'));

    await userEvent.click(screen.getByTestId('toggle-find-replace'));
    await userEvent.type(screen.getByTestId('find-input'), 'demo');
    await userEvent.type(screen.getByTestId('replace-input'), 'smoke');
    await userEvent.click(screen.getByTestId('replace-all'));
    expect(editor.value).toContain('"name": "smoke"');

    fireEvent.change(screen.getByTestId('theme-select'), { target: { value: 'dark' } });
    expect(document.querySelector('.app.dark')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('font-size-increase'));
    expect(screen.getByTestId('font-size-value')).toHaveTextContent('15px');

    await userEvent.click(screen.getByTestId('view-preview'));
    expect(screen.getByTestId('markdown-preview')).toBeVisible();
    await userEvent.click(screen.getByTestId('view-split'));
    expect(screen.getByTestId('markdown-editor')).toBeVisible();
  });

  it('supports table studio insert and preview round-trip editing', async () => {
    const editor = screen.getByTestId('markdown-editor') as HTMLTextAreaElement;
    setTextareaValue(editor, '');

    await userEvent.click(screen.getByTestId('toggle-table-studio'));
    expect(screen.getByTestId('table-studio')).toBeVisible();

    await userEvent.clear(screen.getByTestId('table-cell-0-0'));
    await userEvent.type(screen.getByTestId('table-cell-0-0'), '姓名');
    await userEvent.clear(screen.getByTestId('table-cell-0-1'));
    await userEvent.type(screen.getByTestId('table-cell-0-1'), '角色');
    await userEvent.clear(screen.getByTestId('table-cell-1-0'));
    await userEvent.type(screen.getByTestId('table-cell-1-0'), 'Alice');
    await userEvent.clear(screen.getByTestId('table-cell-1-1'));
    await userEvent.type(screen.getByTestId('table-cell-1-1'), 'Editor');
    await userEvent.click(screen.getByTestId('table-apply'));

    await waitFor(() => expect(editor.value).toContain('| 姓名 | 角色 | 表头 3 |'));
    const preview = screen.getByTestId('markdown-preview');
    const previewTable = within(preview).getByRole('table');
    expect(previewTable).toBeVisible();

    fireEvent.doubleClick(previewTable);
    expect(screen.getByTestId('table-studio')).toBeVisible();
    const cell = screen.getByTestId('table-cell-1-0');
    await userEvent.clear(cell);
    await userEvent.type(cell, 'Bob');
    await userEvent.click(screen.getByTestId('table-apply'));

    await waitFor(() => expect(editor.value).toContain('| Bob | Editor | 内容 1-3 |'));
  });

  it('supports flowchart studio insertion and preview double-click editing', async () => {
    const editor = screen.getByTestId('markdown-editor') as HTMLTextAreaElement;
    setTextareaValue(editor, '');

    await userEvent.click(screen.getByTestId('toggle-flowchart-studio'));
    expect(screen.getByTestId('flowchart-studio')).toBeVisible();

    await userEvent.click(screen.getByTestId('flowchart-template-service'));
    await waitFor(() =>
      expect((screen.getByTestId('flowchart-editor') as HTMLTextAreaElement).value).toContain('API Gateway')
    );
    await userEvent.click(screen.getByTestId('flowchart-snippet-database'));
    await userEvent.click(screen.getByTestId('flowchart-insert'));

    await waitFor(() => expect(editor.value).toContain('```mermaid'));
    await waitFor(() => expect(document.querySelector('.mermaid-block')).toBeInTheDocument());

    fireEvent.doubleClick(document.querySelector('.mermaid-block') as Element);
    expect(screen.getByTestId('flowchart-studio')).toBeVisible();
    await waitFor(() =>
      expect((screen.getByTestId('flowchart-editor') as HTMLTextAreaElement).value).toContain('Order Service')
    );
    expect(screen.getByTestId('flowchart-preview').querySelector('svg')).toBeInTheDocument();
  });

  it('restores untitled drafts from local session storage', async () => {
    const editor = screen.getByTestId('markdown-editor') as HTMLTextAreaElement;
    setTextareaValue(editor, '临时草稿内容');

    await waitFor(() => expect(screen.getByText('未命名草稿已保存在本地')).toBeInTheDocument());

    cleanup();
    render(<App />);
    expect((screen.getByTestId('markdown-editor') as HTMLTextAreaElement).value).toContain('临时草稿内容');
  });
});
