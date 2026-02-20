import WebSocket from "ws";
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 从环境变量获取API密钥
const apiKey = process.env.DASHSCOPE_API_KEY;

// 检查API密钥是否存在
if (!apiKey) {
  console.error('❌ 错误：未设置 DASHSCOPE_API_KEY 环境变量');
  console.error('请在 backend/.env 文件中添加有效的API密钥');
} else {
  console.log('✅ API密钥已配置');
}

// 定义连接状态枚举
const ConnectionState = {
  INITIALIZING: 'initializing',
  CONNECTING: 'connecting',
  HANDSHAKING: 'handshaking',
  READY: 'ready',
  PROCESSING_AUDIO: 'processing_audio',
  AWAITING_RESULT: 'awaiting_result',
  RECONNECTING: 'reconnecting',
  ERROR: 'error',
  CLOSING: 'closing'
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

  // Enhanced state management with explicit connection states
  let state = {
    connectionState: ConnectionState.INITIALIZING, // 当前连接状态
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

  // 设置初始状态
  state.connectionState = ConnectionState.CONNECTING;

  // Health monitoring
  let healthMonitor = {
    lastActivityTime: Date.now(),
    isActive: true,
    healthCheckInterval: null
  };

  // 状态转换辅助函数
  const setState = (newState) => {
    const oldState = state.connectionState;
    state.connectionState = newState;
    console.log(`ASR connection state changed: ${oldState} -> ${newState}`);
    state.lastActivityTime = Date.now();
  };

  // 验证连接是否准备好接收音频数据
  const isValidForAudio = () => {
    return ws.readyState === WebSocket.OPEN &&
           state.connectionState === ConnectionState.READY &&
           !state.hasError &&
           !state.isEnding &&
           !state.isFinished;
  };

  // Start health monitoring when connection opens
  ws.on('open', () => {
    console.log('ASR WebSocket: 连接到服务器');
    setState(ConnectionState.HANDSHAKING);
    state.taskStarted = false;
    state.readyToSendAudio = false;
    state.hasError = false;
    state.isEnding = false;
    state.isFinished = false;

    // Update health monitor
    healthMonitor.lastActivityTime = Date.now();

    // Send initial task
    sendRunTask();

    // Start health check interval
    if (!healthMonitor.healthCheckInterval) {
      healthMonitor.healthCheckInterval = setInterval(() => {
        const now = Date.now();
        if (now - healthMonitor.lastActivityTime > 30000) { // 30 seconds no activity
          console.warn('ASR connection appears inactive, checking state...');
          if (ws.readyState === WebSocket.OPEN && state.connectionState === ConnectionState.READY) {
            // Connection is open but no activity - might need attention
            console.log('Still connected to ASR service, maintaining connection...');

            // Try sending a small ping to verify connection
            if (state.consecutiveFailedPings < state.maxConsecutiveFailedPings) {
              try {
                // We can't send a ping directly with WS, so we'll just log and update timestamp
                state.lastPingTime = now;
              } catch (err) {
                console.error('Failed to ping ASR server:', err);
                state.consecutiveFailedPings++;

                if (state.consecutiveFailedPings >= state.maxConsecutiveFailedPings) {
                  console.error('Too many failed pings, closing connection for reconnection');
                  ws.close(1000, 'Health check failed');
                }
              }
            }
          } else if (ws.readyState !== WebSocket.OPEN) {
            console.error('ASR connection closed unexpectedly');
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
      // This might be audio data or ping response, log and continue
      console.log('Received non-JSON message from ASR service');
      return;
    }

    switch (message.header.event) {
      case 'task-started':
        console.log('ASR WebSocket: 任务开始');
        setState(ConnectionState.READY);
        state.taskStarted = true;
        state.readyToSendAudio = true;
        state.hasError = false; // Reset error state on successful start
        state.consecutiveFailedPings = 0; // Reset failed pings on successful communication
        break;
      case 'result-generated':
        // 如果任务已经完成，忽略后续结果
        if (state.isFinished) {
          console.log('任务已完成，忽略后续识别结果:', message.payload.output.sentence.text);
          break;
        }

        state.hasReceivedResults = true; // 标记已收到结果
        const newText = message.payload.output.sentence.text;
        const sentenceEnd = message.payload.output.sentence.sentence_end; // 使用正确的字段名

        console.log('ASR识别结果：', newText, '句子结束标志:', sentenceEnd);

        // 直接使用ASR返回的完整句子，无需进一步判断是否完整
        if (newText && newText.trim() !== '') {
          // 如果句子结束标志为true，则立即处理这个完整的句子
          if (sentenceEnd) {
            console.log('检测到句子结束，立即触发回调函数:', newText);
            state.isProcessing = true;

            // Process the complete sentence directly
            const finalText = newText.trim();

            // 检查是否正在结束，如果在结束过程中，暂存文本
            if (state.isEnding) {
              state.pendingFinalText = finalText;
              console.log('正在结束过程中，暂存文本:', finalText);
            } else {
              onText(finalText);
            }

            // 清除累积文本，准备下一句
            state.accumulatedText = '';
            state.isProcessing = false;
          } else {
            // 如果不是句子结束，只更新累积文本，不做处理
            // 在用户松开按钮时，会发送finish-task命令，这时会处理最终文本
            state.accumulatedText = newText;
            console.log('非句子结束，更新累积文本:', state.accumulatedText);

            // 关键修改：如果正在进行结束过程，则不发送中间结果到回调
            if (!state.isEnding) {
              // 可选：如果需要发送中间结果（比如部分结果），可以保留此功能
              // 但在当前场景下，我们应该只在完整句子结束时才处理
            }
          }
        }

        if (message.payload.usage) {
          console.log('ASR任务计费时长（秒）：', message.payload.usage.duration);
        }
        break;
      case 'task-finished':
        console.log('ASR任务完成');
        setState(ConnectionState.READY); // Set back to ready for next audio
        state.readyToSendAudio = false;
        state.taskStarted = false; // Reset task started flag
        state.isFinished = true; // Mark the task as finished

        // 清除可能存在的定时器
        if (state.textTimeout) {
          clearTimeout(state.textTimeout);
          state.textTimeout = null;
        }

        // 如果还有累积的文本，在任务结束时发送
        if (state.accumulatedText && state.accumulatedText.trim() !== '') {
          console.log('任务结束，发送剩余累积文本:', state.accumulatedText);
          onText(state.accumulatedText);
          state.accumulatedText = '';
        }
        break;
      case 'task-failed':
        console.error('ASR任务失败：', message.header.error_message);
        setState(ConnectionState.ERROR);
        state.hasError = true;
        state.lastErrorMessage = message.header.error_message;
        state.readyToSendAudio = false;

        // 即使失败，也要发送累积的文本
        if (state.accumulatedText && state.accumulatedText.trim() !== '') {
          console.log('发送失败前累积的文本:', state.accumulatedText);
          onText(state.accumulatedText);
          state.accumulatedText = '';
        }
        break;
      default:
        console.log('ASR未知事件：', message.header.event);
    }
  });

  // 发送run-task指令
  function sendRunTask() {
    const runTaskMessage = {
      header: {
        action: 'run-task',
        task_id: TASK_ID,
        streaming: 'duplex'
      },
      payload: {
        task_group: 'audio',
        task: 'asr',
        function: 'recognition',
        model: 'fun-asr-realtime',
        parameters: {
          sample_rate: 16000,
          format: 'pcm'  // 前端发送的是PCM格式
        },
        input: {}
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
        task_group: 'audio',
        task: 'asr',
        function: 'recognition',
        input: {}
      }
    };
    ws.send(JSON.stringify(finishTaskMessage));
  }

  // Enhanced error handling with retry logic
  ws.on('error', (error) => {
    console.error('ASR WebSocket错误：', error);
    setState(ConnectionState.ERROR);
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
      console.error('认证失败，不尝试重连');
      return;
    }

    // Attempt to reconnect if under limit
    if (state.reconnectAttempts < state.maxReconnectAttempts) {
      state.reconnectAttempts++;
      // Use exponential backoff with jitter
      const delay = (state.reconnectAttempts * 2000) + Math.floor(Math.random() * 1000); // 2-3s, 4-5s, 6-7s
      console.log(`Attempt ${state.reconnectAttempts}/${state.maxReconnectAttempts}: Reconnecting in ${delay}ms`);

      setTimeout(() => {
        // 通知父级连接丢失以便重新初始化
        if (typeof ws.onConnectionLost === 'function') {
          ws.onConnectionLost();
        }
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');

      // Even with error, send accumulated text if any
      if (state.accumulatedText && state.accumulatedText.trim() !== '') {
        console.log('Sending accumulated text despite error:', state.accumulatedText);

        // 尝试通知上层处理累积的文本
        if (typeof onText === 'function') {
          onText(state.accumulatedText);
        }
      }
    }
  });

  // Enhanced connection close handling with health monitoring cleanup
  ws.on('close', (code, reason) => {
    console.log(`ASR WebSocket closed. Code: ${code}, Reason: ${reason}`);
    setState(ConnectionState.CLOSING);

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
      console.warn('Connection closed abnormally, checking if we need to reconnect');

      // 对于常见的网络错误，尝试重连
      if (code === 1006 || // Abnormal closure
          code === 1007 || // Invalid payload
          code === 1011 || // Internal error
          code === 1015) { // TLS handshake failure

        console.log(`Detected connection issue (code: ${code}), attempting reconnection`);

        // 计算重连延迟，使用指数退避算法带抖动
        const delay = (state.reconnectAttempts + 1) * 2000 + Math.floor(Math.random() * 1000);
        setTimeout(() => {
          // 通知外部连接已断开，需要重新初始化ASR连接
          if (typeof ws.onConnectionLost === 'function') {
            ws.onConnectionLost();
          }
        }, delay);
      } else {
        console.log(`Connection ended with code ${code}, not attempting reconnection`);
      }
    } else {
      console.log('Normal connection closure');
    }

    if (!state.taskStarted) {
      console.error('ASR任务未启动，关闭连接');
    } else if (!state.hasReceivedResults) {
      console.warn('ASR连接关闭，但未收到任何识别结果');
    } else {
      console.log('ASR连接已关闭');
    }
    state.readyToSendAudio = false;
    state.isEnding = false;
    state.isFinished = false; // Reset finished flag
    state.taskStarted = false; // Reset task started flag
    state.accumulatedText = ''; // Clear accumulated text
    state.connectionState = ConnectionState.INITIALIZING; // Reset to initial state
  });

  // Optimized sendEndSignal for faster state reset
  ws.sendEndSignal = () => {
    console.log('Initiating ASR session end with finish-task command...');

    // Prevent multiple end sequences
    if (state.isEnding) {
      console.log('ASR session end already initiated, skipping duplicate request');
      return;
    }

    state.isEnding = true;

    // Update state to reflect processing
    state.isProcessing = true;

    // Do NOT process any accumulated text here, as the final complete sentence will come from ASR
    // with sentence_end: true and will be processed in the result-generated handler
    if (state.accumulatedText && state.accumulatedText.trim() !== '') {
      console.log('NOT processing accumulated text during end signal, waiting for final ASR result:', state.accumulatedText);
    }

    // Send finish-task command to properly end the ASR session
    sendFinishTask();

    // Faster state reset for quicker reuse of the same connection
    // Reduce timeout from 1000ms to 300ms for faster reset
    setTimeout(() => {
      console.log('Resetting ASR connection state for next session');

      // Process any pending final text if available (this comes from the final ASR result after finish-task)
      if (state.pendingFinalText) {
        console.log('Processing pending final text:', state.pendingFinalText);
        onText(state.pendingFinalText);
        state.pendingFinalText = null;
      }

      // Reset only the relevant states for a new recognition task
      state.isEnding = false;
      state.isProcessing = false;
      state.accumulatedText = '';
      state.hasReceivedResults = false;
      state.isFinished = false;

      // Re-enable audio sending
      if (ws.readyState === WebSocket.OPEN) {
        state.connectionState = ConnectionState.READY;
        state.readyToSendAudio = true;
        console.log('ASR connection ready for next audio input');

        // Clear any existing keepalive timer first
        if (state.keepaliveTimer) {
          clearInterval(state.keepaliveTimer);
        }

        // Instead of sending silent audio packets which can cause issues,
        // we rely on the WebSocket's built-in keepalive and proper error handling
        // We can optionally add a lightweight ping mechanism if needed
      } else {
        console.warn('Cannot reset ASR connection - WebSocket is closed');

        // If connection is closed, notify parent to recreate it
        if (typeof ws.onConnectionLost === 'function') {
          ws.onConnectionLost();
        }
      }
    }, 300); // Reduced from 1000ms to 300ms for faster reset
  };

  // Enhanced sendAudioData method with improved state checking
  ws.sendAudioData = (audioChunk) => {
    if (isValidForAudio()) {
      // Only send the audio data without interfering with the connection
      ws.send(audioChunk);
    } else if (ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket未连接，无法发送音频数据');
      // Try to reinitialize if connection is lost
      if (typeof ws.onConnectionLost === 'function') {
        ws.onConnectionLost();
      }
    } else if (state.hasError) {
      console.error('ASR连接有错误，无法发送音频数据');
    } else if (!state.readyToSendAudio) {
      console.log('ASR尚未准备就绪，或正在结束会话，音频数据可能被忽略...');
      // Queue the audio data if possible
      if (typeof ws.queueAudioData === 'function') {
        ws.queueAudioData(audioChunk);
      }
    } else if (state.isEnding) {
      console.log('ASR会话正在结束，音频数据被丢弃');
    }
  };

  // Add a method to queue audio data if connection is not ready
  ws.queueAudioData = (audioChunk) => {
    // In this implementation, we won't actively queue, but in a more complex scenario
    // you might want to store chunks temporarily and send them when ready
    console.log('Queuing audio data for later transmission:', audioChunk ? 'received' : 'not received');
  };

  // Enhanced isReady method
  ws.isReady = () => state.connectionState === ConnectionState.READY && !state.hasError && !state.isEnding;

  // Add getState method to allow external inspection of internal state
  ws.getState = () => ({
    ...state,
    ConnectionState // Include the enum in the returned state for debugging
  });

  // Add a method to clear the accumulated text without processing it
  ws.clearAccumulatedText = () => {
    if (state.accumulatedText && state.accumulatedText.trim() !== '') {
      console.log('Clearing accumulated text without processing:', state.accumulatedText);
      state.accumulatedText = '';
    }
  };

  // Add a method to check if we're currently ending
  ws.isEnding = () => state.isEnding;

  return ws;
}
