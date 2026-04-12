/**
 * UI 控制器模块
 * 处理界面交互、动画和小讲解员的显示
 */

import {
    GUIDE_CONFIG,
    GUIDE_RESPONSES,
    SPORTS_LIST,
    RANDOM_SPEAK_INTERVAL,
    RANDOM_SPEAK_THRESHOLD,
    RANDOM_SPEAK_CHANCE,
    debugLog,
    getRandomItem
} from './utils.js';

/**
 * UI 控制器类
 * 管理用户界面交互和小讲解员动画
 */
export class UIController {
    /**
     * @param {Object} dependencies - 依赖的模块
     * @param {SpeechSynthesizer} dependencies.synthesizer - 语音合成器
     * @param {Function} [dependencies.onInteraction] - 用户交互回调
     * @param {Function} [dependencies.isAppActive] - 检查应用是否处于活动状态
     */
    constructor({ synthesizer, onInteraction, isAppActive }) {
        this.synthesizer = synthesizer;
        this.onInteraction = onInteraction || (() => {});
        this.isAppActive = isAppActive || (() => true);

        // DOM 元素引用
        this.elements = {
            guideImg: document.getElementById('chicken-img'),
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
        this.randomSpeakInterval = null; // 存储随机说话 interval ID

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
        const { guideImg, voiceBtn } = this.elements;

        // 点击小讲解员图片
        guideImg.addEventListener('click', () => {
            this.onInteraction();
            this.updateLastInteraction();
            this.interactWithWorks();
        });

        // 触摸小讲解员图片（移动端）
        guideImg.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onInteraction();
            this.updateLastInteraction();
            this.interactWithWorks();
        });
    }

    /**
     * 预加载小讲解员图片
     */
    preloadImages() {
        GUIDE_CONFIG.VIEWS.forEach(src => {
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
     * 重置最后交互时间（用于进入主应用时）
     */
    resetLastInteractionTime() {
        this.lastInteractionTime = Date.now();
    }

    /**
     * 检查是否可以随机说话（基于用户无操作时间）
     * @returns {boolean}
     */
    canSpeakRandomly() {
        const now = Date.now();
        const timeSinceLastInteraction = now - this.lastInteractionTime;
        return timeSinceLastInteraction > RANDOM_SPEAK_THRESHOLD;
    }

    /**
     * 让小讲解员说随机话语（不重置任何计时器）
     */
    guideSpeak() {
        // 不调用 updateLastInteraction() - 随机说话不重置用户交互计时器
        const response = getRandomItem(GUIDE_RESPONSES);
        this.updateSpeechBubble(response);
        this.synthesizer.speak(response);

        // 5秒后重置文字
        setTimeout(() => {
            this.resetSpeechBubble();
            debugLog('UI', '🔄 随机话语说完后重置文字');
        }, 5000);
    }

    /**
     * 播放随机动画
     */
    playAnimation() {
        this.updateLastInteraction();
        const { guideImg } = this.elements;

        // 随机选择动画
        const randomAnimation = getRandomItem(this.animations);

        // 移除所有动画
        this.animations.forEach(anim => {
            guideImg.classList.remove(anim);
        });

        // 添加新动画
        guideImg.classList.add(randomAnimation);

        // 2秒后移除动画
        setTimeout(() => {
            guideImg.classList.remove(randomAnimation);
        }, 2000);

        const response = '你看厦门非遗多美啊！';
        this.updateSpeechBubble(response);
        this.synthesizer.speak(response);

        // 5秒后重置文字
        setTimeout(() => {
            this.resetSpeechBubble();
            debugLog('UI', '🔄 动画说完后重置文字');
        }, 5000);
    }

    /**
     * 作品欣赏交互
     */
    interactWithWorks() {
        // 动态获取 works 目录中的图片
        const validWorks = SPORTS_LIST.filter(s => s.trim() !== '');
        const work = getRandomItem(validWorks);
        const speechText = `这是厦门非遗${work}，它很漂亮吧！`;

        // 显示作品图片
        this.showWorkImage(work);

        // 只更新对话气泡，不添加到聊天记录
        this.updateSpeechBubble(speechText);

        this.synthesizer.speak(speechText);
    }

    /**
     * 显示作品图片
     * @param {string} workName - 作品名称（不含扩展名）
     */
    showWorkImage(workName) {
        const { guideImg } = this.elements;
        // works目录中的图片已经是中文名，直接使用
        const imagePath = `${GUIDE_CONFIG.WORKS_DIR}${workName}.jpg`;

        guideImg.src = imagePath;

        debugLog('UI', '🎨 显示作品图片:', imagePath);

        // 5秒后恢复原图
        setTimeout(() => {
            guideImg.src = GUIDE_CONFIG.ORIGINAL_SRC;
            this.resetSpeechBubble();
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
     * 重置对话气泡为默认文本
     */
    resetSpeechBubble() {
        const { speechText } = this.elements;
        speechText.textContent = '你好！我是厦门非遗小讲解员，很高兴见到你！';
        debugLog('UI', '💭 重置对话气泡');
    }

    /**
     * 清空聊天记录
     */
    clearChatLog() {
        const { chatLog } = this.elements;
        chatLog.innerHTML = '';
        debugLog('UI', '🗑️ 清空聊天记录');
    }

    /**
     * 重置所有UI状态（进入主界面时调用）
     */
    resetUIState() {
        this.resetSpeechBubble();
        this.clearChatLog();
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
     * 只有在应用处于活动状态、用户无操作超过阈值时才触发
     */
    startRandomSpeaking() {
        // 清除已存在的 interval，防止重复创建
        if (this.randomSpeakInterval) {
            clearInterval(this.randomSpeakInterval);
        }

        this.randomSpeakInterval = setInterval(() => {
            // 检查：应用处于活动状态 AND 未在说话 AND 用户无操作时间超过阈值
            if (this.isAppActive() && !this.synthesizer.isCurrentlySpeaking() && this.canSpeakRandomly()) {
                this.guideSpeak();
            }
        }, RANDOM_SPEAK_INTERVAL);
    }

    /**
     * 显示欢迎语
     */
    showWelcomeMessage() {
        setTimeout(() => {
            // 欢迎语是自动播放的，不应重置用户交互计时器
            const welcomeText = '你好！我是厦门非遗小讲解员，很高兴见到你！';
            this.updateSpeechBubble(welcomeText);
            this.synthesizer.speak(welcomeText);
        }, 1000);
    }
}
