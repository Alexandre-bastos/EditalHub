// Trigger redeploy to load env vars
import prisma from '../lib/prisma';
import { geminiService } from './gemini';
import { BlobServiceClient } from '@azure/storage-blob';
import { azureStorage } from './azureStorage';

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

function meetsEntryRequirements(analysis: any, bypassExpiryCheck = false): { valid: boolean; reason?: string } {
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
  if (dataFim < hoje && !bypassExpiryCheck) {
    return { valid: false, reason: `Inscrição encerrada em ${analysis.inscricao_fim}` };
  }

  if (!analysis.cargos || !Array.isArray(analysis.cargos) || analysis.cargos.length === 0) {
    return { valid: false, reason: "Nenhum cargo ou vaga informado" };
  }

  return { valid: true };
}

export async function processEdital(editalId: string, bypassExpiryCheck = false) {
  console.log(`Iniciando processamento do edital: ${editalId} (bypassExpiryCheck: ${bypassExpiryCheck})`);


  try {
    const edital = await prisma.edital.findUnique({
      where: { id: editalId },
      include: { organizadora: true }
    });

    if (!edital || !edital.nome_arquivo) {
      throw new Error('Edital não encontrado ou arquivo não disponível no storage');
    }

    // Limpar erro anterior se houver
    await prisma.edital.update({
      where: { id: editalId },
      data: { erro_mensagem: null }
    });

    // 1. Download do PDF do Azure usando o Connection String (Seguro)
    console.log(`Baixando arquivo do Azure: ${edital.nome_arquivo}`);
    
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
    const containerName = process.env.AZURE_STORAGE_CONTAINER || 'editalhub';
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(edital.nome_arquivo);
    
    const downloadResponse = await blobClient.download();
    const buffer = await streamToBuffer(downloadResponse.readableStreamBody);

    // 2. Análise Gemini (Direto do PDF)
    console.log('Enviando PDF para análise multimodal do Gemini...');
    const analysis = await geminiService.analyzeEdital(buffer);

    // 3. Validação dos Requisitos de Entrada
    const validation = meetsEntryRequirements(analysis, bypassExpiryCheck);
    if (!validation.valid) {

      const dataFim = parseRobustDate(analysis.inscricao_fim);
      const hoje = new Date();
      const isExpired = dataFim && dataFim < hoje;

      if (isExpired) {
        console.log(`Edital fora de vigência (inscrições encerradas em ${analysis.inscricao_fim}). Arquivando como não-visível (is_valido = false) e marcando como processado...`);

        const fullText = "Texto extraído via Gemini Vision/Multimodal";

        // 1. Criar concurso mesmo vencido para registro histórico
        const concurso = await prisma.concurso.create({
          data: {
            edital_id: edital.id,
            nome_concurso: analysis.nome_concurso || edital.nome_edital,
            estado: analysis.estado,
            escolaridade: analysis.escolaridade,
            formacao: analysis.formacao,
            profissao: analysis.profissao,
            taxa_inscricao: analysis.taxa_inscricao,
            salario_inicial: analysis.salario_inicial,
            idade_minima: analysis.idade_minima,
            idade_maxima: analysis.idade_maxima,
            link_inscricao: analysis.link_inscricao,
            resumo: analysis.resumo,
            inscricao_inicio: parseRobustDate(analysis.inscricao_inicio),
            inscricao_fim: dataFim,
            data_prova: parseRobustDate(analysis.data_prova),
            cargos: {
              create: (analysis.cargos || []).map((v: any) => ({
                nome_cargo: v.nome_cargo,
                escolaridade: v.escolaridade,
                salario: v.salario,
                quantidade: v.quantidade,
                requisitos: v.requisitos
              }))
            }
          }
        });

        // 2. Atualizar o edital para status 'processado' e is_valido = false para não ficar visível
        await prisma.edital.update({
          where: { id: edital.id },
          data: {
            status_processamento: 'processado',
            is_valido: false,
            texto_extraido: fullText.substring(0, 50000),
            erro_mensagem: null
          }
        });

        // 3. Excluir o PDF físico no Azure Blob Storage para poupar espaço
        await azureStorage.deleteBlob(edital.nome_arquivo);

        console.log(`Edital ${editalId} processado e arquivado com sucesso como não-visível.`);
        return concurso;
      }

      console.log(`Edital não atende aos requisitos estruturais: ${validation.reason}. Descartando...`);

      // 1. Registrar na tabela de editais descartados
      await prisma.editalDescartado.create({
        data: {
          nome_edital: edital.nome_edital,
          url_edital: edital.url_edital,
          motivo_descarte: validation.reason || 'Requisitos de entrada não atendidos'
        }
      });

      // 2. Excluir arquivo físico no Azure Blob Storage
      await azureStorage.deleteBlob(edital.nome_arquivo);

      // 3. Excluir registro do banco de dados (tabela Edital)
      await prisma.edital.delete({
        where: { id: editalId }
      });

      console.log(`Edital ${editalId} excluído com sucesso por não atender aos requisitos.`);
      return null;
    }

    // 4. Salvar no Banco
    console.log('Salvando dados extraídos...');
    
    const fullText = "Texto extraído via Gemini Vision/Multimodal";
    
    // Criar ou Atualizar Concurso
    const concurso = await prisma.concurso.create({
      data: {
        edital_id: edital.id,
        nome_concurso: analysis.nome_concurso,
        estado: analysis.estado,
        escolaridade: analysis.escolaridade,
        formacao: analysis.formacao,
        profissao: analysis.profissao,
        taxa_inscricao: analysis.taxa_inscricao,
        salario_inicial: analysis.salario_inicial,
        idade_minima: analysis.idade_minima,
        idade_maxima: analysis.idade_maxima,
        link_inscricao: analysis.link_inscricao,
        resumo: analysis.resumo,
        inscricao_inicio: parseRobustDate(analysis.inscricao_inicio),
        inscricao_fim: parseRobustDate(analysis.inscricao_fim),
        data_prova: parseRobustDate(analysis.data_prova),
        cargos: {
          create: (analysis.cargos || []).map((v: any) => ({
            nome_cargo: v.nome_cargo,
            escolaridade: v.escolaridade,
            salario: v.salario,
            quantidade: v.quantidade,
            requisitos: v.requisitos
          }))
        }
      }
    });

    // Atualizar status do edital
    await prisma.edital.update({
      where: { id: edital.id },
      data: {
        status_processamento: 'processado',
        texto_extraido: fullText.substring(0, 50000),
        erro_mensagem: null
      }
    });

    console.log(`Processamento concluído para: ${concurso.nome_concurso}`);
    return concurso;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Erro ao processar edital ${editalId}:`, errorMsg);
    
    // Só tenta atualizar o edital se ele ainda existir no banco de dados!
    try {
      const editalExists = await prisma.edital.findUnique({ where: { id: editalId } });
      if (editalExists) {
        await prisma.edital.update({
          where: { id: editalId },
          data: { 
            status_processamento: 'erro',
            erro_mensagem: errorMsg
          }
        });
      }
    } catch (dbErr) {
      console.error('Erro ao registrar mensagem de erro no Edital:', dbErr);
    }
    
    throw error;
  }
}

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
