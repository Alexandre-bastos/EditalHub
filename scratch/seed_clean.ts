import { PrismaClient } from '@prisma/client';
import { azureStorage } from '../src/services/azureStorage';
import { hashPassword } from '../src/lib/auth';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const ORGANIZADORAS_SEED = [
  { nome: 'FGV (Fundação Getulio Vargas)', site_url: 'https://conhecimento.fgv.br/concursos' },
  { nome: 'Vunesp (Fundação Vunesp)', site_url: 'https://www.vunesp.com.br' },
  { nome: 'Cebraspe', site_url: 'https://www.cebraspe.org.br/concursos' },
  { nome: 'FCC (Fundação Carlos Chagas)', site_url: 'https://www.concursosfcc.com.br' },
  { nome: 'Cesgranrio (Fundação Cesgranrio)', site_url: 'https://www.cesgranrio.org.br' },
  { nome: 'Instituto AOCP', site_url: 'https://www.institutoaocp.org.br' },
  { nome: 'IBFC', site_url: 'https://www.ibfc.org.br' },
  { nome: 'Fundatec', site_url: 'https://www.fundatec.org.br' },
  { nome: 'Consulplan', site_url: 'https://www.consulplan.net' },
  { nome: 'Quadrix', site_url: 'https://www.quadrix.org.br' },
  { nome: 'IADES', site_url: 'https://www.iades.com.br' },
  { nome: 'Idecan', site_url: 'https://www.idecan.org.br' },
  { nome: 'Objetiva Concursos', site_url: 'https://www.objetivas.com.br' },
  { nome: 'Instituto Verbena UFG', site_url: 'https://institutoverbena.ufg.br' },
  { nome: 'COTEC Unimontes', site_url: 'https://www.cotec.unimontes.br' },
  { nome: 'FEPESE', site_url: 'https://fepese.org.br' },
  { nome: 'COSEAC UFF', site_url: 'https://portal.coseac.uff.br' },
  { nome: 'Legalle Concursos', site_url: 'https://www.legalleconcursos.com.br' },
  { nome: 'Instituto Ludus', site_url: 'https://www.institutoludus.com.br' },
  { nome: 'FUNDEP (Gestão de Concursos)', site_url: 'https://www.gestaodeconcursos.com.br' },
  { nome: 'Ceperj', site_url: 'http://www.ceperj.rj.gov.br' },
  { nome: 'Instituto UniFil', site_url: 'https://www.institutounifil.com.br' },
  { nome: 'IBAM Concursos', site_url: 'http://www.ibam-concursos.org.br' },
  { nome: 'Marinha do Brasil', site_url: 'https://www.marinha.mil.br/sspm/concursos/marinha' },
  { nome: 'Exército Brasileiro', site_url: 'https://www.eb.mil.br/concursos' },
  { nome: 'Força Aérea Brasileira (Aeronáutica)', site_url: 'https://www.fab.mil.br/concursos' },
  { nome: 'Faurgs', site_url: 'http://portalfaurgs.com.br/concursos' },
  { nome: 'FUNCERN', site_url: 'https://www.funcern.br' },
  { nome: 'FAU Concursos', site_url: 'https://www.concursosfau.com.br' },
  { nome: 'NC UFPR', site_url: 'https://www.nc.ufpr.br' },
  { nome: 'Gualimp', site_url: 'https://gualimpconcursos.com.br' },
  { nome: 'IDIB', site_url: 'https://www.idib.org.br' },
  { nome: 'Instituto Excelência', site_url: 'https://www.institutoexcelenciapr.com.br' },
  { nome: 'Comperve UFRN', site_url: 'https://www.comperve.ufrn.br' },
  { nome: 'Copeve UFAL', site_url: 'http://www.copeve.ufal.br' },
  { nome: 'CIAAR (Aeronáutica)', site_url: 'https://www.fab.mil.br/ciaar' }
];

async function main() {
  console.log('=== INICIANDO LIMPEZA DA BASE E AZURE BLOB STORAGE ===');

  try {
    // 1. Coleta todos os editais que possuem arquivo PDF na Azure
    const editais = await prisma.edital.findMany({
      where: {
        nome_arquivo: { not: null }
      },
      select: {
        id: true,
        nome_arquivo: true
      }
    });

    console.log(`Encontrados ${editais.length} editais com PDFs associados no Azure Blob.`);

    // 2. Apaga cada arquivo do Azure Blob Storage
    for (const edital of editais) {
      if (edital.nome_arquivo) {
        console.log(`-> Excluindo arquivo: ${edital.nome_arquivo}...`);
        await azureStorage.deleteBlob(edital.nome_arquivo);
      }
    }
    console.log('Todos os arquivos PDF foram excluídos do Azure Blob.');

    // 3. Limpa as tabelas de forma ordenada respeitando Foreign Keys
    console.log('-> Limpando vagas...');
    await prisma.vaga.deleteMany({});
    
    console.log('-> Limpando concursos...');
    await prisma.concurso.deleteMany({});
    
    console.log('-> Limpando logs de auditoria...');
    await prisma.logAuditoria.deleteMany({});

    console.log('-> Limpando editais descartados...');
    await prisma.editalDescartado.deleteMany({});

    console.log('-> Limpando editais...');
    await prisma.edital.deleteMany({});
    
    console.log('-> Limpando organizadoras...');
    await prisma.organizadora.deleteMany({});

    console.log('Tabelas de editais, descartados, vagas, concursos, logs e organizadoras limpas com sucesso!');

    // 4. Seeding das dezenas de organizadoras brasileiras e militares
    console.log(`-> Semeando ${ORGANIZADORAS_SEED.length} organizadoras...`);
    for (const org of ORGANIZADORAS_SEED) {
      await prisma.organizadora.create({
        data: {
          nome: org.nome,
          site_url: org.site_url,
          ativo: true
        }
      });
    }
    console.log('Semeamento de organizadoras finalizado.');

    // 5. Garantir que pelo menos o usuário administrador exista
    const userCount = await prisma.usuario.count();
    if (userCount === 0) {
      console.log('-> Tabela de usuários vazia. Criando administrador padrão...');
      const adminHash = await hashPassword('admin123');
      await prisma.usuario.create({
        data: {
          nome: 'Administrador Padrão',
          email: 'admin@editalhub.com',
          senha_hash: adminHash,
          ativo: true
        }
      });
      console.log('Usuário admin@editalhub.com criado com a senha "admin123". Mude no primeiro login.');
    } else {
      console.log(`-> ${userCount} usuários administradores mantidos com segurança.`);
    }

    console.log('=== PROCESSO DE LIMPEZA E SEEDING CONCLUÍDO COM SUCESSO! ===');

  } catch (error) {
    console.error('Erro crítico durante a limpeza/seeding:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
