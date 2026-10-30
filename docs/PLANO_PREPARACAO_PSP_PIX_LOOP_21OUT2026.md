# LOOP 3.0 — Preparação para integração bancária e PSP (SEM INTEGRAÇÃO REAL)

**Planejamento técnico atualizado em 21/10/2026.** Nenhum PSP foi escolhido, contratado, autenticado, integrado ou acionado. Nenhuma ordem Pix, transferência, pagamento, estorno, saque ou consulta bancária foi executada por esta implementação.

## Estado atual comprovado

- O LOOP usa uma **ponte de testes local** e livros SQLite fictícios para pedidos, posições, provisões e solicitações de saque. Esse laboratório **não constitui checkout bancário** e não prova liquidação financeira.
- A nova função pura `planejarEventoPspFuturoLab` em `src/domain/contrato-psp-futuro-loop-lab.js` confere **apenas formato** e correspondência de um identificador externo com um pedido congelado, intento e valor. Mesmo ao conferir tudo, mantém `autenticidadeDoProvedorComprovada=false`, `liquidacaoConfirmada=false`, `autorizacaoDePosicao=false`, `autorizacaoDeSaque=false`.
- `politicaTarifaSaqueFuturaLab` preserva o **saque 0% ao participante**, líquido integral e **tarifa bancária desconhecida** (`null`), a cargo da empresa. Não inventa tarifa zero nem confirma saldo real.
- Testes em `test/loop-v6-preparacao-psp-contrato-puro.test.js` verificam que payload autodeclarado não pode autorizar pagamento/posição, rejeita moeda/valor/intento/pedido alterados, preserva taxa zero. O vínculo de qualquer operação bancária real fica **pendente de integração e validação independentes**.

## Arquitetura futura PROPOSTA, dependente de revisão e contratação

1. Escolher instituição participante do Pix ou PSP licenciado adequado ao modelo comercial; consultar restrições contratuais ao produto, condições de onboarding PJ, split/reserva, saques, devoluções, limites, retenções e custos. Não escolher fornecedor só pela tarifa anunciada.
2. Manter **pedido imutável** no LOOP: id único, titular, itens, preço/congelamento e intento associado criado pelo backend. O navegador nunca decide confirmação.
3. Gerar cobrança por API do provedor, com credenciais protegidas fora do código e ambientes separados. **Webhooks são alertas**, não prova suficiente de liquidação: autenticar fonte segundo especificação do provedor e **reconsultar o recurso do PSP** por identificador emitido por ele.
4. Conciliar banco/PSP com pedidos: valor, moeda, id de fim-a-fim quando aplicável, pagador autorizado quando comprovável, timestamps, retorno, estornos parciais, chargebacks, taxas, duplicatas, status e liquidação. Guardar eventos anexados sem reescrever histórico.
5. Só uma confirmação liquidada e reconciliada pode alimentar regras comerciais que autorizem uma posição. Em caso de evento conflitante: **não liberar direitos financeiros automaticamente**; abrir pendência humana, manter trilha imutável, resguardar direitos do consumidor e aplicar política aprovada por jurídico/contabilidade.
6. Saques: exigir origem do saldo, titularidade validada, antifraude, disponibilidade, autorização apropriada e reconciliação de transferência. **Participante recebe o valor bruto solicitado**; tarifa efetivamente cobrada deve entrar como **despesa própria da empresa**. Não programar transferência enquanto esses contratos não forem aprovados.
7. Segurança e privacidade: autenticação forte, HTTPS, assinatura/segredo webhook rotacionável, replay window, limite de corpo, idempotência persistida, redução de dados armazenados, segregação de acesso, backups testados, registros de consentimento e direitos dos titulares. Não trafegar ou armazenar dados bancários reais em fixtures, logs ou GitHub.

## Fontes institucionais consultadas

- Banco Central do Brasil — **Normas do Pix**: https://www.bcb.gov.br/estabilidadefinanceira/pix-normas
- Banco Central — **Pix Cobrança**, API para gestão de cobranças, verificação de liquidação, conciliação e suporte à devolução: https://www.bcb.gov.br/estabilidadefinanceira/pix-cobranca
- Banco Central — **Manual de Padrões para Iniciação do Pix**, verificar versão oficial vigente antes de implementar: https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf
- ANPD — **Guia de agentes de tratamento e encarregado**: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado
- Governo Federal — **Adequação empresarial à LGPD**: https://www.gov.br/dnit/pt-br/acesso-a-informacao/tratamento-de-dados-pessoais/perguntas-frequentes-sobre-a-lgpd-e-atuacao-da-agencia-nacional-de-protecao-de-dados-anpd/4-adequacao-a-lgpd/4-1-o-que-as

**As referências não constituem parecer jurídico nem escolha de fornecedor.** Regras do Pix e exigências do provedor devem ser revisitadas na implantação, pois mudam com o tempo.

## Bloqueios ainda existentes / necessários para lançamento

**NÃO CONCLUÍDO:** contrato do PSP, homologação sandbox de provedor escolhido, reconsulta real de liquidação, conciliação independente de extrato e estornos reais, conta PJ/caixa efetivo, conta de pagamentos, provisionamento de tarifas, política de devolução e fraudes, diligência de LGPD, revisão jurídica do modelo de benefício/indicações e tratamento fiscal/tributário e do CDC. São dependências externas reais, não substituíveis por testes simulados.

**Não** fazer merge/deploy, nem implementar Escritório do Administrador sem pedido explícito. Manter PR #1 rascunho e taxa de saque ao participante 0%.
