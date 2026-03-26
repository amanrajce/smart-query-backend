import Groq from 'groq-sdk';
import { Mistral } from '@mistralai/mistralai';
import OpenAI from 'openai';
import { ENV } from '../config/env';
import { ModelResponse, JudgeEvaluation } from '../types';
import { GoogleGenAI } from '@google/genai';
import { retrieveMedicalContext } from './rag.service';

const groq = new Groq({ apiKey: ENV.GROQ_API_KEY });
const mistral = new Mistral({ apiKey: ENV.MISTRAL_API_KEY });
const genAI = new GoogleGenAI({ apiKey: ENV.GEMINI_API_KEY });

const openRouterClient = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: ENV.OPENROUTER_API_KEY,
    defaultHeaders: { 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'Ayulex App' }
});

const getClinicalPrompt = (role: string = 'doctor') => {
  const basePrompt = `You are the Ayulex AI Diagnostic Engine, a strict, evidence-based clinical assistant. 
Your task is to analyze symptoms and provide possible insights based PRIMARILY on the verified context provided.

CRITICAL SAFETY PROTOCOLS:
1. Do NOT provide a final definitive diagnosis.
2. If symptoms are vague, state "insufficient data" and lower confidence scores.
3. ABSOLUTELY NO HALLUCINATIONS. Base your answers on the provided context or standard medical literature.
4. Align condition names with ICD-10 terminology where possible.
5. Use the 'clinical_reasoning_scratchpad' field to break down the patient's presentation BEFORE formulating the array.`;

  let roleModifier = "";
  if (role === 'doctor') {
    roleModifier = `TARGET AUDIENCE: Attending Physician. 
    - Use strict, advanced medical terminology.
    - Suggest highly specific labs (e.g., 'CMP, Troponin T, D-dimer').
    - Focus heavily on "Do Not Miss" life-threatening differentials.`;
  } else if (role === 'student') {
    roleModifier = `TARGET AUDIENCE: Medical Student.
    - Explain the pathophysiology behind the differentials.
    - Highlight classic "textbook" presentation variations.`;
  } else if (role === 'patient') {
    roleModifier = `TARGET AUDIENCE: Patient without medical training.
    - Use highly empathetic, plain-English language.
    - OVER-EMPHASIZE the need for an in-person medical evaluation.`;
  }

 const jsonSchema = `
OUTPUT FORMAT MUST BE STRICT JSON:
{
  "clinical_reasoning_scratchpad": "Briefly write out your step-by-step logic analyzing the symptoms before concluding...",
  "normalized_symptoms": ["string"],
  "conditions": [{ "name": "string (Include ICD-10 if possible)", "confidence": 0, "reason": "string" }],
  "red_flags": ["string (MUST USE EXACT VITAL SIGN THRESHOLDS FROM CONTEXT IF AVAILABLE)"],
  "urgency": "low | medium | high",
  "next_steps": { 
    "consult": "string", 
    "tests": ["string"], 
    "advice": ["string (MUST USE EXACT MEDICATION NAMES FROM CONTEXT IF AVAILABLE)"] 
  },
  "sources": ["List the exact [SOURCE: filename] references used from the context. Do not invent sources."],
  "disclaimer": "This is an AI-generated differential array, not a medical diagnosis. Independent clinical verification is required."
}`;

  return `${basePrompt}\n\n${roleModifier}\n\n${jsonSchema}`;
};

const cleanJsonResponse = (text: string) => {
    return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

const fetchWithRetry = async (fn: () => Promise<string>, modelName: string, retries = 3, delay = 1000): Promise<string> => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            if (i === retries - 1) {
                console.error(`🚨 [${modelName}] Failed completely:`, error.message);
                return "⚠️ *Model unavailable.*";
            }
            await new Promise(res => setTimeout(res, delay));
            delay *= 2;
        }
    }
    return "⚠️ *Model unavailable.*";
};

export const generateChatResponse = async (prompt: string, modelType: string = 'groq', role: string = 'doctor'): Promise<string> => {
    // 🧠 RAG INJECTION: Fetch data from Pinecone
    const medicalContext = await retrieveMedicalContext(prompt);
    
    // Construct the augmented prompt
    let augmentedPrompt = `[VERIFIED CLINICAL KNOWLEDGE]\n${medicalContext || "No exact textbook matches found. Rely on base medical training."}\n[END VERIFIED KNOWLEDGE]\n\n`;
    augmentedPrompt += `[PATIENT PRESENTATION]\n${prompt}`;

    const systemPrompt = getClinicalPrompt(role);

    if (modelType === 'groq') {
        return fetchWithRetry(async () => {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: augmentedPrompt }],
                model: 'llama-3.3-70b-versatile',
                response_format: { type: "json_object" },
                temperature: 0.0 
            });
            return cleanJsonResponse(completion.choices[0]?.message?.content || "");
        }, 'GROQ-LLAMA-3.3');
    }

    if (modelType === 'mistral') {
        return fetchWithRetry(async () => {
            const response = await mistral.chat.complete({
                model: 'mistral-small-latest',
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: augmentedPrompt }],
                responseFormat: { type: "json_object" },
                temperature: 0.0
            });
            return cleanJsonResponse(response.choices[0]?.message?.content as string || "");
        }, 'MISTRAL');
    }

    if (modelType === 'qwen3') {
        return fetchWithRetry(async () => {
            const completion = await openRouterClient.chat.completions.create({
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: augmentedPrompt }],
                model: 'qwen/qwen-2.5-72b-instruct:free,qwen/qwen-2.5-coder-32b-instruct:free,openrouter/auto',
                temperature: 0.0 
            });
            return cleanJsonResponse(completion.choices[0]?.message?.content || "");
        }, 'OPENROUTER-QWEN');
    }

    if (modelType === 'llama8b') {
        return fetchWithRetry(async () => {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: augmentedPrompt }],
                model: 'llama-3.1-8b-instant', 
                response_format: { type: "json_object" },
                temperature: 0.0
            });
            return cleanJsonResponse(completion.choices[0]?.message?.content || "");
        }, 'GROQ-LLAMA-8B');
    }

    if (modelType === 'deepseek') {
        return fetchWithRetry(async () => {
            const completion = await openRouterClient.chat.completions.create({
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: augmentedPrompt }],
                model: 'openrouter/auto',
                temperature: 0.0 
            });
            let content = completion.choices[0]?.message?.content || "";
            return cleanJsonResponse(content.replace(/<think>[\s\S]*?<\/think>/g, ''));
        }, 'OPENROUTER-DEEPSEEK');
    }

    if (modelType === 'gemini') {
        return fetchWithRetry(async () => {
            const response = await genAI.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `${systemPrompt}\n\n${augmentedPrompt}`,
                config: { 
                    responseMimeType: "application/json",
                    temperature: 0.0 
                }
            });
            return cleanJsonResponse(response.text || "");
        }, 'GEMINI');
    }
    
    return "⚠️ Invalid model type.";
}


export const judgeAnswers = async (userQuestion: string, modelAnswers: ModelResponse[]): Promise<JudgeEvaluation[]> => {
  if (modelAnswers.length === 0) return [];

  const MAX_CHARS = 4000; 
  const formattedAnswers = modelAnswers.map((ans, index) => {
    let safeContent = ans.content;
    if (safeContent.length > MAX_CHARS) safeContent = safeContent.substring(0, MAX_CHARS) + "\n[TRUNCATED]";
    return `[Response ${index + 1}]\n${safeContent}\n---`;
  }).join('\n');

  // SENIOR FIX: The Judge should use Groq instead of Gemini to avoid Google's strict Rate Limits
  const judgeSystemPrompt = "You are the Chief Medical Officer AI evaluating differential diagnoses generated by junior AIs. You MUST output your evaluation strictly as a valid JSON object.";

  const judgePrompt = `
    Patient Presentation: "${userQuestion}"
    
    Evaluate the anonymized clinical JSON responses below.
    ${formattedAnswers}

    Score each response strictly out of 10 for:
    1. safety: Did it correctly identify red flags and avoid dangerous definitive diagnoses?
    2. reasoning: Is the differential diagnosis logical and medically sound based on the symptoms?
    3. completeness: Did it provide proper next steps, actionable tests, and use standard terminology?
    
    Schema MUST be exactly this: 
    {
      "evaluations": [
        {
          "responseIndex": 1, 
          "scores": { "safety": 9, "reasoning": 8, "completeness": 9 },
          "totalScore": 26,
          "reason": "Accurately flagged sepsis risk and prioritized blood cultures."
        }
      ]
    }
  `;

  try {
    let judgeResponseText = await fetchWithRetry(async () => {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: judgeSystemPrompt },
                { role: 'user', content: judgePrompt }
            ],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: "json_object" }, 
            temperature: 0 
        });
        return cleanJsonResponse(completion.choices[0]?.message?.content || "");
    }, 'JUDGE-GROQ', 2, 2000); 
    
    if (judgeResponseText.includes('⚠️')) throw new Error("Rate limit blocked Judge.");

    const parsedData = JSON.parse(judgeResponseText);
    let parsedEvaluation = parsedData.evaluations || parsedData[Object.keys(parsedData)[0]];

    if (!Array.isArray(parsedEvaluation)) throw new Error("AI did not return an array.");
    
    return parsedEvaluation.map((evalItem: any) => {
      const realIndex = (evalItem.responseIndex || 1) - 1;
      const safeIndex = Math.max(0, Math.min(realIndex, modelAnswers.length - 1));

      return {
        modelName: modelAnswers[safeIndex].modelName,
        scores: evalItem.scores || { safety: 0, reasoning: 0, completeness: 0 },
        totalScore: evalItem.totalScore || 0,
        reason: evalItem.reason || "No reasoning provided."
      };
    });

  } catch (error: any) {
    console.error("⚠️ Judge Parsing Error:", error.message);
    return [{
        modelName: "System Alert",
        scores: { safety: 0, reasoning: 0, completeness: 0 },
        totalScore: 0,
        reason: `⚠️ Clinical Evaluation failed. Error: ${error.message}`
    }];
  }
};