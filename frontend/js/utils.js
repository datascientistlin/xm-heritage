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

// 大湾鸡图片配置
export const CHICKEN_CONFIG = {
    VIEWS: [
        'assets/images/Front.jpeg',
        'assets/images/Back.jpeg',
        'assets/images/Side.jpeg'
    ],
    ORIGINAL_SRC: 'assets/images/Front.jpeg',
    SPORTS_DIR: 'assets/images/Sports/'
};

// 预设的大湾鸡话语
export const CHICKEN_RESPONSES = [
    "你好呀小朋友！",
    "我喜欢和你一起玩！",
    "今天天气真好呢！",
    "我们一起唱歌吧！",
    "咯咯咯~",
    "你今天开心吗？",
    "我可以陪你聊天哦！",
    "要不要听个故事？",
    "我最喜欢小朋友啦！",
    "我们做好朋友吧！"
];

// 体育项目列表
export const SPORTS_LIST = [
    '举重', '乒乓球', '体操', '冲浪', '击剑', '垒球', '射击', '射箭',
    '帆船', '手球', '拳击', '排球', '摔跤', '攀岩', '曲棍球', '柔道',
    '棒球', '橄榄球（7人制橄榄球）', '武术套路', '武术散打', '水球', '游泳', '滑板',
    '田径', '皮划艇（静水）', '篮球', '网球', '羽毛球', '自行车',
    '艺术体操', '花样游泳', '赛艇', '足球', '跆拳道', '跳水', '蹦床',
    '铁人三项', '霹雳舞', '马拉松游泳', '马术', '高尔夫球'
];

// 随机说话间隔（毫秒）
export const RANDOM_SPEAK_INTERVAL = 30000;
export const RANDOM_SPEAK_THRESHOLD = 30000;
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
