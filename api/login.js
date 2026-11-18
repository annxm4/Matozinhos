import { rota, enviar, lerCorpo, senhaConfere, criarSessao } from '../lib/servidor.js';

export default rota(async (req, res) => {
  if (req.method !== 'POST') return enviar(res, 405, { erro: 'Método não permitido.' });
  const { senha } = await lerCorpo(req);
  if (!senha || !senhaConfere(senha)) {
    await new Promise((r) => setTimeout(r, 800)); // freia tentativa e erro
    return enviar(res, 401, { erro: 'Senha de acesso incorreta.' });
  }
  enviar(res, 200, { token: criarSessao() });
});
