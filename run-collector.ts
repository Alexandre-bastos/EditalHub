import { scrapeFgv } from './src/services/collector';

async function run() {
  try {
    await scrapeFgv();
    console.log('Execução finalizada com sucesso.');
    process.exit(0);
  } catch (err) {
    console.error('Erro na execução:', err);
    process.exit(1);
  }
}

run();
