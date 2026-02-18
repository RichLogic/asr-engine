document.addEventListener('DOMContentLoaded', function() {
    console.log('LLM配置页面加载完成');

    const configList = document.getElementById('configList');
    const configFormSection = document.getElementById('configFormSection');
    const configForm = document.getElementById('configForm');
    const addConfigBtn = document.getElementById('addConfigBtn');
    const closeFormBtn = document.getElementById('closeFormBtn');
    const testConfigBtn = document.getElementById('testConfigBtn');
    const toggleApiKeyBtn = document.getElementById('toggleApiKey');
    const testResult = document.getElementById('testResult');
    const errorArea = document.getElementById('errorArea');
    const formTitle = document.getElementById('formTitle');

    let configs = [];
    let currentConfigId = null;
    let editingConfigId = null;

    // 加载配置列表
    async function loadConfigs() {
        try {
            const response = await fetch(API_BASE + '/api/llm-configs');
            if (!response.ok) {
                throw new Error('获取配置列表失败');
            }

            const data = await response.json();
            configs = data.configs || [];
            // 找到默认配置作为当前配置
            const defaultConfig = configs.find(c => c.is_default);
            currentConfigId = defaultConfig ? defaultConfig.id : null;

            renderConfigList();
        } catch (error) {
            console.error('加载配置失败:', error);
            configList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <div class="empty-state-text">加载配置失败</div>
                    <div class="empty-state-hint">${error.message}</div>
                </div>
            `;
        }
    }

    // 渲染配置列表
    function renderConfigList() {
        if (configs.length === 0) {
            configList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <div class="empty-state-text">暂无配置</div>
                    <div class="empty-state-hint">点击右上角按钮添加第一个配置</div>
                </div>
            `;
            return;
        }

        configList.innerHTML = configs.map(config => {
            const isActive = config.id === currentConfigId;
            const isDefault = config.is_default;

            return `
                <div class="config-item ${isActive ? 'active' : ''} ${isDefault ? 'default' : ''}" data-id="${config.id}">
                    <div class="config-icon">🤖</div>
                    <div class="config-info">
                        <div class="config-name">
                            ${escapeHtml(config.name)}
                            ${isDefault ? '<span class="badge default">默认</span>' : ''}
                        </div>
                        <div class="config-meta">
                            ${escapeHtml(config.model)} · ${escapeHtml(config.base_url)}
                        </div>
                    </div>
                    <div class="config-actions">
                        <button class="btn-icon-action edit" onclick="editConfig('${config.id}')" title="编辑">
                            ✏️
                        </button>
                        <button class="btn-icon-action delete" onclick="deleteConfig('${config.id}')" title="删除">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // 绑定点击事件 - 点击进入编辑模式
        configList.querySelectorAll('.config-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.config-actions')) return;
                const id = item.dataset.id;
                editConfig(id);
            });
        });
    }

    // 显示表单
    function showForm(isEdit = false) {
        formTitle.textContent = isEdit ? '编辑配置' : '新增配置';
        configFormSection.style.display = 'block';
        testResult.innerHTML = '';
        errorArea.innerHTML = '';

        if (!isEdit) {
            configForm.reset();
            document.getElementById('configId').value = '';
            editingConfigId = null;
        }
    }

    // 隐藏表单
    function hideForm() {
        configFormSection.style.display = 'none';
        configForm.reset();
        editingConfigId = null;
        testResult.innerHTML = '';
    }

    // 新增配置
    addConfigBtn.addEventListener('click', () => {
        showForm(false);
    });

    // 关闭表单
    closeFormBtn.addEventListener('click', hideForm);

    // 切换API Key显示
    toggleApiKeyBtn.addEventListener('click', () => {
        const apiKeyInput = document.getElementById('apiKey');
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleApiKeyBtn.textContent = '🙈';
        } else {
            apiKeyInput.type = 'password';
            toggleApiKeyBtn.textContent = '👁️';
        }
    });

    // 编辑配置
    window.editConfig = function(id) {
        const config = configs.find(c => c.id === id);
        if (!config) return;

        editingConfigId = id;
        document.getElementById('configId').value = id;
        document.getElementById('configName').value = config.name;
        document.getElementById('baseUrl').value = config.base_url;
        document.getElementById('apiKey').value = '********'; // 不显示真实密钥
        document.getElementById('modelName').value = config.model;
        document.getElementById('isDefault').checked = config.is_default;

        showForm(true);
    };

    // 删除配置
    window.deleteConfig = async function(id) {
        const config = configs.find(c => c.id === id);
        if (!config) return;

        if (!confirm(`确定要删除配置 "${config.name}" 吗？`)) {
            return;
        }

        try {
            const response = await fetch(API_BASE + `/api/llm-configs/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || '删除失败');
            }

            // 如果删除的是当前选中的配置，清除当前配置
            if (id === currentConfigId) {
                currentConfigId = null;
            }

            await loadConfigs();

            // 显示成功提示
            errorArea.innerHTML = '<div class="success-message">✓ 配置已删除</div>';
            setTimeout(() => {
                errorArea.innerHTML = '';
            }, 3000);

        } catch (error) {
            console.error('删除配置失败:', error);
            errorArea.innerHTML = `<div class="error">删除失败: ${error.message}</div>`;
        }
    };

    // 测试配置
    testConfigBtn.addEventListener('click', async () => {
        const baseUrl = document.getElementById('baseUrl').value.trim();
        const apiKey = document.getElementById('apiKey').value.trim();
        const modelName = document.getElementById('modelName').value.trim();

        if (!baseUrl || !apiKey || !modelName) {
            testResult.innerHTML = '<div class="test-result error">请填写完整的配置信息</div>';
            return;
        }

        testResult.innerHTML = '<div class="test-result loading"><span class="spinner"></span> 测试中...</div>';
        testConfigBtn.disabled = true;

        try {
            // 使用带ID的测试接口，如果是编辑模式使用当前配置ID，否则用临时测试
            const testUrl = editingConfigId
                ? API_BASE + `/api/llm-configs/${editingConfigId}/test`
                : API_BASE + '/api/llm-configs/test';

            const response = await fetch(testUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    base_url: baseUrl,
                    api_key: apiKey,
                    model: modelName
                })
            });

            const data = await response.json();

            if (response.ok && data.available) {
                testResult.innerHTML = `<div class="test-result success">✓ 连接成功${data.message ? ': ' + data.message : ''}</div>`;
            } else {
                throw new Error(data.detail || data.error || '测试失败');
            }
        } catch (error) {
            testResult.innerHTML = `<div class="test-result error">✗ 连接失败: ${error.message}</div>`;
        } finally {
            testConfigBtn.disabled = false;
        }
    });

    // 保存配置
    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const configData = {
            name: document.getElementById('configName').value.trim(),
            base_url: document.getElementById('baseUrl').value.trim(),
            api_key: document.getElementById('apiKey').value.trim(),
            model: document.getElementById('modelName').value.trim(),
            is_default: document.getElementById('isDefault').checked
        };

        // 编辑时如果密钥是占位符，不提交
        if (editingConfigId && configData.api_key === '********') {
            delete configData.api_key;
        }

        try {
            let response;
            if (editingConfigId) {
                // 更新配置
                response = await fetch(API_BASE + `/api/llm-configs/${editingConfigId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(configData)
                });
            } else {
                // 新增配置
                response = await fetch(API_BASE + '/api/llm-configs', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(configData)
                });
            }

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || '保存失败');
            }

            await loadConfigs();
            hideForm();

            errorArea.innerHTML = `<div class="success-message">✓ 配置已${editingConfigId ? '更新' : '添加'}</div>`;
            setTimeout(() => {
                errorArea.innerHTML = '';
            }, 3000);

        } catch (error) {
            console.error('保存配置失败:', error);
            errorArea.innerHTML = `<div class="error">保存失败: ${error.message}</div>`;
        }
    });

    // HTML转义
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 初始化
    loadConfigs();
});
