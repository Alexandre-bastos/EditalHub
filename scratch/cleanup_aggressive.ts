import prisma from '../src/lib/prisma';

const EXCLUDE_KEYWORDS = [
  'nacional unificado 2', 
  'resultado final',
  'resultado definitivo',
  'homologação',
  'classificação final',
  'convocação',
  'posse',
  'encerramento',
  'resultado da prova',
  'gabarito',
  'cronograma',
  'aviso',
  'comunicado',
  'exame' // O usuário pode querer manter exames, mas geralmente são periódicos e não "concursos abertos" no sentido tradicional.
];

async function main() {
  console.log('--- Iniciando Limpeza Agressiva de Editais ---');
  
  const editais = await prisma.edital.findMany({
    include: { concursos: true }
  });

  let removed = 0;

  for (const edital of editais) {
    const nome = edital.nome_edital.toLowerCase();
    const url = (edital.url_edital || '').toLowerCase();
    
    if (EXCLUDE_KEYWORDS.some(k => nome.includes(k) || url.includes(k))) {
      console.log(`Removendo edital: ${edital.nome_edital}`);
      
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
