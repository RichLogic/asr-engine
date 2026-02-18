#!/bin/bash
# 开发模式启动脚本（后端 API）
# 修改 Python 代码会自动重启

echo "🚀 启动后端 API 开发服务器..."
echo "📝 修改 Python 代码会自动重启"
echo "💡 前端请另行启动: ./run_frontend.sh"
echo ""

uv run python run_server.py --reload
