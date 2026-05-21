import { chromium, type Browser } from 'playwright';
import * as cheerio from 'cheerio';
import axios from 'axios';
import prisma from '../lib/prisma';
import { azureStorage } from './azureStorage';

const EXCLUDE_KEYWORDS = [
  'resultado',
  'homologação',
  'classificação',
  'convocação',
  'posse',
  'encerramento',
  'gabarito',
  'cronograma',
  'aviso',
  'comunicado',
  'errata',
  'recurso',
  'resposta',
  'isenção',
  'isento',
  'prorrogação',
  'local de prova',
  'locais de prova',
  'relação nominal',
  'relação de candidatos',
  'lista de candidatos',
  'nota ',
  'prova de títulos',
  'prova prática',
  'prova oral',
  'aptidão física',
  'taf',
  'exame médico',
  'psicotécnico',
  'divulgação',
  'julgamento',
  'aditamento',
  'aditivo',
  'retificação',
  'anulação',
  'cancelamento',
  'suspensão',
  'suspenso',
  'indeferido',
  'deferido',
  'classificados',
  'aprovados',
  'convocados'
];

export async function scrapeAll(organizadoraId?: string) {
  console.log(organizadoraId ? `--- Iniciando Coleta para Banca ID: ${organizadoraId} ---` : '--- Iniciando Coleta Multi-Banca Completa ---');
  
  const whereClause: any = { ativo: true };
  if (organizadoraId) {
    whereClause.id = organizadoraId;
  }
  
  const organizadoras = await prisma.organizadora.findMany({ where: whereClause });
  
  let browser: Browser | null = null;
  
  const getBrowser = async (): Promise<Browser> => {
    if (!browser) {
      console.log('Inicializando navegador Chromium (Playwright)...');
      browser = await chromium.launch({ headless: true });
    }
    return browser;
  };
  
  try {
    for (const org of organizadoras) {
      const nome = org.nome.toLowerCase();
      try {
        if (nome.includes('fgv')) {
          await internalScrapeFgv(org);
        } else if (nome.includes('vunesp')) {
          const b = await getBrowser();
          await internalScrapeVunesp(b, org);
        } else if (nome.includes('cebraspe')) {
          await internalScrapeCebraspe(org);
        } else if (nome.includes('chagas') || nome.includes('fcc')) {
          await internalScrapeFCC(org);
        } else if (nome.includes('cesgranrio')) {
          const b = await getBrowser();
          await internalScrapeCesgranrio(b, org);
        } else {
          console.log(`Banca ${org.nome} ainda não possui scraper específico. Pulando...`);
        }
      } catch (err: any) {
        console.error(`Erro ao processar banca ${org.nome}:`, err.message);
        if (organizadoraId) {
          throw new Error(`Falha ao sincronizar a banca "${org.nome}": ${err.message}`);
        }
      }
    }
  } finally {
    if (browser) {
      console.log('Fechando navegador Chromium...');
      await browser.close();
    }
    console.log('\n--- Coleta Multi-Banca Finalizada ---');
  }
}

async function internalScrapeFgv(org: any) {
  console.log(`\n> Coletando FGV (via HTTP): ${org.site_url}`);
  const res = await axios.get(org.site_url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 30000
  });
  const $ = cheerio.load(res.data);
  
  const items: any[] = [];
  $('.views-row').each((i, el) => {
    const nome = $(el).find('.views-field-title a').text().trim();
    const hrefAttr = $(el).find('.views-field-title a').attr('href');
    const link = hrefAttr ? 'https://conhecimento.fgv.br' + hrefAttr : '';
    if (nome && link) items.push({ nome, link });
  });

  for (const item of items) {
    await processGenericContest({ isAxios: true }, org, item.nome, item.link, async ($c) => {
      const editalLinkEl = $c('a').filter((i, el) => {
        const text = $c(el).text().toLowerCase();
        const matchesEdital = text.includes('edital');
        const hasAberturaOuRetificado = text.includes('abertura') || text.includes('retificado') || text.trim() === 'edital';
        return matchesEdital && hasAberturaOuRetificado && !EXCLUDE_KEYWORDS.some(k => text.includes(k) && k !== 'retificado');
      }).first();
      return editalLinkEl.length > 0 ? resolveUrl(editalLinkEl.attr('href'), 'https://conhecimento.fgv.br') : null;
    });
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
      await processGenericContest({ page }, org, item.nome, item.link, async ($c, p) => {
        await p.click('a:has-text("Editais e Documentos")', { timeout: 3000 }).catch(() => {});
        await p.waitForTimeout(1000);
        const $u = cheerio.load(await p.content());
        const link = $u('a[href$=".pdf"]').filter((i, el) => {
          const t = $u(el).text().toLowerCase();
          return t.includes('edital de abertura') && !EXCLUDE_KEYWORDS.some(k => t.includes(k));
        }).first();
        return link.length > 0 ? resolveUrl(link.attr('href'), 'https://www.vunesp.com.br') : null;
      });
    }
  } finally {
    await page.close();
  }
}

async function internalScrapeCebraspe(org: any) {
  console.log(`\n> Coletando Cebraspe (via HTTP): ${org.site_url}`);
  const res = await axios.get(org.site_url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 30000
  });
  const $ = cheerio.load(res.data);
  const items: any[] = [];
  
  $('a[href*="/concursos/"]').each((i, el) => {
    const nome = $(el).text().trim();
    const href = $(el).attr('href');
    if (nome && href && nome.length > 10) items.push({ nome, link: resolveUrl(href, 'https://www.cebraspe.org.br') });
  });

  for (const item of items) {
    await processGenericContest({ isAxios: true }, org, item.nome, item.link, async ($c) => {
      const link = $c('a').filter((i, el) => {
        const t = $c(el).text().toLowerCase();
        return ((t.includes('edital') && t.includes('abertura')) || t.includes('edital nº 1')) && !EXCLUDE_KEYWORDS.some(k => t.includes(k));
      }).first();
      return link.length > 0 ? resolveUrl(link.attr('href'), 'https://www.cebraspe.org.br') : null;
    });
  }
}

async function internalScrapeFCC(org: any) {
  console.log(`\n> Coletando FCC (via HTTP): ${org.site_url}`);
  const res = await axios.get(org.site_url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 30000
  });
  const $ = cheerio.load(res.data);
  const items: any[] = [];
  
  $('a[href*="concursos/"]').each((i, el) => {
    const nome = $(el).text().trim();
    const href = $(el).attr('href');
    if (nome && href) items.push({ nome, link: resolveUrl(href, 'https://www.concursosfcc.com.br') });
  });

  for (const item of items) {
    await processGenericContest({ isAxios: true }, org, item.nome, item.link, async ($c) => {
      const linkEl = $c('a').filter((i, el) => {
        const t = $c(el).text().toLowerCase();
        const h = $c(el).attr('href') || '';
        return (t.includes('edital') || t.includes('abertura')) && (h.includes('.pdf') || h.includes('rybena')) && !EXCLUDE_KEYWORDS.some(k => t.includes(k));
      }).first();

      if (linkEl.length > 0) {
        let href = linkEl.attr('href') || '';
        if (href.includes('rybena') && href.includes('file=')) {
          href = href.split('file=')[1];
          if (href.includes('&')) href = href.split('&')[0];
        }
        return resolveUrl(href, 'https://www.concursosfcc.com.br');
      }
      return null;
    });
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
      await processGenericContest({ page }, org, item.nome, item.link, async ($c, p) => {
        const portalLink = $c('a[href*="portal"]').first().attr('href');
        if (portalLink) {
          await p.goto(portalLink, { waitUntil: 'networkidle' });
          await p.waitForSelector('.list-group-item', { timeout: 10000 }).catch(() => {});
          const $p = cheerio.load(await p.content());
          const link = $p('a[href$=".pdf"]').filter((i, el) => {
            const t = $p(el).text().toLowerCase();
            return t.includes('edital') && !EXCLUDE_KEYWORDS.some(k => t.includes(k));
          }).first();
          return link.length > 0 ? resolveUrl(link.attr('href'), 'https://concursos.cesgranrio.org.br') : null;
        }
        return null;
      });
    }
  } finally {
    await page.close();
  }
}

async function processGenericContest(
  client: { page?: any; isAxios?: boolean },
  org: any,
  nome: string,
  link: string,
  findEditalUrl: ($c: any, p?: any) => Promise<string | null>
) {
  console.log(`  [${new Date().toLocaleTimeString()}] Analisando: ${nome.substring(0, 60)}...`);
  
  const alreadyHas = await prisma.edital.findFirst({ where: { nome_edital: nome } });
  if (alreadyHas) {
    console.log(`    > Já cadastrado.`);
    return;
  }

  // Otimização: verifica se o edital já foi processado e rejeitado por não atender aos requisitos
  const alreadyDiscarded = await prisma.editalDescartado.findFirst({
    where: {
      OR: [
        { nome_edital: nome },
        { url_edital: link }
      ]
    }
  });
  if (alreadyDiscarded) {
    console.log(`    > Pulando (já processado e descartado anteriormente: ${alreadyDiscarded.motivo_descarte}).`);
    return;
  }

  try {
    let html: string;
    if (client.page) {
      await client.page.goto(link, { waitUntil: 'networkidle', timeout: 30000 });
      html = await client.page.content();
    } else {
      const res = await axios.get(link, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 30000
      });
      html = res.data;
    }
    const $c = cheerio.load(html);
    
    const nomeLower = nome.toLowerCase();
    let isValid = !EXCLUDE_KEYWORDS.some(k => nomeLower.includes(k));
    
    const editalUrl = await findEditalUrl($c, client.page);

    if (!editalUrl) {
      isValid = false;
    } else {
      const editalUrlLower = editalUrl.toLowerCase();
      if (EXCLUDE_KEYWORDS.some(k => editalUrlLower.includes(k))) {
        isValid = false;
      }
    }

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
    if (!buffer.toString('utf-8', 0, 4).includes('%PDF')) {
      console.error(`    > ALERTA: O arquivo baixado de ${url} não parece ser um PDF válido.`);
      return;
    }

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
  const fgv = await prisma.organizadora.findFirst({ where: { nome: { contains: 'FGV' } } });
  if (fgv) await internalScrapeFgv(fgv);
};
