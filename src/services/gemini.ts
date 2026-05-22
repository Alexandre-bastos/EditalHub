import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKeys = (process.env.GEMINI_API_KEY || '')
  .split(/[;,]/)
  .map(k => k.trim().replace(/^["']|["']$/g, ''))
  .filter(Boolean);

export class GeminiService {
  constructor() {
    if (apiKeys.length === 0) {
      console.warn('Nenhuma GEMINI_API_KEY configurada. Os recursos de IA estarão desativados.');
    } else {
      console.log(`[Gemini] Configurado com ${apiKeys.length} chave(s) de API para rotação.`);
    }
  }

  async analyzeEdital(pdfBuffer: Buffer) {
    if (apiKeys.length === 0) {
      throw new Error('Nenhuma chave de API do Gemini configurada (GEMINI_API_KEY).');
    }

    const prompt = `
      Você é um especialista em análise de editais de concursos públicos.
      Analise o edital fornecido e extraia as informações essenciais em formato JSON.
      
      Informações necessárias:
      1. Nome do concurso.
      2. Estado (UF).
      3. Escolaridade predominante (Fundamental, Médio, Técnico ou Superior).
      4. Valor da taxa de inscrição (se houver múltiplos, use o da escolaridade superior).
      5. Salário Inicial: Identifique o menor salário oferecido entre todos os cargos (ou o salário base).
      6. Datas importantes (Início das inscrições, Fim das inscrições e Data da prova):
         - "inscricao_inicio": Data de início das inscrições. Deve ser convertida e retornada estritamente no formato YYYY-MM-DD.
           Procure no edital por frases como "inscrições estarão abertas de/das...", "período de inscrições inicia em...", "a partir do dia...".
           Traduza meses em português para números (ex: "2 de julho de 2025" vira "2025-07-02").
         - "inscricao_fim": Data de término/encerramento das inscrições. Deve ser convertida e retornada estritamente no formato YYYY-MM-DD.
           Esta informação é MANDATÓRIA e CRÍTICA. Se não estiver óbvia no texto principal das inscrições, faça uma varredura minuciosa por todo o documento (especialmente no Anexo do Cronograma Estimado / Calendário no final do PDF).
           Procure por termos como "até as 23h59min do dia...", "período de inscrições encerra em...", "término das inscrições em...", "inscrições até DD/MM/YYYY".
           Traduza meses em português para números (ex: "20 de julho de 2025" vira "2025-07-20").
         - "data_prova": Data de realização da prova objetiva/escrita. Deve ser convertida e retornada no formato YYYY-MM-DD.
           Procure no Cronograma ou nas seções de "DAS PROVAS". Se houver mais de uma data (ex: prova objetiva e prova discursiva em dias diferentes), use a data da primeira prova objetiva.
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

    let lastError: any = null;

    for (let i = 0; i < apiKeys.length; i++) {
      const currentKey = apiKeys[i];
      const partialKey = `${currentKey.substring(0, 8)}...${currentKey.substring(currentKey.length - 4)}`;
      console.log(`[Gemini] Tentando processar edital com a chave index ${i} (${partialKey})`);
      
      try {
        const genAI = new GoogleGenerativeAI(currentKey);
        // Usando models/gemini-flash-latest
        const model = genAI.getGenerativeModel({ 
          model: 'models/gemini-flash-latest',
          generationConfig: {
            responseMimeType: 'application/json',
          }
        });

        const result = await model.generateContent([
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
      } catch (err: any) {
        console.warn(`[Gemini] Falha usando a chave index ${i} (${partialKey}): ${err.message || err}`);
        lastError = err;
        
        // Se for erro de JSON inválido, não adianta tentar outra chave, lança direto
        if (err.message && err.message.includes('JSON válido')) {
          throw err;
        }
      }
    }

    throw new Error(`Todas as ${apiKeys.length} chaves configuradas falharam. Último erro: ${lastError?.message || lastError}`);
  }
}

export const geminiService = new GeminiService();
