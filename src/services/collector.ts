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
  'convocação para posse',
  'encerramento',
  'resultado da prova'
];

export async function scrapeFgv() {
  console.log('--- Iniciando Coleta FGV (Filtro: Vigentes) ---');
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

    console.log(`Total de concursos encontrados na página: ${concursos.length}`);

    for (const concurso of concursos) {
      console.log(`\n[${new Date().toLocaleTimeString()}] Analisando: ${concurso.nome}`);
      
      try {
        await page.goto(concurso.link, { waitUntil: 'networkidle', timeout: 30000 });
        const concContent = await page.content();
        const $c = cheerio.load(concContent);
        
        // 1. Verificar se é "Vigente" (possui link de inscrição ou não tem keywords de encerramento no topo)
        const hasRegistrationLink = $c('a').filter((i, el) => {
          const text = $c(el).text().toLowerCase();
          return text.includes('inscrição') || text.includes('inscreva-se');
        }).length > 0;

        // Verificar os primeiros 5 links/títulos para keywords de encerramento
        let isFinished = false;
        $c('a, .views-field-title').slice(0, 10).each((i, el) => {
          const text = $c(el).text().toLowerCase();
          if (EXCLUDE_KEYWORDS.some(k => text.includes(k))) {
            isFinished = true;
            return false; // break
          }
        });

        if (isFinished && !hasRegistrationLink) {
          console.log(`  > STATUS: Ignorado (Concurso encerrado ou apenas resultados)`);
          continue;
        }

        if (!hasRegistrationLink && !isFinished) {
          // Pode ser um concurso novo que ainda não abriu ou que não tem link fácil
          // Vamos checar se tem o edital de abertura pelo menos
        }

        // 2. Procurar Edital de Abertura
        const editalLinkEl = $c('a').filter((i, el) => {
          const text = $c(el).text().toLowerCase();
          return text.includes('edital') && (text.includes('abertura') || text.includes('retificado'));
        }).first();

        if (editalLinkEl.length > 0) {
          let href = editalLinkEl.attr('href') || '';
          const editalUrl = href.startsWith('http') ? href : 'https://conhecimento.fgv.br' + (href.startsWith('/') ? '' : '/') + href;
          
          const existing = await prisma.edital.findFirst({
            where: { url_edital: editalUrl }
          });

          if (!existing) {
            const edital = await prisma.edital.create({
              data: {
                organizadora_id: fgv.id,
                nome_edital: concurso.nome,
                url_edital: editalUrl,
                status_processamento: 'pendente'
              }
            });
            
            console.log(`  > NOVO EDITAL VIGENTE: ${edital.nome_edital}`);
            await uploadEditalToAzure(editalUrl, fgv.nome, edital.id);
          } else {
            console.log('  > Edital já cadastrado.');
          }
        } else {
          console.log('  > Nenhum link de edital de abertura encontrado.');
        }
      } catch (err) {
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
    console.log(`  > Baixando PDF: ${url}`);
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const buffer = Buffer.from(response.data);
    const year = new Date().getFullYear().toString();
    const blobName = `${org}/${year}/${editalId}.pdf`;

    console.log(`  > Fazendo upload para Azure Storage...`);
    const blobUrl = await azureStorage.uploadBuffer(buffer, blobName);

    await prisma.edital.update({
      where: { id: editalId },
      data: {
        nome_arquivo: blobName,
        data_download: new Date()
      }
    });

    console.log(`  > Upload concluído: ${blobName}`);
    return blobUrl;
  } catch (error) {
    console.error(`  > Erro no download/upload do edital ${url}:`, error.message);
  }
}
