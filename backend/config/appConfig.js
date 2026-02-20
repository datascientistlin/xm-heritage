// Application configuration
const config = {
  port: process.env.PORT || 3000,
  wsPort: process.env.WS_PORT || 3001,
  frontendPort: process.env.FRONTEND_PORT || 8000,

  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseUrl: 'https://dashscope.aliyuncs.com',
    asrModel: process.env.ASR_MODEL || 'fun-asr-realtime',
    ttsModel: process.env.TTS_MODEL || 'qwen3-tts-flash',
    chatModel: process.env.CHAT_MODEL || 'qwen-plus'
  },

  // Child safety settings
  safety: {
    // Maximum response length to prevent overly verbose answers
    maxResponseLength: 200,
    // Timeout for API calls
    apiTimeout: 30000,
    // Allowed topics for child-friendly responses
    allowedTopics: ['story', 'game', 'education', 'fun', 'learning']
  },

  // Audio settings
  audio: {
    sampleRate: 16000,
    format: 'pcm'
  },

  // Development settings
  development: {
    enableLogging: process.env.NODE_ENV !== 'production',
    logLevel: process.env.LOG_LEVEL || 'info'
  }
};

// Validate required configuration
if (!config.dashscope.apiKey) {
  console.warn('⚠️ Warning: DASHSCOPE_API_KEY is not set in environment variables');
}

export default config;