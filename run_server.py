#!/usr/bin/env python3
"""
启动服务器脚本，从配置文件读取端口
"""
import sys
from pathlib import Path

def load_port():
    """从配置文件读取端口"""
    config_path = Path("config.toml")
    port = 8000  # 默认端口
    
    if config_path.exists():
        try:
            # Python 3.11+ 内置 tomllib
            try:
                import tomllib
                with open(config_path, "rb") as f:
                    config = tomllib.load(f)
            except ImportError:
                # Python < 3.11 使用 tomli
                import tomli
                with open(config_path, "rb") as f:
                    config = tomli.load(f)
            
            port = config.get("server", {}).get("port", 8000)
        except Exception as e:
            print(f"⚠ 读取配置文件失败，使用默认端口 8000: {e}")
    
    return port

if __name__ == "__main__":
    port = load_port()
    
    # 检查是否传入 --reload 参数（开发模式）
    reload = "--reload" in sys.argv
    
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload)
