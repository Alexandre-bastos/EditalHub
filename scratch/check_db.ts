import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDb() {
  try {
    const totalEditais = await prisma.edital.count();
    console.log(`Total de editais no banco: ${totalEditais}`);
    
    // Busca a organizadora FGV
    const fgv = await prisma.organizadora.findFirst({
      where: { nome: { contains: 'FGV' } }
    });
    
    if (!fgv) {
      console.log('Organizadora FGV não encontrada no banco!');
      return;
    }
    
    console.log(`\nBanca FGV encontrada: ID = ${fgv.id}, Nome = "${fgv.nome}"`);
    
    const editaisFgv = await prisma.edital.findMany({
      where: { organizadora_id: fgv.id },
      orderBy: { data_criacao: 'desc' }
    });
    
    console.log(`Total de editais cadastrados para FGV: ${editaisFgv.length}`);
    
    if (editaisFgv.length > 0) {
      console.log('\n--- Amostra dos 10 editais FGV mais recentes ---');
      editaisFgv.slice(0, 10).each = undefined; // just normal loop
      for (let i = 0; i < Math.min(10, editaisFgv.length); i++) {
        const e = editaisFgv[i];
        console.log(`[${i + 1}] ID: ${e.id}`);
        console.log(`    Nome: "${e.nome_edital}"`);
        console.log(`    URL: "${e.url_edital}"`);
        console.log(`    Valido: ${e.is_valido}`);
        console.log(`    Status: "${e.status_processamento}"`);
        console.log(`    Data Criação: ${e.data_criacao.toISOString()}`);
        console.log(`    Mensagem Erro: ${e.erro_mensagem || 'Nenhum'}`);
      }
    }
    
    // Contagem por status
    const validCount = await prisma.edital.count({ where: { organizadora_id: fgv.id, is_valido: true } });
    const ignoredCount = await prisma.edital.count({ where: { organizadora_id: fgv.id, is_valido: false } });
    const pendingCount = await prisma.edital.count({ where: { organizadora_id: fgv.id, status_processamento: 'pendente' } });
    const processedCount = await prisma.edital.count({ where: { organizadora_id: fgv.id, status_processamento: 'processado' } });
    const errorCount = await prisma.edital.count({ where: { organizadora_id: fgv.id, status_processamento: 'erro' } });
    const ignoredStatusCount = await prisma.edital.count({ where: { organizadora_id: fgv.id, status_processamento: 'ignorado' } });
    
    console.log('\n--- Estatísticas de Status FGV no Banco ---');
    console.log(`- Válidos: ${validCount}`);
    console.log(`- Inválidos (Descartados): ${ignoredCount}`);
    console.log(`- Status 'pendente': ${pendingCount}`);
    console.log(`- Status 'processado': ${processedCount}`);
    console.log(`- Status 'erro': ${errorCount}`);
    console.log(`- Status 'ignorado': ${ignoredStatusCount}`);

  } catch (err) {
    console.error('Erro ao consultar banco:', err);
  } finally {
    await prisma.$disconnect();
  }
}

checkDb();
