// Trigger redeploy to load env vars
import prisma from '../lib/prisma';
import { geminiService } from './gemini';
import { azureStorage } from './azureStorage';
import { BlobServiceClient } from '@azure/storage-blob';
import * as pdfParse from 'pdf-parse';
// @ts-ignore - Handle ESM/CJS interop for pdf-parse
const pdf = (pdfParse.default || pdfParse) as any;

export async function processEdital(editalId: string) {
  console.log(`Iniciando processamento do edital: ${editalId}`);

  try {
    const edital = await prisma.edital.findUnique({
      where: { id: editalId },
      include: { organizadora: true }
    });

    if (!edital || !edital.nome_arquivo) {
      throw new Error('Edital não encontrado ou arquivo não disponível');
    }

    // 1. Download do PDF do Azure usando o Connection String (Seguro)
    console.log(`Baixando arquivo do Azure: ${edital.nome_arquivo}`);
    
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
    const containerName = process.env.AZURE_STORAGE_CONTAINER || 'editalhub';
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(edital.nome_arquivo);
    
    const downloadResponse = await blobClient.download();
    const buffer = await streamToBuffer(downloadResponse.readableStreamBody);

    // 2. Extração de Texto
    console.log('Extraindo texto do PDF...');
    const pdfData = await pdf(buffer);
    const fullText = pdfData.text;

    // 3. Análise Gemini
    console.log('Enviando para análise do Gemini...');
    const analysis = await geminiService.analyzeEdital(fullText);

    // 4. Salvar no Banco
    console.log('Salvando dados extraídos...');
    
    // Criar ou Atualizar Concurso
    const concurso = await prisma.concurso.create({
      data: {
        edital_id: edital.id,
        nome_concurso: analysis.nome_concurso,
        estado: analysis.estado,
        escolaridade: analysis.escolaridade,
        taxa_inscricao: analysis.taxa_inscricao,
        inscricao_inicio: analysis.inscricao_inicio ? new Date(analysis.inscricao_inicio) : null,
        inscricao_fim: analysis.inscricao_fim ? new Date(analysis.inscricao_fim) : null,
        data_prova: analysis.data_prova ? new Date(analysis.data_prova) : null,
        cargos: {
          create: analysis.cargos.map((v: any) => ({
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
        texto_extraido: fullText.substring(0, 50000) // Guardar um resumo do texto
      }
    });

    console.log(`Processamento concluído para: ${concurso.nome_concurso}`);
    return concurso;

  } catch (error) {
    console.error(`Erro ao processar edital ${editalId}:`, error);
    await prisma.edital.update({
      where: { id: editalId },
      data: { status_processamento: 'erro' }
    });
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
