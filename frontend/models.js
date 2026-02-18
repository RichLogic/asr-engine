document.addEventListener('DOMContentLoaded', function() {
    console.log('模型选择页面加载完成');

    const modelsList = document.getElementById('modelsList');
    const errorArea = document.getElementById('errorArea');

    let models = [];
    let currentModelId = null;
    let pollingIntervals = {};

    // 模型配置信息
    const modelInfo = {
        'tiny': {
            icon: '🐤',
            description: '最轻量级，速度最快，适合低配置设备',
            size: '~39 MB',
            speed: '最快',
            accuracy: '基础',
            ram: '~1 GB'
        },
        'base': {
            icon: '🚀',
            description: '平衡选择，适合大多数场景',
            size: '~74 MB',
            speed: '快',
            accuracy: '良好',
            ram: '~1 GB'
        },
        'small': {
            icon: '⭐',
            description: '较好的识别精度，推荐配置',
            size: '~244 MB',
            speed: '中等',
            accuracy: '较好',
            ram: '~2 GB',
            recommended: true
        },
        'medium': {
            icon: '🎯',
            description: '高精度识别，需要较好的硬件',
            size: '~769 MB',
            speed: '较慢',
            accuracy: '高',
            ram: '~4 GB'
        },
        'large': {
            icon: '🏆',
            description: '最高精度，适合专业场景',
            size: '~1.5 GB',
            speed: '最慢',
            accuracy: '最高',
            ram: '~8 GB'
        }
    };

    // 加载模型列表
    async function loadModels() {
        try {
            const response = await fetch(API_BASE + '/api/models');
            if (!response.ok) {
                throw new Error('获取模型列表失败');
            }

            const data = await response.json();
            // 适配后端API格式
            models = (data.available_models || []).map(name => ({
                id: name,
                name: name.charAt(0).toUpperCase() + name.slice(1),
                status: data.downloaded_models.includes(name) ? 'ready' : 'not_downloaded'
            }));
            currentModelId = data.current_model;

            renderModels();
        } catch (error) {
            console.error('加载模型列表失败:', error);
            errorArea.innerHTML = `<div class="error">加载模型列表失败: ${error.message}</div>`;
            modelsList.innerHTML = `
                <div class="error-state">
                    <p>无法加载模型列表，请检查网络连接</p>
                    <button class="btn btn-primary" onclick="location.reload()">重试</button>
                </div>
            `;
        }
    }

    // 渲染模型列表
    function renderModels() {
        if (models.length === 0) {
            modelsList.innerHTML = '<p class="empty-state">暂无可用模型</p>';
            return;
        }

        modelsList.innerHTML = models.map(model => {
            const info = modelInfo[model.id] || {
                icon: '📦',
                description: 'Whisper 语音模型',
                size: '未知',
                speed: '-',
                accuracy: '-',
                ram: '-'
            };

            const isSelected = model.id === currentModelId;
            const isDownloading = model.status === 'downloading';
            const isReady = model.status === 'ready';

            let statusHtml = '';
            let actionHtml = '';

            if (isDownloading) {
                const progress = model.progress || 0;
                statusHtml = `
                    <div class="model-status downloading">
                        <span class="status-dot downloading"></span>
                        <span>下载中</span>
                    </div>
                    <div class="download-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <div class="progress-text">${progress.toFixed(1)}%</div>
                    </div>
                `;
                actionHtml = `<button class="btn-model btn-secondary" disabled>下载中...</button>`;
                startPolling(model.id);
            } else if (isReady) {
                statusHtml = `
                    <div class="model-status ready">
                        <span class="status-dot ready"></span>
                        <span>已就绪</span>
                    </div>
                `;
                if (isSelected) {
                    actionHtml = `<button class="btn-model btn-success" disabled>当前使用</button>`;
                } else {
                    actionHtml = `<button class="btn-model btn-primary" onclick="selectModel('${model.id}')">选择</button>`;
                }
            } else {
                statusHtml = `
                    <div class="model-status not-downloaded">
                        <span class="status-dot not-downloaded"></span>
                        <span>未下载</span>
                    </div>
                `;
                actionHtml = `<button class="btn-model btn-secondary" onclick="downloadModel('${model.id}')">下载</button>`;
            }

            return `
                <div class="model-card ${isSelected ? 'selected' : ''} ${isDownloading ? 'downloading' : ''}" id="model-${model.id}">
                    <div class="model-icon">${info.icon}</div>
                    <div class="model-info">
                        <div class="model-name">
                            ${model.name}
                            ${isSelected ? '<span class="model-badge current">当前</span>' : ''}
                            ${info.recommended ? '<span class="model-badge recommended">推荐</span>' : ''}
                        </div>
                        <div class="model-description">${info.description}</div>
                        <div class="model-meta">
                            <span>📦 ${info.size}</span>
                            <span>⚡ ${info.speed}</span>
                            <span>🎯 ${info.accuracy}</span>
                            <span>💾 ${info.ram}</span>
                        </div>
                    </div>
                    <div class="model-actions">
                        ${statusHtml}
                        ${actionHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    // 下载模型
    window.downloadModel = async function(modelId) {
        const btn = document.querySelector(`#model-${modelId} .btn-model`);
        if (btn) {
            btn.disabled = true;
            btn.textContent = '准备中...';
        }

        try {
            const response = await fetch(API_BASE + `/api/models/${modelId}/download`, {
                method: 'POST'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || '下载失败');
            }

            // 开始轮询进度
            startPolling(modelId);

        } catch (error) {
            console.error('下载模型失败:', error);
            errorArea.innerHTML = `<div class="error">下载失败: ${error.message}</div>`;
            renderModels();
        }
    };

    // 选择模型（加载模型）
    window.selectModel = async function(modelId) {
        const btn = document.querySelector(`#model-${modelId} .btn-model`);
        if (btn) {
            btn.disabled = true;
            btn.textContent = '切换中...';
        }

        try {
            // 先卸载当前模型
            if (currentModelId) {
                await fetch(API_BASE + '/api/models/unload', { method: 'POST' });
            }

            // 加载新模型
            const response = await fetch(API_BASE + `/api/models/${modelId}/load`, {
                method: 'POST'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || '切换失败');
            }

            currentModelId = modelId;
            renderModels();

            // 显示成功提示
            errorArea.innerHTML = `<div class="success-message">模型切换成功！</div>`;
            setTimeout(() => {
                errorArea.innerHTML = '';
            }, 3000);

        } catch (error) {
            console.error('选择模型失败:', error);
            errorArea.innerHTML = `<div class="error">切换失败: ${error.message}</div>`;
            renderModels();
        }
    };

    // 轮询模型状态
    function startPolling(modelId) {
        if (pollingIntervals[modelId]) {
            clearInterval(pollingIntervals[modelId]);
        }

        pollingIntervals[modelId] = setInterval(async () => {
            try {
                const response = await fetch(API_BASE + `/api/models/${modelId}/status`);
                if (!response.ok) return;

                const data = await response.json();
                const modelIndex = models.findIndex(m => m.id === modelId);
                if (modelIndex === -1) return;

                models[modelIndex] = { ...models[modelIndex], ...data };

                // 更新UI
                updateModelCard(modelId);

                // 如果下载完成或失败，停止轮询
                if (data.status !== 'downloading') {
                    clearInterval(pollingIntervals[modelId]);
                    delete pollingIntervals[modelId];

                    if (data.status === 'ready' && !currentModelId) {
                        // 自动选择第一个下载完成的模型
                        selectModel(modelId);
                    }
                }
            } catch (error) {
                console.error('轮询模型状态失败:', error);
            }
        }, 1000);
    }

    // 更新单个模型卡片
    function updateModelCard(modelId) {
        const model = models.find(m => m.id === modelId);
        if (!model) return;

        const card = document.getElementById(`model-${modelId}`);
        if (!card) return;

        // 重新渲染整个列表以保持状态一致
        renderModels();
    }

    // 页面卸载时清理轮询
    window.addEventListener('beforeunload', () => {
        Object.values(pollingIntervals).forEach(interval => {
            clearInterval(interval);
        });
    });

    // 初始化
    loadModels();
});
