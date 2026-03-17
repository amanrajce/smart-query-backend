import { Request, Response } from 'express';
import { generateChatResponse, judgeAnswers } from '../services/ai.service';
import { ModelResponse, JudgeEvaluation } from '../types';

export const handleChat = async (req: Request, res: Response): Promise<void> => {
    try {
        const { message, modelProvider } = req.body;
        if (!message) return res.status(400).json({ error: "Message is required." }) as any;
        const aiResponse = await generateChatResponse(message, modelProvider);
        res.status(200).json({ reply: aiResponse, provider: modelProvider || 'gemini' });
    } catch (error) {
        res.status(500).json({ error: "Internal server error." });
    }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const compareModels = async (req: Request, res: Response): Promise<void> => {
  const { prompt } = req.body;

  try {
    // 🚦 THE 6-MODEL RACE: Perfectly balanced across 3 different corporate infrastructures
    const results = await Promise.allSettled([
      generateChatResponse(prompt, 'groq'),                             // 0.0s (Groq Llama 3.3)
      delay(100).then(() => generateChatResponse(prompt, 'gemini')),    // 0.1s (Google Gemini 2.5) ⚡️ NEW
      delay(300).then(() => generateChatResponse(prompt, 'mistral')),   // 0.3s (Mistral Native)
      delay(600).then(() => generateChatResponse(prompt, 'llama8b')),   // 0.6s (Groq Llama 3.1 8B)
      delay(1500).then(() => generateChatResponse(prompt, 'qwen3')),    // 1.5s (OpenRouter Qwen)
      delay(3000).then(() => generateChatResponse(prompt, 'deepseek'))  // 3.0s (OpenRouter DeepSeek)
    ]);

    const validAnswers: ModelResponse[] = [];
    // 🚨 IMPORTANT: This array must exactly match the 6 promises above
    const modelNames = [
        'Llama 3.3 70B', 
        'Gemini 2.5 Flash', 
        'Mistral Small', 
        'Llama 3.1 8B', 
        'Qwen 2.5 72B', 
        'DeepSeek R1'
    ]; 

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const isError = result.value.includes('[Error]') || result.value.includes('⚠️');
        validAnswers.push({
          modelName: modelNames[index],
          content: isError ? "⚠️ *This model is currently experiencing high traffic on its free tier. Please try again later.*" : result.value
        });
      } else {
        validAnswers.push({
          modelName: modelNames[index],
          content: "⚠️ *API Connection Failed. Model decommissioned or offline.*"
        });
      }
    });

    const answersToJudge = validAnswers.filter(ans => !ans.content.includes('⚠️'));

    // Wait 2 seconds for Groq's TPM bucket to reset before firing the Judge
    await delay(2000); 
    const evaluation = await judgeAnswers(prompt, answersToJudge);

    res.status(200).json({
      answers: validAnswers,
      evaluation: evaluation.length > 0 
        ? evaluation.sort((a: JudgeEvaluation, b: JudgeEvaluation) => b.totalScore - a.totalScore) 
        : []
    });

  } catch (error: any) {
    console.error("Critical Compare Error:", error.message);
    res.status(500).json({ error: "The system encountered a critical error." });
  }
};