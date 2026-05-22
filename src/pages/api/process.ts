import type { APIRoute } from 'astro';
import prisma from '../../lib/prisma';
import { processEdital } from '../../services/processor';
import { decryptSession } from '../../lib/session';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    let userNome = 'Sistema / Painel';
    let userId = null;

    try {
      const sessionToken = cookies.get('session')?.value;
      if (sessionToken) {
        const session = decryptSession(sessionToken);
        if (session) {
          userId = session.id;
          userNome = session.nome;
        }
      }
    } catch (e) {
      // Ignora erro de sessão
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      // Ignora se não houver body
    }

    const { editalId } = body;
    const workerUrl = process.env.AZURE_WORKER_URL;

    // Registra o início do processamento na trilha de auditoria para o poller da UI iniciar o feedback visual
    await prisma.logAuditoria.create({
      data: {
        usuario_id: userId,
        usuario_nome: userNome,
        acao: 'sincronizacao_iniciada',
        entidade: 'edital',
        detalhes: editalId 
          ? `Processamento manual solicitado para o edital ID ${editalId}.`
          : 'Processamento em lote de todos os editais pendentes/erros iniciado.'
      }
    });

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

    // Fallback: Execução local (desenvolvimento) - Assíncrona no background para evitar timeouts HTTP
    if (editalId) {
      const runSingleBackground = async () => {
        try {
          await processEdital(editalId);
          
          // Registra sucesso individual na auditoria
          await prisma.logAuditoria.create({
            data: {
              usuario_id: userId,
              usuario_nome: userNome,
              acao: 'processamento_edital_sucesso',
              entidade: 'edital',
              entidade_id: editalId,
              detalhes: `Processamento local do edital ID ${editalId} concluído com sucesso.`
            }
          });

          await prisma.logAuditoria.create({
            data: {
              usuario_id: userId,
              usuario_nome: userNome,
              acao: 'sincronizacao_concluida',
              entidade: 'edital',
              detalhes: `Processamento local do edital ID ${editalId} concluído.`
            }
          });
        } catch (err: any) {
          console.error(`Erro no processamento local do edital ${editalId}:`, err);
          
          // Registra erro individual na auditoria
          await prisma.logAuditoria.create({
            data: {
              usuario_id: userId,
              usuario_nome: userNome,
              acao: 'processamento_edital_erro',
              entidade: 'edital',
              entidade_id: editalId,
              detalhes: `Erro no processamento local do edital ID ${editalId}: ${err.message}`
            }
          });

          await prisma.logAuditoria.create({
            data: {
              usuario_id: userId,
              usuario_nome: userNome,
              acao: 'sincronizacao_erro',
              entidade: 'edital',
              detalhes: `Erro no processamento local do edital ID ${editalId}: ${err.message}`
            }
          });
        }
      };

      runSingleBackground().catch(console.error);

      return new Response(JSON.stringify({ message: 'Processamento do edital iniciado localmente em segundo plano!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Processamento em lote local (Assíncrono no background para evitar timeouts HTTP)
    const runBatchBackground = async () => {
      try {
        const editais = await prisma.edital.findMany({
          where: { 
            status_processamento: { in: ['pendente', 'erro'] },
            is_valido: true,
            nome_arquivo: { not: null }
          }
        });

        if (editais.length === 0) {
          await prisma.logAuditoria.create({
            data: {
              usuario_id: userId,
              usuario_nome: userNome,
              acao: 'sincronizacao_concluida',
              entidade: 'edital',
              detalhes: 'Nenhum edital pendente ou com erro encontrado para processar localmente.'
            }
          });
          return;
        }

        let successCount = 0;
        let failedCount = 0;

        for (const edital of editais) {
          try {
            await processEdital(edital.id);
            successCount++;

            // Registra sucesso individual na auditoria
            await prisma.logAuditoria.create({
              data: {
                usuario_id: userId,
                usuario_nome: userNome,
                acao: 'processamento_edital_sucesso',
                entidade: 'edital',
                entidade_id: edital.id,
                detalhes: `Processamento local do edital "${edital.nome_edital}" (ID: ${edital.id}) concluído com sucesso.`
              }
            });
          } catch (err: any) {
            console.error(`Erro local no edital ${edital.id}:`, err);
            failedCount++;

            // Registra erro individual na auditoria
            await prisma.logAuditoria.create({
              data: {
                usuario_id: userId,
                usuario_nome: userNome,
                acao: 'processamento_edital_erro',
                entidade: 'edital',
                entidade_id: edital.id,
                detalhes: `Erro no processamento local do edital "${edital.nome_edital}" (ID: ${edital.id}): ${err.message}`
              }
            });
          }

          // Delay de 5 segundos entre chamadas para evitar rate limit do Gemini
          if (editais.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        
        await prisma.logAuditoria.create({
          data: {
            usuario_id: userId,
            usuario_nome: userNome,
            acao: 'sincronizacao_concluida',
            entidade: 'edital',
            detalhes: `Processamento local concluído: ${successCount} sucesso(s), ${failedCount} falha(s).`
          }
        });
      } catch (batchErr: any) {
        console.error('Erro no processamento em lote local:', batchErr);
        await prisma.logAuditoria.create({
          data: {
            usuario_id: userId,
            usuario_nome: userNome,
            acao: 'sincronizacao_erro',
            entidade: 'edital',
            detalhes: `Falha geral no processamento local: ${batchErr.message}`
          }
        });
      }
    };

    runBatchBackground().catch(console.error);

    return new Response(JSON.stringify({
      message: 'Processamento em lote iniciado localmente em segundo plano com sucesso!'
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
