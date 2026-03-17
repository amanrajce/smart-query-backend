// backend/src/server.ts
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit'; // 🚀 NEW: Security layer
import chatRoutes from './routes/chat.routes';
import { ENV } from './config/env';

const app = express();

// 🛠️ SENIOR FIX 1: Production CORS Policy
// In production, we only allow our own frontend URL to talk to us.
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// 🛠️ SENIOR FIX 2: API Rate Limiting (The "Token Shield")
// Prevents a single user from spamming and exhausting your free API keys.
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 15, // Limit each IP to 15 requests per window
  message: { error: "Too many requests. Please take a breath and try again in a minute." },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply the limiter to all API routes
app.use('/api/', limiter);

// 3. Mount routes
app.use('/api/chat', chatRoutes);

// 🛠️ SENIOR FIX 3: Dynamic Port Binding
// Cloud providers like Railway/Heroku assign a random PORT; we must listen to it.
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
    console.log(`🚀 SmartQuery Production Server active on port ${PORT}`);
    console.log(`🛡️  CORS allowed origin: ${allowedOrigin}`);
});