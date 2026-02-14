document.addEventListener('DOMContentLoaded', function() {
    console.log('页面加载完成，初始化录音功能...');

    const recordBtn = document.getElementById('recordBtn');
    const resultBox = document.getElementById('resultBox');
    const placeholder = document.getElementById('placeholder');
    const recordingStatus = document.getElementById('recordingStatus');
    const copyBtn = document.getElementById('copyBtn');
    const errorArea = document.getElementById('errorArea');

    // 新增元素
    const optimizeBtn = document.getElementById('optimizeBtn');
    const optimizeToggle = document.getElementById('optimizeToggle');
    const enableOptimize = document.getElementById('enableOptimize');
    const optimizeResult = document.getElementById('optimizeResult');
    const optimizeContent = document.getElementById('optimizeContent');
    const compareBtn = document.getElementById('compareBtn');
    const applyOptimizeBtn = document.getElementById('applyOptimizeBtn');
    const compareModal = document.getElementById('compareModal');
    const closeModal = document.getElementById('closeModal');
    const originalText = document.getElementById('originalText');
    const optimizedText = document.getElementById('optimizedText');

    if (!recordBtn) {
        console.error('无法找到录音按钮元素');
        errorArea.innerHTML = '<div class="error">页面初始化失败，请刷新页面重试</div>';
        return;
    }

    console.log('所有元素已找到，开始绑定事件');

    let isRecording = false;
    let isProcessing = false;
    let mediaRecorder = null;
    let audioChunks = [];
    let currentStream = null;
    let currentText = '';
    let optimizedTextValue = '';
    let hasLLMConfig = false;

    // 加载配置状态
    async function loadConfigStatus() {
        try {
            // 加载语音模型状态 - 使用 /api/models 接口
            const asrResponse = await fetch('/api/models');
            const asrStatus = document.querySelector('#asrModelStatus .status-value');
            if (asrResponse.ok) {
                const data = await asrResponse.json();
                if (data.current_model) {
                    asrStatus.textContent = data.current_model.charAt(0).toUpperCase() + data.current_model.slice(1);
                    asrStatus.className = 'status-value ready';
                } else {
                    asrStatus.textContent = '未选择';
                    asrStatus.className = 'status-value not-ready';
                }
            } else {
                asrStatus.textContent = '加载失败';
                asrStatus.className = 'status-value error';
            }

            // 加载文字模型状态 - 使用 /api/llm-status 接口
            const llmResponse = await fetch('/api/llm-status');
            const llmStatus = document.querySelector('#llmConfigStatus .status-value');
            if (llmResponse.ok) {
                const data = await llmResponse.json();
                if (data.enabled && data.current_config) {
                    llmStatus.textContent = data.current_config.name || '已配置';
                    llmStatus.className = 'status-value ready';
                    hasLLMConfig = true;
                    optimizeToggle.style.display = 'flex';
                } else {
                    llmStatus.textContent = '未配置';
                    llmStatus.className = 'status-value not-ready';
                    hasLLMConfig = false;
                    optimizeToggle.style.display = 'none';
                }
            } else {
                llmStatus.textContent = '未配置';
                llmStatus.className = 'status-value not-ready';
                hasLLMConfig = false;
                optimizeToggle.style.display = 'none';
            }
        } catch (error) {
            console.error('加载配置状态失败:', error);
        }
    }

    // 更新录音按钮状态
    function updateRecordBtn(recording) {
        if (recording) {
            recordBtn.innerHTML = '<span>⏹️</span><span>停止录音</span>';
            recordBtn.classList.remove('btn-record');
            recordBtn.classList.add('btn-stop');
        } else {
            recordBtn.innerHTML = '<span>🎙️</span><span>开始录音</span>';
            recordBtn.classList.remove('btn-stop');
            recordBtn.classList.add('btn-record');
        }
    }

    // 显示录音中状态
    function showRecordingState() {
        placeholder.style.display = 'none';
        recordingStatus.style.display = 'block';
        recordingStatus.innerHTML = `
            <div class="recording-indicator">
                <span class="pulse"></span>
                <span>正在录音...</span>
            </div>
        `;
        resultBox.classList.add('recording');
        resultBox.classList.remove('has-content');
        // 隐藏优化结果
        optimizeResult.style.display = 'none';
        optimizeBtn.style.display = 'none';
        optimizeBtn.disabled = true;
    }

    // 显示识别结果
    function showResult(text) {
        placeholder.style.display = 'none';
        recordingStatus.style.display = 'block';
        recordingStatus.textContent = text;
        resultBox.classList.remove('recording');
        resultBox.classList.add('has-content');
        currentText = text;

        // 如果有文字模型配置，显示优化按钮
        if (hasLLMConfig) {
            optimizeBtn.style.display = 'flex';
            optimizeBtn.disabled = false;
        }
    }

    // 显示加载状态
    function showLoading() {
        placeholder.style.display = 'none';
        recordingStatus.style.display = 'block';
        recordingStatus.innerHTML = `
            <div class="loading-spinner">
                <span class="spinner"></span>
                <span>正在识别中，请稍候...</span>
            </div>
        `;
        resultBox.classList.remove('recording');
    }

    // 显示优化加载状态
    function showOptimizeLoading() {
        optimizeResult.style.display = 'block';
        optimizeContent.innerHTML = `
            <div class="loading-spinner">
                <span class="spinner"></span>
                <span>正在优化文字...</span>
            </div>
        `;
        optimizeBtn.disabled = true;
    }

    // 显示优化结果
    function showOptimizeResult(text) {
        optimizeResult.style.display = 'block';
        optimizeContent.textContent = text;
        optimizedTextValue = text;
        optimizeBtn.disabled = false;
    }

    // 重置状态
    function resetState() {
        placeholder.style.display = 'block';
        recordingStatus.style.display = 'none';
        recordingStatus.textContent = '';
        resultBox.classList.remove('recording', 'has-content');
        optimizeResult.style.display = 'none';
        optimizeBtn.style.display = 'none';
        optimizeBtn.disabled = true;
        currentText = '';
        optimizedTextValue = '';
    }

    // 优化文字
    async function optimizeText() {
        if (!currentText || isProcessing) return;

        isProcessing = true;
        showOptimizeLoading();

        try {
            const response = await fetch('/api/optimize-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: currentText })
            });

            const data = await response.json();

            if (response.ok) {
                showOptimizeResult(data.optimized_text);
            } else {
                throw new Error(data.detail || '优化失败');
            }
        } catch (error) {
            console.error('优化失败:', error);
            optimizeContent.innerHTML = `<div class="error">优化失败: ${error.message}</div>`;
            optimizeBtn.disabled = false;
        } finally {
            isProcessing = false;
        }
    }

    // 应用优化结果
    function applyOptimize() {
        if (optimizedTextValue) {
            currentText = optimizedTextValue;
            recordingStatus.textContent = currentText;
            optimizeResult.style.display = 'none';

            // 显示成功提示
            errorArea.innerHTML = '<div class="success-message">✓ 已应用优化结果</div>';
            setTimeout(() => {
                errorArea.innerHTML = '';
            }, 3000);
        }
    }

    // 显示对比弹窗
    function showCompare() {
        originalText.textContent = currentText;
        optimizedText.textContent = optimizedTextValue;
        compareModal.style.display = 'flex';
    }

    // 隐藏对比弹窗
    function hideCompare() {
        compareModal.style.display = 'none';
    }

    recordBtn.addEventListener('click', async () => {
        if (isProcessing) return;

        if (!isRecording) {
            // 开始录音
            console.log('开始录音按钮被点击');
            isProcessing = true;
            recordBtn.disabled = true;

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });

                console.log('麦克风权限获取成功');
                currentStream = stream;

                // 检测支持的 MIME 类型
                let mimeType = 'audio/webm';
                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                    mimeType = 'audio/webm;codecs=opus';
                } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                    mimeType = 'audio/webm';
                } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    mimeType = 'audio/mp4';
                } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                    mimeType = 'audio/ogg';
                }

                console.log('使用 MIME 类型:', mimeType);

                mediaRecorder = new MediaRecorder(stream, {
                    mimeType: mimeType
                });

                audioChunks = [];

                mediaRecorder.ondataavailable = (event) => {
                    console.log('收到音频数据:', event.data.size, 'bytes');
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = async () => {
                    console.log('录音停止，开始识别');
                    const audioBlob = new Blob(audioChunks, { type: mimeType });
                    console.log('音频 Blob 大小:', audioBlob.size, 'bytes');
                    await recognizeAudio(audioBlob, mimeType);

                    if (currentStream) {
                        currentStream.getTracks().forEach(track => track.stop());
                        currentStream = null;
                    }
                };

                mediaRecorder.onerror = (event) => {
                    console.error('MediaRecorder 错误:', event.error);
                    errorArea.innerHTML = `<div class="error">录音错误: ${event.error.message}</div>`;
                };

                mediaRecorder.start();
                console.log('MediaRecorder 已开始');
                isRecording = true;
                isProcessing = false;

                updateRecordBtn(true);
                recordBtn.disabled = false;
                showRecordingState();
                copyBtn.disabled = true;
                errorArea.innerHTML = '';

            } catch (error) {
                console.error('录音错误:', error);
                errorArea.innerHTML = `<div class="error">无法访问麦克风: ${error.message}<br>请确保已授予麦克风权限</div>`;
                isRecording = false;
                isProcessing = false;
                recordBtn.disabled = false;
            }
        } else {
            // 停止录音
            console.log('停止录音按钮被点击');
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                isProcessing = true;
                recordBtn.disabled = true;
                mediaRecorder.stop();
                console.log('MediaRecorder 已停止');

                isRecording = false;
                updateRecordBtn(false);
                showLoading();
            }
        }
    });

    async function recognizeAudio(audioBlob, mimeType = 'audio/webm') {
        try {
            // 根据 MIME 类型确定文件扩展名
            let extension = '.webm';
            if (mimeType.includes('mp4')) {
                extension = '.m4a';
            } else if (mimeType.includes('ogg')) {
                extension = '.ogg';
            } else if (mimeType.includes('wav')) {
                extension = '.wav';
            }

            const formData = new FormData();
            formData.append('file', audioBlob, `recording${extension}`);

            // 如果开启了自动优化，添加参数
            if (enableOptimize.checked && hasLLMConfig) {
                formData.append('optimize', 'true');
            }

            const response = await fetch('/recognize', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                const recognizedText = data.text || '未识别到内容';
                showResult(recognizedText);
                copyBtn.disabled = false;
                recordingStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // 如果服务端已经优化，显示优化结果
                if (data.optimized_text) {
                    showOptimizeResult(data.optimized_text);
                }
            } else {
                throw new Error(data.detail || '识别失败');
            }
        } catch (error) {
            errorArea.innerHTML = `<div class="error">识别错误: ${error.message}</div>`;
            showResult('识别失败，请重试');
            copyBtn.disabled = true;
        } finally {
            isProcessing = false;
            recordBtn.disabled = false;
        }
    }

    copyBtn.addEventListener('click', async () => {
        if (copyBtn.disabled) return;

        // 优先复制优化后的文本，如果没有则复制原文本
        const text = optimizedTextValue || currentText || recordingStatus.textContent;
        if (text && !text.includes('正在识别') && !text.includes('识别失败')) {
            try {
                await navigator.clipboard.writeText(text);
                copyBtn.innerHTML = '<span>✓</span><span>已复制</span>';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.innerHTML = '<span>📋</span><span>复制文字</span>';
                    copyBtn.classList.remove('copied');
                }, 2000);
            } catch (error) {
                console.error('复制失败:', error);
                // 降级方案
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    copyBtn.innerHTML = '<span>✓</span><span>已复制</span>';
                    copyBtn.classList.add('copied');
                    setTimeout(() => {
                        copyBtn.innerHTML = '<span>📋</span><span>复制文字</span>';
                        copyBtn.classList.remove('copied');
                    }, 2000);
                } catch (err) {
                    errorArea.innerHTML = '<div class="error">复制失败，请手动选择文字复制</div>';
                }
                document.body.removeChild(textArea);
            }
        }
    });

    // 优化按钮事件
    optimizeBtn.addEventListener('click', optimizeText);

    // 应用优化按钮事件
    applyOptimizeBtn.addEventListener('click', applyOptimize);

    // 对比按钮事件
    compareBtn.addEventListener('click', showCompare);

    // 关闭弹窗事件
    closeModal.addEventListener('click', hideCompare);
    compareModal.addEventListener('click', (e) => {
        if (e.target === compareModal || e.target.classList.contains('modal-overlay')) {
            hideCompare();
        }
    });

    // 可编辑区域事件监听 - 同步编辑内容到变量
    recordingStatus.addEventListener('input', () => {
        currentText = recordingStatus.textContent;
    });

    optimizeContent.addEventListener('input', () => {
        optimizedTextValue = optimizeContent.textContent;
    });

    originalText.addEventListener('input', () => {
        currentText = originalText.textContent;
    });

    optimizedText.addEventListener('input', () => {
        optimizedTextValue = optimizedText.textContent;
    });

    // 初始化
    loadConfigStatus();

    console.log('录音功能初始化完成');
});
