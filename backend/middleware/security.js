/**
 * 安全中间件
 * 提供儿童友好的安全检查和过滤
 */

// 儿童安全检查中间件
export function childSafetyMiddleware(req, res, next) {
  // 检查请求内容的安全性
  if (req.body && req.body.text) {
    const userInput = req.body.text.toLowerCase();

    // 简单的敏感词过滤
    const unsafeWords = [
      'kill', 'hurt', 'attack', 'fight', 'badword', 'curse',
      'inappropriate', 'unsafe', 'dangerous'
    ];

    const hasUnsafeContent = unsafeWords.some(word => userInput.includes(word));

    if (hasUnsafeContent) {
      return res.status(400).json({
        error: 'Content contains inappropriate language for children',
        safeMessage: '让我们聊些更有趣的话题吧！'
      });
    }
  }

  next();
}

// 速率限制中间件
export function rateLimitMiddleware(req, res, next) {
  // 简单的速率限制逻辑，记录请求时间
  if (!req.session) {
    req.session = {};
  }

  const now = Date.now();
  const lastRequestTime = req.session.lastRequestTime || 0;
  const timeSinceLastRequest = now - lastRequestTime;

  // 限制请求频率（例如，最小间隔1秒）
  if (timeSinceLastRequest < 1000) {
    return res.status(429).json({
      error: 'Too many requests. Please slow down.'
    });
  }

  req.session.lastRequestTime = now;
  next();
}

// 输入验证中间件
export function inputValidationMiddleware(req, res, next) {
  if (req.body && req.body.text) {
    // 验证输入长度
    if (req.body.text.length > 500) {
      return res.status(400).json({
        error: 'Input too long. Please keep messages under 500 characters.'
      });
    }

    // 检查是否为空输入
    if (!req.body.text.trim()) {
      return res.status(400).json({
        error: 'Empty messages are not allowed.'
      });
    }
  }

  next();
}