/**
 * 厦门非遗展示应用入口
 * 协调各模块，管理整体应用流程
 */

import { WebSocketManager } from './websocket-manager.js';
import { AudioProcessor } from './audio-processor.js';
import { SpeechSynthesizer } from './speech-synthesizer.js';
import { UIController } from './ui-controller.js';
import { debugLog } from './utils.js';

/**
 * 厦门非遗展示应用主类
 * 负责初始化和协调各个模块
 */
class HeritageApp {
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
        this.isVideoPlaying = true;
        this.isAppActive = false;

        // 空闲超时设置（3分钟 = 180000ms）
        this.IDLE_TIMEOUT = 180000;
        this.idleTimer = null;
    }

    /**
     * 初始化应用 - 等待视频播放完成后初始化语音功能
     */
    async init() {
        debugLog('App', '🚀 正在初始化应用...');

        try {
            // 初始化语音合成器（提前初始化以便视频播放期间可以预加载）
            this.synthesizer = new SpeechSynthesizer();
            await this.synthesizer.preloadVoices();

            // 初始化 UI 控制器
            this.uiController = new UIController({
                synthesizer: this.synthesizer,
                onInteraction: () => this.recordUserInteraction(),
                isAppActive: () => this.isAppActive
            });

            // 初始化 WebSocket 管理器
            this.wsManager = new WebSocketManager(
                (msg) => this.handleWebSocketMessage(msg),
                (status) => this.handleStatusChange(status)
            );
            this.wsManager.connect();

            // 初始化音频处理器
            this.audioProcessor = new AudioProcessor(this.wsManager);

            // 绑定语音按钮事件
            this.bindVoiceButtonEvents();

            // 设置视频播放结束监听
            this.setupVideoEndedHandler();

            debugLog('App', '✅ 等待视频播放完成...');
        } catch (error) {
            debugLog('App', '❌ 应用初始化失败:', error);
        }
    }

    /**
     * 设置视频播放结束处理器
     */
    setupVideoEndedHandler() {
        const video = document.getElementById('start-video');
        const videoContainer = document.getElementById('video-container');

        // 视频播放结束或点击跳过后的处理
        const onVideoEnd = () => {
            debugLog('App', '🎬 视频播放完成');
            this.isVideoPlaying = false;
            this.isAppActive = true;

            // 隐藏视频容器
            if (videoContainer) {
                videoContainer.style.display = 'none';
            }

            // 停止视频
            video.pause();
            video.currentTime = 0;

            // 重置交互时间，确保随机说话在无操作50秒后才触发
            this.uiController.resetLastInteractionTime();

            // 重置所有UI状态
            this.uiController.resetUIState();

            // 显示欢迎信息
            this.uiController.showWelcomeMessage();

            // 启动随机说话
            this.uiController.startRandomSpeaking();

            // 启动空闲计时器
            this.startIdleTimer();

            debugLog('App', '✅ 应用初始化完成');
        };

        if (video) {
            video.addEventListener('ended', onVideoEnd);

            // 视频播放出错时也直接跳过
            video.addEventListener('error', () => {
                debugLog('App', '⚠️ 视频播放出错，直接跳过');
                onVideoEnd();
            });

            // 点击视频区域播放视频或跳过
            videoContainer.addEventListener('click', async () => {
                if (this.isVideoPlaying) {
                    if (video.paused) {
                        try {
                            await video.play();
                            debugLog('App', '▶️ 开始播放视频');
                        } catch (err) {
                            debugLog('App', '⚠️ 播放失败，跳过');
                            onVideoEnd();
                        }
                    } else {
                        // 视频正在播放时点击则跳过
                        onVideoEnd();
                    }
                }
            });

            // 尝试自动播放
            video.play().catch(() => {
                debugLog('App', 'ℹ️ 自动播放被阻止，请点击视频区域播放');
            });
        }
    }

    /**
     * 启动空闲计时器
     */
    startIdleTimer() {
        this.resetIdleTimer();
    }

    /**
     * 重置空闲计时器
     */
    resetIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        if (this.isAppActive) {
            this.idleTimer = setTimeout(() => {
                this.returnToVideo();
            }, this.IDLE_TIMEOUT);
            debugLog('App', '⏱️ 空闲计时器已重置');
        }
    }

    /**
     * 返回视频界面
     */
    returnToVideo() {
        debugLog('App', '⏱️ 空闲超时，返回视频');
        this.isAppActive = false;
        this.isVideoPlaying = true;

        const video = document.getElementById('start-video');
        const videoContainer = document.getElementById('video-container');

        // 停止当前语音
        if (this.synthesizer) {
            this.synthesizer.cancel();
        }

        // 显示视频容器
        if (videoContainer) {
            videoContainer.style.display = 'flex';
        }

        // 重置视频播放状态（不自动播放）
        if (video) {
            video.currentTime = 0;
            // 不自动播放，等待用户点击
        }

        debugLog('App', '📺 已返回视频界面');
    }

    /**
     * 记录用户交互
     */
    recordUserInteraction() {
        if (this.isAppActive && !this.isVideoPlaying) {
            this.resetIdleTimer();
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

        // 视频还在播放时不允许语音交互
        if (this.isVideoPlaying) {
            debugLog('App', '⚠️ 视频尚未播放完成，请稍候');
            return;
        }

        this.recordUserInteraction();
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
            this.recordUserInteraction();
            this.uiController.updateLastInteraction();
            this.uiController.guideSpeak();
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
    const app = new HeritageApp();
    app.init();

    // 页面卸载时清理资源
    window.addEventListener('beforeunload', () => {
        app.dispose();
    });
});
