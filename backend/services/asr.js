/**
 * ASR (语音识别) 服务模块
 * 处理与阿里云 DashScope ASR API 的 WebSocket 连接
 * 支持实时语音识别，包括连接管理、状态转换、错误处理和重连逻辑
 */

import WebSocket from "ws";
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 从 backend 目录加载 .env（向上走一级目录）
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// 从环境变量获取API密钥
const apiKey = process.env.DASHSCOPE_API_KEY;

// 检查API密钥是否存在
if (!apiKey) {
  logger.error('❌ 错误：未设置 DASHSCOPE_API_KEY 环境变量');
  logger.error('请在 backend/.env 文件中添加有效的API密钥');
} else {
  logger.info('✅ API密钥已配置');
}

// 定义ASR任务状态枚举
const ASRTaskState = {
  IDLE: 'idle',
  STARTING_TASK: 'starting_task',
  STREAMING: 'streaming',
  FINISHING: 'finishing',
  WAITING_FINAL: 'waiting_final',
  COMPLETED: 'completed',
  ERROR: 'error'
};

// 创建ASR连接的函数
export function createASRConnection(onText) {
  // 生成32位随机ID
  const TASK_ID = uuidv4().replace(/-/g, '').slice(0, 32);

  const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference/', {
    headers: {
      Authorization: `bearer ${apiKey}`
    }
  });

  // Enhanced state management with explicit ASR task states
  let state = {
    taskState: ASRTaskState.IDLE, // Current ASR task state - initialized directly
    connectionState: 'disconnected', // WebSocket connection state
    taskStarted: false, // 标记任务是否已启动
    readyToSendAudio: false, // 标记是否可以发送音频
    accumulatedText: '', // 累积识别结果
    hasReceivedResults: false, // 标记是否已经收到过识别结果
    isProcessing: false, // 标记是否正在处理
    hasError: false, // 标记是否有错误
    lastErrorMessage: null, // 存储最后的错误信息
    isEnding: false, // 标记是否正在结束会话
    isFinished: false, // 标记任务是否已完成
    reconnectAttempts: 0, // 重连尝试次数
    maxReconnectAttempts: 3, // 最大重连尝试次数
    textTimeout: null, // 文本超时定时器
    keepaliveTimer: null, // 保持连接活跃的定时器
    lastPingTime: Date.now(), // 上次ping的时间
    consecutiveFailedPings: 0, // 连续失败的ping次数
    maxConsecutiveFailedPings: 3, // 最大连续失败ping次数
    lastActivityTime: Date.now(), // 上次活动时间
    pendingFinalText: null, // 结束过程中待处理的最终文本
    currentSessionId: TASK_ID // 当前会话ID
  };

  // 设置初始 state 无需调用 setState，直接赋值
  state.connectionState = 'connecting';

  // Health monitoring
  let healthMonitor = {
    lastActivityTime: Date.now(),
    isActive: true,
    healthCheckInterval: null
  };

  // 状态转换辅助函数
  const setState = (newState) => {
    const oldState = state.taskState;
    state.taskState = newState;
    logger.info(`ASR task state changed: ${oldState} -> ${newState}`);
    state.lastActivityTime = Date.now();
  };

  // Now that setState is defined, set the initial state properly
  setState(ASRTaskState.IDLE);

  // 验证连接是否准备好接收音频数据
  const isValidForAudio = () => {
    return ws.readyState === WebSocket.OPEN &&
           state.taskState === ASRTaskState.STREAMING &&
           state.taskStarted &&  // Ensure the task was actually started
           !state.hasError &&
           !state.isEnding &&
           !state.isFinished;
  };

  // Start health monitoring when connection opens
  ws.on('open', () => {
    logger.info('ASR WebSocket: 连接到服务器');
    state.connectionState = 'connected';
    setState(ASRTaskState.STARTING_TASK);
    state.taskStarted = false; // Will be set to true when task-started event occurs
    state.readyToSendAudio = false;
    state.hasError = false;
    state.isEnding = false;
    state.isFinished = false;

    // Update health monitor
    healthMonitor.lastActivityTime = Date.now();

    // Send initial task - this is the ONLY place to auto-start tasks
    sendRunTask();

    // Start health check interval
    if (!healthMonitor.healthCheckInterval) {
      healthMonitor.healthCheckInterval = setInterval(() => {
        const now = Date.now();
        if (now - healthMonitor.lastActivityTime > 30000) { // 30 seconds no activity
          logger.warn('ASR connection appears inactive, checking state...');
          if (ws.readyState === WebSocket.OPEN && state.taskState === ASRTaskState.STREAMING) {
            // Connection is open but no activity - might need attention
            logger.info('Still connected to ASR service, maintaining connection...');

            // Try sending a small ping to verify connection
            if (state.consecutiveFailedPings < state.maxConsecutiveFailedPings) {
              try {
                // We can't send a ping directly with WS, so we'll just log and update timestamp
                state.lastPingTime = now;
              } catch (err) {
                logger.error('Failed to ping ASR server:', { error: err });
                state.consecutiveFailedPings++;

                if (state.consecutiveFailedPings >= state.maxConsecutiveFailedPings) {
                  logger.error('Too many failed pings, closing connection for reconnection');
                  ws.close(1000, 'Health check failed');
                }
              }
            }
          } else if (ws.readyState !== WebSocket.OPEN) {
            logger.error('ASR connection closed unexpectedly');
            clearInterval(healthMonitor.healthCheckInterval);
          }
        }
      }, 10000); // Check every 10 seconds
    }
  });

  // Enhanced message processing with health monitoring
  ws.on('message', (data) => {
    // Update health monitor on any activity
    healthMonitor.lastActivityTime = Date.now();
    state.lastActivityTime = Date.now();

    // Try to parse as JSON first, if it fails, it might be binary audio data
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (e) {
      // This might be audio data or ping response, ignore
      return;
    }

    switch (message.header.event) {
      case 'task-started':
        logger.info('ASR WebSocket: 任务开始');
        setState(ASRTaskState.STREAMING);
        state.taskStarted = true; // Mark that the task has officially started
        state.readyToSendAudio = true;
        state.hasError = false; // Reset error state on successful start
        state.consecutiveFailedPings = 0; // Reset failed pings on successful communication

        // Start a keepalive timer during streaming to send small silent PCM frames periodically
        if (state.keepaliveTimer) {
          clearInterval(state.keepaliveTimer);
        }
        state.keepaliveTimer = setInterval(() => {
          if (state.taskState === ASRTaskState.STREAMING && ws.readyState === WebSocket.OPEN) {
            // Send a small silent PCM frame to keep the connection alive
            // 320 bytes of silence at 16kHz is 20ms of audio data
            const silentFrame = new Uint8Array(320).fill(0);
            ws.send(silentFrame);
          } else {
            // Stop the timer if not streaming anymore
            if (state.keepaliveTimer) {
              clearInterval(state.keepaliveTimer);
              state.keepaliveTimer = null;
            }
          }
        }, 5000); // Send keepalive every 5 seconds during streaming

        break;
      case 'result-generated':
        // 如果任务已经完成，忽略后续结果
        if (state.isFinished) {
          logger.info('任务已完成，忽略后续识别结果:', { text: message.payload.output.sentence.text });
          break;
        }

        state.hasReceivedResults = true; // 标记已收到结果
        const newText = message.payload.output.sentence.text;
        const sentenceEnd = message.payload.output.sentence.sentence_end; // 使用正确的字段名

        logger.info("ASR识别结果", { newText, sentenceEnd });

        // 直接使用ASR返回的完整句子，无需进一步判断是否完整
        if (newText && newText.trim() !== '') {
          // 如果句子结束标志为true，则立即处理这个完整的句子
          if (sentenceEnd) {
            logger.info('检测到句子结束，立即触发回调函数:', { text: newText });
            state.isProcessing = true;

            // Process the complete sentence directly
            const finalText = newText.trim();

            // 检查是否正在结束，如果在结束过程中，暂存文本
            if (state.isEnding) {
              state.pendingFinalText = finalText;
              logger.info('正在结束过程中，暂存文本:', { text: finalText });
            } else {
              // Include the utterance ID in the callback
              onText({ text: finalText, utteranceId: Date.now() + Math.random() });
            }

            // 清除累积文本，准备下一句
            // Only clear accumulated text if we're not in WAITING_FINAL state to prevent clearing before final result
            if (state.taskState !== ASRTaskState.WAITING_FINAL) {
              state.accumulatedText = '';
            }
            state.isProcessing = false;
          } else {
            // 如果不是句子结束，只更新累积文本，不做处理
            // 在用户松开按钮时，会发送finish-task命令，这时会处理最终文本
            state.accumulatedText = newText;
          }
        }

        if (message.payload.usage) {
          logger.info('ASR任务计费时长（秒）:', { duration: message.payload.usage.duration });
        }
        break;
      case 'task-finished':
        logger.info('ASR任务完成');

        // Only update state if we're in a valid finishing state
        if (state.taskState === ASRTaskState.FINISHING || state.taskState === ASRTaskState.WAITING_FINAL) {
          setState(ASRTaskState.COMPLETED); // Set to completed state
        }

        state.readyToSendAudio = false;
        state.taskStarted = false; // Reset task started flag so next interaction must wait for new task-started
        state.isFinished = true; // Mark the task as finished

        // 清除可能存在的定时器
        if (state.textTimeout) {
          clearTimeout(state.textTimeout);
          state.textTimeout = null;
        }

        // 如果有最终文本(pendingFinalText)，优先发送最终文本
        // 否则才发送累积的文本作为后备
        if (state.pendingFinalText && state.pendingFinalText.trim() !== '') {
          logger.info('任务结束，发送最终文本:', { text: state.pendingFinalText });
          onText({ text: state.pendingFinalText, utteranceId: Date.now() + Math.random() });
          state.pendingFinalText = '';
        } else if (state.accumulatedText && state.accumulatedText.trim() !== '') {
          logger.info('任务结束，发送剩余累积文本:', { text: state.accumulatedText });
          onText({ text: state.accumulatedText, utteranceId: Date.now() + Math.random() });
          state.accumulatedText = '';
        }
        break;
      case 'task-failed':
        logger.error('ASR任务失败：', { error: message.header.error_message });
        setState(ASRTaskState.ERROR);
        state.hasError = true;
        state.lastErrorMessage = message.header.error_message;
        state.readyToSendAudio = false;
        state.taskStarted = false; // Reset task started flag since task failed

        // 清除可能存在的定时器
        if (state.textTimeout) {
          clearTimeout(state.textTimeout);
          state.textTimeout = null;
        }

        // 即使失败，也要发送累积的文本
        if (state.accumulatedText && state.accumulatedText.trim() !== '') {
          logger.info('发送失败前累积的文本:', { text: state.accumulatedText });
          onText({ text: state.accumulatedText, utteranceId: Date.now() + Math.random() });
          state.accumulatedText = '';
        }
        break;
      default:
        logger.info('ASR未知事件：', { event: message.header.event });
    }
  });

  // Define unified task payload for consistent parameters
  const taskPayload = {
    task_group: 'audio',
    task: 'asr',
    function: 'recognition',
    model: 'fun-asr-realtime',
    parameters: {
      sample_rate: 16000,
      format: 'pcm'  // 前端发送的是PCM格式
    },
    input: {}
  };

  // 发送run-task指令
  function sendRunTask() {
    const runTaskMessage = {
      header: {
        action: 'run-task',
        task_id: TASK_ID,
        streaming: 'duplex'
      },
      payload: {
        ...taskPayload  // Spread the unified payload template
      }
    };
    ws.send(JSON.stringify(runTaskMessage));
  }

  // 发送finish-task指令
  function sendFinishTask() {
    const finishTaskMessage = {
      header: {
        action: 'finish-task',
        task_id: TASK_ID,
        streaming: 'duplex'
      },
      payload: {
        ...taskPayload  // Use the same unified payload template for consistency
      }
    };
    ws.send(JSON.stringify(finishTaskMessage));
  }

  // Enhanced error handling with retry logic
  ws.on('error', (error) => {
    logger.error('ASR WebSocket错误：', { error });
    setState(ASRTaskState.ERROR);
    state.hasError = true;
    state.lastErrorMessage = error.message;

    // 清除可能存在的定时器
    if (state.textTimeout) {
      clearTimeout(state.textTimeout);
      state.textTimeout = null;
    }

    // 清除keepalive定时器
    if (state.keepaliveTimer) {
      clearInterval(state.keepaliveTimer);
      state.keepaliveTimer = null;
    }

    // 如果是认证错误，不要尝试重连
    if (error.message && error.message.includes('Authentication failed')) {
      logger.error('认证失败，不尝试重连');
      return;
    }

    // When reconnecting, reset to IDLE state - distinguishing between new tasks vs continuing utterances
    setState(ASRTaskState.IDLE);
    state.taskStarted = false;
    state.readyToSendAudio = false;
    state.accumulatedText = '';

    // Attempt to reconnect if under limit
    if (state.reconnectAttempts < state.maxReconnectAttempts) {
      state.reconnectAttempts++;
      // Use exponential backoff with jitter
      const delay = (state.reconnectAttempts * 2000) + Math.floor(Math.random() * 1000); // 2-3s, 4-5s, 6-7s
      logger.info(`Attempt ${state.reconnectAttempts}/${state.maxReconnectAttempts}: Reconnecting in ${delay}ms`);

      setTimeout(() => {
        // 通知父级连接丢失以便重新初始化 - this ensures frontend state is reset for new interaction
        if (typeof ws.onConnectionLost === 'function') {
          ws.onConnectionLost();
        }
      }, delay);
    } else {
      logger.error('Max reconnection attempts reached');

      // Even with error, send accumulated text if any
      if (state.accumulatedText && state.accumulatedText.trim() !== '') {
        logger.info('Sending accumulated text despite error:', { text: state.accumulatedText });

        // 尝试通知上层处理累积的文本
        if (typeof onText === 'function') {
          onText({ text: state.accumulatedText, utteranceId: Date.now() + Math.random() });
        }
      }
    }
  });

  // Enhanced connection close handling with health monitoring cleanup
  ws.on('close', (code, reason) => {
    logger.info(`ASR WebSocket closed. Code: ${code}, Reason: ${reason}`);
    setState(ASRTaskState.COMPLETED); // Use the correct task state enum

    // 清除文本超时定时器
    if (state.textTimeout) {
      clearTimeout(state.textTimeout);
      state.textTimeout = null;
    }

    // 清除keepalive定时器
    if (state.keepaliveTimer) {
      clearInterval(state.keepaliveTimer);
      state.keepaliveTimer = null;
    }

    // Clean up health monitoring
    if (healthMonitor.healthCheckInterval) {
      clearInterval(healthMonitor.healthCheckInterval);
      healthMonitor.healthCheckInterval = null;
    }

    // Only reset certain states if not a normal completion
    if (code !== 1000) { // Normal closure
      logger.warn('Connection closed abnormally, checking if we need to reconnect');

      // 对于常见的网络错误，尝试重连
      if (code === 1006 || // Abnormal closure
          code === 1007 || // Invalid payload
          code === 1011 || // Internal error
          code === 1015) { // TLS handshake failure

        logger.info(`Detected connection issue (code: ${code}), attempting reconnection`);

        // 计算重连延迟，使用指数退避算法带抖动
        const delay = (state.reconnectAttempts + 1) * 2000 + Math.floor(Math.random() * 1000);
        setTimeout(() => {
          // 通知外部连接已断开，需要重新初始化ASR连接
          if (typeof ws.onConnectionLost === 'function') {
            ws.onConnectionLost();
          }
        }, delay);
      } else {
        logger.info(`Connection ended with code ${code}, not attempting reconnection`);
      }
    } else {
      logger.info('Normal connection closure - this is expected after task completion, triggering reconnection');
      // For normal closures (code 1000) after successful task completion, trigger reconnection
      // This is expected behavior from DashScope API after finish-task
      if (typeof ws.onConnectionLost === 'function') {
        // Add a slight delay to ensure proper cleanup before reconnection
        setTimeout(() => {
          ws.onConnectionLost();
        }, 50); // Small delay to allow proper cleanup
      }
    }

    if (!state.taskStarted) {
      logger.error('ASR任务未启动，关闭连接');
    } else if (!state.hasReceivedResults) {
      logger.warn('ASR连接关闭，但未收到任何识别结果');
    } else {
      logger.info('ASR连接已关闭');
    }
    state.readyToSendAudio = false;
    state.isEnding = false;
    state.isFinished = false; // Reset finished flag
    state.taskStarted = false; // Reset task started flag
    state.accumulatedText = ''; // Clear accumulated text
    setState(ASRTaskState.IDLE); // Reset to idle state
  });

  // Optimized sendEndSignal for faster state reset
  ws.sendEndSignal = () => {
    logger.info('Initiating ASR session end with finish-task command...');

    // Guard 1: Prevent multiple end sequences
    if (state.isEnding) {
      logger.info('ASR session end already initiated, skipping duplicate request');
      return;
    }

    // Guard 2: Check WebSocket is open
    if (ws.readyState !== WebSocket.OPEN) {
      logger.warn("Ignoring finish-task: WebSocket not open", { readyState: ws.readyState });
      state.isEnding = false;
      return;
    }

    // Guard 3: Check task was actually started
    if (!state.taskStarted) {
      logger.warn('⚠️ Ignoring finish-task: no active run-task (taskStarted=false)');
      state.isEnding = false;
      return;
    }

    // Guard 4: Check task state is valid for finishing
    if (
      state.taskState !== ASRTaskState.STREAMING &&
      state.taskState !== ASRTaskState.WAITING_FINAL
    ) {
      logger.warn('⚠️ Ignoring finish-task: invalid state', { state: state.taskState });
      state.isEnding = false;
      return;
    }

    // Guard 5: Check no error
    if (state.hasError) {
      logger.warn('⚠️ Ignoring finish-task: ASR has error');
      state.isEnding = false;
      return;
    }

    // Proceed with finish-task...
    state.isEnding = true;
    setState(ASRTaskState.FINISHING); // Set to finishing state

    // Update state to reflect processing
    state.isProcessing = true;

    // Do NOT process any accumulated text here, as the final complete sentence will come from ASR
    // with sentence_end: true and will be processed in the result-generated handler
    if (state.accumulatedText && state.accumulatedText.trim() !== '') {
      logger.info("NOT processing accumulated text during end signal", { accumulatedText: state.accumulatedText });
    }

    // Send finish-task command to properly end the ASR session
    sendFinishTask();

    // Set to waiting final state to allow final result processing
    setState(ASRTaskState.WAITING_FINAL);

    // Implement timeout mechanism to handle cases where final ASR results don't arrive
    if (state.textTimeout) {
      clearTimeout(state.textTimeout);
    }

    // Set timeout to handle missing final result (800ms as suggested in requirements)
    state.textTimeout = setTimeout(() => {
      logger.info('Timeout waiting for final ASR result, checking for fallback');

      // If there's accumulated text but no final result, use accumulated text as fallback
      if (state.accumulatedText && state.accumulatedText.trim() !== '') {
        logger.info('Using accumulated text as fallback:', { text: state.accumulatedText });
        onText({ text: state.accumulatedText, utteranceId: Date.now() + Math.random() });
        // Only clear accumulatedText after using it as fallback
        state.accumulatedText = '';
      } else {
        logger.info('No accumulated text to fallback to');
      }

      // Only reset to IDLE state after timeout if still in WAITING_FINAL state
      // This prevents overriding server-driven completion
      if (state.taskState === ASRTaskState.WAITING_FINAL) {
        setState(ASRTaskState.IDLE);

        // Don't auto-start a new task here to avoid multiple auto-start locations
        // New task will be started when user interacts again and WebSocket is ready
        state.isEnding = false;
        state.isProcessing = false;
        state.readyToSendAudio = false;
      }
    }, 800); // 800ms timeout as mentioned in requirements

    // Faster state reset for quicker reuse of the same connection
    // Reduce timeout from 1000ms to 300ms for faster reset
    setTimeout(() => {
      logger.info('Resetting ASR connection state for next session');

      // Process any pending final text if available (this comes from the final ASR result after finish-task)
      if (state.pendingFinalText) {
        logger.info('Processing pending final text:', { text: state.pendingFinalText });

        // Clear the timeout since we got the final result
        if (state.textTimeout) {
          clearTimeout(state.textTimeout);
          state.textTimeout = null;
        }

        onText({ text: state.pendingFinalText, utteranceId: Date.now() + Math.random() });
        state.pendingFinalText = null;

        // Only set to IDLE if we're still in WAITING_FINAL state
        // This prevents overriding server-driven state changes
        if (state.taskState === ASRTaskState.WAITING_FINAL) {
          setState(ASRTaskState.IDLE);
        }
      }

      // Reset only the relevant states for a new recognition task
      state.isEnding = false;
      state.isProcessing = false;
      // Don't clear accumulatedText here as it might still be needed for the final result
      // The accumulatedText will be cleared after processing in the timeout or when a new sentence starts
      state.hasReceivedResults = false;
      state.isFinished = false;

      // Don't auto-start a new task here to avoid multiple auto-start locations
      // The new task will be started in the WebSocket open handler or when needed
      if (ws.readyState === WebSocket.OPEN) {
        // Only set readyToSendAudio to true if we're in a valid state to receive audio
        if (state.taskState === ASRTaskState.IDLE) {
          // This will be set to true when a new task starts
          logger.info('ASR connection ready for next audio input when task starts');
        }
      } else {
        logger.warn('Cannot reset ASR connection - WebSocket is closed');

        // If connection is closed, notify parent to recreate it
        if (typeof ws.onConnectionLost === 'function') {
          ws.onConnectionLost();
        }
      }

      // Clear any existing keepalive timer first
      if (state.keepaliveTimer) {
        clearInterval(state.keepaliveTimer);
      }
    }, 300); // Reduced from 1000ms to 300ms for faster reset
  };

  // Enhanced sendAudioData method with improved state checking
  ws.sendAudioData = (audioChunk) => {
    if (isValidForAudio()) {
      // Only send the audio data without interfering with the connection
      ws.send(audioChunk);
    } else if (ws.readyState !== WebSocket.OPEN) {
      logger.error('WebSocket未连接，无法发送音频数据');
      // Try to reinitialize if connection is lost
      if (typeof ws.onConnectionLost === 'function') {
        ws.onConnectionLost();
      }
    } else if (state.hasError) {
      logger.error('ASR连接有错误，无法发送音频数据');
    } else if (!state.readyToSendAudio) {
      logger.info('ASR尚未准备就绪，或正在结束会话，音频数据可能被忽略...');
      // Queue the audio data if possible
      if (typeof ws.queueAudioData === 'function') {
        ws.queueAudioData(audioChunk);
      }
    } else if (state.isEnding) {
      logger.info('ASR会话正在结束，音频数据被丢弃');
    }
  };

  // Add a method to queue audio data if connection is not ready
  ws.queueAudioData = (audioChunk) => {
    // In this implementation, we won't actively queue, but in a more complex scenario
    // you might want to store chunks temporarily and send them when ready
  };

  // Enhanced isReady method
  ws.isReady = () => state.taskState === ASRTaskState.STREAMING && state.taskStarted && !state.hasError && !state.isEnding;

  // Add getState method to allow external inspection of internal state
  ws.getState = () => ({
    ...state,
    ASRTaskState // Include the enum in the returned state for debugging
  });

  // Add a method to clear the accumulated text without processing it
  ws.clearAccumulatedText = () => {
    if (state.accumulatedText && state.accumulatedText.trim() !== '') {
      logger.info('Clearing accumulated text without processing:', { text: state.accumulatedText });
      state.accumulatedText = '';
    }
  };

  // Add a method to check if we're currently ending
  ws.isEnding = () => state.isEnding;

  // Add a method to start a new ASR task (for multi-round conversations)
  ws.startNewTask = () => {
    // Check if WebSocket is open
    if (ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot start new task: WebSocket not open');
      return false;
    }

    // Check if task is already running
    if (state.taskStarted && state.taskState === ASRTaskState.STREAMING) {
      logger.info('Task already running, can proceed with audio');
      return true;
    }

    // Check if we're in a valid state to start a new task
    if (state.taskState === ASRTaskState.ERROR) {
      logger.warn('Cannot start new task: ASR is in error state');
      return false;
    }

    // Reset state for new task
    logger.info('Starting new ASR task for next conversation round');
    state.taskStarted = false;
    state.accumulatedText = '';
    state.pendingFinalText = '';
    state.isEnding = false;
    state.isFinished = false;
    state.isProcessing = false;

    // Start the new task
    sendRunTask();
    return true;
  };

  return ws;
}
