/**
 * 大湾鸡 (Dawanji) 主应用入口
 * 协调各模块，管理整体应用流程
 */

import { WebSocketManager } from './websocket-manager.js';
import { AudioProcessor } from './audio-processor.js';
import { SpeechSynthesizer } from './speech-synthesizer.js';
import { UIController } from './ui-controller.js';
import { debugLog } from './utils.js';

/**
 * 大湾鸡应用主类
 * 负责初始化和协调各个模块
 */
class DawanjiApp {
    constructor() {
        // 模块实例
        this.wsManager = null;
        this.audioProcessor = null;
        this.synthesizer = null;
        this.uiController = null;

        // 应用状态
        this.isRecording = false;
        this.isPushToTalkActive = false;
        this.pressTimer = null;
    }

    /**
     * 初始化应用
     */
    async init() {
        debugLog('App', '🚀 正在初始化大湾鸡应用...');

        try {
            // 1. 初始化语音合成器
            this.synthesizer = new SpeechSynthesizer();
            await this.synthesizer.preloadVoices();

            // 2. 初始化 UI 控制器
            this.uiController = new UIController({
                synthesizer: this.synthesizer
            });

            // 3. 初始化 WebSocket 管理器
            this.wsManager = new WebSocketManager(
                (msg) => this.handleWebSocketMessage(msg),
                (status) => this.handleStatusChange(status)
            );
            this.wsManager.connect();

            // 4. 初始化音频处理器
            this.audioProcessor = new AudioProcessor(this.wsManager);

            // 5. 绑定语音按钮事件
            this.bindVoiceButtonEvents();

            // 6. 显示欢迎信息
            this.uiController.showWelcomeMessage();

            // 7. 启动随机说话
            this.uiController.startRandomSpeaking();

            debugLog('App', '✅ 大湾鸡应用初始化完成');
        } catch (error) {
            debugLog('App', '❌ 应用初始化失败:', error);
        }
    }

    /**
     * 处理 WebSocket 消息
     * @param {Object} msg - 消息对象
     */
    handleWebSocketMessage(msg) {
        debugLog('App', '📥 处理 WebSocket 消息:', msg.type);

        if (msg.type === 'user') {
            // 用户消息
            this.uiController.addChatMessage('user', msg.text);
            this.uiController.updateLastInteraction();
        } else if (msg.type === 'assistant') {
            // AI 回复
            this.uiController.addChatMessage('assistant', msg.text);
            this.uiController.updateLastInteraction();

            // 播放语音
            if (msg.audio) {
                AudioProcessor.playAudioFromBase64(msg.audio);
            }
        }
    }

    /**
     * 处理连接状态变化
     * @param {string} status - 连接状态
     */
    handleStatusChange(status) {
        debugLog('App', '📡 连接状态变化:', status);
        this.uiController.updateASRStatus(status);
    }

    /**
     * 绑定语音按钮事件
     */
    bindVoiceButtonEvents() {
        const voiceBtn = document.getElementById('voice-btn');

        // 鼠标事件
        voiceBtn.addEventListener('mousedown', (e) => this.handleVoiceButtonDown(e));
        voiceBtn.addEventListener('mouseup', () => this.handleVoiceButtonUp());
        voiceBtn.addEventListener('mouseleave', () => this.handleVoiceButtonLeave());

        // 触摸事件
        voiceBtn.addEventListener('touchstart', (e) => this.handleVoiceButtonDown(e));
        voiceBtn.addEventListener('touchend', (e) => this.handleVoiceButtonUp(e));
    }

    /**
     * 按下语音按钮
     * @param {Event} e - 事件对象
     */
    async handleVoiceButtonDown(e) {
        if (e) e.preventDefault();

        this.uiController.updateLastInteraction();

        // 长按启动录音
        this.pressTimer = setTimeout(async () => {
            if (!this.audioProcessor.audioContext) {
                await this.audioProcessor.initMicrophone();
            }

            await this.audioProcessor.startRecording();
            this.isRecording = true;
            this.isPushToTalkActive = true;

            this.uiController.updateVoiceButton(true);
            debugLog('App', '🔴 开始录音');
        }, 300);
    }

    /**
     * 松开语音按钮
     */
    handleVoiceButtonUp() {
        if (this.pressTimer) {
            clearTimeout(this.pressTimer);
            this.pressTimer = null;
        }

        if (this.isPushToTalkActive) {
            this.stopRecording();
        } else {
            // 短按，说话
            this.uiController.updateLastInteraction();
            this.uiController.chickenSaySomething();
        }
    }

    /**
     * 鼠标离开语音按钮
     */
    handleVoiceButtonLeave() {
        if (this.pressTimer) {
            clearTimeout(this.pressTimer);
            this.pressTimer = null;
        }

        if (this.isPushToTalkActive) {
            this.stopRecording();
        }
    }

    /**
     * 停止录音
     */
    stopRecording() {
        this.audioProcessor.stopRecording();
        this.isRecording = false;
        this.isPushToTalkActive = false;
        this.uiController.updateVoiceButton(false);
        debugLog('App', '⏹ 停止录音');
    }

    /**
     * 清理资源
     */
    dispose() {
        if (this.audioProcessor) {
            this.audioProcessor.dispose();
        }
        if (this.wsManager) {
            this.wsManager.close();
        }
        debugLog('App', '🗑 应用资源已释放');
    }
}

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
    const app = new DawanjiApp();
    app.init();

    // 页面卸载时清理资源
    window.addEventListener('beforeunload', () => {
        app.dispose();
    });
});
