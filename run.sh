#!/bin/bash
# 启动语音识别 API 服务（后端）

echo "🚀 启动语音识别 API 服务..."
echo "📝 首次运行会自动下载 Whisper 模型（需要网络）"
echo "💡 前端请另行启动: ./run_frontend.sh"
echo ""

uv run python main.py
