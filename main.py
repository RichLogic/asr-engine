"""
FastAPI 语音识别服务
支持本地语音识别，无需联网
使用 OpenAI Whisper 模型
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import os
import tempfile
from pathlib import Path
import asyncio

try:
    import whisper
except ImportError:
    whisper = None

try:
    import zhconv
except ImportError:
    zhconv = None

# 读取配置文件
def load_config():
    """从配置文件加载设置"""
    config_path = Path("config.toml")
    model_name = "medium"  # 默认值
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
            
            model_name = config.get("model", {}).get("name", "medium")
            port = config.get("server", {}).get("port", 8000)
            print(f"从配置文件读取: 模型={model_name}, 端口={port}")
        except Exception as e:
            print(f"⚠ 读取配置文件失败，使用默认值: {e}")
    
    return model_name, port

app = FastAPI(title="本地语音识别服务")

# 挂载静态文件目录
app.mount("/static", StaticFiles(directory="static"), name="static")

# 模板目录
from fastapi.templating import Jinja2Templates
templates = Jinja2Templates(directory="templates")

# 存储模型
model = None
model_name, server_port = load_config()


def init_whisper_model(model_size: str):
    """初始化 Whisper 模型"""
    global model
    
    if whisper is None:
        raise RuntimeError("Whisper 未安装，请运行: uv pip install openai-whisper")
    
    print(f"正在加载 Whisper 模型: {model_size}...")
    model = whisper.load_model(model_size)
    print(f"✓ Whisper 模型已加载: {model_size}")


@app.on_event("startup")
async def startup_event():
    """应用启动时初始化模型"""
    try:
        # 首次运行会自动下载模型（需要网络）
        # 下载后模型会缓存在 ~/.cache/whisper/ 目录
        init_whisper_model(model_name)
    except Exception as e:
        print(f"⚠ 警告: 模型初始化失败: {e}")
        print("应用将继续运行，但语音识别功能可能不可用")


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """返回前端页面"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/recognize")
async def recognize_audio(file: UploadFile = File(...)):
    """语音识别端点"""
    global model
    import traceback
    
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="语音识别模型未初始化。请检查模型是否正确加载。"
        )
    
    tmp_file_path = None
    try:
        # 保存临时文件
        suffix = Path(file.filename).suffix or '.webm'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            content = await file.read()
            if len(content) == 0:
                raise HTTPException(status_code=400, detail="音频文件为空")
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        try:
            # 使用 Whisper 进行识别
            # language="zh" 指定中文，可以自动检测
            result = model.transcribe(
                tmp_file_path,
                language="zh",  # 中文识别
                task="transcribe"  # 转录任务
            )
            
            # 提取识别文本
            text = result.get("text", "").strip()
            
            if not text:
                text = "未识别到内容"
            else:
                # 强制转换为简体中文
                if zhconv:
                    text = zhconv.convert(text, 'zh-cn')
                else:
                    # 如果没有安装 zhconv，尝试使用内置方法
                    # 这里可以添加备选方案，但建议安装 zhconv
                    pass
            
            return JSONResponse(content={
                "text": text,
                "language": result.get("language", "unknown")
            })
            
        except FileNotFoundError as e:
            if 'ffmpeg' in str(e).lower():
                raise HTTPException(
                    status_code=500,
                    detail="未找到 ffmpeg。请先安装 ffmpeg:\n"
                           "macOS: brew install ffmpeg\n"
                           "Linux: sudo apt-get install ffmpeg\n"
                           "Windows: 从 https://ffmpeg.org/download.html 下载安装"
                )
            raise HTTPException(status_code=500, detail=f"文件未找到: {str(e)}")
        except Exception as e:
            # 打印详细错误信息到控制台
            error_trace = traceback.format_exc()
            print(f"识别错误详情:\n{error_trace}")
            raise HTTPException(
                status_code=500, 
                detail=f"识别过程中出错: {str(e)}\n错误类型: {type(e).__name__}"
            )
        finally:
            # 删除临时文件
            if tmp_file_path and os.path.exists(tmp_file_path):
                try:
                    os.unlink(tmp_file_path)
                except:
                    pass
                
    except HTTPException:
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"处理错误详情:\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"处理音频文件时出错: {str(e)}")


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return JSONResponse(content={
        "status": "ok",
        "model_loaded": model is not None,
        "model_name": model_name if model is not None else None
    })


@app.get("/config")
async def get_config():
    """获取当前配置"""
    return JSONResponse(content={
        "model": model_name,
        "port": server_port
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=server_port)
