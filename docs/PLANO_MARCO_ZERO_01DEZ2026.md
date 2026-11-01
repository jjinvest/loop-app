# LOOP 3.0 / AKITEMM — Plano de decisão para 1º de dezembro de 2026

**Criado em:** 01/11/2026. **Meta comercial proposta:** terça-feira, **01/12/2026**. São 30 dias após 01/11.
**Estado:** **META CONDICIONAL, NÃO É DATA DE INAUGURAÇÃO APROVADA.**
**Repositório:** `jjinvest/loop-app`; branch `fix/teste-escrita-catraca-20261014`; PR #1 DRAFT. Não fazer merge/deploy nem usar dinheiro real sem autorização formal.

## A distinção que decide a data

O CI e Chromium já aprovam o fluxo de laboratório. O servidor público `src/server.js` ainda **não** é o mesmo fluxo de produção do Escritório/loja/cobranças do laboratório; suas rotas de simulação ficam bloqueadas por padrão. Portanto, **suíte verde não equivale a checkout público homologado**.

O objetivo é ter plataforma **tecnicamente e juridicamente pronta para vender e atender consumidores reais**, com estoque/entrega dos fornecedores, liquidação demonstrável, regras de filas e expectativas comunicadas com clareza. Não simular disponibilidade financeira, não prometer ganhos por compras, nem ativar benefícios por evento não liquidado.

A decisão **GO** só pode ser tomada com documentação e validação independentes de **todos os seis gates** no Escritório; o painel de laboratório permanece `NAO_LIBERADO_PARA_DIVULGACAO`. **Uma data do calendário nunca destrava gate.**

## Caminho crítico por semanas

| Limite | Entrega obrigatória | Critério de saída | Risco de atraso |
| --- | --- | --- | --- |
| **07/11** | Arquitetura de produção definida, hospedagem/HTTPS, escopo comercial congelado; revisão jurídica inicial do modelo de compras, indicações, filas, CDC/LGPD e contratos iniciada | Responsáveis, impedimentos jurídicos, dados a custodiar e plano de infraestrutura explicitados | Sem viabilidade jurídica ou dono dos acessos, **não prometer venda em dezembro** |
| **14/11** | Serviço de compra/cadastro/checkout próprio de produção segregado do laboratório; Asaas **Sandbox remoto** homologado com pedido de R$250, titularidade fixa e webhook entregue pelo provedor a endpoint temporário autenticado | Evidência externa do envio remoto, reconsulta PSP, uma posição pendente e zero duplicações; exceções documentadas | Sem webhook ou caminho de produção definido, **meta de vendas em risco alto** |
| **21/11** | Staging real com HTTPS, acesso e sessão seguros, segredo segregado, backup criptografado/offsite, restauração em máquina separada, monitoramento e procedimentos de incidente; conciliação PSP/banco e saques sob aprovação independente | Testes E2E, fraude/replay, falhas de rede, encerramento inesperado, restauração com RPO/RTO medidos e parecer financeiro | Se staging seguro não estiver concluído, **substituir lançamento de vendas por pré-cadastro** |
| **27/11** | Regressão completa no candidato exato, aprovação visual do proprietário PC/celular, termos/privacidade/suporte/entrega/reembolso e contratos de fornecedores, parecer jurídico final | Todos os seis gates com evidência verificável, sem pendências críticas | **Qualquer gate faltante = NO-GO** |
| **28–30/11** | Congelamento do código, ensaio da operação, contingência/rollback, autorização escrita final | Decisão **GO/NO-GO** com responsáveis e evidências do SHA e ambiente exatos | Não autorizar em modo automático |
| **01/12** | **Vender apenas em caso de GO formal**; caso contrário, comunicação limitada a pré-cadastro/lista de interesse, desde que juridicamente aprovada | Segurança e direitos de consumidores preservados | Ajustar data sem simular prontidão |

## Evidências que não podem ser trocadas por números de testes

1. **CI exato da versão pública**: build reproduzível e Chromium completo no código realmente implantável.
2. **Asaas remoto**: webhook verdadeiramente **emitido pelo provedor**, assinatura/token, idempotência, reconsulta independente, reversão/estorno com revisão; somente Sandbox até autorização.
3. **Financeiro**: prova externa de liquidação, margens líquidas, provisões, cofre, riscos e saques; separar remuneração por indicação de receitas de venda. Nenhuma promessa de retorno.
4. **Produção/segurança**: autenticação real, HTTPS, rotas públicas com autorização, proteção de dados, monitoramento, backups offsite/restore, incidente/continuidade.
5. **Aprovação do proprietário**: telas e jornada real completas, pedidos/posições e condições comerciais em PC/celular.
6. **Jurídico independente**: análise da legalidade do modelo, inclusive risco de enquadramento como pirâmide, publicidade, relações de consumo, LGPD, tributos e direito a arrependimento/reembolso quando aplicável. **Este item pode impor redesenho ou impedir lançamento do modelo atual**.

## Regras de execução e dependências

- Desenvolver em blocos grandes; primeiro conferir HEAD e documentos, sem repetir auditorias já encerradas. Não aceitar `CI success` antigo como prova da versão atual sem conferir SHA.
- Work e chat comum não devem sobrescrever o mesmo arquivo enquanto trabalham em paralelo; reconsultar HEAD a cada atualização.
- Sem deploy, merge, pagamentos reais, saques, migração de dados pessoais ou publicidade com promessa de ganho sem autorização e evidência.
- O proprietário precisará disponibilizar **por fluxo seguro**, quando solicitado, suas aprovações e acessos de infraestrutura/Asaas, além de viabilizar avaliação jurídica/contábil externa; nunca colar chaves em chat ou GitHub.
- Se a data não permitir cumprir requisitos, a alternativa é **vitrine de apresentação/espera, sem compra ou acesso financeiro**, com peças revisadas. O primeiro dia de vendas deve ocorrer apenas quando os gates forem satisfeitos.

## Registro inicial de impedimentos, verificável em 01/11/2026

| Gate | Estado inicial | Por quê |
| --- | --- | --- |
| CI_HEAD_ATUAL | CI do laboratório aprovado; **produção não homologada** | Browser e suíte não cobrem versão pública que aceite dinheiro |
| ASAAS_REMOTO | **NÃO COMPROVADO na versão atual** | Webhook externo direto nunca foi recebido pela plataforma |
| BANCO_E_SAQUES | **NÃO COMPROVADO** | Simulações e provisões não são comprovantes bancários |
| PRODUCAO_E_SEGURANCA | **NÃO COMPROVADO** | Infra pública, restore offsite e monitoramento não aprovados |
| ESCRITORIO_VISUAL | **NÃO COMPROVADO pelo proprietário** | Capturas de teste não são aprovação final |
| JURIDICO | **NÃO COMPROVADO** | É necessária análise independente do modelo e das vendas |

**Próximo passo técnico do bloco:** reforçar a proteção de bootstrap público para impedir que flags de clientes de laboratório ou modo de simulação sejam usadas em `NODE_ENV=production`, com testes negativos, preservando a separação atual do checkout. Não confundir o bloqueio com a criação do backend de vendas real.

## Implementação pública incremental de 01/11/2026

**Contrato de orçamento implementado:** `POST /api/checkout/cotacao` consulta os mesmos produtos de `/catalogo`, recalcula quantidades e preços no servidor, rejeita parâmetros de cliente e produtos demonstrativos/ocultos, e devolve **somente estimativa informativa**, sem registro de pedido ou preço reservado. `GET /api/checkout/estado` informa o bloqueio. Todo endpoint para finalizar, criar pedido, pagar ou webhook permanece com **503**. `GET /health` mede vida do processo; `GET /health/ready` fica em **503** enquanto o Marco Zero não estiver homologado. Os seis gates externos são mantidos em `src/domain/marco-zero-gates.js` e reutilizados tanto pelo público quanto pelo monitor do laboratório.

**Evidência até aqui:** [CI da versão de orçamento](https://github.com/jjinvest/loop-app/actions/runs/41340343800): **731 testes aprovados, zero falhas**, Chromium PC/celular aprovado. O CI do refinamento de fonte única dos gates será registrado no documento-mestre após conclusão.

**Próximo caminho técnico:** modelar sessão de cliente e pedido durável na arquitetura pública **sem copiar as rotas fictícias**, criar integração Asaas exclusivamente Sandbox sob credencial controlada em staging externo, validar webhook remoto e cancelamentos com revisão; só depois desenhar o caminho de pagamento real, sujeito às autorizações e ao jurídico. Este avanço **não** libera checkout ou anúncios de venda.

