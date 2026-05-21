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
    let summary: any = null;

    if (lastSyncLog) {
      const now = new Date();
      const diffMs = now.getTime() - new Date(lastSyncLog.data_criacao).getTime();
      const diffMinutes = diffMs / (1000 * 60);

      // Busca se há um log de conclusão após o início deste sync
      const completionLog = await prisma.logAuditoria.findFirst({
        where: {
          acao: 'sincronizacao_concluida',
          data_criacao: {
            gte: lastSyncLog.data_criacao
          }
        }
      });

      if (completionLog) {
        // Se já existe log de finalização posterior à data de início, o sync concluiu!
        active = false;
        stage = 'idle';
        message = 'Sincronização concluída com sucesso!';
      } else if (diffMinutes < 15) {
        // Se ainda não concluiu e está dentro de 15 minutos, consideramos ativo
        active = true;
        if (pendingCount > 0) {
          stage = 'processing';
          message = `Processando ${pendingCount} edital(ais) com Inteligência Artificial na Azure...`;
        } else {
          stage = 'scraping';
          message = 'Buscando novos editais nos portais das bancas na Azure...';
        }
      } else {
        // Excedeu o timeout de segurança de 15 minutos
        active = false;
        stage = 'idle';
        message = 'Sincronização finalizada por tempo limite.';
      }

      // Sempre calcula o resumo detalhado para a última sincronização (ativa ou recém-concluída)
      const editaisSinceSync = await prisma.edital.findMany({
        where: {
          data_criacao: {
            gte: lastSyncLog.data_criacao
          }
        }
      });

      summary = {
        total: editaisSinceSync.length,
        valid: editaisSinceSync.filter(e => e.is_valido).length,
        ignored: editaisSinceSync.filter(e => !e.is_valido).length,
        processed: editaisSinceSync.filter(e => e.is_valido && e.status_processamento === 'processado').length,
        failed: editaisSinceSync.filter(e => e.is_valido && e.status_processamento === 'erro').length
      };
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
      summary,
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
