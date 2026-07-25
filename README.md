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
- 可配置模型、temperature 和流式输出
- 浏览器自动保存、历史版本和 JSON 导入导出
- API key 只保存在服务器，不会发送给浏览器

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

编辑 `.env`：

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://your-provider.example/v1
DEFAULT_MODEL=your-model

APP_BIND_IP=0.0.0.0
APP_PORT=3001
```

`OPENAI_BASE_URL` 应填写 OpenAI Chat Completions compatible API 的完整基础路径。很多服务需要以 `/v1` 结尾。

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

如果服务器访问 npm 官方源较慢，可以在 `.env` 中增加：

```env
NPM_REGISTRY=https://registry.npmmirror.com
```

如果构建停在拉取 `node:22-alpine`，需要为服务器的 Docker daemon 配置 Docker Hub 镜像加速。

## 数据说明

当前编辑内容和历史版本保存在访问设备的浏览器 localStorage 中，不会写入服务器，也不会在不同浏览器之间自动同步。需要迁移或备份时，请使用页面中的 JSON 导出功能。
