/**
 * 音频处理模块
 * 处理麦克风音频采集和编码
 */

import { AUDIO_CONFIG, debugLog } from './utils.js';

/**
 * 音频处理器类
 * 负责麦克风权限获取、音频采集和 PCM 编码
 */
export class AudioProcessor {
    /**
     * @param {WebSocketManager} wsManager - WebSocket 管理器实例
     */
    constructor(wsManager) {
        this.wsManager = wsManager;
        this.audioContext = null;
        this.processor = null;
        this.inputStream = null;
        this.isRecording = false;
    }

    /**
     * 初始化麦克风
     * @returns {Promise<boolean>} 是否初始化成功
     */
    async initMicrophone() {
        try {
            debugLog('Audio', '🎤 请求麦克风权限...');

            // 请求麦克风权限
            this.inputStream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });

            // 创建音频上下文
            this.audioContext = new AudioContext({
                sampleRate: AUDIO_CONFIG.SAMPLE_RATE
            });

            // 创建音频源
            const source = this.audioContext.createMediaStreamSource(this.inputStream);

            // 创建音频处理器
            this.processor = this.audioContext.createScriptProcessor(
                AUDIO_CONFIG.BUFFER_SIZE,
                1,
                1
            );

            // 连接节点
            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            // 设置音频处理回调
            this.processor.onaudioprocess = (event) => {
                this.processAudio(event);
            };

            debugLog('Audio', '✅ 麦克风初始化成功');
            return true;
        } catch (error) {
            debugLog('Audio', '❌ 麦克风初始化失败:', error);
            return false;
        }
    }

    /**
     * 处理音频数据
     * @param {AudioProcessingEvent} event - 音频处理事件
     */
    processAudio(event) {
        // 检查是否正在录音且 WebSocket 已连接
        if (!this.isRecording || !this.wsManager.isConnected()) {
            return;
        }

        // 获取输入音频数据
        const inputData = event.inputBuffer.getChannelData(0);

        // 转换为 16 位 PCM
        const pcmData = this.convertToPCM16(inputData);

        // 发送到服务器
        this.wsManager.send(pcmData.buffer);

        debugLog('Audio', '📤 发送音频数据');
    }

    /**
     * 将浮点音频数据转换为 16 位 PCM
     * @param {Float32Array} inputData - 浮点音频数据
     * @returns {Int16Array} 16 位 PCM 数据
     */
    convertToPCM16(inputData) {
        const pcm = new Int16Array(inputData.length);

        for (let i = 0; i < inputData.length; i++) {
            // 限制在 [-1, 1] 范围内并转换为 16 位
            pcm[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
        }

        return pcm;
    }

    /**
     * 开始录音
     * @returns {Promise<boolean>} 是否开始成功
     */
    async startRecording() {
        if (this.isRecording) {
            debugLog('Audio', '⚠️ 已在录音中');
            return true;
        }

        // 如果音频上下文不存在，先初始化
        if (!this.audioContext) {
            const success = await this.initMicrophone();
            if (!success) {
                return false;
            }
        }

        // 恢复音频上下文（如果被暂停）
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.isRecording = true;
        debugLog('Audio', '🔴 开始录音');
        return true;
    }

    /**
     * 停止录音
     */
    stopRecording() {
        if (!this.isRecording) {
            return;
        }

        this.isRecording = false;
        debugLog('Audio', '⏹ 停止录音');

        // 发送说话结束信号
        setTimeout(() => {
            this.wsManager.sendUserDoneSpeaking();
        }, 100);
    }

    /**
     * 从 Base64 音频数据播放
     * @param {string} base64 - Base64 编码的音频数据
     */
    static playAudioFromBase64(base64) {
        try {
            // 解码 Base64
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);

            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            // 创建 Blob 和 Audio
            const blob = new Blob([bytes], { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);

            audio.play();
            debugLog('Audio', '🔊 播放音频');
        } catch (error) {
            debugLog('Audio', '❌ 音频播放失败:', error);
        }
    }

    /**
     * 释放资源
     */
    dispose() {
        this.stopRecording();

        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        if (this.inputStream) {
            this.inputStream.getTracks().forEach(track => track.stop());
            this.inputStream = null;
        }

        debugLog('Audio', '🗑 释放音频资源');
    }
}
