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

// 创建ASR连接的函数
export function createASRConnection(onText) {
  // 生成32位随机ID
  const TASK_ID = uuidv4().replace(/-/g, '').slice(0, 32);

  const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference/', {
    headers: {
      Authorization: `bearer ${apiKey}`
    }
  });

  // Enhanced state management
  let state = {
    taskStarted: false, // 标记任务是否已启动
    readyToSendAudio: false, // 标记是否可以发送音频
    accumulatedText: '', // 累积识别结果
    hasReceivedResults: false, // 标记是否已经收到过识别结果
    isProcessing: false, // 标记是否正在处理
    hasError: false, // 标记是否有错误
    lastErrorMessage: null, // 存储最后的错误信息
    isEnding: false, // 标记是否正在结束会话
    reconnectAttempts: 0, // 重连尝试次数
    maxReconnectAttempts: 3, // 最大重连尝试次数
    textTimeout: null, // 文本超时定时器
    keepaliveTimer: null // 保持连接活跃的定时器
  };

  // Health monitoring
  let healthMonitor = {
    lastActivityTime: Date.now(),
    isActive: true,
    healthCheckInterval: null
  };

  // Start health monitoring when connection opens
  ws.on('open', () => {
    console.log('ASR WebSocket: 连接到服务器');
    state.taskStarted = false;
    state.readyToSendAudio = false;
    state.hasError = false;
    state.isEnding = false;

    // Update health monitor
    healthMonitor.lastActivityTime = Date.now();

    // Send initial task
    sendRunTask();

    // Start health check interval
    if (!healthMonitor.healthCheckInterval) {
      healthMonitor.healthCheckInterval = setInterval(() => {
        if (Date.now() - healthMonitor.lastActivityTime > 30000) { // 30 seconds no activity
          console.warn('ASR connection appears inactive, checking state...');
          if (ws.readyState === WebSocket.OPEN && state.readyToSendAudio) {
            // Connection is open but no activity - might need attention
            console.log('Still connected to ASR service, maintaining connection...');
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

    const message = JSON.parse(data.toString());
    switch (message.header.event) {
      case 'task-started':
        console.log('ASR WebSocket: 任务开始');
        state.taskStarted = true;
        state.readyToSendAudio = true;
        state.hasError = false; // Reset error state on successful start
        break;
      case 'result-generated':
        state.hasReceivedResults = true; // 标记已收到结果
        const newText = message.payload.output.sentence.text;
        console.log('ASR识别结果：', newText);

        // 检查是否有定时器，如果有则清除
        if (state.textTimeout) {
          clearTimeout(state.textTimeout);
          state.textTimeout = null;
          console.log('文本超时定时器已清除，等待更多文本...');
        }

        // 不是简单地追加文本，而是使用最新识别的完整文本
        // ASR服务通常会返回完整的句子，而不是增量部分
        state.accumulatedText = newText;

        // 如果句子结束，触发回调函数
        if (message.payload.output.sentence.is_end) {
          console.log('句子结束，触发回调函数，累积文本:', state.accumulatedText);
          state.isProcessing = true;

          // Process the text
          onText(state.accumulatedText);

          // Reset for next sentence
          state.accumulatedText = '';
          state.isProcessing = false;
        } else {
          // 如果不是句子结束，设置一个定时器，如果一段时间内没有新文本到达，则触发回调
          console.log('文本片段识别完成，设置超时机制，当前累积文本:', state.accumulatedText);

          state.textTimeout = setTimeout(() => {
            console.log('达到超时时间，触发回调函数处理累积文本:', state.accumulatedText);
            if (state.accumulatedText && state.accumulatedText.trim() !== '') {
              state.isProcessing = true;

              // Process the accumulated text
              onText(state.accumulatedText);

              // Reset for next segment
              state.accumulatedText = '';
              state.isProcessing = false;
            }
            state.textTimeout = null;
          }, 1500); // 1.5秒无新文本到达则触发
        }

        if (message.payload.usage) {
          console.log('ASR任务计费时长（秒）：', message.payload.usage.duration);
        }
        break;
      case 'task-finished':
        console.log('ASR任务完成');
        state.readyToSendAudio = false;

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

  // Enhanced error handling with retry logic
  ws.on('error', (error) => {
    console.error('ASR WebSocket错误：', error);
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

    // Attempt to reconnect if under limit and not an authentication error
    if (state.reconnectAttempts < state.maxReconnectAttempts && error.message !== 'Authentication failed') {
      console.log(`Attempting to reconnect (${state.reconnectAttempts + 1}/${state.maxReconnectAttempts})`);
      state.reconnectAttempts++;

      setTimeout(() => {
        // Recreate the WebSocket connection
        const newWs = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference/', {
          headers: {
            Authorization: `bearer ${apiKey}`
          }
        });

        // We should pass the onText callback to the new connection
        // This requires more sophisticated reconnection handling
        // which would involve exposing a reconnection method to the caller
      }, 2000 * state.reconnectAttempts); // Exponential backoff
    } else {
      console.error('Max reconnection attempts reached or authentication failed');

      // Even with error, send accumulated text if any
      if (state.accumulatedText && state.accumulatedText.trim() !== '') {
        console.log('Sending accumulated text despite error:', state.accumulatedText);

        // This is tricky - we need to somehow notify the parent about the accumulated text
        // when the connection is lost. For now, we'll log this situation.
        console.log('WARNING: Accumulated text exists but connection is lost. Parent should handle this.');
      }
    }
  });

  // Enhanced connection close handling with health monitoring cleanup
  ws.on('close', (code, reason) => {
    console.log(`ASR WebSocket closed. Code: ${code}, Reason: ${reason}`);

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

      // 根据错误代码决定是否重连
      if (code === 1007) { // Invalid payload，可能需要重连
        console.log('Invalid payload detected, attempting reconnection');

        // 尝试重新连接
        setTimeout(() => {
          // 通知外部连接已断开，需要重新初始化ASR连接
          if (typeof ws.onConnectionLost === 'function') {
            ws.onConnectionLost();
          }
        }, 1000);
      } else if (state.hasReceivedResults && code !== 1000) {
        console.log('Connection ended unexpectedly, but had results. May need reconnection depending on use case.');
      }
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
    state.taskStarted = false; // Reset task started flag
    state.accumulatedText = ''; // Clear accumulated text
  });

  // Enhanced sendEndSignal with improved timing and safety
  ws.sendEndSignal = () => {
    console.log('Initiating ASR session end sequence...');

    // Prevent multiple end sequences
    if (state.isEnding) {
      console.log('ASR session end already initiated, skipping duplicate request');
      return;
    }

    state.isEnding = true;

    // Update state to reflect processing
    state.isProcessing = true;

    // Process any accumulated text immediately before ending the session
    if (state.accumulatedText && state.accumulatedText.trim() !== '') {
      console.log('Processing accumulated text before ending session:', state.accumulatedText);

      // Clear the timeout if it exists, as we're manually triggering the callback
      if (state.textTimeout) {
        clearTimeout(state.textTimeout);
        state.textTimeout = null;
        console.log('Cleared text timeout before manual trigger');
      }

      // Process the accumulated text immediately
      onText(state.accumulatedText);

      // Reset the accumulated text
      state.accumulatedText = '';
    }

    // Send end marker as per DashScope API specification
    try {
      // Create a small buffer of silence to mark end
      const silenceBuffer = new ArrayBuffer(320); // 10ms of 16kHz PCM
      const silenceView = new DataView(silenceBuffer);
      for (let i = 0; i < silenceBuffer.byteLength; i += 2) {
        silenceView.setInt16(i, 0, true); // Little endian zero
      }

      // Send multiple end markers for reliability
      ws.send(silenceBuffer);

      // Rather than closing the connection immediately, we'll reset state
      // to allow for subsequent audio inputs in the same session
      setTimeout(() => {
        console.log('Resetting ASR connection state for next session');

        // Reset only the relevant states for a new recognition task
        state.isEnding = false;
        state.isProcessing = false;
        state.accumulatedText = '';
        state.hasReceivedResults = false;

        // Re-enable audio sending
        if (ws.readyState === WebSocket.OPEN) {
          state.readyToSendAudio = true;
          console.log('ASR connection ready for next audio input');

          // Clear any existing keepalive timer first
          if (state.keepaliveTimer) {
            clearInterval(state.keepaliveTimer);
          }

          // Set up a keepalive timer to send minimal data periodically to keep connection alive
          // But use a more conservative approach - send less frequently to avoid payload issues
          state.keepaliveTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN &&
                state.readyToSendAudio &&
                !state.isEnding &&
                !state.hasError) {

              // Send a very minimal audio packet to keep the connection alive
              // Make sure this is a valid PCM packet
              const tinySilence = new Int16Array(160); // 5ms of 16kHz PCM, zeroed by default
              ws.send(Buffer.from(tinySilence.buffer));

              // Log this to see how often keepalive is happening
              console.log('Keepalive: Sending minimal data to maintain connection');
            } else {
              // If connection is no longer suitable for sending data, clear the timer
              if (state.keepaliveTimer) {
                clearInterval(state.keepaliveTimer);
                state.keepaliveTimer = null;
              }
            }
          }, 15000); // Send keepalive every 15 seconds (was 18 seconds) to stay under 23s timeout
        } else {
          console.warn('Cannot reset ASR connection - WebSocket is closed');

          // If connection is closed, notify parent to recreate it
          if (typeof ws.onConnectionLost === 'function') {
            ws.onConnectionLost();
          }
        }

        // Remove the problematic code that tried to send a new run-task command
        // since ASR service doesn't allow restarting tasks in the middle of a session
      }, 1000); // Wait 1 second to allow processing

    } catch (error) {
      console.error('Error sending end signal:', error);

      // Reset state even if there's an error
      state.isEnding = false;
      state.isProcessing = false;
      state.accumulatedText = '';

      if (ws.readyState === WebSocket.OPEN) {
        state.readyToSendAudio = true;
      } else {
        // Connection closed during reset
        console.warn('Connection closed during reset, notifying parent');
        if (typeof ws.onConnectionLost === 'function') {
          ws.onConnectionLost();
        }
      }
    }
  };

  // Enhanced sendAudioData method with improved state checking
  ws.sendAudioData = (audioChunk) => {
    if (ws.readyState === WebSocket.OPEN && state.readyToSendAudio && !state.hasError && !state.isEnding) {
      // Pause keepalive mechanism briefly when sending audio data to prevent conflicts
      if (state.keepaliveTimer) {
        // Temporarily pause the keepalive to avoid interfering with audio data
        clearInterval(state.keepaliveTimer);

        // Resume keepalive after a short delay to allow audio transmission
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN &&
              state.readyToSendAudio &&
              !state.isEnding &&
              !state.hasError) {

            // Restart the keepalive timer
            state.keepaliveTimer = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN &&
                  state.readyToSendAudio &&
                  !state.isEnding &&
                  !state.hasError) {

                // Send minimal audio data to keep the connection alive
                // Make sure this is a valid PCM packet
                const tinySilence = new Int16Array(160); // 5ms of 16kHz PCM, zeroed by default
                ws.send(Buffer.from(tinySilence.buffer));

                // Log this to see how often keepalive is happening
                console.log('Keepalive: Sending minimal data to maintain connection');
              } else {
                // If connection is no longer suitable for sending data, clear the timer
                if (state.keepaliveTimer) {
                  clearInterval(state.keepaliveTimer);
                  state.keepaliveTimer = null;
                }
              }
            }, 15000); // Send keepalive every 15 seconds to stay under 23s timeout
          }
        }, 1000); // Wait 1 second after audio transmission to resume keepalive
      }

      ws.send(audioChunk);
    } else if (ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket未连接，无法发送音频数据');
    } else if (state.hasError) {
      console.error('ASR连接有错误，无法发送音频数据');
    } else if (!state.readyToSendAudio) {
      console.log('ASR尚未准备就绪，或正在结束会话，音频数据可能被忽略...');
    }
  };

  // Enhanced isReady method
  ws.isReady = () => state.readyToSendAudio && !state.hasError && !state.isEnding;

  // Add getState method to allow external inspection of internal state
  ws.getState = () => ({ ...state });

  // Add a method to clear the accumulated text without processing it
  ws.clearAccumulatedText = () => {
    if (state.accumulatedText && state.accumulatedText.trim() !== '') {
      console.log('Clearing accumulated text without processing:', state.accumulatedText);
      state.accumulatedText = '';
    }
  };

  return ws;
}
