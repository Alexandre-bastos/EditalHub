import type { APIRoute } from 'astro';
import { scrapeAll } from '../../services/collector';

export const POST: APIRoute = async () => {
  try {
    await scrapeAll();
    
    return new Response(JSON.stringify({
      message: 'Coleta multi-banca finalizada com sucesso!'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Erro na API de coleta:', error);
    return new Response(JSON.stringify({
      message: 'Erro ao processar coleta',
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
