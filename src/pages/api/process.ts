import type { APIRoute } from 'astro';
import { processEdital } from '../../services/processor';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { editalId } = await request.json();
    
    if (!editalId) {
      return new Response(JSON.stringify({ message: 'ID do edital é obrigatório' }), { status: 400 });
    }

    const result = await processEdital(editalId);
    
    return new Response(JSON.stringify({
      message: 'Edital processado com sucesso!',
      concurso: result
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Erro na API de processamento:', error);
    return new Response(JSON.stringify({
      message: 'Erro ao processar edital',
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
