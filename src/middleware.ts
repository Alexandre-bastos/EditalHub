import { defineMiddleware } from 'astro:middleware';
import { decryptSession } from './lib/session';

// Rotas do painel que requerem proteção de login
const PROTECTED_PREFIXES = ['/dashboard', '/editais', '/concursos', '/organizadoras', '/usuarios'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect, locals } = context;
  const path = url.pathname;

  // 1. Tenta recuperar e descriptografar a sessão atual a partir do cookie
  const sessionToken = cookies.get('session')?.value;
  const user = decryptSession(sessionToken);

  // Injeta o usuário logado para estar disponível nos layouts e páginas via Astro.locals.user
  locals.user = user;

  // 2. Determina se o caminho atual requer login
  const isDashboardRoute = PROTECTED_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + '/'));

  if (isDashboardRoute) {
    if (!user) {
      // Se não estiver autenticado, limpa o cookie quebrado e redireciona para a tela de login
      cookies.delete('session', { path: '/' });
      return redirect('/login');
    }
  }

  // 3. Se for a tela de login e o usuário já estiver logado, redireciona direto para o painel
  if (path === '/login' && user) {
    return redirect('/dashboard');
  }

  return next();
});
