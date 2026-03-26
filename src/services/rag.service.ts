import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';
import { ENV } from '../config/env';

const pinecone = new Pinecone({ apiKey: ENV.PINECONE_API_KEY });
const genAI = new GoogleGenAI({ apiKey: ENV.GEMINI_API_KEY });
const index = pinecone.index('ayulex-clinical-knowledge');

const getEmbeddings = async (text: string): Promise<number[]> => {
  try {
    const response = await genAI.models.embedContent({
      model: 'gemini-embedding-001', // 🩺 SENIOR FIX: The brand new 2026 Google Model
      contents: text,
    });
    return response.embeddings?.[0]?.values || [];
  } catch (error) {
    console.error("Embedding Generation Failed:", error);
    return [];
  }
};

export const retrieveMedicalContext = async (patientSymptoms: string) => {
  try {
    const queryVector = await getEmbeddings(patientSymptoms);

    if (queryVector.length === 0) return "";

    const searchResults = await index.query({
      vector: queryVector,
      topK: 3, 
      includeMetadata: true,
    });

    if (searchResults.matches.length === 0) return "";

    const contextChunks = searchResults.matches
      .map(match => `[SOURCE: ${match.metadata?.source || 'Unknown Database'}]\n${match.metadata?.text}`)
      .filter(text => text !== undefined);

    return contextChunks.join('\n\n[NEXT REFERENCE]\n\n');
  } catch (error) {
    console.error("RAG Retrieval Failed:", error);
    return "";
  }
};