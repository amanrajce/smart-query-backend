// backend/src/routes/chat.routes.ts
import { Router } from 'express';
import { handleChat, compareModels } from '../controllers/chat.controller';

const router = Router();

// Handles standard 1-on-1 chat (e.g., POST http://127.0.0.1:5001/api/chat)
router.post('/', handleChat);

// Handles the AI Judge feature (e.g., POST http://127.0.0.1:5001/api/chat/compare)
router.post('/compare', compareModels);

export default router;