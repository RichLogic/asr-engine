#!/bin/bash
# 启动前端开发服务器
# 使用 Python 内置 HTTP 服务器提供静态文件服务

FRONTEND_PORT=${1:-3000}

echo "🎨 启动前端开发服务器..."
echo "📂 服务目录: frontend/"
echo "🌐 访问地址: http://localhost:${FRONTEND_PORT}"
echo "📡 后端 API 地址请在 frontend/config.js 中配置"
echo ""

cd "$(dirname "$0")/frontend" && python3 -m http.server "$FRONTEND_PORT"
