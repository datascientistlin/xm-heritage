/**
 * WebSocket 管理模块
 * 处理与后端的 WebSocket 连接，包括重连逻辑
 */

import { WS_CONFIG, debugLog } from './utils.js';

/**
 * WebSocket 管理器类
 * 管理 WebSocket 连接状态、消息发送和自动重连
 */
export class WebSocketManager {
    /**
     * @param {Function} onMessage - 消息回调函数
     * @param {Function} onStatusChange - 状态变化回调函数
     */
    constructor(onMessage, onStatusChange) {
        this.ws = null;
        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;
        this.reconnectTimer = null;
        this.isManualClose = false;
        this.messageHandlers = {
            'user': null,
            'assistant': null
        };
    }

    /**
     * 建立 WebSocket 连接
     */
    connect() {
        debugLog('WebSocket', '正在连接服务器...');
        this.isManualClose = false;

        try {
            this.ws = new WebSocket(WS_CONFIG.URL);

            this.ws.onopen = () => {
                debugLog('WebSocket', '✅ 连接成功');
                if (this.onStatusChange) {
                    this.onStatusChange('connected');
                }
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event);
            };

            this.ws.onclose = () => {
                debugLog('WebSocket', '❌ 连接断开');
                if (this.onStatusChange) {
                    this.onStatusChange('disconnected');
                }
                this.scheduleReconnect();
            };

            this.ws.onerror = (error) => {
                debugLog('WebSocket', '⚠️ 连接错误', error);
                if (this.onStatusChange) {
                    this.onStatusChange('disconnected');
                }
            };
        } catch (error) {
            debugLog('WebSocket', '❌ 连接失败:', error);
            this.scheduleReconnect();
        }
    }

    /**
     * 处理接收到的消息
     * @param {MessageEvent} event - WebSocket 消息事件
     */
    handleMessage(event) {
        try {
            const msg = JSON.parse(event.data);
            debugLog('WebSocket', '📥 收到消息:', msg.type);

            // 调用消息回调
            if (this.onMessage) {
                this.onMessage(msg);
            }

            // 处理特定类型的消息
            if (msg.type === 'user' && this.messageHandlers.user) {
                this.messageHandlers.user(msg.text);
            } else if (msg.type === 'assistant' && this.messageHandlers.assistant) {
                this.messageHandlers.assistant(msg.text, msg.audio);
            }
        } catch (error) {
            debugLog('WebSocket', '❌ 消息解析错误:', error);
        }
    }

    /**
     * 安排重连
     */
    scheduleReconnect() {
        if (this.isManualClose) return;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        debugLog('WebSocket', `⏳ ${WS_CONFIG.RECONNECT_DELAY / 1000}秒后尝试重连...`);
        if (this.onStatusChange) {
            this.onStatusChange('connecting');
        }

        this.reconnectTimer = setTimeout(() => {
            debugLog('WebSocket', '🔄 正在重连...');
            this.connect();
        }, WS_CONFIG.RECONNECT_DELAY);
    }

    /**
     * 发送消息
     * @param {Object|string} data - 要发送的数据
     * @returns {boolean} 是否发送成功
     */
    send(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            debugLog('WebSocket', '⚠️ WebSocket 未连接');
            return false;
        }

        try {
            this.ws.send(data);
            return true;
        } catch (error) {
            debugLog('WebSocket', '❌ 发送失败:', error);
            return false;
        }
    }

    /**
     * 发送 JSON 消息
     * @param {Object} data - 要发送的数据对象
     * @returns {boolean} 是否发送成功
     */
    sendJSON(data) {
        return this.send(JSON.stringify(data));
    }

    /**
     * 发送用户说话结束信号
     */
    sendUserDoneSpeaking() {
        return this.sendJSON({ type: 'user_done_speaking' });
    }

    /**
     * 手动关闭连接
     */
    close() {
        this.isManualClose = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * 检查连接状态
     * @returns {boolean} 是否已连接
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * 注册消息处理器
     * @param {string} type - 消息类型 ('user' | 'assistant')
     * @param {Function} handler - 处理函数
     */
    registerHandler(type, handler) {
        this.messageHandlers[type] = handler;
    }
}
