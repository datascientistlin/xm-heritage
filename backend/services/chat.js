import fetch from "node-fetch";
import config from "../config/appConfig.js";

export async function qwenChat(history) {
  // 儿童安全检查 - 验证输入内容
  const lastUserMessage = history[history.length - 1];
  if (lastUserMessage && lastUserMessage.role === 'user') {
    // 简单的内容安全检查
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

  // 调试信息：显示输入到模型的完整消息历史
  console.log('【DEBUG】发送到Chat模型的输入:');
  console.log('系统提示:', `
你是"大湾鸡"，一个温柔、耐心、儿童友好的小鸡朋友。
- 用简单句子
- 不说恐怖、暴力、成人内容
- 多鼓励孩子
- 不超过 2~3 句话
- 如果孩子提出不适宜的话题，请温和地引导到安全话题
              `.trim());
  console.log('用户输入历史:', history);

  const res = await fetch(
    `${config.dashscope.baseUrl}/api/v1/services/aigc/text-generation/generation`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.dashscope.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.dashscope.chatModel,
        input: {
          messages: [
            {
              role: "system",
              content: `
你是"大湾鸡"，一个温柔、耐心、儿童友好的小鸡朋友。
- 用简单句子
- 不说恐怖、暴力、成人内容
- 多鼓励孩子
- 不超过 2~3 句话
- 如果孩子提出不适宜的话题，请温和地引导到安全话题
              `.trim()
            },
            ...history
          ]
        }
      })
    }
  );

  if (!res.ok) {
    console.error(`DashScope API 请求失败: ${res.status} ${res.statusText}`);
    const errorBody = await res.text();
    console.error('错误详情:', errorBody);
    throw new Error(`API请求失败: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  if (json.error) {
    console.error('DashScope API 错误:', json.error);
    throw new Error(`API错误: ${json.error.message}`);
  }

  // 安全地提取响应内容，处理可能的API响应结构变化
  let response = '';
  try {
    // 检查API响应结构 - 优先检查官方推荐格式（包含choices字段）
    if (json.output && json.output.choices && json.output.choices.length > 0) {
      const firstChoice = json.output.choices[0];
      if (firstChoice.message && firstChoice.message.content) {
        response = firstChoice.message.content;
      } else if (firstChoice.text) {
        // 备选字段名
        response = firstChoice.text;
      } else {
        console.error('API响应格式异常，缺少预期字段:', json.output);
        throw new Error('API响应格式异常');
      }
    }
    // 检查另一种可能的格式（直接包含text字段）
    else if (json.output && json.output.text) {
      response = json.output.text;
    }
    // 如果两种格式都不匹配，抛出错误
    else {
      console.error('API响应格式异常，不支持的响应格式:', json);
      throw new Error('API响应格式异常：不支持的格式');
    }
  } catch (error) {
    console.error('解析API响应时出错:', error);
    console.log('完整API响应:', JSON.stringify(json, null, 2)); // 添加完整响应的调试信息
    throw new Error('解析AI响应失败');
  }

  // 调试信息：显示模型返回的原始响应
  console.log('【DEBUG】Chat模型返回的原始响应:', response);

  // 后处理：确保响应符合儿童安全标准
  if (response.toLowerCase().includes("sorry") || response.toLowerCase().includes("cannot")) {
    response = "没关系，我们可以聊聊别的有趣的事情！";
  }

  // 限制响应长度以符合安全要求
  if (response.length > config.safety.maxResponseLength) {
    response = response.substring(0, config.safety.maxResponseLength) + "...";
  }

  // 调试信息：显示经过后处理的最终响应
  console.log('【DEBUG】经过后处理的最终响应:', response);

  return response;
}