#!/bin/bash
# 开发模式启动脚本
# 修改 Python 代码会自动重启，修改前端代码只需刷新浏览器

echo "🚀 启动开发服务器..."
echo "📝 修改 Python 代码会自动重启"
echo "🎨 修改前端代码（static/ 或 templates/）只需刷新浏览器"
echo ""

uv run python run_server.py --reload
