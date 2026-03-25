# MD Editor

一个精美的 Markdown 编辑器，灵感来源于 Typora，采用 Electron + React + TypeScript 构建。

![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue)

## 功能特性

### 🎨 编辑模式
- **编辑器模式** - 全屏显示Markdown源代码
- **分屏模式** - 左右分栏，实时预览（默认）
- **预览模式** - 全屏显示渲染效果

### 📁 多文件支持
- 支持同时打开多个Markdown文件
- 文件标签栏，快速切换不同文件
- 自动保存每个文件的编辑状态

### ✍️ 编辑体验
- 类似 Typora 的实时预览写作体验
- 首页内置完整功能案例，打开即可验证主要能力
- 多标签文档切换，首次 `Cmd + N` 不再丢失当前内容
- 查找替换、字号切换、浅色 / 深色 / Sepia 主题
- Tab 键缩进支持
- 未命名文档自动保存为本地草稿，重启后可恢复
- 已存在文件支持自动保存回原路径，降低内容丢失风险
- `/` 斜杠菜单快速插入代码块、JSON、表格、流程图模板
- 内置流程图工作台，可本地编辑 Mermaid 流程图并导出 SVG
- 内置表格工作台，可视化编辑表格并回写 Markdown
- 预览区支持双击表格/流程图，直接进入对应编辑工作台

### 🧩 Markdown 扩展
- 标题、引用、列表、表格、删除线、代码块、自动链接
- 任务列表，支持在预览区直接勾选并回写 Markdown
- 脚注 `[^1]`
- 目录语法 `[toc]`
- YAML Front Matter
- 高亮 `==text==`
- 下标 `H~2~O` 与上标 `x^2^`
- Emoji 短码 `:smile:`
- 行内公式与块公式（KaTeX）
- Mermaid 代码块图表渲染
- Mermaid 流程图支持单独导出为 SVG
- Markdown 表格支持可视化导入、编辑、覆盖更新
- 原生 HTML、图片粘贴、图片拖拽插入

### 🎯 macOS原生体验
- 符合Apple Human Interface Guidelines
- 支持系统暗黑模式自动切换
- SF Pro字体
- 原生窗口控件
- 流畅的动画效果

### 📤 导出功能
- 导出为 HTML 文件
- 导出为 PDF 文件
- 导出为 Word 文件

## 技术栈

- **框架**: Electron 41
- **前端**: React 19 + TypeScript
- **构建工具**: Vite 8
- **Markdown解析**: markdown-it + 扩展插件
- **代码高亮**: Prism.js
- **数学公式**: KaTeX
- **图表**: Mermaid

## 安装

### 从DMG安装
1. 下载 `release/MD Editor-1.0.0-arm64.dmg`
2. 双击打开DMG文件
3. 将MD Editor拖入Applications文件夹

### 从ZIP安装
1. 下载 `release/MD Editor-1.0.0-arm64-mac.zip`
2. 解压缩
3. 将 `MD Editor.app` 移动到Applications文件夹

## 开发

### 环境要求
- Node.js 18+
- npm 或 pnpm

### 安装依赖
```bash
cd md-editor
npm install
```

### 开发模式
```bash
npm run electron:dev
```

### 构建
```bash
# 构建前端
npm run build

# 打包macOS应用
npm run electron:build:mac
```

## 项目结构

```
md-editor/
├── TYPORA_PARITY_PLAN.md  # Typora 功能对齐计划与进度
├── src/                    # React前端源代码
│   ├── App.tsx            # 主应用组件
│   ├── main.tsx           # React入口
│   ├── styles/            # 样式文件
│   └── types/             # 本地类型声明
├── electron/              # Electron主进程
│   ├── main.js            # 主进程入口
│   └── preload.js         # 预加载脚本
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript配置
└── vite.config.ts         # Vite配置
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd + N` | 新建文件 |
| `Cmd + O` | 打开文件 |
| `Cmd + S` | 保存文件 |
| `Cmd + Shift + S` | 另存为 |
| `Cmd + P` | 导出PDF |
| `Tab` | 缩进 |

## 当前状态

- 已完成一轮 Typora 常用 Markdown 能力补齐，详细清单见 [TYPORA_PARITY_PLAN.md](./TYPORA_PARITY_PLAN.md)
- 仍待继续实现的高级能力包括：表格编辑工具栏、Typora 式行内元素展开编辑、偏好设置面板等

## 系统要求

- macOS 10.15 或更高版本
- Apple Silicon (M1/M2) 或 Intel处理器

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

## 作者

MD Editor Team

---

**享受Markdown写作！** ✨
