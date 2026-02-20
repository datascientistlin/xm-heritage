import express from 'express';
import { chatController } from '../controllers/chatController.js';

const router = express.Router();

// Route for chat interactions
router.post('/chat', chatController);

export default router;