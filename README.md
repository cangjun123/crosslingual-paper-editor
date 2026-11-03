# Cross-Lingual Paper Editor

一个用于修改英文学术论文段落的网页工具。

它不会把修改后的中文简单地重新翻译成英文，而是先比较中文语义发生了什么变化，再把这些变化尽量小地应用到原英文中。这样可以更好地保留原文的写作风格、专业术语、引用和 LaTeX 格式。

## 使用流程

1. 粘贴需要修改的英文论文段落。
2. 生成忠实的中文译文。
3. 直接修改中文语义，也可以补充额外要求。
4. 生成修改后的英文，并查看中英文差异。
5. 保存历史版本，或通过 JSON 导入、导出项目。

还可以粘贴整篇论文的 LaTeX 上下文，让模型参考全文中的术语、符号和写作风格。

## 主要功能

- 支持流式生成中文译文和修改后的英文
- 中文字符级 diff 和英文单词级 diff
- 尽量保留 `\cite{}`、`\ref{}`、数学表达式和自定义 LaTeX 命令
- 支持 OpenAI 兼容、Gemini、Anthropic 三种接口格式
- 在网页设置中填写 Base URL、API key 和模型，保存在浏览器中，下次打开无需重新输入
- 可从服务获取模型列表，并记住最近使用的模型
- 可配置 temperature 和流式输出
- 浏览器自动保存、历史版本和 JSON 导入导出
- 快捷键：在英文框按 `Ctrl + Enter` 生成译文，在中文框按 `Ctrl + Enter` 回写英文

## 模型服务配置

有两种方式，任选其一：

1. **在网页中配置（推荐个人使用）**：点击右上角设置，选择接口格式，填写 Base URL、API key 和模型。配置保存在当前浏览器的 localStorage 中，请求时经本站后端转发给模型服务。
2. **在服务器 `.env` 中配置**：网页中 Base URL 和 API key 都留空时，使用服务器配置。服务器的 API key 不会发送给浏览器。

Base URL 可以只填域名和端口，会自动补全版本路径：

| 接口格式 | 填写示例 | 实际请求地址 |
| --- | --- | --- |
| OpenAI 兼容 | `https://api.openai.com` | `https://api.openai.com/v1/chat/completions` |
| Gemini | `https://generativelanguage.googleapis.com` | `.../v1beta/models/{model}:generateContent` |
| Anthropic | `https://api.anthropic.com` | `https://api.anthropic.com/v1/messages` |

已经带路径的地址（例如 `https://relay.example/api/v4`）会原样使用；Gemini 中转地址如 `https://relay.example/gemini` 会补全为 `/gemini/v1beta`。

> 网页中填写的 Base URL 由后端代为请求。如果把服务暴露在公网，任何能访问页面的人都可以让服务器请求任意地址，建议只在内网、Tailscale 或加了访问控制的环境中部署。

## Docker 部署

服务器需要安装 Docker 和 Docker Compose。

### 1. 下载项目

```bash
git clone git@github.com:cangjun123/crosslingual-paper-editor.git
cd crosslingual-paper-editor
```

### 2. 创建配置

```bash
cp .env.example .env
```

如果只在网页中配置模型服务，`.env` 中的 LLM 配置可以留空。需要服务器默认配置时，编辑 `.env`：

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://your-provider.example/v1
DEFAULT_MODEL=your-model

APP_BIND_IP=0.0.0.0
APP_PORT=3001
```

`LLM_PROVIDER` 可选 `openai`、`gemini`、`anthropic`，默认为 `openai`。`OPENAI_BASE_URL` 的补全规则与网页中的 Base URL 相同。

如果只希望通过 Tailscale 地址访问，可以将 `APP_BIND_IP` 设置为 `tailscale ip -4` 返回的地址。

### 3. 启动

```bash
docker compose up -d --build
```

访问：

```text
http://服务器IP:3001
```

查看运行状态和日志：

```bash
docker compose ps
docker compose logs -f app
```

更新项目：

```bash
git pull
docker compose up -d --build
```

停止服务：

```bash
docker compose down
```

Docker 构建只执行一次 `npm ci`，编译完成后会裁剪开发依赖，以降低低内存服务器的构建峰值。如果服务器访问 npm 官方源较慢，可以在 `.env` 中增加：

```env
NPM_REGISTRY=https://registry.npmmirror.com
```

如果构建停在拉取 `node:22-alpine`，需要为服务器的 Docker daemon 配置 Docker Hub 镜像加速。

## 数据说明

当前编辑内容、历史版本和网页中填写的模型服务配置（包括 API key）保存在访问设备的浏览器 localStorage 中，不会写入服务器，也不会在不同浏览器之间自动同步。需要迁移或备份时，请使用页面中的 JSON 导出功能；导出的 JSON 只包含编辑内容和历史版本，不包含 API key。
