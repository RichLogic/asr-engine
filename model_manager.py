"""
语音模型管理器
支持管理多个 Whisper 模型的加载、卸载和状态追踪
"""
import os
import json
import asyncio
import whisper
from pathlib import Path
from typing import Dict, Optional, Callable
from dataclasses import dataclass, asdict
from enum import Enum
import threading
import time


class ModelStatus(Enum):
    """模型状态"""
    NOT_DOWNLOADED = "not_downloaded"  # 未下载
    DOWNLOADING = "downloading"        # 下载中
    READY = "ready"                    # 已就绪
    LOADING = "loading"                # 加载中
    ERROR = "error"                    # 错误


@dataclass
class ModelInfo:
    """模型信息"""
    name: str
    size: str
    description: str
    status: str
    download_progress: float = 0.0
    error_message: Optional[str] = None


class ModelManager:
    """Whisper 模型管理器"""

    # 可用模型列表
    AVAILABLE_MODELS = {
        "tiny": {
            "name": "tiny",
            "size": "39 MB",
            "description": "最小模型，速度最快但精度较低，适合测试"
        },
        "base": {
            "name": "base",
            "size": "74 MB",
            "description": "基础模型，平衡速度和精度"
        },
        "small": {
            "name": "small",
            "size": "244 MB",
            "description": "小型模型，较好的识别精度"
        },
        "medium": {
            "name": "medium",
            "size": "769 MB",
            "description": "中型模型，高精度识别（推荐）"
        },
        "large": {
            "name": "large",
            "size": "1550 MB",
            "description": "大型模型，最高精度但速度较慢"
        }
    }

    def __init__(self, cache_dir: Optional[str] = None):
        self.cache_dir = Path(cache_dir) if cache_dir else Path.home() / ".cache" / "whisper"
        self.current_model: Optional[whisper.Whisper] = None
        self.current_model_name: Optional[str] = None
        self._model_status: Dict[str, ModelStatus] = {}
        self._download_progress: Dict[str, float] = {}
        self._download_callbacks: Dict[str, Callable] = {}
        self._lock = threading.Lock()
        self._download_tasks: Dict[str, asyncio.Task] = {}

        # 初始化状态
        self._init_status()

    def _init_status(self):
        """初始化所有模型状态"""
        for model_name in self.AVAILABLE_MODELS:
            model_file = self.cache_dir / f"{model_name}.pt"
            if model_file.exists():
                self._model_status[model_name] = ModelStatus.NOT_DOWNLOADED
            else:
                self._model_status[model_name] = ModelStatus.NOT_DOWNLOADED
            self._download_progress[model_name] = 0.0

    def check_model_downloaded(self, model_name: str) -> bool:
        """检查模型是否已下载"""
        model_file = self.cache_dir / f"{model_name}.pt"
        return model_file.exists()

    def get_model_status(self, model_name: str) -> ModelStatus:
        """获取模型状态"""
        if model_name not in self.AVAILABLE_MODELS:
            return ModelStatus.ERROR

        with self._lock:
            status = self._model_status.get(model_name)
            if status in [ModelStatus.DOWNLOADING, ModelStatus.LOADING]:
                return status

            # 检查实际文件状态
            if self.check_model_downloaded(model_name):
                if self.current_model_name == model_name:
                    return ModelStatus.READY
                return ModelStatus.NOT_DOWNLOADED  # 已下载但未加载
            else:
                return ModelStatus.NOT_DOWNLOADED

    def get_all_models(self) -> list:
        """获取所有模型信息列表"""
        models = []
        for name, info in self.AVAILABLE_MODELS.items():
            status = self.get_model_status(name)
            model_info = ModelInfo(
                name=name,
                size=info["size"],
                description=info["description"],
                status=status.value,
                download_progress=self._download_progress.get(name, 0.0)
            )
            models.append(asdict(model_info))
        return models

    def get_current_model(self) -> Optional[str]:
        """获取当前加载的模型名称"""
        return self.current_model_name

    async def download_model(self, model_name: str, progress_callback: Optional[Callable] = None) -> bool:
        """
        下载模型

        Args:
            model_name: 模型名称
            progress_callback: 进度回调函数，接收 (model_name, progress) 参数

        Returns:
            是否成功
        """
        if model_name not in self.AVAILABLE_MODELS:
            return False

        # 检查是否已下载
        if self.check_model_downloaded(model_name):
            return True

        # 检查是否正在下载
        with self._lock:
            if self._model_status.get(model_name) == ModelStatus.DOWNLOADING:
                return False
            self._model_status[model_name] = ModelStatus.DOWNLOADING
            self._download_progress[model_name] = 0.0
            if progress_callback:
                self._download_callbacks[model_name] = progress_callback

        try:
            # 使用线程池执行下载，避免阻塞事件循环
            loop = asyncio.get_event_loop()

            def download_with_progress():
                """在后台线程中下载模型"""
                try:
                    # 模拟进度更新
                    for i in range(10):
                        time.sleep(0.1)
                        progress = (i + 1) * 10
                        self._download_progress[model_name] = progress

                        # 调用进度回调
                        callback = self._download_callbacks.get(model_name)
                        if callback:
                            try:
                                if asyncio.iscoroutinefunction(callback):
                                    asyncio.run_coroutine_threadsafe(
                                        callback(model_name, progress),
                                        loop
                                    )
                                else:
                                    callback(model_name, progress)
                            except Exception:
                                pass

                    # 实际下载模型
                    model = whisper.load_model(model_name)

                    # 如果当前没有加载模型，则使用这个新下载的
                    with self._lock:
                        if self.current_model is None:
                            self.current_model = model
                            self.current_model_name = model_name

                    return True
                except Exception as e:
                    print(f"下载模型 {model_name} 失败: {e}")
                    return False

            # 在线程池中执行下载
            result = await loop.run_in_executor(None, download_with_progress)

            with self._lock:
                if result:
                    self._model_status[model_name] = ModelStatus.NOT_DOWNLOADED  # 已下载但未加载
                else:
                    self._model_status[model_name] = ModelStatus.ERROR
                self._download_progress[model_name] = 100.0 if result else 0.0

            return result

        except Exception as e:
            print(f"下载模型 {model_name} 时出错: {e}")
            with self._lock:
                self._model_status[model_name] = ModelStatus.ERROR
            return False

    async def load_model(self, model_name: str) -> bool:
        """
        加载指定模型

        Args:
            model_name: 模型名称

        Returns:
            是否成功
        """
        if model_name not in self.AVAILABLE_MODELS:
            return False

        # 如果已经是当前模型，直接返回
        if self.current_model_name == model_name and self.current_model is not None:
            return True

        # 检查是否已下载
        if not self.check_model_downloaded(model_name):
            return False

        with self._lock:
            self._model_status[model_name] = ModelStatus.LOADING

        try:
            # 卸载当前模型
            if self.current_model is not None:
                del self.current_model
                self.current_model = None

            # 加载新模型
            loop = asyncio.get_event_loop()
            model = await loop.run_in_executor(None, whisper.load_model, model_name)

            with self._lock:
                self.current_model = model
                self.current_model_name = model_name
                self._model_status[model_name] = ModelStatus.READY

            return True

        except Exception as e:
            print(f"加载模型 {model_name} 失败: {e}")
            with self._lock:
                self._model_status[model_name] = ModelStatus.ERROR
            return False

    def unload_model(self):
        """卸载当前模型"""
        with self._lock:
            if self.current_model is not None:
                del self.current_model
                self.current_model = None
                old_name = self.current_model_name
                self.current_model_name = None
                if old_name:
                    self._model_status[old_name] = ModelStatus.NOT_DOWNLOADED

    def get_download_progress(self, model_name: str) -> float:
        """获取下载进度"""
        return self._download_progress.get(model_name, 0.0)


# 全局模型管理器实例
_model_manager: Optional[ModelManager] = None


def get_model_manager() -> ModelManager:
    """获取全局模型管理器实例"""
    global _model_manager
    if _model_manager is None:
        _model_manager = ModelManager()
    return _model_manager
