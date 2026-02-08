# ASR Engine

基于 FastAPI 和 OpenAI Whisper 的本地语音识别服务，完全离线运行，支持中文识别。

## ✨ 特性

- 🚀 **完全离线** - 识别过程无需联网，保护隐私
- 🇨🇳 **中文支持** - 优化的中文语音识别
- 🎨 **简洁界面** - 现代化的 Web 界面
- 🔧 **易于配置** - 通过配置文件管理模型和端口
- 📡 **RESTful API** - 支持程序化调用
- 🎵 **多格式支持** - MP3, WAV, M4A, FLAC 等

## 🚀 快速开始

### 前置要求

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) (推荐) 或 pip
- ffmpeg

**安装 ffmpeg:**

```bash
# macOS
brew install ffmpeg

# Linux (Ubuntu/Debian)
sudo apt-get install ffmpeg

# Windows
# 从 https://ffmpeg.org/download.html 下载安装
```

### 安装

```bash
# 克隆项目
git clone <your-repo-url>
cd asr-engine

# 安装依赖
uv sync
```

### 运行

```bash
# 生产模式
./run.sh

# 或开发模式（代码修改自动重启）
./run_dev.sh
```

首次运行会自动下载 Whisper 模型（约 769 MB），需要网络连接。模型下载后会缓存在 `~/.cache/whisper/` 目录。

访问 http://localhost:8000 使用 Web 界面。

## ⚙️ 配置

编辑 `config.toml` 文件进行配置：

```toml
[model]
# 可选: tiny, base, small, medium, large
# tiny: 最快但准确度低
# medium: 平衡速度和准确度（默认）
# large: 最准确但速度慢
name = "medium"

[server]
# 服务监听端口，默认 8000
# 修改后重启服务生效，访问地址变为 http://localhost:<新端口>
port = 8000
```

### 修改端口

1. 编辑 `config.toml`，修改 `[server]` 部分的 `port` 值
2. 重启服务
3. 使用新端口访问，例如：`http://localhost:8080`

**注意：** 确保端口未被占用，否则启动会失败。

## 📡 API 接口

### POST /recognize

上传音频文件进行识别

```bash
curl -X POST "http://localhost:8000/recognize" \
  -F "file=@audio.wav"
```

**响应:**
```json
{
  "text": "识别出的文本内容",
  "language": "zh"
}
```

### GET /health

健康检查

```bash
curl http://localhost:8000/health
```

**响应:**
```json
{
  "status": "ok",
  "model_loaded": true,
  "model_name": "medium"
}
```

### GET /config

获取当前配置

```bash
curl http://localhost:8000/config
```

## 🛠️ 项目结构

```
asr-engine/
├── main.py              # FastAPI 应用
├── config.toml          # 配置文件
├── run.sh               # 启动脚本
├── run_dev.sh           # 开发模式脚本
├── static/              # 前端静态资源
│   ├── app.js
│   └── style.css
└── templates/           # HTML 模板
    └── index.html
```

## ❓ 常见问题

**Q: 首次启动很慢？**  
A: 首次运行需要下载模型（约 769 MB），请耐心等待。模型下载后后续启动会很快。

**Q: 识别速度慢？**  
A: 在 `config.toml` 中切换到更小的模型（如 `tiny` 或 `base`），或确保有足够的内存。

**Q: ffmpeg 未找到？**  
A: 请确保已安装 ffmpeg 并在系统 PATH 中。安装方法见"前置要求"部分。

**Q: 内存不足？**  
A: 切换到更小的模型（`tiny` 或 `base`），或关闭其他占用内存的程序。

**Q: 如何修改端口？**  
A: 编辑 `config.toml` 文件中的 `[server]` 部分的 `port` 值，然后重启服务。确保新端口未被占用。

## 🛠️ 技术栈

- [FastAPI](https://fastapi.tiangolo.com/) - Web 框架
- [OpenAI Whisper](https://github.com/openai/whisper) - 语音识别引擎
- [PyTorch](https://pytorch.org/) - 深度学习框架
- [Uvicorn](https://www.uvicorn.org/) - ASGI 服务器

## 📝 License

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
