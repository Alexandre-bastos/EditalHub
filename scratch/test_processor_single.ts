import { processEdital } from '../src/services/processor';
import prisma from '../src/lib/prisma';

async function main() {
  const id = '09f27c81-906b-4a7d-a892-b15dc869d6ef';
  console.log(`Testando processamento para ID: ${id}`);
  const concurso = await processEdital(id);
  
  const saved = await prisma.concurso.findUnique({
    where: { id: concurso.id },
    include: { cargos: true }
  });

  console.log('--- Dados Salvos ---');
  console.log(`Concurso: ${saved?.nome_concurso}`);
  console.log(`Salário Inicial (DB): ${saved?.salario_inicial}`);
  console.log(`Cargos encontrados: ${saved?.cargos.length}`);
}

main().catch(console.error);
