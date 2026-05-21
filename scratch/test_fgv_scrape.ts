import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

const EXCLUDE_KEYWORDS = [
  'resultado', 'homologação', 'classificação', 'convocação', 'posse',
  'encerramento', 'gabarito', 'cronograma', 'aviso', 'comunicado',
  'errata', 'recurso', 'resposta', 'isenção', 'isento', 'prorrogação',
  'local de prova', 'locais de prova', 'relação nominal', 'relação de candidatos',
  'lista de candidatos', 'nota ', 'prova de títulos', 'prova prática',
  'prova oral', 'aptidão física', 'taf', 'exame médico', 'psicotécnico',
  'divulgação', 'julgamento', 'aditamento', 'aditivo', 'retificação',
  'anulação', 'cancelamento', 'suspensão', 'suspenso', 'indeferido',
  'deferido', 'classificados', 'aprovados', 'convocados'
];

function resolveUrl(href: string | undefined, base: string): string {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  return base + (href.startsWith('/') ? '' : '/') + href;
}

async function testFgvScrape() {
  console.log('Iniciando Chromium para simulação...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    const siteUrl = 'https://conhecimento.fgv.br/concursos';
    console.log(`Navegando para: ${siteUrl}`);
    await page.goto(siteUrl, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Pequena espera adicional
    await page.waitForTimeout(3000);
    
    const content = await page.content();
    const $ = cheerio.load(content);
    
    const items: any[] = [];
    $('.views-row').each((i, el) => {
      const nome = $(el).find('.views-field-title a').text().trim();
      const hrefAttr = $(el).find('.views-field-title a').attr('href');
      const link = hrefAttr ? 'https://conhecimento.fgv.br' + hrefAttr : '';
      if (nome && link) {
        items.push({ nome, link });
      }
    });

    console.log(`\nTotal de concursos encontrados na listagem FGV: ${items.length}`);
    
    if (items.length === 0) {
      console.log('Nenhum concurso encontrado! Seletores da listagem podem estar errados ou a página não carregou.');
      return;
    }

    // Testa os primeiros 5 concursos
    console.log('\n--- Analisando os primeiros 5 concursos ---');
    for (let i = 0; i < Math.min(5, items.length); i++) {
      const item = items[i];
      console.log(`\n[Concurso ${i+1}] Nome: "${item.nome}"`);
      console.log(`             Link: "${item.link}"`);
      
      try {
        console.log(`             Navegando para a página do concurso...`);
        await page.goto(item.link, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        
        const cHtml = await page.content();
        const $c = cheerio.load(cHtml);
        
        console.log(`             Total de links (a) na página: ${$c('a').length}`);
        
        // Vamos listar todos os links da página para analisar o que tem nela
        const linksNaPagina: any[] = [];
        $c('a').each((j, el) => {
          const text = $c(el).text().trim();
          const href = $c(el).attr('href') || '';
          if (text || href) {
            linksNaPagina.push({ text, href });
          }
        });
        
        // Filtra links que parecem ser editais ou PDFs
        const pdfLinks = linksNaPagina.filter(l => l.href.toLowerCase().endsWith('.pdf') || l.text.toLowerCase().includes('edital') || l.href.toLowerCase().includes('edital'));
        console.log(`             Links de editais/PDFs sugeridos na página (${pdfLinks.length}):`);
        pdfLinks.forEach((l, idx) => {
          console.log(`               - [Sugerido ${idx}]: text="${l.text}" | href="${l.href}"`);
        });

        // Executa o filtro de busca de edital que está em collector.ts
        const editalLinkEl = $c('a').filter((idx, el) => {
          const text = $c(el).text().toLowerCase();
          const matchesEdital = text.includes('edital');
          const matchesAberturaOuRetificado = text.includes('abertura') || text.includes('retificado');
          const isExcluded = EXCLUDE_KEYWORDS.some(k => text.includes(k) && k !== 'retificado');
          
          if (matchesEdital && (text.includes('abertura') || text.includes('regulamento') || matchesAberturaOuRetificado)) {
            console.log(`               * Candidato: text="${text}" | matchesEdital=${matchesEdital} | matchesAberturaOuRetificado=${matchesAberturaOuRetificado} | isExcluded=${isExcluded}`);
          }
          
          return matchesEdital && (text.includes('abertura') || text.includes('retificado')) && !isExcluded;
        }).first();

        if (editalLinkEl.length > 0) {
          const resolved = resolveUrl(editalLinkEl.attr('href'), 'https://conhecimento.fgv.br');
          console.log(`             👉 EDITAL ENCONTRADO! text="${editalLinkEl.text().trim()}" | href="${resolved}"`);
        } else {
          console.log(`             ❌ NENHUM edital que passe no filtro de abertura foi encontrado na página!`);
        }

      } catch (err: any) {
        console.log(`             Erro ao analisar concurso: ${err.message}`);
      }
    }

  } catch (err: any) {
    console.error('Erro geral no teste:', err);
  } finally {
    await browser.close();
    console.log('\nChromium fechado.');
  }
}

testFgvScrape();
