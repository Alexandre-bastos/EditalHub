import type { APIRoute } from 'astro';
import { scrapeFgv } from '../../services/collector';

export const POST: APIRoute = async () => {
  try {
    // Iniciamos o processo de forma assíncrona para não travar a requisição
    // Mas no MVP vamos aguardar para dar o feedback imediato
    await scrapeFgv();
    
    return new Response(JSON.stringify({
      message: 'Coleta finalizada com sucesso!'
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
