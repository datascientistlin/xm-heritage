document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const chickenImg = document.getElementById('chicken-img');
    const talkBtn = document.getElementById('talk-btn');
    const animateBtn = document.getElementById('animate-btn');
    const switchViewBtn = document.getElementById('switch-view-btn');
    const speechText = document.getElementById('speech-text');
    const speechBubble = document.getElementById('speech-bubble');

    // 大湾鸡图片数组
    const chickenViews = [
        'assets/images/Front.jpeg',
        'assets/images/Back.jpeg',
        'assets/images/Side.jpeg'
    ];

    // 当前显示的图片索引
    let currentViewIndex = 0;

    // WebSocket connection
    let ws;
    let isRecording = false;

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

    // 让大湾鸡说话
    function chickenSaySomething() {
        const randomIndex = Math.floor(Math.random() * chickenResponses.length);
        const response = chickenResponses[randomIndex];
        speak(response);
    }

    // 切换大湾鸡视图
    function switchChickenView() {
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

    // 点击大湾鸡图片的交互
    chickenImg.addEventListener('click', function() {
        playAnimation();
    });

    // 触摸事件（移动端优化）
    chickenImg.addEventListener('touchstart', function(e) {
        e.preventDefault(); // 防止默认的触摸行为
        playAnimation();
    });

    // 按钮事件监听器
    talkBtn.addEventListener('click', chickenSaySomething);

    animateBtn.addEventListener('click', playAnimation);

    switchViewBtn.addEventListener('click', switchChickenView);

    // 初始化加载第一张图片
    chickenImg.onload = function() {
        chickenImg.style.opacity = '1';
    };

    // 页面加载时说一句欢迎语
    setTimeout(() => {
        speak("你好！我是大湾鸡，很高兴见到你！");
    }, 1000);

    // 定期随机说话（每30秒一次，增加趣味性）
    setInterval(() => {
        // 只有在没有其他语音正在播放时才说话
        if (!speechSynthesis.speaking) {
            const randomChance = Math.random();
            if (randomChance > 0.7) { // 30%概率说话
                chickenSaySomething();
            }
        }
    }, 30000);

    function connectConversationWS() {
        // For testing purposes, we'll connect to the WebSocket server on localhost:3001
        // Note: In a production environment, you might want to use a relative URL
        ws = new WebSocket("ws://localhost:3001");

        ws.onopen = () => {
            console.log("🎤 Conversation WS connected");
        };

        ws.onmessage = e => {
            const msg = JSON.parse(e.data);
            console.log('Received WebSocket message:', msg);

            if (msg.type === "user") {
                console.log('Adding user message to chat:', msg.text);
                addChat("user", msg.text);  // 添加用户消息到聊天窗口
            } else if (msg.type === "assistant") {
                console.log('Adding assistant message to chat:', msg.text);
                addChat("assistant", msg.text);
                playAudioFromBase64(msg.audio);
            }
        };

        ws.onclose = () => {
            console.log("Connection lost, reconnecting...");
            setTimeout(connectConversationWS, 3000);
        };

        ws.onerror = (err) => {
            console.error("WS error:", err);
        };
    }

    connectConversationWS();

    // Microphone capture
    let audioContext;
    let processor;
    let inputStream;

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

    // Push-to-talk button
    const micBtn = document.getElementById("mic-btn");

    micBtn.addEventListener("mousedown", async () => {
        if (!audioContext) await startMic();
        isRecording = true;
        micBtn.textContent = "🎤 松开结束";
    });

    micBtn.addEventListener("mouseup", () => {
        isRecording = false;
        micBtn.textContent = "🎤 按住和大湾鸡说话";
        // 当松开按钮时，发送一个小延迟以确保最后的音频数据被发送
        setTimeout(() => {
            // 可以发送一个心跳信号以表示用户交互完成
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'user_done_speaking' }));
            }
        }, 100);
    });

    // 添加鼠标离开按钮区域的处理（以防用户拖拽鼠标离开按钮区域后松开）
    micBtn.addEventListener("mouseleave", () => {
        if (isRecording) {
            isRecording = false;
            micBtn.textContent = "🎤 按住和大湾鸡说话";
            // 当鼠标离开按钮时，发送一个小延迟以确保最后的音频数据被发送
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'user_done_speaking' }));
                }
            }, 100);
        }
    });

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