import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import chatRoutes from './routes/chatRoutes.js'; // Import the new routes

dotenv.config();

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
      console.error("DashScope TTS response:", ttsJson);
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
    console.error("TTS error:", err);
    res.status(500).json({ error: "TTS failed" });
  }
});

app.listen(3000, () => {
  console.log("✅ Backend running at http://localhost:3000");
});
