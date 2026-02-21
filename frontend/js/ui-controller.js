/**
 * UI 控制器模块
 * 处理界面交互、动画和大湾鸡角色的显示
 */

import {
    CHICKEN_CONFIG,
    CHICKEN_RESPONSES,
    SPORTS_LIST,
    RANDOM_SPEAK_THRESHOLD,
    RANDOM_SPEAK_CHANCE,
    debugLog,
    getRandomItem
} from './utils.js';

/**
 * UI 控制器类
 * 管理用户界面交互和大湾鸡角色动画
 */
export class UIController {
    /**
     * @param {Object} dependencies - 依赖的模块
     * @param {SpeechSynthesizer} dependencies.synthesizer - 语音合成器
     */
    constructor({ synthesizer }) {
        this.synthesizer = synthesizer;

        // DOM 元素引用
        this.elements = {
            chickenImg: document.getElementById('chicken-img'),
            voiceBtn: document.getElementById('voice-btn'),
            speechText: document.getElementById('speech-text'),
            speechBubble: document.getElementById('speech-bubble'),
            asrStatusIndicator: document.getElementById('asr-status-indicator'),
            asrStatusText: document.getElementById('asr-status-text'),
            chatLog: document.getElementById('chat-log'),
            voiceBtnText: document.getElementById('voice-btn-text')
        };

        // 状态变量
        this.currentViewIndex = 0;
        this.lastInteractionTime = Date.now();

        // 可用的动画列表
        this.animations = ['bounce', 'wiggle', 'eye-blink', 'talk-animation'];

        this.init();
    }

    /**
     * 初始化 UI 控制器
     */
    init() {
        this.bindEvents();
        this.preloadImages();
        debugLog('UI', '✅ UI 控制器已初始化');
    }

    /**
     * 绑定事件处理器
     */
    bindEvents() {
        const { chickenImg, voiceBtn } = this.elements;

        // 点击大湾鸡图片
        chickenImg.addEventListener('click', () => {
            this.updateLastInteraction();
            this.interactWithSports();
        });

        // 触摸大湾鸡图片（移动端）
        chickenImg.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.updateLastInteraction();
            this.interactWithSports();
        });
    }

    /**
     * 预加载大湾鸡图片
     */
    preloadImages() {
        CHICKEN_CONFIG.VIEWS.forEach(src => {
            const img = new Image();
            img.src = src;
        });
        debugLog('UI', '📷 图片预加载完成');
    }

    /**
     * 更新最后交互时间
     */
    updateLastInteraction() {
        this.lastInteractionTime = Date.now();
    }

    /**
     * 检查是否可以随机说话
     * @returns {boolean}
     */
    canSpeakRandomly() {
        const now = Date.now();
        const timeSinceLastInteraction = now - this.lastInteractionTime;
        return timeSinceLastInteraction > RANDOM_SPEAK_THRESHOLD;
    }

    /**
     * 让大湾鸡说随机话语
     */
    chickenSaySomething() {
        this.updateLastInteraction();
        const response = getRandomItem(CHICKEN_RESPONSES);
        this.updateSpeechBubble(response);
        this.synthesizer.speak(response);
    }

    /**
     * 切换大湾鸡视图（正面/背面/侧面）
     */
    switchChickenView() {
        this.updateLastInteraction();
        this.currentViewIndex = (this.currentViewIndex + 1) % CHICKEN_CONFIG.VIEWS.length;

        const { chickenImg } = this.elements;
        chickenImg.src = CHICKEN_CONFIG.VIEWS[this.currentViewIndex];

        // 淡入效果
        chickenImg.style.opacity = '0';
        setTimeout(() => {
            chickenImg.style.opacity = '1';
        }, 100);

        // 根据视图给出不同回应
        let response;
        switch (this.currentViewIndex) {
            case 0:
                response = '这是我的正面照，好看吗？';
                break;
            case 1:
                response = '这是我的背面，你觉得像什么？';
                break;
            case 2:
                response = '这是我的侧面，是不是很可爱？';
                break;
            default:
                response = getRandomItem(CHICKEN_RESPONSES);
        }

        this.updateSpeechBubble(response);
        this.synthesizer.speak(response);
    }

    /**
     * 播放随机动画
     */
    playAnimation() {
        this.updateLastInteraction();
        const { chickenImg } = this.elements;

        // 随机选择动画
        const randomAnimation = getRandomItem(this.animations);

        // 移除所有动画
        this.animations.forEach(anim => {
            chickenImg.classList.remove(anim);
        });

        // 添加新动画
        chickenImg.classList.add(randomAnimation);

        // 2秒后移除动画
        setTimeout(() => {
            chickenImg.classList.remove(randomAnimation);
        }, 2000);

        const response = '你看我厉害吗？';
        this.updateSpeechBubble(response);
        this.synthesizer.speak(response);
    }

    /**
     * 体育图片交互
     */
    interactWithSports() {
        // 过滤掉空字符串
        const validSports = SPORTS_LIST.filter(s => s.trim() !== '');
        const sport = getRandomItem(validSports);
        const speechText = `我会${sport}，你可以吗？`;

        // 显示运动图片
        this.showSportsImage(sport);

        // 只更新对话气泡，不添加到聊天记录
        this.updateSpeechBubble(speechText);

        this.synthesizer.speak(speechText);
    }

    /**
     * 显示体育图片
     * @param {string} sportName - 体育项目名称
     */
    showSportsImage(sportName) {
        const { chickenImg } = this.elements;
        // URL编码文件名，处理中文和特殊字符
        const encodedName = encodeURIComponent(sportName);
        chickenImg.src = `${CHICKEN_CONFIG.SPORTS_DIR}${encodedName}.png`;

        debugLog('UI', '🏃 显示运动图片:', `${CHICKEN_CONFIG.SPORTS_DIR}${encodedName}.png`);

        // 5秒后恢复原图
        setTimeout(() => {
            chickenImg.src = CHICKEN_CONFIG.ORIGINAL_SRC;
            debugLog('UI', '🔄 恢复原图');
        }, 5000);
    }

    /**
     * 更新 ASR 状态显示
     * @param {string} status - 状态 ('connected' | 'connecting' | 'disconnected')
     */
    updateASRStatus(status) {
        const { asrStatusIndicator, asrStatusText } = this.elements;

        // 移除所有状态类
        ['connected', 'connecting', 'disconnected'].forEach(cls => {
            asrStatusIndicator.classList.remove(cls);
        });

        // 添加当前状态类
        if (['connected', 'connecting', 'disconnected'].includes(status)) {
            asrStatusIndicator.classList.add(status);
        }

        // 状态文本映射
        const statusTexts = {
            'connected': '已连接',
            'connecting': '连接中...',
            'disconnected': '未连接'
        };

        asrStatusText.textContent = statusTexts[status] || '等待连接...';
    }

    /**
     * 添加聊天消息到聊天记录（不包括 speech-bubble）
     * @param {string} role - 角色 ('user' | 'assistant')
     * @param {string} text - 消息文本
     */
    addChatMessage(role, text) {
        const { chatLog } = this.elements;

        // 创建消息元素
        const p = document.createElement('p');
        p.className = role;
        p.textContent = text;
        chatLog.appendChild(p);

        // 滚动到底部
        chatLog.scrollTop = chatLog.scrollHeight;

        debugLog('UI', `💬 添加${role === 'user' ? '用户' : 'AI'}消息:`, text);
    }

    /**
     * 更新对话气泡
     * @param {string} text - 要显示的文本
     */
    updateSpeechBubble(text) {
        const { speechText } = this.elements;
        speechText.textContent = text;
        debugLog('UI', '💭 更新对话气泡:', text);
    }

    /**
     * 更新语音按钮状态
     * @param {boolean} isRecording - 是否正在录音
     */
    updateVoiceButton(isRecording) {
        const { voiceBtn, voiceBtnText } = this.elements;

        if (isRecording) {
            voiceBtn.classList.add('recording');
            voiceBtn.innerHTML = '🔴';
            voiceBtnText.textContent = '松开结束对话';
        } else {
            voiceBtn.classList.remove('recording');
            voiceBtn.innerHTML = '🎤';
            voiceBtnText.textContent = '按住说话';
        }
    }

    /**
     * 启动定期随机说话
     */
    startRandomSpeaking() {
        setInterval(() => {
            // 检查条件：未录音、可随机说话、未在说话
            if (!this.synthesizer.isCurrentlySpeaking() &&
                this.canSpeakRandomly() &&
                Math.random() > RANDOM_SPEAK_CHANCE) {
                this.chickenSaySomething();
            }
        }, RANDOM_SPEAK_THRESHOLD);
    }

    /**
     * 显示欢迎语
     */
    showWelcomeMessage() {
        setTimeout(() => {
            this.updateLastInteraction();
            const welcomeText = '你好！我是大湾鸡，很高兴见到你！';
            this.updateSpeechBubble(welcomeText);
            this.synthesizer.speak(welcomeText);
        }, 1000);
    }
}
