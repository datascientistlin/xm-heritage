# 大湾鸡 (Dawanji/Awesome Chicken)

大湾鸡是一个专为儿童设计的AI虚拟伙伴应用程序，提供安全、有趣且具有教育意义的语音互动体验。

## 架构概览

应用遵循典型的客户端-服务器架构，分为三个主要组件：

### 后端服务 (`/backend/`)
- `server.js`: Express.js服务器，通过DashScope API处理TTS请求
- `ws-server.js`: WebSocket服务器，管理实时音频对话
- `/services/asr.js`: 处理ASR（自动语音识别）功能
- `/services/conversation.js`: 协调ASR、AI处理和TTS之间的交互流程
- `/services/chat.js`: 使用Qwen处理AI响应

### 前端界面 (`/frontend/`)
- `index.html`: 包含鸡角色和交互控件的主页面
- `/css/`: 样式表文件
- `/js/`: 脚本文件，处理动画、语音气泡和实时通信
- `/assets/images/`: 图像资源
- `/assets/audio/`: 音频资源

## 功能特性

1. **语音互动**: 孩子可以通过麦克风与鸡角色对话
2. **实时响应**: AI通过文字转语音实时响应
3. **动画角色**: 可与动画鸡互动，包含多种动画和视角
4. **一键通话麦克风**: 基于按钮的语音输入功能
5. **聊天界面**: 显示用户与AI之间的对话历史
6. **安全过滤**: 系统提示确保适合儿童的响应
7. **视觉控制**: 动画按钮、视角切换和互动鸡响应

## 技术栈

- **后端**: Node.js with Express.js, WebSocket library (ws)
- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **音频处理**: Web Audio API for microphone access
- **AI服务**: Alibaba Cloud's DashScope API for ASR/TTS and Qwen AI
- **协议**: WebSocket for real-time communication

## 开发设置

1. 在 `/backend/.env` 中设置DashScope API密钥
2. 运行 `npm install` 安装依赖
3. 运行 `npm run dev` 启动整个应用程序

## API密钥配置

创建一个 `.env` 文件在后端目录中:

```
DASHSCOPE_API_KEY=your_api_key_here
```

## 运行命令

- `npm run dev`: 启动整个应用（后端、WebSocket服务器和前端）
- `npm run backend`: 仅启动后端服务器 (端口 3000)
- `npm run ws`: 仅启动WebSocket ASR服务器 (端口 3001)
- `npm run frontend`: 仅启动前端服务器 (端口 8000)

## 核心交互流程

1. 前端通过麦克风捕获音频并发送到WebSocket服务器
2. WebSocket服务器连接到DashScope ASR服务进行实时转录
3. 转录文本发送到Qwen AI生成适合儿童的响应
4. AI响应使用DashScope TTS服务转换为语音
5. 语音编码为base64并通过WebSocket发送回前端
6. 前端播放音频并在聊天日志中显示用户和AI消息
7. 鸡角色动画并对孩子的回应

## 安全和合规

- 应用包含儿童友好的AI提示，确保内容安全
- 使用适当的API密钥管理和错误处理
- 实现连接管理和错误处理

## 未来功能路线图

- 个性化体验基于互动历史
- 多语言支持
- 高级情感检测和响应
- 家长控制面板
- 离线模式能力
- 游戏化成就系统