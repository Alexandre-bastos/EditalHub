import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

async function checkFgv() {
  console.log('Iniciando Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const targetUrl = 'https://conhecimento.fgv.br/concursos';
    console.log(`Navegando para: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Aguarda um pequeno tempo adicional para garantir renderizações dinâmicas
    await page.waitForTimeout(5000);
    
    const content = await page.content();
    const $ = cheerio.load(content);
    
    console.log(`Tamanho do HTML: ${content.length} caracteres`);
    
    // 1. Procurar por classes comuns do Drupal (que a FGV usa)
    console.log('--- Analisando seletores ---');
    console.log(`Total de .views-row: ${$('.views-row').length}`);
    console.log(`Total de .views-field-title: ${$('.views-field-title').length}`);
    console.log(`Total de links (a): ${$('a').length}`);
    
    // 2. Imprime os primeiros 5 blocos com .views-row ou estruturas similares
    console.log('\n--- Primeiros 10 elementos .views-row ---');
    $('.views-row').slice(0, 10).each((i, el) => {
      console.log(`Elemento ${i}:`);
      console.log(`- HTML resumido: ${$(el).html()?.substring(0, 200)}...`);
      console.log(`- Texto interno: ${$(el).text().trim().substring(0, 100)}`);
      const linkEl = $(el).find('a');
      console.log(`- Links encontrados (${linkEl.length}):`);
      linkEl.each((j, lEl) => {
        console.log(`   Link ${j}: href="${$(lEl).attr('href')}" text="${$(lEl).text().trim()}"`);
      });
    });

    // 3. Procurar links para concursos especificamente
    console.log('\n--- Amostra de links contendo /concursos/ ou similares ---');
    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (href.includes('/concursos/') || href.includes('concursos') || text.toLowerCase().includes('concurso')) {
        console.log(`- Link: href="${href}" | Texto: "${text}"`);
      }
    });

  } catch (err: any) {
    console.error('Erro na verificação:', err);
  } finally {
    await browser.close();
    console.log('Chromium fechado.');
  }
}

checkFgv();
