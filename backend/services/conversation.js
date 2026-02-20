import { createASRConnection } from "./asr.js";
import { qwenChat } from "./chat.js";
import fetch from "node-fetch";
import { checkAndSendMessage, cleanupClientResources } from "../utils/ws-utils.js";

// 为每个WebSocket客户端维护独立的历史记录
const clientHistories = new Map();

// 用于跟踪每个客户端的最后AI回复时间和内容，以防止重复
const lastAIReplyInfo = new Map();

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

    // 向前端发送用户语音转文字结果
    const userMessageSent = await checkAndSendMessage(wsClient, {
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
    clientHistories.set(clientId, history); // 更新存储的历史记录

    console.log('【DEBUG-CONV】准备发送给AI模型的输入:', userText);
    console.log('【DEBUG-CONV】当前对话历史长度:', history.length);

    try {
      const reply = await qwenChat(history);

      console.log('【DEBUG-CONV】从AI模型收到的回复:', reply);

      // 检查是否在短时间内收到了相同的AI回复（防止ASR被重复触发）
      const now = Date.now();
      const clientLastReply = lastAIReplyInfo.get(clientId);

      if (clientLastReply) {
        // 如果距离上次回复不到2秒且内容相同，则跳过此次回复
        if (now - clientLastReply.timestamp < 2000 && clientLastReply.content === reply) {
          console.log('检测到短时间内相同的AI回复，跳过发送:', reply);
          return;
        }
      }

      // 更新最后AI回复信息
      lastAIReplyInfo.set(clientId, {
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

      const aiMessageSent = await checkAndSendMessage(wsClient, {
        type: "assistant",
        text: reply,
        audio: Buffer.from(audio).toString("base64")
      });

      if (!aiMessageSent) {
        // 即使TTS失败，也要尝试发送文本回复
        await checkAndSendMessage(wsClient, {
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
      await checkAndSendMessage(wsClient, {
        type: "assistant",
        text: "抱歉，我现在有点忙，稍后再聊好吗？",
        audio: ""
      });
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
      cleanupClientResources(clientHistories, lastAIReplyInfo, clientId);
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