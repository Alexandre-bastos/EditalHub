import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

async function testVunesp() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const url = 'https://www.vunesp.com.br/busca/concurso/inscricoes%20abertas';
  
  console.log(`Acessando: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  const content = await page.content();
  const $ = cheerio.load(content);
  
  const boxes = $('section.box-concurso');
  console.log(`Boxes encontrados: ${boxes.length}`);
  
  boxes.each((i, el) => {
    const nome = $(el).find('h4').text().trim();
    console.log(`- ${nome}`);
  });
  
  await browser.close();
}

testVunesp().catch(console.error);
