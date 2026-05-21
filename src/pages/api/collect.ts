import type { APIRoute } from 'astro';
import { scrapeAll } from '../../services/collector';
import prisma from '../../lib/prisma';
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

    let organizadoraId: string | undefined;
    try {
      const body = await request.json();
      organizadoraId = body?.organizadoraId || undefined;
    } catch (e) {
      // Ignora se o corpo da requisição estiver vazio ou não for JSON
    }

    let organizadoraNome = '';
    if (organizadoraId) {
      const org = await prisma.organizadora.findUnique({
        where: { id: organizadoraId }
      });
      if (org) {
        organizadoraNome = org.nome;
      }
    }

    const detalhesAudit = organizadoraNome
      ? `Sincronização manual da banca "${organizadoraNome}" iniciada. Tarefas em segundo plano acionadas.`
      : 'Sincronização manual de todas as bancas iniciada. Tarefas em segundo plano acionadas.';

    // Registra o início da sincronização na trilha de auditoria
    await prisma.logAuditoria.create({
      data: {
        usuario_id: userId,
        usuario_nome: userNome,
        acao: 'sincronizacao_iniciada',
        entidade: 'edital',
        detalhes: detalhesAudit
      }
    });

    const workerUrl = process.env.AZURE_WORKER_URL;

    // Se a URL do Worker na Azure estiver configurada, delega a tarefa
    if (workerUrl) {
      console.log('Direcionando requisição de coleta para o Azure Function Worker:', workerUrl);
      
      const res = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizadoraId })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erro na Azure Function (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify({
        message: organizadoraNome 
          ? `Sincronização da banca "${organizadoraNome}" iniciada com sucesso em segundo plano na Azure!` 
          : 'Sincronização das bancas iniciada com sucesso em segundo plano na Azure!',
        details: data
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fallback: Executa localmente (desenvolvimento)
    console.log('Executando coleta localmente (modo de desenvolvimento)...');
    await scrapeAll(organizadoraId);
    
    return new Response(JSON.stringify({
      message: organizadoraNome 
        ? `Coleta da banca "${organizadoraNome}" finalizada com sucesso localmente!`
        : 'Coleta multi-banca finalizada com sucesso localmente!'
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
