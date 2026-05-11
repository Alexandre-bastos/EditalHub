import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import axios from 'axios';
import prisma from '../lib/prisma';
import { azureStorage } from './azureStorage';

export async function scrapeFgv() {
  console.log('Iniciando coleta FGV...');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://conhecimento.fgv.br/concursos', { waitUntil: 'networkidle' });
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

    console.log(`Encontrados ${concursos.length} concursos.`);

    for (const concurso of concursos.slice(0, 5)) {
      console.log(`Processando: ${concurso.nome}`);
      
      try {
        await page.goto(concurso.link, { waitUntil: 'networkidle' });
        const concContent = await page.content();
        const $c = cheerio.load(concContent);
        
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
            
            console.log(`Edital encontrado e cadastrado: ${edital.id}`);
            await uploadEditalToAzure(editalUrl, fgv.nome, edital.id);
          } else {
            console.log('Edital já cadastrado.');
          }
        }
      } catch (err) {
        console.error(`Erro ao processar concurso ${concurso.nome}:`, err);
      }
    }

  } catch (error) {
    console.error('Erro na coleta FGV:', error);
  } finally {
    await browser.close();
  }
}

async function uploadEditalToAzure(url: string, org: string, editalId: string) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer'
    });

    const buffer = Buffer.from(response.data);
    const year = new Date().getFullYear().toString();
    const blobName = `${org}/${year}/${editalId}.pdf`;

    console.log(`Fazendo upload para Azure: ${blobName}`);
    const blobUrl = await azureStorage.uploadBuffer(buffer, blobName);

    await prisma.edital.update({
      where: { id: editalId },
      data: {
        nome_arquivo: blobName,
        data_download: new Date()
      }
    });

    console.log(`Upload concluído com sucesso: ${blobUrl}`);
    return blobUrl;
  } catch (error) {
    console.error(`Erro ao subir edital para Azure ${url}:`, error);
  }
}
