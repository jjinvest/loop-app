# AKITEMM — Cloudflare R2 privado (preparação, sem publicação)

Decisão de 21/10/2026: preparar Cloudflare R2 como armazenamento remoto de avaliações (até 3 fotos e 1 MP4 de 30 segundos). **Não está conectado a uma conta Cloudflare real**; nenhuma credencial foi recebida, nenhuma cobrança ou arquivo remoto foi criado.

## Preparar a conta da AKITEMM

1. Entrar em https://dash.cloudflare.com/ com conta própria da empresa.
2. Storage & databases → R2 → Overview → Create bucket. Sugestão de nome: `akitemm-avaliacoes-privado`. Selecionar classe **Standard**. **Não configurar acesso público para o bucket**.
3. R2 → Manage API Tokens → Create API Token com permissões **Object Read & Write**, restritas **somente a esse bucket**.
4. Armazenar Access Key ID e Secret Access Key no cofre de segredos do servidor, **nunca no GitHub, chat, HTML, painel público ou código-fonte**. Criar as quatro variáveis no ambiente do processo Node:

   - `AKITEMM_R2_ACCOUNT_ID` — ID da conta Cloudflare (32 caracteres hexadecimais).
   - `AKITEMM_R2_ACCESS_KEY_ID` — Access Key ID do token R2.
   - `AKITEMM_R2_SECRET_ACCESS_KEY` — Secret Access Key do token R2.
   - `AKITEMM_R2_BUCKET` — nome exato do bucket privado.

Nenhuma configuração parcial é aceita: sem as quatro variáveis, o laboratório **continua em SQLite**, sem chave, token ou necessidade de R2. Se houver variáveis incompletas ou inválidas, o servidor deve recusar a configuração; não transformar uma falha na autorização pública de arquivos.

## Fluxo previsto

- O navegador entrega os bytes pelo servidor autenticado da AKITEMM, nunca recebe credenciais R2.
- O servidor valida conteúdo, limite e direito de avaliação, gera chaves aleatórias e envia os bytes ao R2 por HTTPS e assinatura AWS v4.
- O SQLite preserva o vínculo pedido / titular / produto, a situação de moderação, tamanho, tipo, duração e a chave **privada** do objeto. Em modo R2 o SQLite não grava outra cópia do binário (campos binários vazios).
- A leitura de arquivos mantém as permissões anteriores: antes da aprovação, somente o dono autenticado ou administrador; após a aprovação, consumidores autenticados pela loja. O bucket R2 **nunca é público**.
- Anexos antigos armazenados no SQLite continuam acessíveis. A mudança não faz migração retroativa.
- A moderação continua obrigatória. Nunca gerar credencial temporária de R2 com privilégios indiscriminados para o navegador.

## Limitações antes de produção

- O laboratório continua **local e sem deploy**. A integração R2 está preparada e testada com respostas simuladas, mas **ainda não teve teste de ponta a ponta em uma conta R2 verdadeira**.
- Necessário testar com a conta da empresa antes de ativar, incluindo falha de upload, verificação dos arquivos, limites de custos e privacidade.
- Upload atualmente passa pelo servidor Node; não é envio direto do navegador ao R2. Para escala, considerar upload assinado limitado, antivírus, recodificação/transcodificação, retenção e estratégia de limpeza de eventuais objetos órfãos em falhas de processo.
- Confirmar termos, retenção e tratamento de dados pessoais antes da publicação.
- Os preços, franquias e operações do R2 devem ser reconfirmados no painel Cloudflare no momento da ativação.

Docs oficiais: https://developers.cloudflare.com/r2/get-started/s3/ e https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/

**Regra absoluta LOOP:** não alterar Minha Rede, Minhas Posições, Financeiro, Tabuleiro, cores de elegibilidade e não fazer merge/publicação.
