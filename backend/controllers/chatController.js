import { qwenChat } from '../services/conversation.js';
import logger from '../utils/logger.js';

/**
 * Controller for handling chat interactions
 */
export async function chatController(req, res) {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Pass the user message to the AI service
    const aiResponse = await qwenChat([{ role: 'user', content: message }]);

    res.json({
      success: true,
      response: aiResponse,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Chat controller error:', { error });
    res.status(500).json({
      error: 'Failed to process chat message',
      details: error.message
    });
  }
}