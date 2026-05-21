import { PrismaClient } from '@prisma/client';
import { geminiService } from '../src/services/gemini';
import { BlobServiceClient } from '@azure/storage-blob';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function streamToBuffer(readableStream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    readableStream.on('data', (data: any) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}

function parseRobustDate(dateStr: any): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }
  if (typeof dateStr !== 'string') return null;

  const cleanStr = dateStr.trim();
  if (cleanStr === "" || cleanStr.toLowerCase() === "null") return null;

  // 1. Verifica formato YYYY-MM-DD (ex: "2025-07-20" ou "2025-07-20T23:59:59")
  let match = cleanStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    return new Date(year, month - 1, day, 23, 59, 59);
  }

  // 2. Verifica formato brasileiro DD/MM/YYYY ou DD-MM-YYYY (ex: "20/07/2025" ou "20-07-2025")
  match = cleanStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    return new Date(year, month - 1, day, 23, 59, 59);
  }

  // 3. Fallback para o parse nativo do JS
  const parsed = new Date(cleanStr);
  if (!isNaN(parsed.getTime())) {
    parsed.setHours(23, 59, 59, 999);
    return parsed;
  }

  return null;
}

function meetsEntryRequirements(analysis: any): { valid: boolean; reason?: string } {
  if (!analysis.nome_concurso || analysis.nome_concurso.trim() === "") {
    return { valid: false, reason: "Nome do concurso ausente" };
  }
  if (!analysis.inscricao_fim) {
    return { valid: false, reason: "Data limite de inscrição ausente" };
  }

  const dataFim = parseRobustDate(analysis.inscricao_fim);
  if (!dataFim) {
    return { valid: false, reason: `Data limite de inscrição inválida: ${analysis.inscricao_fim}` };
  }

  const hoje = new Date();
  if (dataFim < hoje) {
    return { valid: false, reason: `Inscrição encerrada em ${analysis.inscricao_fim}` };
  }

  if (!analysis.cargos || !Array.isArray(analysis.cargos) || analysis.cargos.length === 0) {
    return { valid: false, reason: "Nenhum cargo ou vaga informado" };
  }

  return { valid: true };
}

async function main() {
  console.log("Procurando um edital da organizadora FGV na base de dados...");
  
  // 1. Achar a organizadora FGV
  const fgvOrg = await prisma.organizadora.findFirst({
    where: {
      nome: {
        contains: 'FGV'
      }
    }
  });

  if (!fgvOrg) {
    console.error("Nenhuma organizadora contendo 'FGV' foi encontrada no banco.");
    return;
  }

  console.log(`Organizadora encontrada: ${fgvOrg.nome} (ID: ${fgvOrg.id})`);

  // 2. Achar um edital pendente ou com erro da FGV
  const edital = await prisma.edital.findFirst({
    where: {
      organizadora_id: fgvOrg.id,
      nome_arquivo: {
        not: null
      }
    },
    orderBy: {
      data_criacao: 'desc'
    }
  });

  if (!edital) {
    console.error("Nenhum edital com arquivo associado à FGV foi encontrado.");
    return;
  }

  console.log(`\nEdital selecionado para teste:`);
  console.log(`ID: ${edital.id}`);
  console.log(`Nome: ${edital.nome_edital}`);
  console.log(`Status atual: ${edital.status_processamento}`);
  console.log(`Nome do Arquivo: ${edital.nome_arquivo}`);
  console.log(`URL original: ${edital.url_edital}`);

  // 3. Download do Azure
  console.log(`\nBaixando arquivo do Azure Blob Storage...`);
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
  const containerName = process.env.AZURE_STORAGE_CONTAINER || 'editalhub';
  
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING não está definida no arquivo .env.');
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(edital.nome_arquivo!);
  
  const downloadResponse = await blobClient.download();
  const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
  console.log(`Download finalizado! Tamanho do buffer: ${buffer.length} bytes.`);

  // 4. Executar Análise no Gemini
  console.log(`\nEnviando para análise multimodal do Gemini (2.5-flash)...`);
  const startTime = Date.now();
  const analysis = await geminiService.analyzeEdital(buffer);
  const endTime = Date.now();
  
  console.log(`Análise concluída em ${((endTime - startTime) / 1000).toFixed(2)} segundos.`);
  console.log(`\nResposta bruta do Gemini:`);
  console.log(JSON.stringify(analysis, null, 2));

  // 5. Validar requisitos
  console.log(`\nExecutando meetsEntryRequirements()...`);
  const validation = meetsEntryRequirements(analysis);
  console.log(`Resultado da validação:`, validation);

  // 6. Testar parse robusto de datas
  console.log(`\nTeste de Parsing de Datas Extraídas:`);
  const parsedInicio = parseRobustDate(analysis.inscricao_inicio);
  const parsedFim = parseRobustDate(analysis.inscricao_fim);
  const parsedProva = parseRobustDate(analysis.data_prova);

  console.log(`- inscricao_inicio bruto: ${analysis.inscricao_inicio} => Parsed: ${parsedInicio ? parsedInicio.toISOString() : 'NULL'}`);
  console.log(`- inscricao_fim bruto: ${analysis.inscricao_fim} => Parsed: ${parsedFim ? parsedFim.toISOString() : 'NULL'}`);
  console.log(`- data_prova bruto: ${analysis.data_prova} => Parsed: ${parsedProva ? parsedProva.toISOString() : 'NULL'}`);

  console.log(`\nHoje: ${new Date().toISOString()}`);
  if (parsedFim) {
    console.log(`Inscrição fim >= hoje: ${parsedFim >= new Date()}`);
  }
}

main()
  .catch((e) => {
    console.error("Erro durante a execução do teste:");
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
