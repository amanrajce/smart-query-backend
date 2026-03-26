import { Request, Response } from 'express';
import { generateChatResponse, judgeAnswers } from '../services/ai.service';
import { ModelResponse, JudgeEvaluation } from '../types';

export const handleChat = async (req: Request, res: Response): Promise<void> => {
    try {
        const { message, modelProvider, role } = req.body; // Extracts role
        if (!message) {
            res.status(400).json({ error: "Message is required." });
            return;
        }
        
        // Passes the role to the service
        const aiResponse = await generateChatResponse(message, modelProvider, role);
        res.status(200).json({ reply: aiResponse, provider: modelProvider || 'gemini' });
    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ error: "Internal server error." });
    }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const compareModels = async (req: Request, res: Response): Promise<void> => {
  const { prompt, role } = req.body; // Extracts role

  try {
    // 🚦 THE 6-MODEL RACE: Passing the role into every single model
    const results = await Promise.allSettled([
      generateChatResponse(prompt, 'groq', role),                             
      delay(100).then(() => generateChatResponse(prompt, 'gemini', role)),    
      delay(300).then(() => generateChatResponse(prompt, 'mistral', role)),   
      delay(600).then(() => generateChatResponse(prompt, 'llama8b', role)),   
      delay(1500).then(() => generateChatResponse(prompt, 'qwen3', role)),    
      delay(3000).then(() => generateChatResponse(prompt, 'deepseek', role))  
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