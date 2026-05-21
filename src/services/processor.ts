// Trigger redeploy to load env vars
import prisma from '../lib/prisma';
import { geminiService } from './gemini';
import { BlobServiceClient } from '@azure/storage-blob';

export async function processEdital(editalId: string) {
  console.log(`Iniciando processamento do edital: ${editalId}`);

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

    // 3. Salvar no Banco
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
        inscricao_inicio: analysis.inscricao_inicio ? new Date(analysis.inscricao_inicio) : null,
        inscricao_fim: analysis.inscricao_fim ? new Date(analysis.inscricao_fim) : null,
        data_prova: analysis.data_prova ? new Date(analysis.data_prova) : null,
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
    
    await prisma.edital.update({
      where: { id: editalId },
      data: { 
        status_processamento: 'erro',
        erro_mensagem: errorMsg
      }
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
