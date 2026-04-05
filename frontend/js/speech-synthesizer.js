/**
 * 语音合成模块
 * 处理 TTS 语音合成，包括通义千问 TTS 和 Web Speech API 回退
 */

import { TTS_CONFIG, debugLog } from './utils.js';

/**
 * 语音合成器类
 * 统一管理 TTS 语音输出
 */
export class SpeechSynthesizer {
    constructor() {
        this.speechSynthesis = null;
        this.isSpeechSupported = true;
        this.useQwenTTS = TTS_CONFIG.USE_QWEN_TTS;
        this.isSpeaking = false;

        this.init();
    }

    /**
     * 初始化语音合成
     */
    init() {
        if ('speechSynthesis' in window) {
            this.speechSynthesis = window.speechSynthesis;
            debugLog('TTS', '✅ 语音合成已初始化');
        } else {
            console.warn('⚠️ 浏览器不支持语音合成功能');
            this.isSpeechSupported = false;
        }
    }

    /**
     * 获取中文语音
     * @returns {SpeechSynthesisVoice|null} 中文语音
     */
    getChineseVoice() {
        if (!this.speechSynthesis) return null;

        const voices = this.speechSynthesis.getVoices();

        // 查找中文语音
        return voices.find(voice =>
            voice.lang.includes('zh') ||
            voice.lang.includes('zh-CN') ||
            voice.name.includes('Chinese') ||
            voice.name.includes('Ting-Ting') ||
            voice.name.includes('Mei-Jia') ||
            voice.name.includes('Ting')
        ) || voices[0] || null;
    }

    /**
     * 使用通义千问 TTS 合成语音
     * @param {string} text - 要合成的文本
     * @returns {Promise<boolean>} 是否成功
     */
    async speakWithQwenTTS(text) {
        try {
            debugLog('TTS', '🎵 正在调用通义千问 TTS...', text);

            const response = await fetch(TTS_CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            if (!response.ok) {
                throw new Error(`TTS 请求失败: ${response.status}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);

            const audio = new Audio(audioUrl);

            audio.onplay = () => {
                this.isSpeaking = true;
                debugLog('TTS', '🔊 开始播放语音');
            };

            audio.onended = () => {
                this.isSpeaking = false;
                debugLog('TTS', '✅ 语音播放完成');
            };

            audio.onerror = (error) => {
                this.isSpeaking = false;
                debugLog('TTS', '❌ 语音播放错误:', error);
            };

            await audio.play();
            return true;
        } catch (error) {
            debugLog('TTS', '❌ 通义千问 TTS 失败:', error);
            return false;
        }
    }

    /**
     * 使用 Web Speech API 回退
     * @param {string} text - 要合成的文本
     */
    speakFallback(text) {
        if (!this.isSpeechSupported) {
            debugLog('TTS', '⚠️ 语音合成不支持，仅显示文本');
            return;
        }

        // 取消当前正在进行的语音
        this.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        // 设置语音参数
        utterance.rate = TTS_CONFIG.FALLBACK_RATE;
        utterance.pitch = TTS_CONFIG.FALLBACK_PITCH;
        utterance.volume = TTS_CONFIG.FALLBACK_VOLUME;

        // 设置中文语音
        const chineseVoice = this.getChineseVoice();
        if (chineseVoice) {
            utterance.voice = chineseVoice;
            debugLog('TTS', '🎤 使用语音:', chineseVoice.name);
        }

        // 设置事件回调
        utterance.onstart = () => {
            this.isSpeaking = true;
            debugLog('TTS', '🔊 开始播放语音 (Web Speech API)');
        };

        utterance.onend = () => {
            this.isSpeaking = false;
            debugLog('TTS', '✅ 语音播放完成 (Web Speech API)');
        };

        utterance.onerror = (event) => {
            this.isSpeaking = false;
            debugLog('TTS', '❌ 语音错误:', event.error);
        };

        this.speechSynthesis.speak(utterance);
    }

    /**
     * 统一的说话接口
     * @param {string} text - 要合成的文本
     * @returns {Promise<void>}
     */
    async speak(text) {
        debugLog('TTS', '📢 准备说话:', text);

        if (this.useQwenTTS) {
            // 尝试使用通义千问 TTS
            const success = await this.speakWithQwenTTS(text);

            if (!success) {
                debugLog('TTS', '↩️ 回退到 Web Speech API');
                this.speakFallback(text);
            }
        } else {
            // 直接使用 Web Speech API
            this.speakFallback(text);
        }
    }

    /**
     * 停止当前语音
     */
    stop() {
        if (this.speechSynthesis) {
            this.speechSynthesis.cancel();
            this.isSpeaking = false;
            debugLog('TTS', '⏹ 停止语音');
        }
    }

    /**
     * 检查是否正在说话
     * @returns {boolean} 是否正在说话
     */
    isCurrentlySpeaking() {
        return this.isSpeaking || (this.speechSynthesis && this.speechSynthesis.speaking);
    }

    /**
     * 取消当前语音
     */
    cancel() {
        if (this.speechSynthesis) {
            this.speechSynthesis.cancel();
            this.isSpeaking = false;
            debugLog('TTS', '⏹ 停止语音');
        }
    }

    /**
     * 预加载语音列表（某些浏览器需要）
     */
    preloadVoices() {
        if (this.speechSynthesis && this.speechSynthesis.getVoices().length === 0) {
            return new Promise((resolve) => {
                this.speechSynthesis.onvoiceschanged = () => {
                    debugLog('TTS', '📋 语音列表已加载');
                    resolve();
                };
            });
        }
        return Promise.resolve();
    }
}
