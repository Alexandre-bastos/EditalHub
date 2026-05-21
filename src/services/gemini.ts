import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export class GeminiService {
  private model: any;

  constructor() {
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not defined. AI features will be disabled.');
    }
    this.model = genAI.getGenerativeModel({ 
      model: 'models/gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });
  }

  async analyzeEdital(pdfBuffer: Buffer) {
    if (!apiKey) throw new Error('Gemini API Key missing');

    const prompt = `
      Você é um especialista em análise de editais de concursos públicos.
      Analise o edital fornecido e extraia as informações essenciais em formato JSON.
      
      Informações necessárias:
      1. Nome do concurso.
      2. Estado (UF).
      3. Escolaridade predominante (Fundamental, Médio, Técnico ou Superior).
      4. Valor da taxa de inscrição (se houver múltiplos, use o da escolaridade superior).
      5. Salário Inicial: Identifique o menor salário oferecido entre todos os cargos (ou o salário base).
      6. Datas: Início das inscrições, Fim das inscrições e Data da prova.
      7. Formação/Profissão: Se o edital for para uma área específica (ex: Saúde, Jurídico), identifique. Caso contrário, use "Diversas".
      8. Idade Mínima/Máxima: Identifique se houver limites de idade (comum em carreiras policiais).
      9. Link de Inscrição: Procure pelo link do portal do candidato no site da banca.
      10. Lista de Cargos (Vagas): Nome do cargo, Escolaridade exigida, Salário, Quantidade de vagas e Requisitos.
      11. Resumo do concurso: Crie um resumo bem estruturado, atrativo e completo do concurso em português, detalhando o órgão, destaques das oportunidades de vagas e informações essenciais (de 2 a 4 parágrafos).

      O formato de resposta DEVE ser EXATAMENTE este JSON:
      {
        "nome_concurso": "string",
        "estado": "string",
        "escolaridade": "string",
        "salario_inicial": number,
        "formacao": "string",
        "profissao": "string",
        "taxa_inscricao": number,
        "idade_minima": number,
        "idade_maxima": number,
        "inscricao_inicio": "YYYY-MM-DD",
        "inscricao_fim": "YYYY-MM-DD",
        "data_prova": "YYYY-MM-DD",
        "link_inscricao": "string",
        "resumo": "string",
        "cargos": [
          {
            "nome_cargo": "string",
            "escolaridade": "string",
            "salario": number,
            "quantidade": number,
            "requisitos": "string"
          }
        ]
      }
    `;

    const result = await this.model.generateContent([
      {
        inlineData: {
          data: pdfBuffer.toString("base64"),
          mimeType: "application/pdf"
        }
      },
      prompt
    ]);
    
    const response = await result.response;
    const text = response.text();
    
    try {
      const cleanJson = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      console.error('Erro ao processar resposta do Gemini:', text);
      throw new Error('Resposta da IA não é um JSON válido');
    }
  }
}

export const geminiService = new GeminiService();
