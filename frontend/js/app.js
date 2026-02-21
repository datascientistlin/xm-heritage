document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const chickenImg = document.getElementById('chicken-img');
    const voiceInteractBtn = document.getElementById('voice-interact-btn');
    const speechText = document.getElementById('speech-text');
    const speechBubble = document.getElementById('speech-bubble');
    const asrStatusIndicator = document.getElementById('asr-status-indicator');
    const asrStatusText = document.getElementById('asr-status-text');

    // 大湾鸡图片数组
    const chickenViews = [
        'assets/images/Front.jpeg',
        'assets/images/Back.jpeg',
        'assets/images/Side.jpeg'
    ];

    // 当前显示的图片索引
    let currentViewIndex = 0;

    // 保存原始大湾鸡图片路径
    const originalChickenSrc = 'assets/images/Front.jpeg';

    // WebSocket connection
    let ws;
    let isRecording = false;
    let isPushToTalkActive = false; // Track push-to-talk state
    let audioContext;
    let processor;
    let inputStream;
    let pressTimer = null;

    // Track the last interaction time to prevent random speech during active conversation
    let lastInteractionTime = Date.now();

    // 预设的大湾鸡话语
    const chickenResponses = [
        "你好呀小朋友！",
        "我喜欢和你一起玩！",
        "今天天气真好呢！",
        "我们一起唱歌吧！",
        "咯咯咯~",
        "你今天开心吗？",
        "我可以陪你聊天哦！",
        "要不要听个故事？",
        "我最喜欢小朋友啦！",
        "我们做好朋友吧！"
    ];

    // 语音合成对象
    let speechSynthesis;
    let isSpeechSupported = true;
    const useQwenTTS = true; // 启用通义千问TTS

    const QWEN_CONFIG = {
        baseURL: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        model: 'qwen3-tts-flash',
        voice: 'Cherry',
        languageType: 'Chinese'
    };

    // 检查浏览器是否支持语音合成
    if ('speechSynthesis' in window) {
        speechSynthesis = window.speechSynthesis;
    } else {
        console.warn('浏览器不支持语音合成功能');
        isSpeechSupported = false;
    }

    // 通义千问TTS API函数
    async function speakWithQwenTTS(text) {
        try {
            console.log('🎵 正在调用通义千问TTS...', text);

            // 注意：以下是一个框架示例，实际使用时需要配置API密钥和端点
            const response = await fetch("http://localhost:3000/api/tts", {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text })
            });

            if (!response.ok) throw new Error("TTS failed");

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);

            const audio = new Audio(audioUrl);
            audio.play();

            speechText.textContent = text;
        } catch (e) {
            console.warn("后端 TTS 失败，回退 Web Speech API");
            speakFallback(text);
        }
    }

    // 原始Web Speech API函数（回退选项）
    function speakFallback(text) {
        if (!isSpeechSupported) {
            // 如果不支持语音，则仅在气泡中显示文本
            speechText.textContent = text;
            return;
        }

        // 停止任何正在进行的语音
        speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        // 设置语音参数（适合儿童的声音）
        utterance.rate = 0.9; // 稍慢一些，便于理解
        utterance.pitch = 1.2; // 稍高一些，更友善
        utterance.volume = 1;

        // 尝试找到中文语音
        const voices = speechSynthesis.getVoices();
        const chineseVoice = voices.find(voice =>
            voice.lang.includes('zh') ||
            voice.name.includes('Chinese') ||
            voice.name.includes('Ting-Ting') ||
            voice.name.includes('Mei-Jia')
        );

        if (chineseVoice) {
            utterance.voice = chineseVoice;
        }

        speechText.textContent = text;
        speechSynthesis.speak(utterance);
    }

    // 统一的说话函数
    function speak(text) {
        if (useQwenTTS) {
            // 使用通义千问TTS
            speakWithQwenTTS(text);
        } else {
            // 使用原始的Web Speech API
            speakFallback(text);
        }
    }

    // 更新最后交互时间
    function updateLastInteraction() {
        lastInteractionTime = Date.now();
    }

    // 检查是否可以随机说话
    function canSpeakRandomly() {
        const now = Date.now();
        const timeSinceLastInteraction = now - lastInteractionTime;
        // 只有在至少30秒没有交互的情况下才允许随机说话
        return timeSinceLastInteraction > 30000;
    }

    // 让大湾鸡说话
    function chickenSaySomething() {
        updateLastInteraction(); // 更新最后交互时间
        const randomIndex = Math.floor(Math.random() * chickenResponses.length);
        const response = chickenResponses[randomIndex];
        speak(response);
    }

    // 切换大湾鸡视图
    function switchChickenView() {
        updateLastInteraction(); // 更新最后交互时间
        currentViewIndex = (currentViewIndex + 1) % chickenViews.length;
        chickenImg.src = chickenViews[currentViewIndex];

        // 添加淡入淡出效果
        chickenImg.style.opacity = '0';
        setTimeout(() => {
            chickenImg.style.opacity = '1';
        }, 100);

        // 根据视图显示不同的回应
        let response;
        switch(currentViewIndex) {
            case 0:
                response = "这是我的正面照，好看吗？";
                break;
            case 1:
                response = "这是我的背面，你觉得像什么？";
                break;
            case 2:
                response = "这是我的侧面，是不是很可爱？";
                break;
            default:
                response = chickenResponses[Math.floor(Math.random() * chickenResponses.length)];
        }
        speak(response);
    }

    // 播放动画效果
    function playAnimation() {
        updateLastInteraction(); // 更新最后交互时间
        // 随机选择一种动画
        const animations = ['bounce', 'wiggle', 'eye-blink', 'talk-animation'];
        const randomAnimation = animations[Math.floor(Math.random() * animations.length)];

        // 移除之前的动画类
        animations.forEach(anim => {
            chickenImg.classList.remove(anim);
        });

        // 添加新动画
        chickenImg.classList.add(randomAnimation);

        // 在动画结束后移除类
        setTimeout(() => {
            chickenImg.classList.remove(randomAnimation);
        }, 2000);

        // 附带一句话
        speak("你看我厉害吗？");
    }

    // 点击大湾鸡图片的交互 - 显示体育图片并播放TTS
    chickenImg.addEventListener('click', function() {
        updateLastInteraction(); // 更新最后交互时间
        interactWithSports();
    });

    // 触摸事件（移动端优化）
    chickenImg.addEventListener('touchstart', function(e) {
        e.preventDefault(); // 防止默认的触摸行为
        updateLastInteraction(); // 更新最后交互时间
        interactWithSports();
    });

    // 体育图片交互功能
    function interactWithSports() {
        // 体育图片列表
        const sportsImages = [
            '举重', '乒乓球', '体操', '冲浪', '击剑', '垒球', '射击', '射箭',
            '帆船', '手球', '拳击', '排球', '摔跤', '攀岩', '曲棍球', '柔道',
            '棒球', '橄榄球', '武术套路', '武术散打', '水球', '游泳', '滑板',
            '现代五项', '田径', '皮划艇', '篮球', '网球', '羽毛球', '自行车',
            '艺术体操', '花样游泳', '赛艇', '足球', '跆拳道', '跳水', '蹦床',
            '铁人三项', '霹雳舞', '马拉松游泳', '马术', '高尔夫球'
        ];

        // 随机选择一个体育项目
        const randomSport = sportsImages[Math.floor(Math.random() * sportsImages.length)];

        // 显示体育图片
        showSportsImage(randomSport);

        // 播放TTS
        speak(`我会${randomSport}，你可以吗？`);
    }

    // 显示体育图片 - 直接替换大湾鸡图片
    function showSportsImage(sportName) {
        // 直接替换大湾鸡图片为体育图片
        chickenImg.src = `assets/images/Sports/${sportName}.png`;

        // 5秒后恢复显示大湾鸡正面图
        setTimeout(() => {
            chickenImg.src = originalChickenSrc;
        }, 5000);
    }

    // 更新ASR状态显示
    function updateASRStatus(status) {
        const statusClasses = {
            'connected': 'connected',
            'connecting': 'connecting',
            'disconnected': 'disconnected'
        };

        // 移除所有状态类
        Object.values(statusClasses).forEach(cls => {
            asrStatusIndicator.classList.remove(cls);
        });

        // 添加对应状态类
        if (status in statusClasses) {
            asrStatusIndicator.classList.add(statusClasses[status]);
        }

        // 更新文本
        const statusTexts = {
            'connected': '已连接',
            'connecting': '连接中...',
            'disconnected': '未连接'
        };

        asrStatusText.textContent = `状态：${statusTexts[status] || '未知'}`;
    }

    // 初始化连接状态为连接中
    updateASRStatus('connecting');

    // 连接到对话WebSocket
    function connectConversationWS() {
        // 对于测试目的，我们将连接到本地运行在端口3001上的WebSocket服务器
        // 注意：在生产环境中，您可能想要使用相对URL
        ws = new WebSocket("ws://localhost:3001");

        ws.onopen = () => {
            console.log("🎤 Conversation WS connected");
            updateASRStatus('connected'); // 连接成功时更新状态
        };

        ws.onmessage = e => {
            const msg = JSON.parse(e.data);
            console.log('Received WebSocket message:', msg);

            if (msg.type === "user") {
                console.log('Adding user message to chat:', msg.text);
                addChat("user", msg.text);  // 添加用户消息到聊天窗口
                updateLastInteraction(); // 收到用户消息时更新最后交互时间
            } else if (msg.type === "assistant") {
                console.log('Adding assistant message to chat:', msg.text);
                addChat("assistant", msg.text);
                playAudioFromBase64(msg.audio);
                updateLastInteraction(); // 收到助手消息时更新最后交互时间
            }
        };

        ws.onclose = () => {
            console.log("Connection lost, reconnecting...");
            updateASRStatus('disconnected'); // 断开连接时更新状态

            // 实现指数退避重连策略
            setTimeout(() => {
                console.log("Attempting to reconnect...");
                updateASRStatus('connecting'); // 更新状态为连接中
                connectConversationWS();
            }, 3000);
        };

        ws.onerror = (err) => {
            console.error("WS error:", err);
            updateASRStatus('disconnected'); // 错误时更新状态
        };
    }

    connectConversationWS();

    // Microphone capture
    async function startMic() {
        inputStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        audioContext = new AudioContext({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(inputStream);

        processor = audioContext.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(audioContext.destination);

        processor.onaudioprocess = e => {
            if (!isRecording || ws.readyState !== WebSocket.OPEN) return;

            const input = e.inputBuffer.getChannelData(0);
            const pcm = new Int16Array(input.length);

            for (let i = 0; i < input.length; i++) {
            pcm[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
            }

            ws.send(pcm.buffer);
            console.log('Sending audio chunk to WebSocket');
        };
    }

    // 语音互动按钮事件处理器
    voiceInteractBtn.addEventListener('mousedown', (e) => {
        updateLastInteraction(); // 更新最后交互时间
        // 首先设置一个定时器，如果按下超过阈值时间则认为是长按
        pressTimer = setTimeout(async () => {
            // 长按逻辑 - 启动录音
            if (!audioContext) await startMic();
            isRecording = true;
            isPushToTalkActive = true;
            voiceInteractBtn.innerHTML = '<span class="btn-icon">🎤</span> 松开结束';
            voiceInteractBtn.classList.add('recording');
        }, 300); // 300ms作为长按阈值
    });

    voiceInteractBtn.addEventListener('mouseup', () => {
        if (pressTimer) clearTimeout(pressTimer);

        if (isPushToTalkActive) {
            // 如果之前是长按时激活的录音
            isRecording = false;
            isPushToTalkActive = false;
            voiceInteractBtn.innerHTML = '<span class="btn-icon">🎤</span> 语音互动';
            voiceInteractBtn.classList.remove('recording');

            // 发送信号表示录音结束
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'user_done_speaking' }));
                }
            }, 100);
        } else {
            // 短按逻辑 - 直接让大湾鸡说话
            updateLastInteraction(); // 更新最后交互时间
            chickenSaySomething();
        }
    });

    // 添加鼠标离开按钮区域的处理（以防用户拖拽鼠标离开按钮区域后松开）
    voiceInteractBtn.addEventListener('mouseleave', () => {
        if (pressTimer) clearTimeout(pressTimer);

        if (isPushToTalkActive) {
            isRecording = false;
            isPushToTalkActive = false;
            voiceInteractBtn.innerHTML = '<span class="btn-icon">🎤</span> 语音互动';
            voiceInteractBtn.classList.remove('recording');

            // 发送信号表示录音结束
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'user_done_speaking' }));
                }
            }, 100);
        }
    });

    // 初始化加载第一张图片
    chickenImg.onload = function() {
        chickenImg.style.opacity = '1';
    };

    // 页面加载时说一句欢迎语
    setTimeout(() => {
        updateLastInteraction(); // 更新最后交互时间
        speak("你好！我是大湾鸡，很高兴见到你！");
    }, 1000);

    // 重写定期随机说话的逻辑
    setInterval(() => {
        // 只有在没有活动交互的情况下才随机说话
        if (!isRecording && canSpeakRandomly() && !speechSynthesis.speaking) {
            const randomChance = Math.random();
            if (randomChance > 0.7) { // 30%概率说话
                chickenSaySomething();
            }
        }
    }, 30000); // 每30秒检查一次是否可以随机说话

    // Chat UI Helpers
    const chatLog = document.getElementById("chat-log");

    function addChat(role, text) {
        const p = document.createElement("p");
        p.className = role;
        p.textContent = text;
        chatLog.appendChild(p);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    // Audio playback helper
    function playAudioFromBase64(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: "audio/wav" });
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
    }
});