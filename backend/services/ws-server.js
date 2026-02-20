import { WebSocketServer } from "ws";
import { createASRConnection } from "./asr.js";
import { qwenChat } from "./chat.js";
import fetch from "node-fetch";

// 为每个WebSocket客户端维护独立的历史记录
const clientHistories = new Map();

// 为每个客户端维护额外的状态信息
const clientStates = new Map();

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
  };

  // Store client state
  clientStates.set(clientState.id, clientState);

  // Initialize ASR session with proper state tracking
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

      // 过滤掉可能的空白文本
      if (!userText || userText.trim() === '') {
        console.log('忽略空白的ASR识别结果');
        return;
      }

      // 避免重复或递增文本（如从"给我讲个故"变成"给我讲个故事吧长着什么秘"）
      // 检查新文本是否包含了旧文本作为前缀，如果是，则认为是延续而不是新输入
      const currentHistory = clientHistories.get(clientState.id) || [];
      const lastUserMessage = currentHistory.length > 0 ?
        currentHistory.slice(-1)[0] : { content: "" };

      if (lastUserMessage && lastUserMessage.role === 'user') {
        const lastText = lastUserMessage.content;
        // 如果新文本包含了上一个文本作为前缀，可能只是延续
        if (userText.startsWith(lastText) && userText.length > lastText.length + 5) {
          // 只处理显著不同的新文本
          console.log('Detected continuation, processing as incremental:', userText);
        }
      }

      console.log('收到ASR识别结果:', userText);

      // 检查WebSocket客户端是否存在且连接
      if (!client || typeof client.readyState === 'undefined') {
        console.error('WebSocket客户端状态无法检查');
        return;
      }

      console.log('WebSocket当前状态码:', client.readyState, 'OPEN状态码:', client.OPEN);

      // 改进连接状态检查逻辑，增加重试机制
      let attempts = 0;
      const maxAttempts = 3;
      const checkAndSendMessage = () => {
        if (client.readyState === client.OPEN) {
          // 向前端发送用户语音转文字结果
          try {
            client.send(JSON.stringify({
                type: "user",
                text: userText
            }));
            console.log('成功发送用户消息到前端:', userText);
          } catch (error) {
            console.error('发送用户消息到前端失败:', error);
            return false;
          }
          return true;
        } else if (attempts < maxAttempts) {
          attempts++;
          console.log(`WebSocket未连接，第${attempts}次尝试延迟发送...`);
          setTimeout(checkAndSendMessage, 500); // 延迟500ms后重试
          return false;
        } else {
          console.warn('WebSocket客户端未处于OPEN状态，状态码:', client.readyState);
          return false;
        }
      };

      if (!checkAndSendMessage()) {
        return; // 如果连接状态检查失败，则退出
      }

      // 将用户输入添加到该客户端的历史记录中
      history.push({ role: "user", content: userText });

      console.log('【DEBUG-CONV】准备发送给AI模型的输入:', userText);
      console.log('【DEBUG-CONV】当前对话历史长度:', history.length);

      try {
        const reply = await qwenChat(history);

        console.log('【DEBUG-CONV】从AI模型收到的回复:', reply);

        // 再次检查WebSocket连接状态，使用相同的重试逻辑
        let aiReplyAttempts = 0;
        const checkAndSendAIReply = async () => {
          if (client.readyState === client.OPEN) {
            try {
              // 将AI回复添加到该客户端的历史记录中
              history.push({ role: "assistant", content: reply });

              // TTS（复用你已有逻辑）
              const ttsResp = await fetch("http://localhost:3000/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: reply })
              });

              const audio = await ttsResp.arrayBuffer();

              client.send(JSON.stringify({
                type: "assistant",
                text: reply,
                audio: Buffer.from(audio).toString("base64")
              }));

              console.log('已发送AI回复到前端');
            } catch (ttsError) {
              console.error('发送AI回复到前端失败:', ttsError);

              // 即使TTS失败，也要尝试发送文本回复
              if (client.readyState === client.OPEN) {
                try {
                  client.send(JSON.stringify({
                    type: "assistant",
                    text: reply,
                    audio: ""
                  }));
                  console.log('已发送AI文本回复到前端');
                } catch (textError) {
                  console.error('发送AI文本回复也失败了:', textError);
                }
              }
            }
          } else if (aiReplyAttempts < maxAttempts) {
            aiReplyAttempts++;
            console.log(`WebSocket未连接，第${aiReplyAttempts}次尝试发送AI回复...`);
            setTimeout(checkAndSendAIReply, 500); // 延迟500ms后重试
          } else {
            console.warn('WebSocket客户端在AI处理后已关闭或状态异常，无法发送回复');
          }
        };

        await checkAndSendAIReply();
      } catch (error) {
        console.error('处理AI回复时出错:', error);

        // 尝试发送错误消息到前端（如果连接可用），使用重试逻辑
        let errorAttempts = 0;
        const sendErrorMessage = () => {
          if (client.readyState === client.OPEN) {
            try {
              client.send(JSON.stringify({
                type: "assistant",
                text: "抱歉，我现在有点忙，稍后再聊好吗？",
                audio: ""
              }));
            } catch (sendError) {
              console.error('发送错误消息也失败了:', sendError);
            }
          } else if (errorAttempts < maxAttempts) {
            errorAttempts++;
            console.log(`WebSocket未连接，第${errorAttempts}次尝试发送错误消息...`);
            setTimeout(sendErrorMessage, 500); // 延迟500ms后重试
          } else {
            console.error('无法发送错误消息到前端，WebSocket连接不可用');
          }
        };

        sendErrorMessage();
      }
    });

    // 为ASR连接添加连接丢失处理
    clientState.asrSession.onConnectionLost = () => {
      console.log('ASR连接丢失，正在重新创建连接...');

      // 延迟一小段时间后重新初始化
      setTimeout(() => {
        if (client.readyState === client.OPEN) {
          initializeASRSession(); // 重新初始化ASR会话
        } else {
          console.log('客户端WebSocket已关闭，不再重连ASR');
        }
      }, 1000);
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

    // If ASR is not ready, queue the message instead of dropping it
    if (clientState.asrSession &&
        clientState.asrSession.isReady &&
        !clientState.asrSession.isReady()) {
      console.log('ASR not ready, queuing audio message');
      clientState.messageQueue.push(data);

      // Process queue when ASR becomes ready
      const queueChecker = setInterval(() => {
        if (clientState.asrSession && clientState.asrSession.isReady && clientState.asrSession.isReady()) {
          processMessageQueue();
          clearInterval(queueChecker);
        }
      }, 100); // Check every 100ms if ASR is ready

    } else {
      // Forward audio data to ASR
      forwardToASR(data);
    }
  });

  client.on("close", () => {
    console.log("🔌 Client disconnected");
    clientState.isConnected = false;

    // Remove client history
    clientHistories.delete(clientState.id);
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