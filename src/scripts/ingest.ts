import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!PINECONE_API_KEY || !GEMINI_API_KEY) {
  console.error("🚨 Missing API Keys. Check your .env file.");
  process.exit(1);
}

const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const index = pinecone.index('ayulex-clinical-knowledge');

// 🧰 SENIOR ARCHITECTURE: Configure the Text Splitter
// This ensures we don't cut medical context in half. It overlaps chunks by 200 characters.
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200, 
});

const getEmbeddings = async (text: string): Promise<number[]> => {
  try {
    const response = await genAI.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
    });
    return response.embeddings?.[0]?.values || [];
  } catch (error) {
    console.error("Embedding generation failed.", error);
    return [];
  }
};

const ingestDirectory = async () => {
  const dataDir = path.resolve(process.cwd(), 'data');
  
  if (!fs.existsSync(dataDir)) {
    console.error(`🚨 Data directory not found at ${dataDir}. Please create it and add text files.`);
    return;
  }

  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.txt') || f.endsWith('.md'));
  
  if (files.length === 0) {
    console.log("⚠️ No .txt or .md files found in the data directory.");
    return;
  }

  console.log(`🚀 Found ${files.length} files. Starting Enterprise Ingestion Pipeline...`);

  const allVectors: any[] = [];

  for (const file of files) {
    console.log(`\n📄 Processing file: ${file}`);
    const filePath = path.join(dataDir, file);
    const rawText = fs.readFileSync(filePath, 'utf-8');

    // 1. Chunk the massive text file into bite-sized paragraphs
    const chunks = await splitter.splitText(rawText);
    console.log(`   ✂️ Split into ${chunks.length} semantic chunks.`);

    // 2. Vectorize each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      console.log(`   🧠 Embedding chunk ${i + 1}/${chunks.length}...`);
      
      const embedding = await getEmbeddings(chunkText);
      
      if (embedding.length > 0) {
        allVectors.push({
          id: `${file}-chunk-${i}-${Date.now()}`, // Unique ID for Pinecone
          values: embedding,
          metadata: {
            source: file,
            text: chunkText // Store the text so the AI can read it later
          }
        });
      }
      
      // Safety delay to prevent hitting Google Gemini API Rate Limits
      await new Promise(resolve => setTimeout(resolve, 300)); 
    }
  }

  // 3. Batch Upload to Pinecone (Safely using the explicit records object)
  if (allVectors.length > 0) {
    console.log(`\n💾 Total vectors generated: ${allVectors.length}. Uploading...`);
    
    // Upload in batches of 100 to prevent payload too large errors
    const BATCH_SIZE = 100;
    for (let i = 0; i < allVectors.length; i += BATCH_SIZE) {
      const batch = allVectors.slice(i, i + BATCH_SIZE);
      console.log(`   📤 Uploading batch ${Math.floor(i / BATCH_SIZE) + 1}...`);
      await index.upsert({ records: batch });
    }

    console.log("\n🎉 Enterprise Ingestion Complete! Your RAG Database is massively scaled.");
  }
};

ingestDirectory().catch(console.error);