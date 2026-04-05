# 厦门非遗展示

一个面向幼儿园小朋友的厦门非物质文化遗产互动展示应用。通过语音交互，小朋友可以与小讲解员对话，了解厦门的非遗文化。

## 功能特点

- **开场视频**: 页面加载时自动播放介绍视频，支持点击跳过
- **语音交互**: 长按语音按钮录音，与 AI 小讲解员对话
- **作品展示**: 点击小讲解员图片，随机展示厦门非遗作品（凤冠、螺钿琴等）
- **智能语音**: AI 用儿童友好的方式介绍非遗知识
- **自动返回**: 1分钟无操作自动返回视频界面
- **响应式设计**: 支持桌面和移动设备

## 技术架构

### 前端 (frontend/)
- HTML5 + CSS3 + JavaScript (ES6 模块)
- Web Audio API 音频处理
- WebSocket 实时通信
- 语音合成 (TTS)

### 后端 (backend/)
- Node.js + Express.js
- WebSocket 服务器
- 阿里云 DashScope API
  - ASR 语音识别
  - TTS 语音合成
  - Qwen AI 对话生成

## 目录结构

```
xm-heritage/
├── frontend/
│   ├── assets/
│   │   ├── start_video.mp4        # 开场视频
│   │   └── images/
│   │       ├── start.jpeg         # 默认小讲解员图片
│   │       └── works/             # 非遗作品图片
│   │           ├── 凤冠.jpg
│   │           └── 螺钿琴.jpg
│   ├── css/
│   │   └── style.css              # 样式文件
│   ├── js/
│   │   ├── app.js                 # 主应用控制器
│   │   ├── utils.js               # 工具函数和配置
│   │   ├── ui-controller.js       # UI 交互控制器
│   │   ├── websocket-manager.js   # WebSocket 管理
│   │   ├── audio-processor.js     # 音频处理器
│   │   └── speech-synthesizer.js  # 语音合成器
│   └── index.html                 # 主页面
├── backend/
│   ├── config/
│   │   └── appConfig.js           # 应用配置
│   ├── controllers/
│   │   └── chatController.js      # 聊天控制器
│   ├── middleware/
│   │   └── security.js           # 安全中间件
│   ├── models/
│   │   └── User.js               # 数据模型
│   ├── routes/
│   │   └── chatRoutes.js         # 路由配置
│   ├── services/
│   │   ├── asr.js                # ASR 语音识别服务
│   │   ├── chat.js              # 聊天处理服务
│   │   ├── conversation.js      # AI 对话服务
│   │   └── ws-server.js         # WebSocket 服务器
│   ├── utils/
│   │   ├── logger.js            # 日志工具
│   │   ├── text-utils.js       # 文本工具
│   │   └── ws-utils.js         # WebSocket 工具
│   ├── server.js               # Express 服务器入口
│   └── .env                    # 环境变量（需创建）
├── CLAUDE.md                   # Claude Code 指南
├── README.md                   # 本文档
└── package.json
```

## 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0

### 安装依赖

```bash
npm install
```

### 配置环境变量

在 `backend/` 目录下创建 `.env` 文件：

```env
DASHSCOPE_API_KEY=你的阿里云 DashScope API Key
NODE_ENV=development
PORT=3000
WS_PORT=3001
```

### 启动应用

**开发模式（同时启动前端、后端和 WebSocket 服务器）：**

```bash
npm run dev
```

**单独启动各服务：**

```bash
# 仅后端服务器 (端口 3000)
npm run backend

# 仅 WebSocket 服务器 (端口 3001)
npm run ws

# 仅前端服务器 (端口 8000)
npm run frontend
```

### 访问应用

打开浏览器访问：http://localhost:8000

## 使用说明

### 交互流程

1. **开场视频**: 页面加载后自动播放介绍视频
   - 点击视频区域可开始播放
   - 再次点击或等待视频结束可跳过

2. **与小讲解员对话**:
   - 长按 🎤 按钮说话
   - 松开按钮发送录音
   - AI 小讲解员会回答关于厦门非遗的问题

3. **欣赏非遗作品**:
   - 点击小讲解员图片
   - 会随机展示一件非遗作品
   - 配合语音介绍
   - 5秒后自动恢复默认图片

4. **自动返回**:
   - 如果1分钟内没有任何交互
   - 会自动返回开场视频界面

## 非遗知识

应用内置了以下厦门非遗主题知识：

- **闽南话**: 厦门地区的传统方言
- **答嘴鼓**: 闽南特有的曲艺形式
- **歌仔戏**: 厦门特有的戏曲
- **南音**: 传统音乐，被称为"古代人的音乐游戏"
- **高甲戏**: 闽南戏曲剧种
- **漆线雕**: 传统雕塑艺术
- **闽南粘贴画**: 民间艺术形式
- **厦门珠绣**: 传统刺绣工艺
- **螺钿**: 贝壳镶嵌工艺

## 自定义配置

### 修改作品列表

编辑 `frontend/js/utils.js` 中的 `SPORTS_LIST`：

```javascript
export const SPORTS_LIST = [
    '凤冠',
    '螺钿琴'
    // 添加更多作品...
];
```

### 修改随机话语

编辑 `frontend/js/utils.js` 中的 `GUIDE_RESPONSES`：

```javascript
export const GUIDE_RESPONSES = [
    "你知道吗？厦门的非遗项目有好多好多呢！",
    // 更多话语...
];
```

### 修改 AI 对话主题

编辑 `backend/services/conversation.js` 中的 system prompt。

### 调整空闲超时

编辑 `frontend/js/app.js` 中的 `IDLE_TIMEOUT`（单位：毫秒）：

```javascript
this.IDLE_TIMEOUT = 60000; // 1分钟
```

## 故障排除

### 视频无法播放

- 确保 `frontend/assets/start_video.mp4` 文件存在
- 尝试使用 ffprobe 检查视频格式：
  ```bash
  ffprobe start_video.mp4
  ```
- 如需转换视频格式：
  ```bash
  ffmpeg -i input.mp4 -c:v libx264 -c:a aac output.mp4
  ```

### 语音无法识别

- 检查麦克风权限是否授予
- 确保后端服务器和 WebSocket 服务器正常运行
- 检查浏览器控制台是否有错误信息

### API 调用失败

- 确认 `DASHSCOPE_API_KEY` 正确配置
- 检查网络连接
- 查看后端日志获取详细错误信息

## 部署

### Railway 部署

1. 将代码推送到 GitHub
2. 在 Railway 中导入项目
3. 设置环境变量 `DASHSCOPE_API_KEY`
4. 部署会自动启动所有服务

### Docker 部署

```bash
# 构建镜像
docker build -t xm-heritage .

# 运行容器
docker run -p 8000:8000 -p 3000:3000 -p 3001:3001 \
  -e DASHSCOPE_API_KEY=your_api_key \
  xm-heritage
```

### 手动服务器部署

1. 安装 Node.js >= 16
2. 克隆代码并安装依赖
3. 配置环境变量
4. 使用 PM2 或 similar 启动：
   ```bash
   npm run dev
   ```

## 开发指南

### 添加新的非遗作品

1. 将作品图片放入 `frontend/assets/images/works/` 目录
2. 图片命名规范：中文名称 + .jpg（如 `凤冠.jpg`）
3. 在 `frontend/js/utils.js` 的 `SPORTS_LIST` 中添加作品名称（不带扩展名）
4. 重启前端服务

### 添加新的随机话语

编辑 `frontend/js/utils.js` 中的 `GUIDE_RESPONSES` 数组。

### 修改 UI 样式

主要样式文件：`frontend/css/style.css`

- `.container`: 主容器样式
- `.chicken-container`: 图片容器
- `.speech-bubble`: 对话气泡
- `.voice-btn`: 语音按钮
- `#video-container`: 视频容器

## 许可证

本项目仅供学习交流使用。

## 致谢

- 阿里云 DashScope API
- Qwen AI 大语言模型
