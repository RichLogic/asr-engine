"""
FastAPI 语音识别服务 (API Server)
支持本地语音识别，无需联网
使用 OpenAI Whisper 模型
前后端分离架构 - 仅提供 REST API
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import os
import tempfile
from pathlib import Path
import asyncio
import uuid
import traceback

try:
    import whisper
except ImportError:
    whisper = None

try:
    import zhconv
except ImportError:
    zhconv = None

# 导入自定义模块
from model_manager import get_model_manager, ModelStatus
from llm_client import get_config_manager, LLMConfig, LLMClient

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

app = FastAPI(title="本地语音识别服务 API")

# CORS 配置 - 允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 存储模型
model = None
model_name, server_port = load_config()

# 获取模型管理器和配置管理器
model_manager = get_model_manager()
config_manager = get_config_manager()


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
    global model, model_name
    try:
        # 使用模型管理器加载配置的模型
        success = await model_manager.load_model(model_name)
        if success:
            model = model_manager.current_model
            print(f"✓ 模型管理器已加载模型: {model_name}")
        else:
            # 回退到旧方式
            init_whisper_model(model_name)
            model_manager.current_model = model
            model_manager.current_model_name = model_name
    except Exception as e:
        print(f"⚠ 警告: 模型初始化失败: {e}")
        print("应用将继续运行，但语音识别功能可能不可用")


@app.post("/recognize")
async def recognize_audio(
    file: UploadFile = File(...),
    optimize: str = Form(default="false")
):
    """语音识别端点"""
    global model

    # 优先使用模型管理器中的模型
    current_model = model_manager.current_model or model

    if current_model is None:
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
            result = current_model.transcribe(
                tmp_file_path,
                language="zh",
                task="transcribe"
            )

            # 提取识别文本
            text = result.get("text", "").strip()

            if not text:
                text = "未识别到内容"
            else:
                # 强制转换为简体中文
                if zhconv:
                    text = zhconv.convert(text, 'zh-cn')

            response_data = {
                "text": text,
                "language": result.get("language", "unknown")
            }

            # 如果开启了自动优化，调用 LLM 优化
            if optimize.lower() == "true" and text != "未识别到内容":
                config = config_manager.get_default_config()
                if config:
                    try:
                        client = LLMClient(config)
                        optimized_text, error = await client.optimize_text(text)
                        if optimized_text and not error:
                            response_data["optimized_text"] = optimized_text
                    except Exception as e:
                        print(f"自动优化失败: {e}")

            return JSONResponse(content=response_data)

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
    current = model_manager.get_current_model()
    return JSONResponse(content={
        "status": "ok",
        "model_loaded": current is not None,
        "model_name": current
    })


@app.get("/config")
async def get_config():
    """获取当前配置"""
    return JSONResponse(content={
        "model": model_manager.get_current_model() or model_name,
        "port": server_port
    })


# ==================== 语音模型管理 API ====================

@app.get("/api/models")
async def get_models():
    """获取所有可用模型列表"""
    models = model_manager.get_all_models()

    # 适配前端期望的格式
    available_models = list(model_manager.AVAILABLE_MODELS.keys())
    downloaded_models = [m["name"] for m in models if m["status"] in ["ready", "not_downloaded"] and model_manager.check_model_downloaded(m["name"])]

    return JSONResponse(content={
        "available_models": available_models,
        "downloaded_models": downloaded_models,
        "current_model": model_manager.get_current_model()
    })


@app.get("/api/models/current")
async def get_current_model():
    """获取当前使用的模型"""
    current = model_manager.get_current_model()
    if current:
        return JSONResponse(content={
            "model_id": current,
            "model_name": model_manager.AVAILABLE_MODELS.get(current, {}).get("name", current)
        })
    return JSONResponse(content={"model_id": None, "model_name": None})


@app.get("/api/models/{model_name}/status")
async def get_model_status(model_name: str):
    """获取指定模型状态"""
    if model_name not in model_manager.AVAILABLE_MODELS:
        raise HTTPException(status_code=404, detail="模型不存在")

    status = model_manager.get_model_status(model_name)
    progress = model_manager.get_download_progress(model_name)

    return JSONResponse(content={
        "name": model_name,
        "status": status.value,
        "progress": progress
    })


@app.post("/api/models/{model_name}/download")
async def download_model(model_name: str):
    """开始下载模型"""
    if model_name not in model_manager.AVAILABLE_MODELS:
        raise HTTPException(status_code=404, detail="模型不存在")

    status = model_manager.get_model_status(model_name)
    if status == ModelStatus.DOWNLOADING:
        return JSONResponse(content={"message": "模型正在下载中"})

    if status == ModelStatus.READY:
        return JSONResponse(content={"message": "模型已就绪"})

    # 异步开始下载
    asyncio.create_task(model_manager.download_model(model_name))

    return JSONResponse(content={
        "message": "开始下载模型",
        "model": model_name
    })


@app.post("/api/models/{model_name}/load")
async def load_model(model_name: str):
    """加载指定模型"""
    if model_name not in model_manager.AVAILABLE_MODELS:
        raise HTTPException(status_code=404, detail="模型不存在")

    # 检查是否已下载
    if not model_manager.check_model_downloaded(model_name):
        raise HTTPException(status_code=400, detail="模型未下载，请先下载")

    success = await model_manager.load_model(model_name)
    if success:
        global model
        model = model_manager.current_model

        # 更新配置文件
        try:
            import tomli_w
            config_path = Path("config.toml")
            config = {}
            if config_path.exists():
                try:
                    import tomllib
                    with open(config_path, "rb") as f:
                        config = tomllib.load(f)
                except ImportError:
                    import tomli
                    with open(config_path, "rb") as f:
                        config = tomli.load(f)

            config["model"] = {"name": model_name}

            with open(config_path, "wb") as f:
                tomli_w.dump(config, f)
        except Exception as e:
            print(f"更新配置文件失败: {e}")

        return JSONResponse(content={
            "message": "模型加载成功",
            "model": model_name
        })
    else:
        raise HTTPException(status_code=500, detail="模型加载失败")


@app.post("/api/models/unload")
async def unload_model():
    """卸载当前模型"""
    model_manager.unload_model()
    global model
    model = None
    return JSONResponse(content={"message": "模型已卸载"})


# ==================== 文字模型配置 API ====================

class LLMConfigRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    api_key: str = Field(..., min_length=1)
    base_url: str = Field(..., min_length=1)
    model: str = Field(..., min_length=1)
    is_default: bool = False


class LLMConfigUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    is_default: Optional[bool] = None


@app.get("/api/llm-configs")
async def get_llm_configs():
    """获取所有 LLM 配置"""
    configs = config_manager.get_all_configs()
    return JSONResponse(content={"configs": configs})


@app.get("/api/llm-configs/current")
async def get_current_llm_config():
    """获取当前使用的 LLM 配置"""
    config = config_manager.get_default_config()
    if config:
        return JSONResponse(content={"config": config.to_dict(encrypt_key=True)})
    return JSONResponse(content={"config": None})


@app.post("/api/llm-configs")
async def create_llm_config(config_req: LLMConfigRequest):
    """创建新的 LLM 配置"""
    config = LLMConfig(
        id=str(uuid.uuid4()),
        name=config_req.name,
        api_key=config_req.api_key,
        base_url=config_req.base_url,
        model=config_req.model,
        is_default=config_req.is_default
    )

    success = config_manager.add_config(config)
    if success:
        return JSONResponse(content={
            "message": "配置创建成功",
            "config": config.to_dict(encrypt_key=True)
        })
    else:
        raise HTTPException(status_code=500, detail="配置创建失败")


@app.put("/api/llm-configs/{config_id}")
async def update_llm_config(config_id: str, updates: LLMConfigUpdateRequest):
    """更新 LLM 配置"""
    update_dict = {k: v for k, v in updates.dict().items() if v is not None}

    success = config_manager.update_config(config_id, update_dict)
    if success:
        config = config_manager.get_config(config_id)
        return JSONResponse(content={
            "message": "配置更新成功",
            "config": config.to_dict(encrypt_key=True) if config else None
        })
    else:
        raise HTTPException(status_code=404, detail="配置不存在")


@app.delete("/api/llm-configs/{config_id}")
async def delete_llm_config(config_id: str):
    """删除 LLM 配置"""
    success = config_manager.delete_config(config_id)
    if success:
        return JSONResponse(content={"message": "配置删除成功"})
    else:
        raise HTTPException(status_code=404, detail="配置不存在")


@app.post("/api/llm-configs/{config_id}/select")
async def select_llm_config(config_id: str):
    """选择/设为默认 LLM 配置"""
    config = config_manager.get_config(config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    success = config_manager.update_config(config_id, {"is_default": True})
    if success:
        return JSONResponse(content={
            "message": "配置已设为默认",
            "config": config.to_dict(encrypt_key=True)
        })
    else:
        raise HTTPException(status_code=500, detail="设置失败")


class TestConfigRequest(BaseModel):
    """测试配置请求"""
    base_url: str
    api_key: str
    model: str


@app.post("/api/llm-configs/test")
async def test_llm_config_temp(request: TestConfigRequest):
    """临时测试 LLM 配置（未保存的配置）"""
    config = LLMConfig(
        id="temp",
        name="temp",
        api_key=request.api_key,
        base_url=request.base_url,
        model=request.model
    )

    client = LLMClient(config)
    success, error = await client.test_connection()

    if success:
        return JSONResponse(content={
            "available": True,
            "message": "连接成功"
        })
    else:
        return JSONResponse(content={
            "available": False,
            "error": error
        })


@app.post("/api/llm-configs/{config_id}/test")
async def test_llm_config(config_id: str):
    """测试已保存的 LLM 配置是否可用"""
    config = config_manager.get_config(config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    client = LLMClient(config)
    success, error = await client.test_connection()

    if success:
        return JSONResponse(content={
            "available": True,
            "message": "连接成功"
        })
    else:
        return JSONResponse(content={
            "available": False,
            "error": error
        })


# ==================== 文字优化 API ====================

class OptimizeRequest(BaseModel):
    text: str = Field(..., min_length=1)
    config_id: Optional[str] = None


@app.post("/api/optimize-text")
async def optimize_text(request: OptimizeRequest):
    """优化文本"""
    # 获取配置
    if request.config_id:
        config = config_manager.get_config(request.config_id)
    else:
        config = config_manager.get_default_config()

    if not config:
        raise HTTPException(
            status_code=400,
            detail="未找到可用的 LLM 配置，请先配置文字模型"
        )

    client = LLMClient(config)
    optimized_text, error = await client.optimize_text(request.text)

    if error:
        raise HTTPException(status_code=500, detail=error)

    return JSONResponse(content={
        "original": request.text,
        "optimized_text": optimized_text
    })


@app.get("/api/llm-status")
async def get_llm_status():
    """获取 LLM 配置状态 - 适配前端期望格式"""
    configs = config_manager.get_all_configs()
    default_config = config_manager.get_default_config()

    return JSONResponse(content={
        "enabled": len(configs) > 0,
        "current_config": default_config.to_dict(encrypt_key=True) if default_config else None
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=server_port)
