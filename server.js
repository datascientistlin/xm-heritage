import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables - only load .env file in development (not production)
// Railway provides environment variables directly via dashboard
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, 'backend/.env') });
}

import chatRoutes from './backend/routes/chatRoutes.js';
import { createASRConnection } from './backend/services/asr.js';
import { qwenChat } from './backend/services/conversation.js';
import { calculateSimilarity, findLongestCommonPrefix, cleanTextForComparison } from './backend/utils/text-utils.js';
import { checkAndSendMessage, cleanupClientResources } from './backend/utils/ws-utils.js';
import logger from './backend/utils/logger.js';

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Determine port - Railway provides PORT environment variable
const PORT = process.env.PORT || 3000;
const WS_PATH = process.env.WS_PATH || '/ws';

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'frontend')));

// API routes
app.use('/api', chatRoutes);

// TTS endpoint
app.post("/api/tts", async (req, res) => {
  const { text } = req.body;

  try {
    const ttsResp = await fetch(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "qwen3-tts-flash",
          input: {
            text,
            voice: "Bella",
            language_type: "Chinese",
            stream: false
          }
        })
      }
    );

    const ttsJson = await ttsResp.json();
    const audioUrl = ttsJson?.output?.audio?.url;

    if (!audioUrl) {
      logger.error("DashScope TTS response:", { response: ttsJson });
      return res.status(500).json({ error: "No audio URL returned" });
    }

    const audioResp = await fetch(audioUrl);

    if (!audioResp.ok) {
      return res.status(500).json({ error: "Failed to fetch audio file" });
    }

    res.setHeader("Content-Type", audioResp.headers.get("content-type") || "audio/wav");
    res.setHeader("Cache-Control", "no-store");

    audioResp.body.pipe(res);

  } catch (err) {
    logger.error("TTS error:", { error: err });
    res.status(500).json({ error: "TTS failed" });
  }
});

// Create HTTP server
const server = createServer(app);

// WebSocket server attached to the same HTTP server
const wss = new WebSocketServer({ server, path: WS_PATH });

// Client state management
const clientHistories = new Map();
const clientStates = new Map();
const lastAIReplyInfo = new Map();
const clientCurrentUtteranceIds = new Map();

wss.on("connection", client => {
  logger.info("🎤 Client connected for audio conversation");

  const clientState = {
    id: Date.now() + Math.random(),
    isConnected: true,
    asrSession: null,
    messageQueue: [],
    sessionStartTime: Date.now(),
    lastUserInteraction: Date.now(),
    interactionSequence: 0,
    currentInteractionSeq: 0,
    lastProcessedText: "",
    lastProcessedTime: Date.now(),
    asrProcessingLock: false,
    currentUtteranceId: null,
    queueChecker: null
  };

  clientStates.set(clientState.id, clientState);

  if (!clientHistories.has(clientState.id)) {
    clientHistories.set(clientState.id, []);
  }
  const history = clientHistories.get(clientState.id);

  const asrReadyState = { ready: false, lastChecked: Date.now() };
  clientCurrentUtteranceIds.set(clientState.id, null);

  const initializeASRSession = () => {
    clientState.asrSession = createASRConnection(async (asrResult) => {
      let userText, utteranceId;

      if (typeof asrResult === 'object' && asrResult.text !== undefined) {
        userText = asrResult.text;
        utteranceId = asrResult.utteranceId;
      } else {
        userText = asrResult;
        utteranceId = Date.now() + Math.random();
      }

      logger.info("ASR callback invoked", { userText, utteranceId });

      const previousUtteranceId = clientCurrentUtteranceIds.get(clientState.id);
      if (previousUtteranceId && previousUtteranceId === utteranceId) {
        logger.info('Duplicate utterance ID detected, skipping:', { userText });
        return;
      }

      clientCurrentUtteranceIds.set(clientState.id, utteranceId);

      if (!client) {
        logger.error('WebSocket client does not exist');
        return;
      }

      if (clientState.asrProcessingLock) {
        logger.info('ASR is processing, skipping this iteration:', { userText });
        return;
      }

      clientState.asrProcessingLock = true;

      try {
        if (!userText || userText.trim() === '') {
          logger.info('Ignoring empty ASR result');
          return;
        }

        if (userText === clientState.lastProcessedText) {
          logger.info('Exact duplicate text detected, skipping:', { userText });
          return;
        }

        const currentTime = Date.now();
        const timeSinceLastProcess = currentTime - (clientState.lastProcessedTime || 0);

        if (timeSinceLastProcess < 1500 && clientState.lastProcessedText) {
          const cleanCurrent = cleanTextForComparison(userText);
          const cleanPrevious = cleanTextForComparison(clientState.lastProcessedText);

          if (cleanCurrent === cleanPrevious) {
            logger.info('Duplicate text with punctuation difference, skipping:', { userText });
            return;
          }

          if ((userText.includes(clientState.lastProcessedText) && userText.length <= clientState.lastProcessedText.length + 20) ||
              (clientState.lastProcessedText.includes(userText) && clientState.lastProcessedText.length <= userText.length + 20)) {
            if (userText.length > clientState.lastProcessedText.length) {
              const commonPrefix = findLongestCommonPrefix(cleanCurrent, cleanPrevious);
              if (commonPrefix.length < Math.min(cleanCurrent.length, cleanPrevious.length) * 0.7) {
                logger.info("Possible recognition correction detected", { newText: userText, oldText: clientState.lastProcessedText });
              } else {
                logger.info('Continuation or similar duplicate detected, skipping:', { userText });
                return;
              }
            } else {
              logger.info('Continuation or similar duplicate detected, skipping:', { userText });
              return;
            }
          }

          const similarityRatio = calculateSimilarity(cleanCurrent, cleanPrevious);
          if (similarityRatio > 0.7 && similarityRatio < 1.0) {
            logger.info("High similarity text detected, skipping", { userText, lastProcessedText: clientState.lastProcessedText, similarityRatio });
            return;
          }
        }

        const currentHistory = clientHistories.get(clientState.id) || [];
        const recentUserMessages = currentHistory.filter(item => item.role === 'user').slice(-3);

        for (const msg of recentUserMessages) {
          if (msg.content === userText) {
            logger.info('Duplicate with recent history detected, skipping:', { userText });
            return;
          }

          const cleanCurrent = cleanTextForComparison(userText);
          const cleanRecent = cleanTextForComparison(msg.content);

          const similarityRatio = calculateSimilarity(cleanCurrent, cleanRecent);
          if (similarityRatio > 0.7) {
            logger.info("High similarity with recent history detected, skipping", { userText, recentText: msg.content, similarityRatio });
            return;
          }
        }

        clientState.lastProcessedText = userText;
        clientState.lastProcessedTime = currentTime;

        logger.info('ASR result received, preparing to send to AI:', { userText });

        if (!client || typeof client.readyState === 'undefined') {
          logger.error('Unable to check WebSocket client state');
          return;
        }

        const userMessageSent = await checkAndSendMessage(client, {
          type: "user",
          text: userText
        });

        if (!userMessageSent) {
          logger.warn('Unable to send user message to frontend');
          return;
        }
        logger.info('User message sent to frontend:', { userText });

        history.push({ role: "user", content: userText });

        try {
          const reply = await qwenChat(history);
          logger.info('AI generated reply:', { reply });

          history.push({ role: "assistant", content: reply });

          const now = Date.now();
          const clientLastReply = lastAIReplyInfo.get(clientState.id);

          if (clientLastReply) {
            if (now - clientLastReply.timestamp < 2000 && clientLastReply.content === reply) {
              logger.info('Duplicate AI reply detected within short time, skipping:', { reply });
              return;
            }
          }

          lastAIReplyInfo.set(clientState.id, {
            content: reply,
            timestamp: now
          });

          for (let [key, value] of lastAIReplyInfo.entries()) {
            if (now - value.timestamp > 5000) {
              lastAIReplyInfo.delete(key);
            }
          }

          // Use 127.0.0.1 instead of localhost for Railway container networking
          const isProduction = process.env.NODE_ENV === 'production';
          const baseUrl = isProduction
            ? `http://127.0.0.1:${PORT}`
            : `http://localhost:${PORT}`;
          const ttsResp = await fetch(`${baseUrl}/api/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: reply })
          });

          const audio = await ttsResp.arrayBuffer();

          const aiMessageSent = await checkAndSendMessage(client, {
            type: "assistant",
            text: reply,
            audio: Buffer.from(audio).toString("base64")
          });

          if (!aiMessageSent) {
            await checkAndSendMessage(client, {
              type: "assistant",
              text: reply,
              audio: ""
            });
            logger.info('TTS conversion failed, sending text only', { reply });
          } else {
            logger.info('TTS conversion successful, audio reply sent', { reply });
          }
        } catch (error) {
          logger.error('AI reply processing failed', { error, reply: reply || 'N/A' });

          await checkAndSendMessage(client, {
            type: "assistant",
            text: "抱歉，我现在有点忙，稍后再聊好吗？",
            audio: ""
          });
        }
      } finally {
        clientState.asrProcessingLock = false;
      }
    });

    clientState.asrSession.onConnectionLost = () => {
      logger.info('ASR connection lost, reconnecting...');
      clientState.asrReady = false;

      if (client.readyState === client.OPEN) {
        setTimeout(() => {
          if (client.readyState === client.OPEN) {
            initializeASRSession();
          } else {
            logger.info('Client WebSocket closed, no longer reconnecting ASR');
          }
        }, 100);
      } else {
        logger.info('Client WebSocket closed, no longer reconnecting ASR');
      }
    };

    return clientState.asrSession;
  };

  initializeASRSession();

  const processMessageQueue = () => {
    if (!clientState.asrSession || !clientState.asrSession.isReady || !clientState.asrSession.isReady()) {
      asrReadyState.ready = false;
      return;
    }

    asrReadyState.ready = true;
    asrReadyState.lastChecked = Date.now();

    while (clientState.messageQueue.length > 0) {
      const message = clientState.messageQueue.shift();
      forwardToASR(message);
    }
  };

  const queueChecker = setInterval(() => {
    if (clientState.asrSession && clientState.asrSession.isReady && clientState.asrSession.isReady()) {
      processMessageQueue();
    }
  }, 100);

  clientState.queueChecker = queueChecker;

  client.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'user_done_speaking') {
        logger.info('Received user completion signal');

        clientState.interactionSequence++;
        clientState.currentInteractionSeq = clientState.interactionSequence;

        logger.info('Interaction sequence updated to:', { currentInteractionSeq: clientState.currentInteractionSeq });

        if (clientState.asrSession && clientState.asrSession.sendEndSignal) {
          logger.info('Sending end signal to ASR session');
          clientState.asrSession.sendEndSignal();
        } else {
          logger.warn('ASR session not available when user done speaking');
        }

        return;
      }

      if (message.type === 'ping' || message.type === 'status') {
        return;
      }
    } catch (e) {
      // Not JSON data, treat as audio data
    }

    if (clientState.asrSession &&
        typeof clientState.asrSession.isReady === 'function' &&
        clientState.asrSession.isReady()) {
      forwardToASR(data);
    } else if (clientState.asrSession &&
               typeof clientState.asrSession.startNewTask === 'function' &&
               clientState.asrSession.startNewTask()) {
      forwardToASR(data);
    } else {
      clientState.messageQueue.push(data);

      const readyChecker = setInterval(() => {
        if (clientState.asrSession &&
            typeof clientState.asrSession.isReady === 'function' &&
            clientState.asrSession.isReady() &&
            asrReadyState.ready) {
          processMessageQueue();
          clearInterval(readyChecker);
        }
      }, 50);

      setTimeout(() => {
        clearInterval(readyChecker);
      }, 10000);
    }
  });

  client.on("close", () => {
    logger.info("🔌 Client disconnected");
    clientState.isConnected = false;

    if (clientState.queueChecker) {
      clearInterval(clientState.queueChecker);
    }

    cleanupClientResources(clientHistories, lastAIReplyInfo, clientState.id);
    clientStates.delete(clientState.id);

    if (clientState.asrSession && typeof clientState.asrSession.close === 'function') {
      clientState.asrSession.close();
    }
  });

  function forwardToASR(data) {
    if (clientState.asrSession &&
        clientState.asrSession.sendAudioData &&
        clientState.asrSession.isReady &&
        clientState.asrSession.isReady()) {
      clientState.asrSession.sendAudioData(data);
    } else if (clientState.asrSession) {
      clientState.asrSession.send(data);
    } else {
      logger.warn('ASR session not available, dropping audio data');
    }
  }
});

// Start server - bind to 0.0.0.0 for Railway compatibility
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`✅ Unified server running at http://0.0.0.0:${PORT}`);
  logger.info(`✅ WebSocket available at ws://0.0.0.0:${PORT}${WS_PATH}`);
  logger.info(`✅ Frontend static files served from: ${path.join(__dirname, 'frontend')}`);
});
