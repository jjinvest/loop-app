# Continuidade da unificação interna LOOP / AKITEMM — 17/11/2026

## Regra central (não negociar)

O produto público deve continuar com **um único acesso principal**, `https://akitemmloop.com.br`, e a mesma experiência aprovada de AKITEMM e Escritório LOOP. Não abrir novas prévias, novas contas paralelas, novo painel administrativo ou nova fonte de verdade. Não alterar HTML/CSS aprovados para contornar falha de navegação. Não trocar DNS/domínios sem disponibilidade comprovada.

## Fonte de código e dados

- Repositório: `jjinvest/loop-app`; branch ativa: `feature/unificar-escritorio-real-20261105`.
- Railway: projeto `8c1ab327-16f0-409a-90ac-8f02a3f5eae0`; ambiente atual **denominado** `homologacao`, ID `e5c30d7f-086f-4845-93ad-7d1a5ca5e31b`. O nome do ambiente não prova por si só que todas as operações sejam produtivas.
- Serviço da entrada pública existente `akitemm-escritorio-preview` ID `7114bc9a-8d39-477b-ad67-6a625b5aebd5`; domínio `akitemmloop.com.br` já verificado. Entrypoint ainda `scripts/servidor-escritorio-preview-railway.js`. Não chamar de produção definitiva.
- Serviço da identidade e banco reais `loop-identidade-real` ID `ac28edec-50ad-4187-99e2-8f7014735b63`; entrypoint `scripts/iniciar-cadastro-publico-release.js`; SQLite persistente `/dados-reais/clientes.sqlite`. **Não migrar nem duplicar** base, contas, sessão ou identificadores de titular para contornar bloqueios.
- `loop.com.br` foi **cadastrado** como domínio personalizado no serviço real, mas verificação de propriedade e alteração do DNS ainda pendentes. Não está comprovado como rota pública.
- Serviço `asaas-webhook-staging` permanece separado; não habilitar liquidação, Pix, saque ou catálogo comprável sem provas externas.

## Mudanças realizadas na branch, sem alterar os arquivos visuais aprovados

1. `src/producao/gateway-admin-comercial.js`: `GET /api/operador/estado` verifica **a mesma sessão administrativa** já existente, independente da sessão do cliente, e responde `operador: true/false`.
2. `src/producao/interface-aprovada-loop.js` e `src/producao/interface-aprovada-loja.js`: atalhos de operador da loja apontam para `/administrador` e são visíveis só quando a sessão do administrador é reconhecida; sem nova central.
3. `scripts/iniciar-cadastro-publico-release.js` e `scripts/iniciar-identidade-real-loop.js`: modo `OPERACAO_INTERNA_REAL` separado do `CADASTRO_REAL`. Flag `LOOP_REAL_OPERACAO_INTERNA=SIM` no serviço original. Mesmo motor, contas, SQLite, backup e admin; `permitirCadastro:false`. Não liga checkout, saques, créditos ou pagamentos.
4. Testes adicionados para seleção segura do modo interno e autenticação do operador da loja.

## Evidência mais recente

- Em 17/11/2026 foi aplicado ao serviço **original** o commit `9a02d1547b74e81d636b9af1cf560864567f26ef` com a flag de modo interno ativada. O Railway informou **SUCCESS**, réplica online, zero alertas/falhas ativas; implantação e código conferidos.
- Três workflows do GitHub para essa revisão ficaram com resultado **success**: identidade segregada, auditoria do pilar interno e simulação de 1.000 participantes.
- A prova de 2 contas migradas e backup offsite ocorreu no serviço original antes da ativação; não inferir da migração que todos os fluxos do usuário já funcionem.
- O acesso HTTP autenticado de usuário/operador à nova plataforma **ainda não foi comprovado fim a fim** por ferramenta de navegador autenticada. Não declarar 100%.

## Pendências internas concretas (sem atalhos)

1. Concluir a convergência da entrada pública `akitemmloop.com.br` com a **mesma fonte real de identidade/contas**, preservando as telas aprovadas, links de indicação, catálogo editável e dados persistidos. A entrada ainda aponta para o serviço antigo; não fazer corte de tráfego para serviço incompleto.
2. Comprovar a jornada real autenticada: loja -> cadastro (quando autorizado) / login de conta migrada -> escritório -> operador em suas permissões próprias -> upload de produto/foto -> leitura de pedidos/posições/financeiro verdadeiro (sem fabricar transações).
3. Confirmar correlação de catálogo/fotos persistentes com o volume e sistema de arquivos de produção, inclusive após deploy/restart.
4. Separar exclusivamente as dependências **externas** (fornecedor, Celcoin, Asaas, aprovação de termos, autorização de cadastro) dos acabamentos internos. Não tornar a ausência de PSP motivo para deixar funções administrativas internas apenas no laboratório.

## Segurança e publicação

O código vigente tem portas fechadas deliberadamente para cadastro público/checkout/saques. Não marcar como concluído aquilo que está apenas testado; ciclo: corrigir -> verificar -> publicar no serviço existente -> conferir funcionalidade e banco reais. Se falhar, reverter ativação sem alterar dados. Não alterar `docs/CONTRATO_VISUAL_LOOP_APROVADO.json` sem autorização visual específica.

**Atenção:** os serviços estão atualmente pinados a commits específicos no Railway; commits posteriores na branch podem não ser publicados automaticamente. Atualizar os serviços existentes explicitamente quando necessário.
