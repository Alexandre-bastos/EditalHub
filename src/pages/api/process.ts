import type { APIRoute } from 'astro';
import prisma from '../../lib/prisma';
import { processEdital } from '../../services/processor';

export const POST: APIRoute = async ({ request }) => {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      // Ignora se não houver body
    }

    const { editalId } = body;
    const workerUrl = process.env.AZURE_WORKER_URL;

    // Se a URL do Worker na Azure estiver configurada, delega a tarefa
    if (workerUrl) {
      console.log('Direcionando requisição de processamento para o Azure Function Worker:', workerUrl);
      
      const res = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editalId })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erro na Azure Function (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify({
        message: 'Processamento de editais iniciado com sucesso em segundo plano na Azure!',
        details: data
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fallback: Execução local (desenvolvimento)
    if (editalId) {
      await processEdital(editalId);
      return new Response(JSON.stringify({ message: 'Edital processado com sucesso localmente!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Processamento em lote local
    const editais = await prisma.edital.findMany({
      where: { 
        status_processamento: { in: ['pendente', 'erro'] },
        nome_arquivo: { not: null }
      }
    });

    if (editais.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum edital pendente para processar localmente.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const results = [];
    for (const edital of editais) {
      try {
        await processEdital(edital.id);
        results.push({ id: edital.id, success: true });
        
        // Delay de 5 segundos entre chamadas para evitar rate limit do Gemini
        if (editais.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (err) {
        results.push({ id: edital.id, success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    
    const successCount = results.filter(r => r.success).length;

    return new Response(JSON.stringify({
      message: `Processamento local finalizado: ${successCount} sucesso(s), ${results.length - successCount} erro(s).`,
      results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Erro na API de processamento:', error);
    return new Response(JSON.stringify({
      message: 'Erro ao processar',
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
