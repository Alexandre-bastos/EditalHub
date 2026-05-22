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
          const b = await getBrowser();
          await internalScrapeCebraspe(b, org);
        } else if (nome.includes('chagas') || nome.includes('fcc')) {
          await internalScrapeFCC(org);
        } else if (nome.includes('cesgranrio')) {
          const b = await getBrowser();
          await internalScrapeCesgranrio(b, org);
        } else if (nome.includes('aocp')) {
          const b = await getBrowser();
          await internalScrapeAocp(b, org);
        } else {
          console.log(`\nBanca "${org.nome}" não possui scraper dedicado. Acionando coletor genérico...`);
          const b = await getBrowser();
          await internalScrapeGeneric(b, org);
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
  const url = 'https://www.vunesp.com.br/busca/concurso/inscricoes%20abertas';
  console.log(`\n> Coletando Vunesp (via Playwright): ${url}`);
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'pt-BR'
  });
  
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => {
      console.log(`  [Vunesp] Aviso de acesso lento/bloqueio: ${e.message}`);
    });
    
    // Aguarda o seletor box-concurso carregar se o site respondeu
    await page.waitForSelector('section.box-concurso', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    const content = await page.content();
    const $ = cheerio.load(content);
    const items: any[] = [];
    
    $('section.box-concurso').each((i, el) => {
      const nome = $(el).find('h4').text().trim();
      const href = $(el).find('a').first().attr('href');
      if (nome && href) {
        items.push({ nome, link: resolveUrl(href, 'https://www.vunesp.com.br') });
      }
    });

    console.log(`  Identificados ${items.length} editais ativos na busca da Vunesp.`);

    for (const item of items) {
      await processGenericContest({ page }, org, item.nome, item.link, async ($c, p) => {
        await p.click('a:has-text("Editais e Documentos")', { timeout: 4000 }).catch(() => {});
        await p.waitForTimeout(1500);
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
    await context.close();
  }
}

async function internalScrapeCebraspe(browser: Browser, org: any) {
  const targetUrl = 'https://www.cebraspe.org.br/concursos/';
  console.log(`\n> Coletando Cebraspe (via Playwright): ${targetUrl}`);
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  
  const page = await context.newPage();
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(4000);
    
    const content = await page.content();
    const $ = cheerio.load(content);
    const items: any[] = [];
    
    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      
      if (href.includes('/concursos/') && 
          !href.endsWith('/concursos/') && 
          !href.includes('/inscricoes-abertas/') && 
          !href.includes('/em-andamento/') && 
          !href.includes('/novos') && 
          !href.includes('/encerrado') &&
          text.length > 5) {
        
        let nome = $(el).parent().find('h3.q_circle_title').text().trim();
        if (!nome) {
          nome = $(el).parent().parent().find('h3.q_circle_title').text().trim();
        }
        if (!nome) {
          nome = text;
        }

        if (nome.toLowerCase() === 'mais informações' || nome.toLowerCase() === 'mais informações...') {
          return;
        }

        items.push({ nome, link: resolveUrl(href, 'https://www.cebraspe.org.br') });
      }
    });

    console.log(`  Identificados ${items.length} links de editais no portal Cebraspe.`);

    for (const item of items) {
      await processGenericContest({ page }, org, item.nome, item.link, async ($c) => {
        const link = $c('a').filter((i, el) => {
          const t = $c(el).text().toLowerCase();
          return ((t.includes('edital') && t.includes('abertura')) || t.includes('edital nº 1')) && !EXCLUDE_KEYWORDS.some(k => t.includes(k));
        }).first();
        return link.length > 0 ? resolveUrl(link.attr('href'), 'https://www.cebraspe.org.br') : null;
      });
    }
  } finally {
    await page.close();
    await context.close();
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
  console.log(`\n> Coletando Cesgranrio (via Playwright): ${org.site_url}`);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  try {
    await page.goto(org.site_url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(3000);
    
    const $ = cheerio.load(await page.content());
    const items: any[] = [];
    
    $('.isotope-item a[href*="/concurso/"]').each((i, el) => {
      const nome = $(el).text().trim();
      const href = $(el).attr('href');
      if (nome && href) items.push({ nome, link: resolveUrl(href, 'https://www.cesgranrio.org.br') });
    });

    console.log(`  Encontrados ${items.length} concursos Cesgranrio ativos.`);

    for (const item of items) {
      await processGenericContest({ page }, org, item.nome, item.link, async ($c, p) => {
        // 1. Tenta buscar pelo link do portal
        const portalLink = $c('a[href*="portal"]').first().attr('href');
        if (portalLink) {
          try {
            await p.goto(portalLink, { waitUntil: 'networkidle', timeout: 20000 });
            await p.waitForSelector('.list-group-item', { timeout: 8000 }).catch(() => {});
            const $p = cheerio.load(await p.content());
            const link = $p('a[href$=".pdf"]').filter((i, el) => {
              const t = $p(el).text().toLowerCase();
              return t.includes('edital') && !EXCLUDE_KEYWORDS.some(k => t.includes(k));
            }).first();
            if (link.length > 0) return resolveUrl(link.attr('href'), 'https://concursos.cesgranrio.org.br');
          } catch (err: any) {
            console.log(`    [Cesgranrio] Falha ao ler portal: ${err.message}`);
          }
        }
        
        // 2. Fallback: Procura por link direto de edital em PDF na própria página
        const directPdf = $c('a[href$=".pdf"]').filter((i, el) => {
          const t = $c(el).text().toLowerCase();
          return (t.includes('edital') || t.includes('abertura')) && !EXCLUDE_KEYWORDS.some(k => t.includes(k));
        }).first();
        if (directPdf.length > 0) {
          return resolveUrl(directPdf.attr('href'), 'https://www.cesgranrio.org.br');
        }
        return null;
      });
    }
  } finally {
    await page.close();
    await context.close();
  }
}

async function internalScrapeAocp(browser: Browser, org: any) {
  const targetUrl = 'https://www.institutoaocp.org.br';
  console.log(`\n> Coletando Instituto AOCP (via Playwright): ${targetUrl}`);
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => {
      console.log(`  [AOCP] Aviso de carregamento lento/bloqueio: ${e.message}`);
    });
    await page.waitForTimeout(3000);
    
    const $ = cheerio.load(await page.content());
    const items: any[] = [];
    
    $('a').each((i, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href') || '';
      
      if ((href.includes('concurso.jsp') || href.includes('concurso/')) && text.length > 10) {
        items.push({ nome: text, link: resolveUrl(href, 'https://www.institutoaocp.org.br') });
      }
    });

    console.log(`  Identificados ${items.length} editais sob o portal Instituto AOCP.`);

    for (const item of items) {
      await processGenericContest({ page }, org, item.nome, item.link, async ($c) => {
        const link = $c('a').filter((i, el) => {
          const t = $c(el).text().toLowerCase();
          const h = $c(el).attr('href') || '';
          return (t.includes('edital de abertura') || (t.includes('edital') && t.includes('abertura')) || h.includes('Edital_Abertura')) && !EXCLUDE_KEYWORDS.some(k => t.includes(k));
        }).first();
        return link.length > 0 ? resolveUrl(link.attr('href'), 'https://www.institutoaocp.org.br') : null;
      });
    }
  } finally {
    await page.close();
    await context.close();
  }
}

async function internalScrapeGeneric(browser: Browser, org: any) {
  console.log(`\n> Iniciando Coletor Genérico Inteligente para: ${org.nome} (${org.site_url})`);
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    await page.goto(org.site_url, { waitUntil: 'networkidle', timeout: 35000 }).catch(e => {
      console.log(`  [Genérico] Aviso ao acessar site: ${e.message}`);
    });
    await page.waitForTimeout(3000);
    
    const $ = cheerio.load(await page.content());
    const links: any[] = [];
    
    $('a').each((i, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href') || '';
      if (href && (href.startsWith('http') || href.startsWith('/')) && text.length > 5) {
        links.push({ text, href: resolveUrl(href, org.site_url) });
      }
    });
    
    const relevantLinks = links.filter(l => {
      const t = l.text.toLowerCase();
      const h = l.href.toLowerCase();
      return t.includes('concurso') || t.includes('edital') || t.includes('aberto') || t.includes('inscric') || t.includes('oportunidade') || h.includes('concurso') || h.includes('edital');
    });
    
    const uniqueLinks = Array.from(new Map(relevantLinks.map(item => [item.href, item])).values());
    console.log(`  [Genérico] Identificados ${uniqueLinks.length} links relevantes de navegação.`);
    
    const targets = uniqueLinks.slice(0, 5);
    for (const target of targets) {
      await processGenericContest({ page }, org, target.text, target.href, async ($c) => {
        const pdfLink = $c('a[href$=".pdf"]').filter((i, el) => {
          const t = $c(el).text().toLowerCase();
          const h = $c(el).attr('href') || '';
          return (t.includes('edital') || t.includes('abertura') || h.includes('edital') || h.includes('abertura')) && !EXCLUDE_KEYWORDS.some(k => t.includes(k));
        }).first();
        return pdfLink.length > 0 ? resolveUrl(pdfLink.attr('href'), target.href) : null;
      });
    }
  } finally {
    await page.close();
    await context.close();
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
      console.log(`    > NOVO EDITAL DETECTADO: ${edital.nome_edital}`);
      await uploadEditalToAzure(editalUrl, org.nome, edital.id);
    } else {
      console.log(`    > Ignorado (não atende a edital de abertura ou PDF ausente).`);
    }
  } catch (err: any) {
    console.error(`    > Erro ao analisar detalhes do concurso: ${err.message}`);
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
    console.error(`    > Erro no upload para o Azure: ${e.message}`);
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
