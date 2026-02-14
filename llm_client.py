"""
LLM 客户端模块
支持调用 OpenAI 格式的 API 进行文字优化
"""
import os
import json
import base64
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from pathlib import Path
import aiohttp
import asyncio


@dataclass
class LLMConfig:
    """LLM 配置"""
    id: str
    name: str
    api_key: str
    base_url: str
    model: str
    is_default: bool = False

    def to_dict(self, encrypt_key: bool = True) -> dict:
        """转换为字典，可选择是否加密 API key"""
        data = asdict(self)
        if encrypt_key and self.api_key:
            # 只显示前4位和后4位
            if len(self.api_key) > 8:
                data['api_key'] = self.api_key[:4] + '*' * (len(self.api_key) - 8) + self.api_key[-4:]
            else:
                data['api_key'] = '*' * len(self.api_key)
        return data


class ConfigManager:
    """配置管理器 - 每次从文件读取，不缓存"""

    CONFIG_FILE = Path("llm_configs.json")

    def _load_configs_from_file(self) -> Dict[str, LLMConfig]:
        """从文件加载配置到字典"""
        configs: Dict[str, LLMConfig] = {}
        if self.CONFIG_FILE.exists():
            try:
                with open(self.CONFIG_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # 支持对象格式和数组格式
                    if isinstance(data, dict):
                        for key, item in data.items():
                            if isinstance(item, dict):
                                item['id'] = item.get('id', key)
                                if 'is_default' not in item:
                                    item['is_default'] = False
                                config = LLMConfig(**item)
                                configs[config.id] = config
                    elif isinstance(data, list):
                        for item in data:
                            config = LLMConfig(**item)
                            configs[config.id] = config
            except Exception as e:
                print(f"加载配置失败: {e}")
        return configs

    def _save_configs(self, configs: Dict[str, LLMConfig]):
        """保存配置到文件"""
        try:
            data = [asdict(config) for config in configs.values()]
            with open(self.CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"保存配置失败: {e}")

    def get_all_configs(self) -> List[dict]:
        """获取所有配置（API key 加密显示）- 每次从文件读取"""
        configs = self._load_configs_from_file()
        return [config.to_dict(encrypt_key=True) for config in configs.values()]

    def get_config(self, config_id: str) -> Optional[LLMConfig]:
        """获取完整配置（包含真实 API key）- 每次从文件读取"""
        configs = self._load_configs_from_file()
        return configs.get(config_id)

    def get_default_config(self) -> Optional[LLMConfig]:
        """获取默认配置 - 每次从文件读取"""
        configs = self._load_configs_from_file()
        for config in configs.values():
            if config.is_default:
                return config
        # 如果没有默认配置，返回第一个
        if configs:
            return next(iter(configs.values()))
        return None

    def add_config(self, config: LLMConfig) -> bool:
        """添加配置"""
        configs = self._load_configs_from_file()

        # 如果设为默认，取消其他默认配置
        if config.is_default:
            for c in configs.values():
                c.is_default = False

        configs[config.id] = config
        self._save_configs(configs)
        return True

    def update_config(self, config_id: str, updates: dict) -> bool:
        """更新配置"""
        configs = self._load_configs_from_file()

        if config_id not in configs:
            return False

        config = configs[config_id]

        # 如果更新 is_default，取消其他默认配置
        if updates.get('is_default'):
            for c in configs.values():
                c.is_default = False

        # 更新字段
        for key, value in updates.items():
            if hasattr(config, key):
                # 如果 api_key 包含 *，说明是加密后的，跳过更新
                if key == 'api_key' and '*' in str(value):
                    continue
                setattr(config, key, value)

        self._save_configs(configs)
        return True

    def delete_config(self, config_id: str) -> bool:
        """删除配置"""
        configs = self._load_configs_from_file()

        if config_id not in configs:
            return False
        del configs[config_id]
        self._save_configs(configs)
        return True


class LLMClient:
    """LLM 客户端"""

    # 默认系统提示词
    DEFAULT_SYSTEM_PROMPT = """你是一个专业的文本优化助手。你的任务是优化语音识别结果，使其更加通顺、准确。

请遵循以下规则：
1. 去除重复的内容、口癖和语气词（如"嗯"、"啊"、"那个"、"然后"等）
2. 修正语义模糊的表达，使其更加清晰准确
3. 适当分段和格式化，提高可读性
4. 保持原文的核心意思不变，不要添加原文中没有的信息
5. 修正可能的同音字错误
6. 保持礼貌和专业性

请直接返回优化后的文本，不需要解释修改内容。"""

    # Prompt 文件路径
    PROMPT_FILE = Path("prompt.txt")

    def __init__(self, config: LLMConfig):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None

    def _load_system_prompt(self) -> str:
        """从文件加载系统提示词，如果文件不存在则使用默认提示词"""
        try:
            if self.PROMPT_FILE.exists():
                return self.PROMPT_FILE.read_text(encoding='utf-8').strip()
        except Exception as e:
            print(f"加载提示词文件失败: {e}")
        return self.DEFAULT_SYSTEM_PROMPT

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
            self.session = None

    async def test_connection(self) -> tuple[bool, str]:
        """
        测试连接是否可用

        Returns:
            (是否成功, 错误信息)
        """
        try:
            headers = {
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json"
            }

            payload = {
                "model": self.config.model,
                "messages": [
                    {"role": "user", "content": "Hello"}
                ],
                "max_tokens": 5
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.config.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status == 200:
                        return True, ""
                    else:
                        text = await response.text()
                        return False, f"API 返回错误: {response.status} - {text}"

        except aiohttp.ClientError as e:
            return False, f"连接错误: {str(e)}"
        except asyncio.TimeoutError:
            return False, "连接超时"
        except Exception as e:
            return False, f"未知错误: {str(e)}"

    async def optimize_text(self, text: str) -> tuple[Optional[str], Optional[str]]:
        """
        优化文本

        Args:
            text: 原始文本

        Returns:
            (优化后的文本, 错误信息)
        """
        if not text or not text.strip():
            return None, "输入文本为空"

        try:
            headers = {
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json"
            }

            payload = {
                "model": self.config.model,
                "messages": [
                    {"role": "system", "content": self._load_system_prompt()},
                    {"role": "user", "content": f"请优化以下文本：\n\n{text}"}
                ],
                "max_tokens": 2000
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.config.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as response:
                    if response.status != 200:
                        text = await response.text()
                        return None, f"API 错误: {response.status} - {text}"

                    data = await response.json()

                    # 调试日志
                    print(f"API 响应: {data}")

                    optimized = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if not optimized:
                        print(f"警告: API 返回空内容, data={data}")
                        return None, "API 返回空内容"
                    return optimized.strip(), None

        except aiohttp.ClientError as e:
            return None, f"请求失败: {str(e)}"
        except asyncio.TimeoutError:
            return None, "请求超时"
        except Exception as e:
            return None, f"处理失败: {str(e)}"


# 全局配置管理器实例
_config_manager: Optional[ConfigManager] = None


def get_config_manager() -> ConfigManager:
    """获取全局配置管理器"""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager
