import type { APIRoute } from 'astro';
import prisma from '../../lib/prisma';

export const GET: APIRoute = async () => {
  try {
    // 1. Conta quantos editais válidos estão na fila de processamento (pendente ou erro)
    const pendingAndErrorCount = await prisma.edital.count({
      where: {
        is_valido: true,
        status_processamento: { in: ['pendente', 'erro'] }
      }
    });

    // 2. Conta quantos editais estão estritamente pendentes de IA
    const strictlyPendingCount = await prisma.edital.count({
      where: {
        is_valido: true,
        status_processamento: 'pendente'
      }
    });

    // 3. Busca o último registro de sincronização iniciada
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
    let errorDetails: string | null = null;

    if (lastSyncLog) {
      const now = new Date();
      const diffMs = now.getTime() - new Date(lastSyncLog.data_criacao).getTime();
      const diffMinutes = diffMs / (1000 * 60);

      // Busca se há um log de erro após o início deste sync
      const errorLog = await prisma.logAuditoria.findFirst({
        where: {
          acao: 'sincronizacao_erro',
          data_criacao: {
            gte: lastSyncLog.data_criacao
          }
        }
      });

      // Busca se há um log de conclusão após o início deste sync
      const completionLog = await prisma.logAuditoria.findFirst({
        where: {
          acao: 'sincronizacao_concluida',
          data_criacao: {
            gte: lastSyncLog.data_criacao
          }
        }
      });

      if (errorLog) {
        // Se houve erro posterior à data de início, marcamos como inativo e extraímos o erro
        active = false;
        stage = 'idle';
        message = 'A sincronização falhou.';
        errorDetails = errorLog.detalhes;
      } else if (completionLog) {
        // Se já existe log de finalização posterior à data de início, o sync concluiu!
        active = false;
        stage = 'idle';
        message = completionLog.detalhes || 'Sincronização concluída com sucesso!';
      } else if (diffMinutes < 15) {
        // Se ainda não concluiu e está dentro de 15 minutos, consideramos ativo
        active = true;
        if (pendingAndErrorCount > 0) {
          stage = 'processing';
          message = `Processando ${pendingAndErrorCount} edital(ais) com Inteligência Artificial na Azure...`;
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

      // 1. Editais novos coletados neste sync
      const editaisNovos = await prisma.edital.findMany({
        where: {
          data_criacao: {
            gte: lastSyncLog.data_criacao
          }
        }
      });
      const novosIds = editaisNovos.map(e => e.id);

      // 2. Logs de processamento de editais ocorridos durante este sync
      const processingLogs = await prisma.logAuditoria.findMany({
        where: {
          acao: { in: ['processamento_edital_sucesso', 'processamento_edital_erro'] },
          data_criacao: {
            gte: lastSyncLog.data_criacao
          }
        }
      });

      // Filtra logs de editais que já são novos (para não contar duas vezes)
      const logsEditaisAntigos = processingLogs.filter(log => log.entidade_id && !novosIds.includes(log.entidade_id));

      const antigosSucessos = logsEditaisAntigos.filter(l => l.acao === 'processamento_edital_sucesso').length;
      const antigosFalhas = logsEditaisAntigos.filter(l => l.acao === 'processamento_edital_erro').length;

      summary = {
        total: editaisNovos.length + antigosSucessos + antigosFalhas,
        valid: editaisNovos.filter(e => e.is_valido).length,
        ignored: editaisNovos.filter(e => !e.is_valido).length,
        processed: editaisNovos.filter(e => e.is_valido && e.status_processamento === 'processado').length + antigosSucessos,
        failed: editaisNovos.filter(e => e.is_valido && e.status_processamento === 'erro').length + antigosFalhas
      };
    }

    // Caso o status_processamento ainda acuse pendentes mas não haja log de sync recente nem erro,
    // ainda consideramos ativo no processamento de IA apenas se houver editais estritamente 'pendentes'
    if (!active && strictlyPendingCount > 0 && !errorDetails) {
      active = true;
      stage = 'processing';
      message = `Processando ${strictlyPendingCount} edital(ais) com Inteligência Artificial pendentes...`;
    }

    return new Response(JSON.stringify({
      active,
      stage,
      pendingCount: pendingAndErrorCount,
      message,
      summary,
      error: errorDetails,
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
