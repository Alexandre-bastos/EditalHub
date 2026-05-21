import type { APIRoute } from 'astro';
import { scrapeAll } from '../../services/collector';

export const POST: APIRoute = async () => {
  try {
    const workerUrl = process.env.AZURE_WORKER_URL;

    // Se a URL do Worker na Azure estiver configurada, delega a tarefa
    if (workerUrl) {
      console.log('Direcionando requisição de coleta para o Azure Function Worker:', workerUrl);
      
      const res = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erro na Azure Function (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify({
        message: 'Sincronização das bancas iniciada com sucesso em segundo plano na Azure!',
        details: data
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fallback: Executa localmente (desenvolvimento)
    console.log('Executando coleta localmente (modo de desenvolvimento)...');
    await scrapeAll();
    
    return new Response(JSON.stringify({
      message: 'Coleta multi-banca finalizada com sucesso localmente!'
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
