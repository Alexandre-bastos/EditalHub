import dotenv from 'dotenv';
dotenv.config();
console.log('Chave Gemini encontrada:', process.env.GEMINI_API_KEY ? 'SIM (Começa com ' + process.env.GEMINI_API_KEY.substring(0, 5) + '...)' : 'NÃO');
import { processEdital } from './src/services/processor';
import prisma from './src/lib/prisma';

async function main() {
  console.log('--- Iniciando Processamento de Editais Pendentes ---');
  
  const editais = await prisma.edital.findMany({
    where: { 
      status_processamento: { in: ['pendente', 'erro'] } 
    }
  });

  if (editais.length === 0) {
    console.log('Nenhum edital pendente encontrado.');
    return;
  }

  console.log(`Encontrados ${editais.length} editais para processar.\n`);

  for (const edital of editais) {
    try {
      console.log(`> Processando: ${edital.id}`);
      await processEdital(edital.id);
      console.log(`✅ Sucesso!\n`);
    } catch (error) {
      console.error(`❌ Erro no edital ${edital.id}:`, error);
    }
  }

  console.log('--- Fim do Processamento ---');
}

main().catch(console.error);
