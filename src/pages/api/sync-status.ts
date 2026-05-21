import type { APIRoute } from 'astro';
import prisma from '../../lib/prisma';

export const GET: APIRoute = async () => {
  try {
    // 1. Conta quantos editais válidos estão pendentes de processamento de IA
    const pendingCount = await prisma.edital.count({
      where: {
        is_valido: true,
        status_processamento: 'pendente'
      }
    });

    // 2. Busca o último registro de sincronização iniciada
    const lastSyncLog = await prisma.logAuditoria.findFirst({
      where: {
        acao: 'sincronizacao_iniciada'
      },
      orderBy: {
        data_criacao: 'desc'
      }
    });

    let stage: 'idle' | 'scraping' | 'processing' = 'idle';
    let message = 'Nenhuma sincronização ativa no momento.';
    let active = false;

    if (lastSyncLog) {
      const now = new Date();
      const diffMs = now.getTime() - new Date(lastSyncLog.data_criacao).getTime();
      const diffMinutes = diffMs / (1000 * 60);

      // Considera a sincronização ativa se foi iniciada a menos de 15 minutos
      if (diffMinutes < 15) {
        active = true;
        if (pendingCount > 0) {
          stage = 'processing';
          message = `Processando ${pendingCount} edital(ais) com Inteligência Artificial na Azure...`;
        } else if (diffMinutes < 3) {
          // Se começou a menos de 3 minutos e não há pendentes no banco ainda,
          // assume que o crawler (scraper) está rodando e buscando novos PDFs
          stage = 'scraping';
          message = 'Buscando novos editais nos portais das bancas na Azure...';
        } else {
          // Passou de 3 minutos e não há nenhum edital pendente (ou tudo já foi processado)
          active = false;
          stage = 'idle';
          message = 'Sincronização concluída com sucesso!';
        }
      }
    }

    // Caso o status_processamento ainda acuse pendentes mas não haja log de sync recente,
    // ainda consideramos ativo no processamento de IA
    if (!active && pendingCount > 0) {
      active = true;
      stage = 'processing';
      message = `Processando ${pendingCount} edital(ais) com Inteligência Artificial pendentes...`;
    }

    return new Response(JSON.stringify({
      active,
      stage,
      pendingCount,
      message,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    console.error('Erro na API de status de sync:', error);
    return new Response(JSON.stringify({
      active: false,
      stage: 'idle',
      pendingCount: 0,
      message: 'Erro ao verificar o status da sincronização.',
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
