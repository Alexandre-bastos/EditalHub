import { chromium, type Browser } from 'playwright';
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

export async function scrapeAll() {
  console.log('--- Iniciando Coleta Multi-Banca Completa ---');
  const organizadoras = await prisma.organizadora.findMany({ where: { ativo: true } });
  
  const browser = await chromium.launch({ headless: true });
  
  try {
    for (const org of organizadoras) {
      const nome = org.nome.toLowerCase();
      try {
        if (nome.includes('fgv')) {
          await internalScrapeFgv(browser, org);
        } else if (nome.includes('vunesp')) {
          await internalScrapeVunesp(browser, org);
        } else if (nome.includes('cebraspe')) {
          await internalScrapeCebraspe(browser, org);
        } else if (nome.includes('chagas') || nome.includes('fcc')) {
          await internalScrapeFCC(browser, org);
        } else if (nome.includes('cesgranrio')) {
          await internalScrapeCesgranrio(browser, org);
        } else {
          console.log(`Banca ${org.nome} ainda não possui scraper específico. Pulando...`);
        }
      } catch (err: any) {
        console.error(`Erro ao processar banca ${org.nome}:`, err.message);
      }
    }
  } finally {
    await browser.close();
    console.log('\n--- Coleta Multi-Banca Finalizada ---');
  }
}

async function internalScrapeFgv(browser: Browser, org: any) {
  console.log(`\n> Coletando FGV: ${org.site_url}`);
  const page = await browser.newPage();
  try {
    await page.goto(org.site_url, { waitUntil: 'networkidle', timeout: 60000 });
    const content = await page.content();
    const $ = cheerio.load(content);
    
    const items: any[] = [];
    $('.views-row').each((i, el) => {
      const nome = $(el).find('.views-field-title a').text().trim();
      const link = 'https://conhecimento.fgv.br' + $(el).find('.views-field-title a').attr('href');
      if (nome && link) items.push({ nome, link });
    });

    for (const item of items) {
      await processGenericContest(page, org, item.nome, item.link, async ($c) => {
        const editalLinkEl = $c('a').filter((i, el) => {
          const text = $c(el).text().toLowerCase();
          return text.includes('edital') && (text.includes('abertura') || text.includes('retificado')) && !EXCLUDE_KEYWORDS.some(k => text.includes(k) && k !== 'retificado');
        }).first();
        return editalLinkEl.length > 0 ? resolveUrl(editalLinkEl.attr('href'), 'https://conhecimento.fgv.br') : null;
      });
    }
  } finally {
    await page.close();
  }
}

async function internalScrapeVunesp(browser: Browser, org: any) {
  console.log(`\n> Coletando Vunesp: ${org.site_url}`);
  const page = await browser.newPage();
  try {
    await page.goto(org.site_url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('section.concurso-item', { timeout: 10000 }).catch(() => {});
    
    const content = await page.content();
    const $ = cheerio.load(content);
    const items: any[] = [];
    
    $('section.concurso-item').each((i, el) => {
      const nome = $(el).find('h3').text().trim();
      const href = $(el).find('a[title^="Saiba mais"]').attr('href');
      if (nome && href) items.push({ nome, link: resolveUrl(href, 'https://www.vunesp.com.br') });
    });

    for (const item of items) {
      await processGenericContest(page, org, item.nome, item.link, async ($c, p) => {
        await p.click('a:has-text("Editais e Documentos")', { timeout: 3000 }).catch(() => {});
        await p.waitForTimeout(1000);
        const $u = cheerio.load(await p.content());
        const link = $u('a[href$=".pdf"]').filter((i, el) => {
          const t = $u(el).text().toLowerCase();
          return t.includes('edital de abertura');
        }).first();
        return link.length > 0 ? resolveUrl(link.attr('href'), 'https://www.vunesp.com.br') : null;
      });
    }
  } finally {
    await page.close();
  }
}

async function internalScrapeCebraspe(browser: Browser, org: any) {
  console.log(`\n> Coletando Cebraspe: ${org.site_url}`);
  const page = await browser.newPage();
  try {
    await page.goto(org.site_url, { waitUntil: 'networkidle', timeout: 60000 });
    const $ = cheerio.load(await page.content());
    const items: any[] = [];
    
    // Cebraspe costuma listar concursos em tabelas ou listas simples
    $('a[href*="/concursos/"]').each((i, el) => {
      const nome = $(el).text().trim();
      const href = $(el).attr('href');
      if (nome && href && nome.length > 10) items.push({ nome, link: resolveUrl(href, 'https://www.cebraspe.org.br') });
    });

    for (const item of items) {
      await processGenericContest(page, org, item.nome, item.link, async ($c) => {
        const link = $c('a').filter((i, el) => {
          const t = $c(el).text().toLowerCase();
          return (t.includes('edital') && t.includes('abertura')) || t.includes('edital nº 1');
        }).first();
        return link.length > 0 ? resolveUrl(link.attr('href'), 'https://www.cebraspe.org.br') : null;
      });
    }
  } finally {
    await page.close();
  }
}

async function internalScrapeFCC(browser: Browser, org: any) {
  console.log(`\n> Coletando FCC: ${org.site_url}`);
  const page = await browser.newPage();
  try {
    await page.goto(org.site_url, { waitUntil: 'networkidle', timeout: 60000 });
    const $ = cheerio.load(await page.content());
    const items: any[] = [];
    
    $('a[href*="concursos/"]').each((i, el) => {
      const nome = $(el).text().trim();
      const href = $(el).attr('href');
      if (nome && href) items.push({ nome, link: resolveUrl(href, 'https://www.concursosfcc.com.br') });
    });

    for (const item of items) {
      await processGenericContest(page, org, item.nome, item.link, async ($c) => {
        const link = $c('a[href$=".pdf"]').filter((i, el) => {
          const t = $c(el).text().toLowerCase();
          return t.includes('edital') || t.includes('abertura');
        }).first();
        return link.length > 0 ? resolveUrl(link.attr('href'), 'https://www.concursosfcc.com.br') : null;
      });
    }
  } finally {
    await page.close();
  }
}

async function internalScrapeCesgranrio(browser: Browser, org: any) {
  console.log(`\n> Coletando Cesgranrio: ${org.site_url}`);
  const page = await browser.newPage();
  try {
    await page.goto(org.site_url, { waitUntil: 'networkidle', timeout: 60000 });
    const $ = cheerio.load(await page.content());
    const items: any[] = [];
    
    $('.isotope-item a[href*="/concurso/"]').each((i, el) => {
      const nome = $(el).text().trim();
      const href = $(el).attr('href');
      if (nome && href) items.push({ nome, link: resolveUrl(href, 'https://www.cesgranrio.org.br') });
    });

    for (const item of items) {
      await processGenericContest(page, org, item.nome, item.link, async ($c, p) => {
        const portalLink = $c('a[href*="portal"]').first().attr('href');
        if (portalLink) {
          await p.goto(portalLink, { waitUntil: 'networkidle' });
          // Espera carregar o portal Angular
          await p.waitForSelector('.list-group-item', { timeout: 10000 }).catch(() => {});
          const $p = cheerio.load(await p.content());
          const editalItem = $p('.list-group-item:contains("EDITAL")').first();
          // Se for Angular, talvez precise clicar no menu
          // Mas vamos tentar pegar o link direto se estiver visível
          const link = $p('a[href$=".pdf"]').filter((i, el) => $p(el).text().toLowerCase().includes('edital')).first();
          return link.length > 0 ? resolveUrl(link.attr('href'), 'https://concursos.cesgranrio.org.br') : null;
        }
        return null;
      });
    }
  } finally {
    await page.close();
  }
}

async function processGenericContest(page: any, org: any, nome: string, link: string, findEditalUrl: ($c: any, p: any) => Promise<string | null>) {
  console.log(`  [${new Date().toLocaleTimeString()}] Analisando: ${nome.substring(0, 60)}...`);
  
  const alreadyHas = await prisma.edital.findFirst({ where: { nome_edital: nome } });
  if (alreadyHas) {
    console.log(`    > Já cadastrado.`);
    return;
  }

  try {
    await page.goto(link, { waitUntil: 'networkidle', timeout: 30000 });
    const html = await page.content();
    const $c = cheerio.load(html);
    
    const nomeLower = nome.toLowerCase();
    let isValid = !EXCLUDE_KEYWORDS.some(k => nomeLower.includes(k));
    
    const editalUrl = await findEditalUrl($c, page);

    if (!editalUrl) isValid = false;

    const edital = await prisma.edital.create({
      data: {
        organizadora_id: org.id,
        nome_edital: nome,
        url_edital: editalUrl || link,
        status_processamento: isValid ? 'pendente' : 'ignorado',
        is_valido: isValid
      }
    });

    if (isValid && editalUrl) {
      console.log(`    > NOVO EDITAL: ${edital.nome_edital}`);
      await uploadEditalToAzure(editalUrl, org.nome, edital.id);
    } else {
      console.log(`    > Ignorado.`);
    }
  } catch (err: any) {
    console.error(`    > Erro: ${err.message}`);
  }
}

async function uploadEditalToAzure(url: string, org: string, editalId: string) {
  try {
    const response = await axios({ url, method: 'GET', responseType: 'arraybuffer', timeout: 30000 });
    const buffer = Buffer.from(response.data);
    const blobName = `${org.replace(/\s+/g, '_')}/${new Date().getFullYear()}/${editalId}.pdf`;
    await azureStorage.uploadBuffer(buffer, blobName);
    await prisma.edital.update({
      where: { id: editalId },
      data: { nome_arquivo: blobName, data_download: new Date() }
    });
  } catch (e: any) {
    console.error(`    > Erro upload: ${e.message}`);
  }
}

function resolveUrl(href: string | undefined, base: string): string {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  return base + (href.startsWith('/') ? '' : '/') + href;
}

export const scrapeFgv = async () => {
  const browser = await chromium.launch();
  const fgv = await prisma.organizadora.findFirst({ where: { nome: { contains: 'FGV' } } });
  if (fgv) await internalScrapeFgv(browser, fgv);
  await browser.close();
};
