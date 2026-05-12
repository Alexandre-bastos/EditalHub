import prisma from '../src/lib/prisma';

const EXCLUDE_KEYWORDS = [
  'nacional unificado', // O usuário citou este especificamente
  'resultado final',
  'resultado definitivo',
  'homologação',
  'classificação final',
  'convocação para posse'
];

async function main() {
  console.log('--- Iniciando Limpeza de Concursos Inativos ---');
  
  const editais = await prisma.edital.findMany({
    include: { concursos: true }
  });

  let removed = 0;

  for (const edital of editais) {
    const nome = edital.nome_edital.toLowerCase();
    if (EXCLUDE_KEYWORDS.some(k => nome.includes(k))) {
      console.log(`Removendo edital/concurso inativo: ${edital.nome_edital}`);
      
      // Cascade delete manually because of current Prisma setup if needed, 
      // but db push should have handled relations. 
      // We'll delete Concurso first (if exists) then Edital.
      if (edital.concursos.length > 0) {
        for (const c of edital.concursos) {
          await prisma.vaga.deleteMany({ where: { concurso_id: c.id } });
          await prisma.concurso.delete({ where: { id: c.id } });
        }
      }
      await prisma.edital.delete({ where: { id: edital.id } });
      removed++;
    }
  }

  console.log(`\nLimpeza concluída. ${removed} registros removidos.`);
}

main().catch(console.error);
