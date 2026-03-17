import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
    PORT: process.env.PORT || 5001,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || '',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '', //Deepseak via OpenRouter
    NODE_ENV: process.env.NODE_ENV || 'development'
};

if (!ENV.GEMINI_API_KEY && !ENV.GROQ_API_KEY) {
    console.warn("⚠️ WARNING: No AI API keys found in your .env file!");
}