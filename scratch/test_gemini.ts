import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

async function main() {
  const models = ['models/gemini-2.5-flash', 'models/gemini-2.0-flash', 'models/gemini-1.5-flash'];
  
  for (const modelName of models) {
    try {
      console.log(`Testando modelo: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Diga 'Olá' se você estiver funcionando.");
      console.log(`Resposta (${modelName}):`, result.response.text());
      break;
    } catch (e: any) {
      console.error(`Erro com ${modelName}:`, e.message);
    }
  }
}

main().catch(console.error);
