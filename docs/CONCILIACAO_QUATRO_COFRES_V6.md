# LOOP V6 — Conciliação dos quatro cofres no laboratório

Este módulo confere somente lançamentos FICTÍCIOS no SQLite do laboratório. Não concilia extratos bancários nem confirma recursos em posse da empresa, não autoriza repasses, não liquida créditos de clientes e não promete contemplação.

## Separação de origens

A LOJA conserva contabilização própria de vendas, custo de fornecedor, taxa, imposto e margem. A existência de compra confirmada interna não lança automaticamente saldo no LOOP. Somente um **aporte fictício específico, identificado e único de R$ 250**, vinculado a pedido interno, faz ingressar esse valor no demonstrativo dos cofres. Neste estágio o registro é explicitamente de laboratório, criado por operador; em operação real precisará de confirmação e liquidação auditável por PSP/banco.

## Roteamento e movimento

- Cofre CENTRAL: recebe a metade matemática dos aportes fictícios da fase de arrecadação. Ao concluir um giro, seu valor é separado para uma previsão no Escritório Virtual do centro titular, ou para o quarto cofre DOURADAS se a posição do centro pertencer ao LOOP.
- Cofre ESQUERDA: recebe a parcela matemática do investimento.
- Cofre DIREITA: recebe a parcela matemática de reserva.
- Cofre DOURADAS: recebe os eventos destinados às posições douradas que concluem seu ciclo. Não é uma fila diferente, não cria um giro extra e não credita contas pessoais.

Regra de movimentação é UNA: cada giro requer seis compras fictícias distintas e a autorização da catraca, sem pular as posições douradas. A origem do dinheiro da LOJA fica separada, e as previsões lançadas nos escritórios não são dinheiro sacável.

## Conferências automáticas

O auditor `src/domain/conciliacao-cofres-v6-demo-sqlite.js` examina individualmente aportes vinculados, identificação dos pedidos comerciais, valor fixo, soma da repartição, lançamentos de cada giro e livro de provisões. Confere se as parcelas correspondem a titular ou Dourado, se o centro não fica negativo no cenário demonstrativo, e se a conservação dos recursos por todos os destinos está correta.

Em caso de divergência, o START é recusado; depois dele, qualquer lote de giros com divergência é abortado inteiramente por rollback da mesma transação, sem gerar novos créditos previstos. Uma venda comercial sem aporte não constitui erro: apenas não alimenta nenhum cofre do LOOP.

Endpoint GET autenticado `/api/admin/circuit-break-v6-demo/ponte/conciliacao` devolve valores DEMONSTRATIVOS por cofre, quantidade de lançamentos, códigos de alerta e indicador `dinheiroBancarioComprovadoCentavos:0`. O painel mostra um resumo. A rota não existe na aplicação pública.

## Estornos comerciais e gestão do proprietário

- **Cancelamento, devolução e estorno comercial são operações da LOJA**, em uma contabilidade distinta. O motor de giros do LOOP não oferece o comando `ESTORNO_COMERCIAL`, nem devolve valores por cancelar um produto. Isso NÃO dispensa verificar se um recebimento originário foi estornado pelo provedor: divergências de cobertura ou aportes revertidos precisam ser identificados, e liberações incompatíveis devem ser bloqueadas até conciliação.
- **O proprietário pode solicitar movimentações a qualquer horário**, sem depender de START, Circuit Break ou janela de liberação de giros. A identidade administrativa não modifica a ordem das filas nem os direitos dos titulares.
- Registro administrativo independente `loop_v6_gestao_cofres_solicitacoes_demo`, com origem entre os quatro cofres, destino informado, justificativa, valor e ID idempotente. Auditado em SQLite e imutável; sem acesso ao fluxo público de participantes.
- Por enquanto a movimentação do proprietário é **uma solicitação de laboratório**, não uma saída financeira executada. Nenhum cofre é debitado por ela, mesmo que mostre saldo demonstrativo suficiente. Uma retirada efetiva somente poderá ser autorizada após comprovação bancária e análise de valores já comprometidos e de obrigações da empresa. Não há retirada ilimitada de dinheiro pertencente a terceiros.
- Rotas de laboratório com autenticação administrativa: `GET/POST /api/admin/circuit-break-v6-demo/ponte/gestao-proprietario`. Cada pedido permanece `PENDENTE_CONCILIACAO_REAL`, sem Pix ou liquidação.
## O que ainda falta para dinheiro real

Integrar PSP autorizado, conciliar recursos realmente liquidados, despesas comerciais, estornos da LOJA, eventuais reversões de recebimentos bancários, impostos, reservas e pagamentos; rejeitar saques com saldo insuficiente; registrar decisões de antifraude; proteger a identidade do titular e assegurar a observância da legislação. O prazo planejado de revisão de saque é de 24 horas corridas a partir da solicitação, podendo liberar mais cedo apenas se houver saldo real disponível e todas as validações. **Não existe saque real neste laboratório.**

Revisar previamente a legalidade e a sustentabilidade do modelo em que benefícios se vinculam a compras e indicação de outros clientes, com análise independente do risco de pirâmide financeira e das responsabilidades do consumidor.

PR #1 segue em rascunho; não publicar ou mesclar sem autorização.