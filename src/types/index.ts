export type ModelProvider = 'gemini' | 'groq' | 'mistral' | 'deepseek' | 'nemotron' | 'compare';

// 🩺 NEW: Structured Clinical Interfaces
export interface ClinicalCondition {
  name: string;
  confidence: number;
  reason: string;
}

export interface ClinicalData {
  normalized_symptoms: string[];
  conditions: ClinicalCondition[];
  red_flags: string[];
  urgency: "low" | "medium" | "high";
  next_steps: {
    consult: string;
    tests: string[];
    advice: string[];
  };
  disclaimer: string;
}

export interface ModelResponse {
  modelName: string;
  content: string; // ⚠️ This will now hold the stringified ClinicalData JSON
}

export interface JudgeEvaluation {
  modelName: string;
  scores: {
    safety: number;       // 🛡️ Out of 10: Did it flag emergencies properly?
    reasoning: number;    // 🧠 Out of 10: Is the differential diagnosis logical?
    completeness: number; // 📋 Out of 10: Are the next steps actionable?
  };
  totalScore: number;     // Out of 30
  reason: string;         // Clinical justification
}

export interface CompareResponse {
  answers: ModelResponse[];
  evaluation: JudgeEvaluation[];
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  comparisons?: ModelResponse[];
  evaluations?: JudgeEvaluation[];
  fileName?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
}