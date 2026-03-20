# MD Editor

一个精美的Markdown编辑器，灵感来源于Typora，采用Electron + React + TypeScript构建。

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
- 类似Typora的所见即所得编辑
- 完整的Markdown语法支持
- 代码语法高亮（支持JavaScript、TypeScript、Python、CSS等）
- Tab键缩进支持
- 中文输入法完美支持

### 🎯 macOS原生体验
- 符合Apple Human Interface Guidelines
- 支持系统暗黑模式自动切换
- SF Pro字体
- 原生窗口控件
- 流畅的动画效果

### 📤 导出功能
- 导出为HTML文件
- 导出为PDF文件

## 技术栈

- **框架**: Electron 41
- **前端**: React 19 + TypeScript
- **构建工具**: Vite 8
- **Markdown解析**: markdown-it
- **代码高亮**: Prism.js

## 安装

### 从DMG安装
1. 下载 `MD Editor-1.0.0-arm64.dmg`
2. 双击打开DMG文件
3. 将MD Editor拖入Applications文件夹

### 从ZIP安装
1. 下载 `MD Editor-1.0.0-arm64-mac.zip`
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
├── src/                    # React前端源代码
│   ├── App.tsx            # 主应用组件
│   ├── main.tsx           # React入口
│   └── styles/            # 样式文件
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