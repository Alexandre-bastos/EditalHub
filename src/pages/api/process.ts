import type { APIRoute } from 'astro';
import prisma from '../../lib/prisma';
import { processEdital } from '../../services/processor';

export const POST: APIRoute = async ({ request }) => {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      // Ignora se não houver body (processamento em lote)
    }

    const { editalId } = body;

    if (editalId) {
      // Processamento individual
      await processEdital(editalId);
      return new Response(JSON.stringify({ message: 'Edital processado com sucesso!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Processamento em lote
    const editais = await prisma.edital.findMany({
      where: { 
        status_processamento: { in: ['pendente', 'erro'] },
        nome_arquivo: { not: null }
      }
    });

    if (editais.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum edital pendente para processar.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const results = [];
    for (const edital of editais) {
      try {
        await processEdital(edital.id);
        results.push({ id: edital.id, success: true });
      } catch (err) {
        results.push({ id: edital.id, success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    
    const successCount = results.filter(r => r.success).length;

    return new Response(JSON.stringify({
      message: `Processamento finalizado: ${successCount} sucesso(s), ${results.length - successCount} erro(s).`,
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
