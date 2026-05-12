import prisma from '../src/lib/prisma';

async function main() {
  const organizadoras = await prisma.organizadora.count();
  const editais = await prisma.edital.count();
  const concursos = await prisma.concurso.count();
  const pendentes = await prisma.edital.count({ where: { status_processamento: 'pendente' } });
  const erros = await prisma.edital.count({ where: { status_processamento: 'erro' } });
  const processados = await prisma.edital.count({ where: { status_processamento: 'processado' } });

  console.log('--- Resumo do Banco de Dados ---');
  console.log(`Organizadoras: ${organizadoras}`);
  console.log(`Editais: ${editais}`);
  console.log(`  - Pendentes: ${pendentes}`);
  console.log(`  - Processados: ${processados}`);
  console.log(`  - Erros: ${erros}`);
  console.log(`Concursos: ${concursos}`);
}

main().catch(console.error);
