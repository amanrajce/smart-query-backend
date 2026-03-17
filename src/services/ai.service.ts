import Groq from 'groq-sdk';
import { Mistral } from '@mistralai/mistralai';
import OpenAI from 'openai'; // 🚨 SENIOR FIX: You must import OpenAI to use OpenRouter!
import { ENV } from '../config/env';
import { ModelResponse, JudgeEvaluation } from '../types';
import { GoogleGenAI } from '@google/genai';

// 🚀 ZERO OUTSIDE DEPENDENCIES: Only pure Groq and Mistral
const groq = new Groq({ apiKey: ENV.GROQ_API_KEY });
const mistral = new Mistral({ apiKey: ENV.MISTRAL_API_KEY });
const genAI = new GoogleGenAI({ apiKey: ENV.GEMINI_API_KEY });

const openRouterClient = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: ENV.OPENROUTER_API_KEY,
    defaultHeaders: { 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'SmartQuery App' }
});

const fetchWithRetry = async (fn: () => Promise<string>, modelName: string, retries = 3, delay = 1000): Promise<string> => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            if (i === retries - 1) {
                console.error(`🚨 [${modelName}] Failed completely:`, error.message);
                return "⚠️ *Model unavailable.*";
            }
            console.warn(`⏳ [${modelName}] Rate limited. Retrying in ${delay}ms...`);
            await new Promise(res => setTimeout(res, delay));
            delay *= 2;
        }
    }
    return "⚠️ *Model unavailable.*";
};

export const generateChatResponse = async (prompt: string, modelType: string = 'groq'): Promise<string> => {
    
    // 1. Meta Llama 3.3 70B (The heavy lifter - via Groq)
    if (modelType === 'groq') {
        return fetchWithRetry(async () => {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama-3.3-70b-versatile',
            });
            return completion.choices[0]?.message?.content || "No response.";
        }, 'GROQ-LLAMA-3.3');
    }

    // 2. Mistral Native (Your stable backup)
    if (modelType === 'mistral') {
        return fetchWithRetry(async () => {
            const response = await mistral.chat.complete({
                model: 'mistral-small-latest',
                messages: [{ role: 'user', content: prompt }],
            });
            return response.choices[0]?.message?.content as string || "No response.";
        }, 'MISTRAL');
    }

    // 3. 🔥 PIVOT: Groq decommissioned Qwen, so we route it to OpenRouter's massive 72B free model!
    if (modelType === 'qwen3') {
        return fetchWithRetry(async () => {
            const completion = await openRouterClient.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                // SENIOR FIX: Comma-separated fallback list. 
                // Tries 72B -> falls back to 32B -> falls back to Auto
                model: 'qwen/qwen-2.5-72b-instruct:free,qwen/qwen-2.5-coder-32b-instruct:free,openrouter/auto', 
            });
            return completion.choices[0]?.message?.content || "No response.";
        }, 'OPENROUTER-QWEN');
    }

    // 4. 🔥 NEW 2026 GROQ MODEL: Llama 3.1 8B (Incredibly fast fallback)
    if (modelType === 'llama8b') {
        return fetchWithRetry(async () => {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama-3.1-8b-instant', 
            });
            return completion.choices[0]?.message?.content || "No response.";
        }, 'GROQ-LLAMA-8B');
    }

    // 5. 🔥 PIVOT: Groq decommissioned DeepSeek, so we route it back to OpenRouter!
    if (modelType === 'deepseek') {
        return fetchWithRetry(async () => {
            const completion = await openRouterClient.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                // We use openrouter/auto to prevent the 404 Free Tier crash!
                model: 'openrouter/auto', 
            });
            // We strip out the messy <think> tags so the UI card looks beautiful
            let content = completion.choices[0]?.message?.content || "No response.";
            return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }, 'OPENROUTER-DEEPSEEK');
    }

    // 🔥 RESTORED: Google Gemini 2.5 Flash (Blazing fast, independent infrastructure)
    if (modelType === 'gemini') {
        return fetchWithRetry(async () => {
            const response = await genAI.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            return response.text || "No response.";
        }, 'GEMINI');
    }
    
    return "⚠️ Invalid model type.";
}

export const judgeAnswers = async (userQuestion: string, modelAnswers: ModelResponse[]): Promise<JudgeEvaluation[]> => {
  if (modelAnswers.length === 0) return [];

  // 🛡️ SENIOR FIX 1: Token Armor. Truncate massively long answers (like 428x428 CSVs)
  // 4000 characters is roughly 1000 tokens. Plenty for the judge to evaluate quality.
  const MAX_CHARS = 4000; 

  const formattedAnswers = modelAnswers.map((ans, index) => {
    let safeContent = ans.content;
    if (safeContent.length > MAX_CHARS) {
        safeContent = safeContent.substring(0, MAX_CHARS) + "\n\n... [SYSTEM NOTE: RESPONSE TRUNCATED DUE TO EXTREME LENGTH] ...";
    }
    return `[Response ${index + 1}]\n${safeContent}\n---`;
  }).join('\n');

  const judgePrompt = `
    You are an impartial, highly rigorous AI judge.
    User Question: "${userQuestion}"
    Evaluate the anonymized responses below.
    ${formattedAnswers}

    Score each response strictly out of 10 for:
    1. Accuracy: Is the information factually correct?
    2. Clarity: Is the formatting clean and easy to read?
    3. Completeness: Does it fully answer the prompt?
    
    You MUST output your evaluation strictly as a valid JSON object.
    Schema: 
    {
      "evaluations": [
        {
          "responseIndex": 1, 
          "scores": { "accuracy": 9, "clarity": 8, "completeness": 9 },
          "totalScore": 26,
          "reason": "Short reason."
        }
      ]
    }
  `;

  try {
    // 🔥 SENIOR FIX 2: Shifted Judge to Gemini 2.5 Flash
    // It has a 1 Million Token context window and will never throw a 413 error!
    let judgeResponseText = await fetchWithRetry(async () => {
        const response = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: judgePrompt,
            config: {
                temperature: 0, // Keep it strictly logical
                responseMimeType: "application/json", // Google's strict JSON mode!
            }
        });
        return response.text || "";
    }, 'JUDGE-GEMINI', 2, 2000); 
    
    if (judgeResponseText.includes('⚠️')) throw new Error("Rate limit blocked Judge.");

    const parsedData = JSON.parse(judgeResponseText);
    let parsedEvaluation = parsedData.evaluations || parsedData[Object.keys(parsedData)[0]];

    if (!Array.isArray(parsedEvaluation)) throw new Error("AI did not return an array.");
    
    return parsedEvaluation.map((evalItem: any) => {
      const realIndex = (evalItem.responseIndex || 1) - 1;
      const safeIndex = Math.max(0, Math.min(realIndex, modelAnswers.length - 1));

      return {
        modelName: modelAnswers[safeIndex].modelName,
        scores: evalItem.scores || { accuracy: 0, clarity: 0, completeness: 0 },
        totalScore: evalItem.totalScore || 0,
        reason: evalItem.reason || "No reasoning provided."
      };
    });

  } catch (error: any) {
    console.error("⚠️ Judge Parsing Error:", error.message);
    return [{
        modelName: "System Alert",
        scores: { accuracy: 0, clarity: 0, completeness: 0 },
        totalScore: 0,
        reason: `⚠️ The AI Judge failed. Error: ${error.message}`
    }];
  }
};