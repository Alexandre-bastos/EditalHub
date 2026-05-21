import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  try {
    const logs = await prisma.logAuditoria.findMany({
      orderBy: { data_criacao: 'desc' },
      take: 20
    });
    console.log('--- Last 20 Auditoria Logs ---');
    for (const log of logs) {
      console.log(`[${log.data_criacao.toISOString()}] [${log.usuario_nome || 'N/A'}] [${log.acao}] [${log.entidade || 'N/A'}]: ${log.detalhes}`);
    }
  } catch (err) {
    console.error('Error reading logs:', err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
