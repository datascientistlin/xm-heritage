import { WebSocketServer } from "ws";
import { createASRConnection } from "./asr.js";
import { qwenChat } from "./chat.js";
import fetch from "node-fetch";
import { calculateSimilarity, findLongestCommonPrefix, cleanTextForComparison } from "../utils/text-utils.js";
import { checkAndSendMessage, cleanupClientResources } from "../utils/ws-utils.js";

// 为每个WebSocket客户端维护独立的历史记录
const clientHistories = new Map();

// 为每个客户端维护额外的状态信息
const clientStates = new Map();

// 用于跟踪每个客户端的最后AI回复时间和内容，以防止重复
const lastAIReplyInfo = new Map();

const wss = new WebSocketServer({ port: 3001 });

wss.on("connection", client => {
  console.log("🎤 Client connected for audio conversation");

  // Track client-specific state
  const clientState = {
    id: Date.now() + Math.random(), // Unique client ID
    isConnected: true,
    asrSession: null,
    messageQueue: [], // Queue for messages during initialization
    sessionStartTime: Date.now(),
    lastUserInteraction: Date.now(), // Track last user interaction
    interactionSequence: 0, // Track interaction sequence
    currentInteractionSeq: 0, // Track the current interaction being processed
    lastProcessedText: "", // Track the last processed text to detect repetition/continuation
    lastProcessedTime: Date.now(), // Track the last processed time for better duplicate detection
    asrProcessingLock: false, // Lock to prevent duplicate processing of the same ASR result
  };

  // Store client state
  clientStates.set(clientState.id, clientState);

  // Initialize ASR session with proper state tracking and optimized connection handling
  const initializeASRSession = () => {
    // 获取或初始化该客户端的对话历史
    if (!clientHistories.has(clientState.id)) {
      clientHistories.set(clientState.id, []);
    }
    const history = clientHistories.get(clientState.id);

    clientState.asrSession = createASRConnection(async userText => {
      console.log("ASR回调函数被调用，接收到文本:", userText);

      // 确保WebSocket客户端对象存在
      if (!client) {
        console.error('WebSocket客户端对象不存在');
        return;
      }

      // 使用处理锁防止同一ASR结果被重复处理
      if (clientState.asrProcessingLock) {
        console.log('ASR正在处理中，跳过本次处理:', userText);
        return;
      }

      clientState.asrProcessingLock = true;

      try {
        // 过滤掉可能的空白文本
        if (!userText || userText.trim() === '') {
          console.log('忽略空白的ASR识别结果');
          return;
        }

        // 检查是否与上次处理的文本完全相同，避免完全重复的文本
        if (userText === clientState.lastProcessedText) {
          console.log('检测到完全重复文本，跳过处理:', userText);
          return;
        }

        // 检查当前时间与上次处理时间的间隔，如果太短且内容相似，则认为是重复
        const currentTime = Date.now();
        const timeSinceLastProcess = currentTime - (clientState.lastProcessedTime || 0);

        // 如果时间间隔小于1.5秒且新文本包含了上一个文本或反之，则认为是重复或延续
        if (timeSinceLastProcess < 1500 &&
            clientState.lastProcessedText) {

          // 检查是否是完全相同的文本（忽略标点符号差异）
          const cleanCurrent = cleanTextForComparison(userText);
          const cleanPrevious = cleanTextForComparison(clientState.lastProcessedText);

          // Only skip if the texts are essentially the same after cleaning
          // Allow different texts to be processed even if they're similar
          if (cleanCurrent === cleanPrevious) {
            console.log('检测到标点差异的重复文本，跳过处理:', userText);
            return;
          }

          // 检查是否是新文本包含了旧文本或者是相反的情况
          // 改进的比较逻辑：考虑语义完整性
          if ((userText.includes(clientState.lastProcessedText) && userText.length <= clientState.lastProcessedText.length + 20) ||
              (clientState.lastProcessedText.includes(userText) && clientState.lastProcessedText.length <= userText.length + 20)) {
            // 如果新文本是旧文本的扩展，且看起来是更完整的结果，则使用新文本
            // 例如，从"你家什么"到"你叫什么名字"，后者更合理
            if (userText.length > clientState.lastProcessedText.length) {
              // 新文本更长，检查是否是语义上的修正
              const commonPrefix = findLongestCommonPrefix(cleanCurrent, cleanPrevious);

              // 如果公共前缀较短，说明可能不是简单的扩展，而是识别修正
              if (commonPrefix.length < Math.min(cleanCurrent.length, cleanPrevious.length) * 0.7) {
                // 例如"你家什么" -> "你叫什么名字"，公共前缀"你"相对较短
                // 这可能表明是识别错误的修正，保留较新的结果更为合理
                console.log('检测到可能的识别修正，保留新文本:', userText, '而非旧文本:', clientState.lastProcessedText);
                // 继续 processing with the new text, not return
              } else {
                console.log('检测到延续或重复的相似文本，跳过处理:', userText);
                return;
              }
            } else {
              console.log('检测到延续或重复的相似文本，跳过处理:', userText);
              return;
            }
          }

          // 检查是否是常见的识别变体
          // 例如 "你家什么" 和 "你叫什么" 很相似，可能是同一个意图的不同识别
          const similarityRatio = calculateSimilarity(cleanCurrent, cleanPrevious);
          if (similarityRatio > 0.7 && similarityRatio < 1.0) { // Only skip if similar but not identical
            console.log('检测到高相似度文本，跳过处理:', userText, 'vs', clientState.lastProcessedText, '相似度:', similarityRatio);
            return;
          }
        }

        // 检查是否与最近的对话历史中的文本重复
        const currentHistory = clientHistories.get(clientState.id) || [];
        const recentUserMessages = currentHistory.filter(item => item.role === 'user').slice(-3); // 检查最近3条用户消息

        for (const msg of recentUserMessages) {
          // 检查是否与最近的消息相同或相似
          if (msg.content === userText) {
            console.log('检测到与近期历史重复的文本，跳过处理:', userText);
            return;
          }

          // 检查是否有高度相似的文本（忽略标点）
          const cleanCurrent = cleanTextForComparison(userText);
          const cleanRecent = cleanTextForComparison(msg.content);

          const similarityRatio = calculateSimilarity(cleanCurrent, cleanRecent);
          if (similarityRatio > 0.7) {
            console.log('检测到与近期历史高相似度文本，跳过处理:', userText, 'vs', msg.content, '相似度:', similarityRatio);
            return;
          }
        }

        // 检查文本是否是完整的句子
        // 修改逻辑：现在我们依赖ASR自身的sentence_end标志，而不是在这里再次检查完整性
        // 所有来自ASR的文本现在都被视为最终结果，因为它们是在finish-task后返回的

        // Since we're now treating all ASR text as complete sentences, we'll always update the tracking
        // and proceed to process the text, but still apply duplicate detection
        clientState.lastProcessedText = userText;
        clientState.lastProcessedTime = currentTime;

        console.log('收到ASR识别结果，准备发送到AI:', userText);

        console.log('收到完整的ASR识别结果，准备发送到AI:', userText);

        // 检查WebSocket客户端是否存在且连接
        if (!client || typeof client.readyState === 'undefined') {
          console.error('WebSocket客户端状态无法检查');
          return;
        }

        console.log('WebSocket当前状态码:', client.readyState, 'OPEN状态码:', client.OPEN);

        // 向前端发送用户语音转文字结果
        const userMessageSent = await checkAndSendMessage(client, {
          type: "user",
          text: userText
        });

        if (!userMessageSent) {
          console.warn('无法发送用户消息到前端');
          return;
        }
        console.log('成功发送用户消息到前端:', userText);

        // 将用户输入添加到该客户端的历史记录中
        history.push({ role: "user", content: userText });

        console.log('【DEBUG-CONV】准备发送给AI模型的输入:', userText);
        console.log('【DEBUG-CONV】当前对话历史长度:', history.length);

        try {
          const reply = await qwenChat(history);

          console.log('【DEBUG-CONV】从AI模型收到的回复:', reply);

          // 检查是否在短时间内收到了相同的AI回复（防止ASR被重复触发）
          const now = Date.now();
          const clientLastReply = lastAIReplyInfo.get(clientState.id);

          if (clientLastReply) {
            // 如果距离上次回复不到2秒且内容相同，则跳过此次回复
            if (now - clientLastReply.timestamp < 2000 && clientLastReply.content === reply) {
              console.log('检测到短时间内相同的AI回复，跳过发送:', reply);
              return;
            }
          }

          // 更新最后AI回复信息
          lastAIReplyInfo.set(clientState.id, {
            content: reply,
            timestamp: now
          });

          // 清理超过5秒的旧记录，避免内存泄漏
          for (let [key, value] of lastAIReplyInfo.entries()) {
            if (now - value.timestamp > 5000) {
              lastAIReplyInfo.delete(key);
            }
          }

          // 发送AI回复到前端
          const ttsResp = await fetch("http://localhost:3000/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: reply })
          });

          const audio = await ttsResp.arrayBuffer();

          const aiMessageSent = await checkAndSendMessage(client, {
            type: "assistant",
            text: reply,
            audio: Buffer.from(audio).toString("base64")
          });

          if (!aiMessageSent) {
            // 即使TTS失败，也要尝试发送文本回复
            await checkAndSendMessage(client, {
              type: "assistant",
              text: reply,
              audio: ""
            });
            console.log('已发送AI文本回复到前端');
          } else {
            console.log('已发送AI回复到前端');
          }
        } catch (error) {
          console.error('处理AI回复时出错:', error);

          // 尝试发送错误消息到前端（如果连接可用）
          await checkAndSendMessage(client, {
            type: "assistant",
            text: "抱歉，我现在有点忙，稍后再聊好吗？",
            audio: ""
          });
        }
      } finally {
        // 释放处理锁
        clientState.asrProcessingLock = false;
      }
    });

    // 为ASR连接添加连接丢失处理
    clientState.asrSession.onConnectionLost = () => {
      console.log('ASR连接丢失，正在重新创建连接...');

      // 优化重连逻辑：仅在客户端仍连接时重连
      if (client.readyState === client.OPEN) {
        // 避免立即重连，等待一点时间
        setTimeout(() => {
          // 检查客户端是否仍然连接
          if (client.readyState === client.OPEN) {
            initializeASRSession(); // 重新初始化ASR会话
          } else {
            console.log('客户端WebSocket已关闭，不再重连ASR');
          }
        }, 500); // 减少重连延迟
      } else {
        console.log('客户端WebSocket已关闭，不再重连ASR');
      }
    };

    return clientState.asrSession;
  };

  // 初始化ASR会话
  initializeASRSession();

  // Process queued messages once ASR is ready
  const processMessageQueue = () => {
    if (!clientState.asrSession || !clientState.asrSession.isReady || !clientState.asrSession.isReady()) {
      console.log('ASR not ready, keeping messages queued');
      return;
    }

    // Process all queued messages
    while (clientState.messageQueue.length > 0) {
      const message = clientState.messageQueue.shift();
      forwardToASR(message);
    }
  };

  // Process queued messages when connection state changes
  const queueChecker = setInterval(() => {
    if (clientState.asrSession && clientState.asrSession.isReady && clientState.asrSession.isReady()) {
      processMessageQueue();
    }
  }, 100); // Check every 100ms if ASR is ready

  // Store the interval ID in clientState for proper cleanup
  clientState.queueChecker = queueChecker;

  client.on("message", (data) => {
    // Check if this is a control signal
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'user_done_speaking') {
        console.log('Received user completion signal');

        // Increment the interaction sequence to mark a clear boundary
        clientState.interactionSequence++;
        clientState.currentInteractionSeq = clientState.interactionSequence;

        console.log('Interaction sequence updated to:', clientState.currentInteractionSeq);

        // Notify ASR of audio end
        if (clientState.asrSession && clientState.asrSession.sendEndSignal) {
          // Before ending the signal, make sure we clear any pending timeouts
          // in the ASR connection that might interfere
          console.log('Sending end signal to ASR session');
          clientState.asrSession.sendEndSignal();

          // Also clear any accumulated text in the ASR session to prevent carryover
          if (clientState.asrSession.clearAccumulatedText) {
            clientState.asrSession.clearAccumulatedText();
          }
        } else {
          console.warn('ASR session not available when user done speaking');
        }

        return;
      }

      if (message.type === 'ping' || message.type === 'status') {
        // Handle other control signals
        return;
      }
    } catch (e) {
      // Not JSON data, treat as audio data
    }

    // Check ASR session readiness with a timeout
    if (clientState.asrSession &&
        typeof clientState.asrSession.isReady === 'function' &&
        clientState.asrSession.isReady()) {
      // Forward audio data to ASR immediately if ready
      forwardToASR(data);
    } else {
      // Queue the message if ASR is not ready
      console.log('ASR not ready, queuing audio message');
      clientState.messageQueue.push(data);

      // Attempt to process queue when ASR becomes ready
      const readyChecker = setInterval(() => {
        if (clientState.asrSession &&
            typeof clientState.asrSession.isReady === 'function' &&
            clientState.asrSession.isReady()) {
          processMessageQueue();
          clearInterval(readyChecker);
        }
      }, 50); // Check every 50ms if ASR is ready

      // Clear interval after a reasonable timeout to prevent memory leaks
      setTimeout(() => {
        clearInterval(readyChecker);
      }, 10000); // 10 second timeout
    }
  });

  client.on("close", () => {
    console.log("🔌 Client disconnected");
    clientState.isConnected = false;

    // Clear the queue checker interval
    if (clientState.queueChecker) {
      clearInterval(clientState.queueChecker);
    }

    // Remove client history
    cleanupClientResources(clientHistories, lastAIReplyInfo, clientState.id);
    clientStates.delete(clientState.id);

    // Cleanup ASR session
    if (clientState.asrSession && typeof clientState.asrSession.close === 'function') {
      clientState.asrSession.close();
    }
  });

  // Helper function to safely forward data to ASR
  function forwardToASR(data) {
    console.log('Forwarding audio data to ASR');

    // Safely attempt to send audio data with proper state checking
    if (clientState.asrSession &&
        clientState.asrSession.sendAudioData &&
        clientState.asrSession.isReady &&
        clientState.asrSession.isReady()) {
      clientState.asrSession.sendAudioData(data);
    } else if (clientState.asrSession) {
      // Use general send method as fallback
      clientState.asrSession.send(data);
    } else {
      console.warn('ASR session not available, dropping audio data');
    }
  }
});

console.log("✅ WebSocket ASR server running at ws://localhost:3001");