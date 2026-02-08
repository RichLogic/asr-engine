#!/bin/bash
# 启动语音识别服务

echo "🚀 启动本地语音识别服务..."
echo "📝 首次运行会自动下载 Whisper 模型（需要网络）"
echo ""

uv run python main.py
