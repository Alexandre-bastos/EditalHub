import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import axios from 'axios';
import prisma from '../lib/prisma';
import { azureStorage } from './azureStorage';

const EXCLUDE_KEYWORDS = [
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
  'comunicado'
];

export async function scrapeFgv() {
  console.log('--- Iniciando Coleta FGV (Filtro Inteligente) ---');
  const startTime = new Date();
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('Acessando portal de concursos da FGV...');
    await page.goto('https://conhecimento.fgv.br/concursos', { waitUntil: 'networkidle', timeout: 60000 });
    const content = await page.content();
    const $ = cheerio.load(content);
    
    let fgv = await prisma.organizadora.findFirst({
      where: { nome: 'FGV' }
    });
    
    if (!fgv) {
      fgv = await prisma.organizadora.create({
        data: {
          nome: 'FGV',
          site_url: 'https://conhecimento.fgv.br/concursos',
          ativo: true
        }
      });
    }

    const concursos: any[] = [];
    $('.views-row').each((i, el) => {
      const nome = $(el).find('.views-field-title a').text().trim();
      const link = 'https://conhecimento.fgv.br' + $(el).find('.views-field-title a').attr('href');
      
      if (nome && link) {
        concursos.push({ nome, link });
      }
    });

    console.log(`Total de concursos encontrados: ${concursos.length}`);

    for (const concurso of concursos) {
      console.log(`\n[${new Date().toLocaleTimeString()}] Analisando: ${concurso.nome}`);
      
      try {
        const alreadyHasEdital = await prisma.edital.findFirst({
          where: { nome_edital: concurso.nome }
        });

        if (alreadyHasEdital) {
          console.log(`  > Concurso já processado. Pulando...`);
          continue;
        }

        await page.goto(concurso.link, { waitUntil: 'networkidle', timeout: 30000 });
        const concContent = await page.content();
        const $c = cheerio.load(concContent);
        
        // Determinar se o edital é válido (abertura/vigente) ou apenas informativo
        const nomeLower = concurso.nome.toLowerCase();
        let isValid = !EXCLUDE_KEYWORDS.some(k => nomeLower.includes(k));

        const editalLinkEl = $c('a').filter((i, el) => {
          const text = $c(el).text().toLowerCase();
          const isEdital = text.includes('edital');
          const isAbertura = text.includes('abertura') || text.includes('retificado');
          const isExcluded = EXCLUDE_KEYWORDS.some(k => text.includes(k) && k !== 'retificado');
          
          return isEdital && isAbertura && !isExcluded;
        }).first();

        const editalUrl = editalLinkEl.length > 0 ? 
          (editalLinkEl.attr('href')?.startsWith('http') ? editalLinkEl.attr('href') : 'https://conhecimento.fgv.br' + (editalLinkEl.attr('href')?.startsWith('/') ? '' : '/') + editalLinkEl.attr('href')) : 
          null;

        if (!editalUrl) {
          isValid = false;
        }

        // Mesmo se for inválido, salvamos no banco para não processar de novo, mas marcamos como is_valido: false
        const edital = await prisma.edital.create({
          data: {
            organizadora_id: fgv.id,
            nome_edital: concurso.nome,
            url_edital: editalUrl || concurso.link,
            status_processamento: isValid ? 'pendente' : 'ignorado',
            is_valido: isValid
          }
        });

        if (isValid && editalUrl) {
          console.log(`  > NOVO EDITAL VÁLIDO: ${edital.nome_edital}`);
          await uploadEditalToAzure(editalUrl, fgv.nome, edital.id);
        } else {
          console.log(`  > STATUS: Ignorado (Informativo ou Edital não encontrado)`);
        }

      } catch (err: any) {
        console.error(`  > Erro ao processar concurso ${concurso.nome}:`, err.message);
      }
    }

  } catch (error) {
    console.error('Erro crítico na coleta FGV:', error);
  } finally {
    await browser.close();
    const duration = (new Date().getTime() - startTime.getTime()) / 1000;
    console.log(`\n--- Coleta FGV Finalizada (${duration}s) ---`);
  }
}

async function uploadEditalToAzure(url: string, org: string, editalId: string) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const buffer = Buffer.from(response.data);
    const year = new Date().getFullYear().toString();
    const blobName = `${org}/${year}/${editalId}.pdf`;

    await azureStorage.uploadBuffer(buffer, blobName);

    await prisma.edital.update({
      where: { id: editalId },
      data: {
        nome_arquivo: blobName,
        data_download: new Date()
      }
    });

    return blobName;
  } catch (error: any) {
    console.error(`  > Erro no upload do edital ${url}:`, error.message);
  }
}
