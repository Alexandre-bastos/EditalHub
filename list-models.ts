import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  console.log('Testando chave:', apiKey.substring(0, 10) + '...');
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    
    console.log('--- Modelos Disponíveis para sua Chave ---');
    if (data.models) {
      console.log(`Encontrados ${data.models.length} modelos:`);
      data.models.forEach((m: any) => {
        console.log(`- ${m.name}`);
      });
    } else {
      console.log('Erro na resposta:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Erro ao conectar com o Google:', error);
  }
}

main();
