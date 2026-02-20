import { createASRConnection } from "./asr.js";
import { qwenChat } from "./chat.js";
import fetch from "node-fetch";

// 为每个WebSocket客户端维护独立的历史记录
const clientHistories = new Map();

export function startConversation(wsClient) {
  // 为当前客户端创建唯一标识符
  const clientId = wsClient._socket ? wsClient._socket.remoteAddress + ':' + wsClient._socket.remotePort : Date.now();

  // 初始化该客户端的对话历史
  clientHistories.set(clientId, []);
  let history = clientHistories.get(clientId);

  console.log("Creating new ASR connection for WebSocket client with ID:", clientId);

  // 保存原始的onText回调函数
  const asrWS = createASRConnection(async userText => {
    console.log("ASR回调函数被调用，接收到文本:", userText);

    // 确保WebSocket客户端对象存在
    if (!wsClient) {
      console.error('WebSocket客户端对象不存在');
      return;
    }

    // 获取最新的历史记录（以防在异步期间被其他地方修改）
    history = clientHistories.get(clientId) || [];

    // 过滤掉可能的空白文本
    if (!userText || userText.trim() === '') {
      console.log('忽略空白的ASR识别结果');
      return;
    }

    console.log('收到ASR识别结果:', userText);

    // 检查WebSocket客户端是否存在且连接
    if (!wsClient || typeof wsClient.readyState === 'undefined') {
      console.error('WebSocket客户端状态无法检查');
      return;
    }

    console.log('WebSocket当前状态码:', wsClient.readyState, 'OPEN状态码:', wsClient.OPEN);

    // 改进连接状态检查逻辑，增加重试机制
    let attempts = 0;
    const maxAttempts = 3;
    const checkAndSendMessage = () => {
      if (wsClient.readyState === wsClient.OPEN) {
        // 向前端发送用户语音转文字结果
        try {
          wsClient.send(JSON.stringify({
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
        console.warn('WebSocket客户端未处于OPEN状态，状态码:', wsClient.readyState);
        return false;
      }
    };

    if (!checkAndSendMessage()) {
      return; // 如果连接状态检查失败，则退出
    }

    // 将用户输入添加到该客户端的历史记录中
    history.push({ role: "user", content: userText });
    clientHistories.set(clientId, history); // 更新存储的历史记录

    console.log('【DEBUG-CONV】准备发送给AI模型的输入:', userText);
    console.log('【DEBUG-CONV】当前对话历史长度:', history.length);

    try {
      const reply = await qwenChat(history);

      console.log('【DEBUG-CONV】从AI模型收到的回复:', reply);

      // 再次检查WebSocket连接状态，使用相同的重试逻辑
      let aiReplyAttempts = 0;
      const checkAndSendAIReply = async () => {
        if (wsClient.readyState === wsClient.OPEN) {
          try {
            // 将AI回复添加到该客户端的历史记录中
            history.push({ role: "assistant", content: reply });
            clientHistories.set(clientId, history); // 更新存储的历史记录

            // TTS（复用你已有逻辑）
            const ttsResp = await fetch("http://localhost:3000/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: reply })
            });

            const audio = await ttsResp.arrayBuffer();

            wsClient.send(JSON.stringify({
              type: "assistant",
              text: reply,
              audio: Buffer.from(audio).toString("base64")
            }));

            console.log('已发送AI回复到前端');
          } catch (ttsError) {
            console.error('发送AI回复到前端失败:', ttsError);

            // 即使TTS失败，也要尝试发送文本回复
            if (wsClient.readyState === wsClient.OPEN) {
              try {
                wsClient.send(JSON.stringify({
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
        if (wsClient.readyState === wsClient.OPEN) {
          try {
            wsClient.send(JSON.stringify({
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

  // 为ASR WebSocket添加连接丢失处理
  asrWS.onConnectionLost = () => {
    console.log('ASR连接丢失，正在创建新的ASR连接...');
    // 注意：这里可以实现重新连接逻辑，但这比较复杂，因为需要重新绑定所有的事件处理器
    // 目前暂时记录问题，后续可扩展
  };

  // 返回包含asrWS及其所有方法的对象
  return {
    ...asrWS,
    close: () => {
      if (asrWS.close) {
        asrWS.close();
      }
      // 连接断开时清理历史记录
      clientHistories.delete(clientId);
    },
    sendAudioData: (data) => {
      if (asrWS.sendAudioData) {
        asrWS.sendAudioData(data);
      }
    },
    isReady: () => {
      if (asrWS.isReady) {
        return asrWS.isReady();
      }
      return false;
    },
    sendEndSignal: () => {
      if (asrWS.sendEndSignal) {
        asrWS.sendEndSignal();
      }
    },
    getState: () => {
      if (asrWS.getState) {
        return asrWS.getState();
      }
      return { readyToSendAudio: false };
    }
  };
}