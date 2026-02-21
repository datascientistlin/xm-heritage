import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

import chatRoutes from './routes/chatRoutes.js';
import logger from './utils/logger.js';

const app = express();
app.use(cors());
app.use(express.json());

// Use the chat routes
app.use('/api', chatRoutes);

app.post("/api/tts", async (req, res) => {
  const { text } = req.body;

  try {
    // 1️⃣ Call DashScope TTS
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

    // 2️⃣ Fetch audio file from OSS
    const audioResp = await fetch(audioUrl);

    if (!audioResp.ok) {
      return res.status(500).json({ error: "Failed to fetch audio file" });
    }

    // 3️⃣ Forward audio to frontend
    res.setHeader("Content-Type", audioResp.headers.get("content-type") || "audio/wav");
    res.setHeader("Cache-Control", "no-store");

    audioResp.body.pipe(res);

  } catch (err) {
    logger.error("TTS error:", { error: err });
    res.status(500).json({ error: "TTS failed" });
  }
});

app.listen(3000, () => {
  logger.info("✅ Backend server running at http://localhost:3000");
});
