import prisma from '../lib/prisma';

/**
 * Registra uma entrada na trilha de auditoria (LogAuditoria).
 * Pode ser acionada tanto por ações humanas no painel quanto por processos automáticos do sistema.
 */
export async function createAuditLog(
  usuarioId: string | null,
  usuarioNome: string | null,
  acao: string,
  entidade?: string,
  entidadeId?: string,
  detalhes?: string
) {
  try {
    let resolvedNome = usuarioNome;
    
    if (usuarioId && !resolvedNome) {
      // Se tiver ID de usuário mas não o nome, busca no banco para persistir o nome correto
      const user = await prisma.usuario.findUnique({ where: { id: usuarioId } });
      resolvedNome = user ? user.nome : 'Usuário Desconhecido';
    } else if (!usuarioId && !resolvedNome) {
      // Se não houver usuário, atribui ao Sistema/IA (ex: raspadores automáticos)
      resolvedNome = 'Sistema/IA';
    }

    return await prisma.logAuditoria.create({
      data: {
        usuario_id: usuarioId,
        usuario_nome: resolvedNome,
        acao,
        entidade: entidade || null,
        entidade_id: entidadeId || null,
        detalhes: detalhes || null
      }
    });
  } catch (error) {
    console.error('Erro crítico ao criar Log de Auditoria:', error);
  }
}
