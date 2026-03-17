export interface ModelResponse {
  modelName: string;
  content: string;
}

export interface JudgeEvaluation {
  modelName: string;
  scores: {
    accuracy: number;     // out of 10
    clarity: number;      // out of 10
    completeness: number; // out of 10
  };
  totalScore: number;     // out of 30
  reason: string;
}

export interface CompareResponse {
  answers: ModelResponse[];
  evaluation: JudgeEvaluation[];
}