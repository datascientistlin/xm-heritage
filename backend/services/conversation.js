/**
 * AI 对话服务模块
 * 处理与通义千问 AI 的交互，包括对话生成和儿童安全过滤
 */

import fetch from "node-fetch";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import config from "../config/appConfig.js";
import logger from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file in development (local), skip in production (Railway provides env vars directly)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}

/**
 * 通义千问 AI 对话函数
 * @param {Array<{role: string, content: string}>} history - 对话历史记录
 * @returns {Promise<string>} AI 回复文本
 */
export async function qwenChat(history) {
  // 儿童安全检查 - 验证输入内容
  const lastUserMessage = history[history.length - 1];

  if (lastUserMessage && lastUserMessage.role === 'user') {
    const userInput = lastUserMessage.content.toLowerCase();

    // 过滤不适宜儿童的内容
    const inappropriatePatterns = [
      /kill/i,
      /hurt/i,
      /attack/i,
      /bad/i,
      /naughty/i
    ];

    for (const pattern of inappropriatePatterns) {
      if (pattern.test(userInput)) {
        return "对不起，我们不能谈论这个话题。让我们聊聊更有趣的事情吧！";
      }
    }
  }

  // 使用传入的完整历史记录
  const currentHistory = [...history];

  const res = await fetch(
    `${config.dashscope.baseUrl}/api/v1/services/aigc/text-generation/generation`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.dashscope.chatModel,
        input: {
          messages: [
            {
              role: "system",
              content: `
你是"厦门非遗小讲解员"，一个温柔、耐心、儿童友好的厦门非遗文化小讲解员。
厦门有很多珍贵的非物质文化遗产，比如国家级非遗项目：闽南话、答嘴鼓、歌仔戏、南音、高甲戏、漆线雕、闽南粘贴画、厦门珠绣等。
- 用简单、有趣的句子回答儿童
- 不说恐怖、暴力、成人内容
- 多鼓励孩子的好奇心
- 如果孩子提出不适宜的话题，请温和地引导到厦门非遗或其他有趣的文化话题
- 重点回应孩子最新的一句话，不要重复之前说过的内容
- 可以适当用比喻解释非遗，比如"南音就像古代人的音乐游戏"
- 用充满热情的方式介绍厦门非遗，让小朋友感受传统文化的魅力
- 控制回答长度在两句以内，方便小朋友理解
- 对于和非遗无关的问题，可以不进行回答
              `.trim()
            },
            ...currentHistory
          ]
        }
      })
    }
  );

  if (!res.ok) {
    logger.error(`DashScope API 请求失败: ${res.status} ${res.statusText}`);
    const errorBody = await res.text();
    logger.error('错误详情:', { errorBody });
    throw new Error(`API请求失败: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  if (json.error) {
    logger.error('DashScope API 错误:', { error: json.error });
    throw new Error(`API错误: ${json.error.message}`);
  }

  // 安全地提取响应内容
  let response = '';

  try {
    // 优先检查 choices 字段
    if (json.output && json.output.choices && json.output.choices.length > 0) {
      const firstChoice = json.output.choices[0];
      if (firstChoice.message && firstChoice.message.content) {
        response = firstChoice.message.content;
      } else if (firstChoice.text) {
        response = firstChoice.text;
      }
    }

    // 备选：检查 text 字段
    if (!response && json.output && json.output.text) {
      response = json.output.text;
    }

    // 备选：检查 content 字段
    if (!response && json.output && json.output.content) {
      if (typeof json.output.content === 'string') {
        response = json.output.content;
      } else if (json.output.content.text) {
        response = json.output.content.text;
      }
    }

    // 备选：检查 message 字段
    if (!response && json.output && json.output.message) {
      response = json.output.message.content || json.output.message.text || '';
    }

    if (!response) {
      logger.error('无法从 API 响应中提取内容:', { response: json });
      throw new Error('无法从 API 响应中提取内容');
    }

    return response;

  } catch (error) {
    logger.error('解析 AI 回复时出错:', { error });
    throw error;
  }
}
