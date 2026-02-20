# 快速启动指南

## 项目设置

### 1. 克隆或访问项目

您已经在项目目录中 (`/Users/dilin/Documents/projects/dwj`)

### 2. 安装依赖

```bash
npm install
```

### 3. 配置API密钥

在 `/backend/.env` 文件中设置您的DashScope API密钥:

```env
DASHSCOPE_API_KEY=your_actual_api_key_here
```

### 4. 启动应用

```bash
npm run dev
```

这将启动:
- 后端服务器 (端口 3000)
- WebSocket ASR服务器 (端口 3001)
- 前端服务器 (端口 8000)

### 5. 访问应用

打开浏览器并访问: `http://localhost:8000`

## 使用说明

1. 点击"按住和大湾鸡说话"按钮
2. 说话 (按住按钮)
3. 松开按钮结束录音
4. 等待大湾鸡回应
5. 查看聊天记录

## 项目结构

```
/dwj
├── /backend/           # 后端服务
│   ├── /config/        # 配置文件
│   ├── /controllers/   # 控制器
│   ├── /middleware/    # 中间件
│   ├── /models/        # 数据模型
│   ├── /routes/        # API路由
│   └── /services/      # 业务服务
├── /frontend/          # 前端代码
│   ├── /assets/        # 静态资源
│   ├── /css/           # 样式文件
│   └── /js/            # JavaScript文件
├── /docs/              # 文档
├── /tests/             # 测试文件
└── server.js           # 主服务入口
```

## API配置

在 `backend/config/appConfig.js` 中可以配置:

- API模型选择
- 音频设置
- 安全参数
- 端口设置

## 环境变量

- `DASHSCOPE_API_KEY`: 必需的API密钥
- `PORT`: 后端端口 (默认 3000)
- `WS_PORT`: WebSocket端口 (默认 3001)
- `FRONTEND_PORT`: 前端端口 (默认 8000)

## 开发命令

- `npm run dev`: 启动整个应用
- `npm run backend`: 仅启动后端
- `npm run ws`: 仅启动WebSocket服务器
- `npm run frontend`: 仅启动前端

## 疑难解答

### API密钥问题
- 确保在 `/backend/.env` 中设置了有效的API密钥
- API密钥格式应为: `sk-...`

### 音频问题
- 检查浏览器是否允许使用麦克风
- 确保网络连接稳定

### 连接问题
- 确保所有服务都在运行
- 检查端口是否被占用

### 儿童安全过滤
- 系统会过滤不适合儿童的内容
- 响应会被限制在安全范围内

## 测试

运行基础测试:

```bash
node tests/basic.test.js
```

这将验证所有模块是否正确加载。

## 自定义配置

根据您的需求修改 `backend/config/appConfig.js`:

```javascript
dashscope: {
  apiKey: process.env.DASHSCOPE_API_KEY,  // API密钥
  asrModel: 'fun-asr-realtime',          // 语音识别模型
  ttsModel: 'qwen3-tts-flash',           // 语音合成模型
  chatModel: 'qwen-plus'                 // AI聊天模型
}
```

## 故障排除

如果遇到问题，请检查:

1. API密钥是否正确设置
2. 网络连接是否正常
3. 端口是否被其他应用占用
4. 浏览器权限设置 (麦克风访问)
5. 控制台日志以获取错误详情