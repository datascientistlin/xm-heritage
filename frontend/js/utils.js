/**
 * 工具函数模块
 * 包含配置常量和辅助函数
 */

// WebSocket configuration - use relative URL for same-origin deployment
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
export const WS_CONFIG = {
    URL: `${wsProtocol}//${window.location.host}/ws`,
    RECONNECT_DELAY: 3000,
    PING_INTERVAL: 30000
};

// TTS configuration - use relative URL for same-origin deployment
export const TTS_CONFIG = {
    API_URL: '/api/tts',
    USE_QWEN_TTS: true,
    FALLBACK_RATE: 0.9,
    FALLBACK_PITCH: 1.2,
    FALLBACK_VOLUME: 1
};

// 小讲解员图片配置
export const GUIDE_CONFIG = {
    NAME: '小讲解员',
    VIEWS: [
        'assets/images/start.jpeg',
        'assets/images/start.jpeg',
        'assets/images/start.jpeg'
    ],
    ORIGINAL_SRC: 'assets/images/start.jpeg',
    WORKS_DIR: 'assets/images/works/'
};

// 预设的话语（厦门非遗主题）
export const GUIDE_RESPONSES = [
    "你知道吗？厦门的非遗项目有好多好多呢！",
    "闽南文化真的好有趣啊！",
    "古时候的人留下了很多珍贵的文化遗产！",
    "厦门非遗需要我们一起保护和传承！",
    "你想了解哪个厦门非遗项目呢？",
    "南音是厦门的传统音乐，像古代人的歌曲！",
    "歌仔戏是厦门特有的戏曲，好看极了！",
    "每一种非遗都是独一无二的！",
    "我最喜欢看闽南的传统工艺了！",
    "你想亲自体验厦门非遗吗？"
];

// 厦门非遗作品列表（对应works目录中的图片文件名，不含扩展名）
export const SPORTS_LIST = [
    '凤冠', '螺钿琴'
];

// 随机说话间隔（毫秒）= 50秒
export const RANDOM_SPEAK_INTERVAL = 50000;
// 随机说话触发阈值（毫秒）= 50秒无用户操作
export const RANDOM_SPEAK_THRESHOLD = 50000;
export const RANDOM_SPEAK_CHANCE = 0.7;

// 音频配置
export const AUDIO_CONFIG = {
    SAMPLE_RATE: 16000,
    BUFFER_SIZE: 4096
};

/**
 * 格式化日期时间 (不依赖 locale)
 * @returns {string} 格式化的日期时间字符串 YYYY-MM-DD HH:mm:ss
 */
export function formatDateTime() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * 获取随机数组元素
 * @param {Array} arr - 数组
 * @returns {*} 随机元素
 */
export function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 调试日志输出
 * @param {string} tag - 日志标签
 * @param {string} message - 日志消息
 * @param {...*} args - 其他参数
 */
export function debugLog(tag, message, ...args) {
    console.log(`[${formatDateTime()}] [${tag}] ${message}`, ...args);
}
