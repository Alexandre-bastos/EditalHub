import axios from 'axios';
import * as cheerio from 'cheerio';

async function testAxios() {
  try {
    console.log('Fetching FGV index via Axios...');
    const res = await axios.get('https://conhecimento.fgv.br/concursos', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });
    console.log('Status:', res.status);
    const $ = cheerio.load(res.data);
    const items: any[] = [];
    $('.views-row').each((i, el) => {
      const nome = $(el).find('.views-field-title a').text().trim();
      const href = $(el).find('.views-field-title a').attr('href');
      if (nome && href) {
        items.push({ nome, href });
      }
    });
    console.log(`Found ${items.length} contests using Axios!`);
    if (items.length > 0) {
      console.log('First contest:', items[0]);
      
      const testLink = 'https://conhecimento.fgv.br' + items[0].href;
      console.log(`\nFetching first contest page via Axios: ${testLink}`);
      const cRes = await axios.get(testLink, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });
      console.log('Contest page status:', cRes.status);
      const $c = cheerio.load(cRes.data);
      const links: any[] = [];
      $c('a').each((i, el) => {
        const text = $c(el).text().trim();
        const href = $c(el).attr('href') || '';
        if (href.endsWith('.pdf') || text.toLowerCase().includes('edital')) {
          links.push({ text, href });
        }
      });
      console.log(`Found ${links.length} interesting links in the contest page using Axios!`);
      if (links.length > 0) {
        console.log('Sample links:', links.slice(0, 5));
      }
    }
  } catch (err: any) {
    console.error('Error fetching via Axios:', err.message);
  }
}

testAxios();
