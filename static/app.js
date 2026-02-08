// 等待页面加载完成
document.addEventListener('DOMContentLoaded', function() {
    console.log('页面加载完成，初始化录音功能...');
    
    const recordBtn = document.getElementById('recordBtn');
    const recordingArea = document.getElementById('recordingArea');
    const recordingStatus = document.getElementById('recordingStatus');
    const copyBtn = document.getElementById('copyBtn');
    const errorArea = document.getElementById('errorArea');
    
    // 检查元素是否存在
    if (!recordBtn) {
        console.error('无法找到录音按钮元素');
        errorArea.innerHTML = '<div class="error">页面初始化失败，请刷新页面重试</div>';
        return;
    }
    
    console.log('所有元素已找到，开始绑定事件');
    
    let isRecording = false;
    let isProcessing = false; // 添加处理状态标志
    
    // 录音相关变量
    let mediaRecorder = null;
    let audioChunks = [];
    let currentStream = null;
    
    // 录音按钮点击事件（开始/停止切换）
    recordBtn.addEventListener('click', async () => {
        // 防止重复点击
        if (isProcessing) {
            return;
        }
        
        if (!isRecording) {
            // 开始录音
            console.log('开始录音按钮被点击');
            isProcessing = true;
            recordBtn.disabled = true;
            
            try {
                // 请求麦克风权限
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
                
                // 创建 MediaRecorder
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
                    
                    // 停止所有音频轨道
                    if (currentStream) {
                        currentStream.getTracks().forEach(track => track.stop());
                        currentStream = null;
                    }
                };
                
                mediaRecorder.onerror = (event) => {
                    console.error('MediaRecorder 错误:', event.error);
                    errorArea.innerHTML = `<div class="error">录音错误: ${event.error.message}</div>`;
                };
                
                // 开始录音
                mediaRecorder.start();
                console.log('MediaRecorder 已开始');
                isRecording = true;
                isProcessing = false;
                
                // 更新UI
                recordBtn.textContent = '⏹️ 停止录音';
                recordBtn.classList.remove('btn-record');
                recordBtn.classList.add('btn-stop');
                recordBtn.disabled = false;
                recordingArea.classList.add('recording');
                recordingStatus.textContent = '';
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
                
                // 更新UI
                recordBtn.textContent = '🎤 开始录音';
                recordBtn.classList.remove('btn-stop');
                recordBtn.classList.add('btn-record');
                recordingArea.classList.remove('recording');
                recordingStatus.textContent = '正在识别中，请稍候...';
            }
        }
    });
    
    // 识别音频
    async function recognizeAudio(audioBlob, mimeType = 'audio/webm') {
        try {
            recordingStatus.textContent = '⏳ 正在识别中，请稍候...';
            
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
            
            const response = await fetch('/recognize', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                const recognizedText = data.text || '未识别到内容';
                recordingStatus.textContent = recognizedText;
                copyBtn.disabled = false;
                
                // 滚动到结果区域
                recordingStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                throw new Error(data.detail || '识别失败');
            }
        } catch (error) {
            errorArea.innerHTML = `<div class="error">❌ 识别错误: ${error.message}</div>`;
            recordingStatus.textContent = '识别失败，请重试';
            copyBtn.disabled = true;
        } finally {
            isProcessing = false;
            recordBtn.disabled = false;
        }
    }
    
    // 复制文字功能
    copyBtn.addEventListener('click', async () => {
        if (copyBtn.disabled) {
            return;
        }
        
        const text = recordingStatus.textContent;
        if (text && !text.includes('正在识别') && !text.includes('识别失败')) {
            try {
                await navigator.clipboard.writeText(text);
                copyBtn.textContent = '✓ 已复制';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = '📋 复制文字';
                    copyBtn.classList.remove('copied');
                }, 2000);
            } catch (error) {
                console.error('复制失败:', error);
                // 降级方案：使用传统方法
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    copyBtn.textContent = '✓ 已复制';
                    setTimeout(() => {
                        copyBtn.textContent = '📋 复制文字';
                    }, 2000);
                } catch (err) {
                    errorArea.innerHTML = '<div class="error">复制失败，请手动选择文字复制</div>';
                }
                document.body.removeChild(textArea);
            }
        }
    });
    
    console.log('录音功能初始化完成');
});
