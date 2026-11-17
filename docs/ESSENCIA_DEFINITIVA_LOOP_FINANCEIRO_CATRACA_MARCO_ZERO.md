# ESSÊNCIA DEFINITIVA — LOOP / AKITEMM

> Contrato funcional do negócio aprovado verbalmente pelo proprietário em 17/11/2026. É a regra a preservar no Marco Zero e em futuras auditorias de IA. Este arquivo **não certifica** que o dinheiro real, a fintech ou o mecanismo de contemplação já estejam operacionais.

## 1. O que é separado (não confundir)

- **Loja AKITEMM:** cliente compra produto/serviço efetivo; pedido, fornecedor, frete, custos, taxas e tributos são processos comerciais. Uma compra qualificada pode criar **uma posição**, de acordo com a classificação comercial e as regras vigentes. O ingresso na fila não é um crédito financeiro.
- **Filas:** a venda qualificada cria/alimenta posições; prioridade A/B e demais regras do motor determinam quem chega ao tabuleiro e ao centro. Filas podem continuar recebendo posições mesmo com a catraca parada. Não inventar posição por simplesmente acender uma luz.
- **Caixa central LOOP:** recebe os valores comerciais explicitamente destinados ao LOOP, após comprovação de liquidação e separação bancária. Acumula recurso que pode ficar sem consumo por dias. Não confundir com cofres laterais nem saldo sacável do cliente.
- **Catraca/relógio:** operador controla PAUSADO, LIVRE e PROGRAMADO. As luzes criam os eventos de alocação para o centro e cofres, conforme recursos comprovados; não devem criar receita nem disparar pagamento fictício.

## 2. Primeira etapa: percurso do dinheiro na venda

1. Cliente finaliza compra genuína; sistema recebe confirmação autenticamente conciliada da adquirente/fintech, respeitando cancelamentos e estornos.
2. A instituição captadora/distribuidora escolhida deve, **se o contrato e APIs permitirem**, pagar ao fornecedor e custos relacionados; **separar R$ 250 destinados ao caixa central do LOOP por venda que qualifique esse repasse**, quando disponíveis segundo a política da operação; e enviar o saldo comercial restante à conta do titular da empresa (exemplo atual: Mercado Pago).
3. Em caso de impossibilidade técnica ou jurídica desse split, **não fingir a transferência**: apresentar a alternativa ao proprietário para nova decisão. O valor disponível não pode ser negativo nem conter dinheiro de pedido não liquidado.
4. As contas e instituições são **conectores substituíveis**, sem duplicação de pagamentos: uma mesma obrigação não pode ser liquidada duas vezes por mudança de PSP, concorrência, reprocessamento de webhook ou timeout.
5. Uma compra envia recurso ao **caixa central do LOOP**; a distribuição aos cofres laterais **não ocorre só porque a compra entrou**.

## 3. Segunda etapa: a ordem exata das seis luzes do centro

| Ordem da luz | Destino de alocação | Quem recebe a parcela no ciclo normal |
|---|---|---|
| 1ª | Centro | Titular elegível no centro |
| 2ª | Cofre esquerdo | LOOP |
| 3ª | Centro | Titular elegível no centro |
| 4ª | Cofre direito | LOOP |
| 5ª | Centro | Titular elegível no centro |
| 6ª | Cofre esquerdo | LOOP |

- **Regra de comunicação:** 'O LOOP só ganha quando alguém ganha.' A sequência começa com a luz destinada ao titular, intercalando luzes do titular e luzes do LOOP. Não significa crédito automaticamente sacável ao acender o ícone.
- As luzes **2, 4 e 6** alimentam os cofres laterais conforme esse roteiro; esses cofres não são abastecidos pelo simples evento de venda na loja.
- **Centro dourado/empresa:** quando for uma posição operacional do LOOP, aplicar a regra integral vigente do **cofre dourado** para as seis luzes, sem desviar as parcelas ao titular comum nem debitar valores não existentes.
- A **6ª luz** completa o ciclo e permite o giro/transição das posições segundo as regras de prioridade e ocupação; o movimento não pode apagar histórico ou trocar titularidade.
- **Valor dos eventos:** o plano comercial faz referência à parcela de R$ 250 por luz, mas qualquer crédito real deve ser calculado e auditado a partir dos valores efetivamente segregados, da posição contemplada, dos documentos aplicáveis e da conciliação de cada evento. Não projetar um saldo sacável apenas a partir de luz ou promessa publicitária.

## 4. Os três modos operacionais são diferentes

### PAUSADO / ACUMULAÇÃO

- Operador mantém a catraca parada. Vendas qualificadas podem continuar criando posições/filas e, quando as integrações forem habilitadas, acumulando dinheiro efetivamente recebido no caixa central.
- **Nenhuma luz**, transferência ao cofre lateral ou giro deve ser causado apenas pela compra enquanto a catraca está PAUSADA.
- Estratégia planejada de acumulação entre **01/12/2026 e 01/01/2027**, sempre condicionada à disponibilidade real e autorização das integrações comerciais.

### LIVRE / RITMO DA DEMANDA

- Só entra em LIVRE por **comando explícito do operador**. Meta zero não liga o LIVRE automaticamente; não se exige a agenda do relógio.
- Cada nova compra qualificada, **liquidada, conciliada e com parcela nova disponível ao LOOP**, pode disparar **exatamente a próxima luz** imediatamente, se a catraca/tabuleiro e os bloqueios financeiros permitirem.
- Uma compra **não conclui automaticamente todas as seis luzes**, nem libera saque ou repasse bancário incondicional. Cada luz segue a ordem e o destino financeiro definidos acima.
- O LIVRE usa a **parcela correspondente à venda corrente disponível**, registrando o débito/alocação real; **não consome uma reserva antiga** já destinada à programação. Quando a parcela estiver insuficiente, pendente ou estornada, não acender nem gerar crédito.
- A fila continua seguindo as próprias regras de posição, inclusive quando vendas e luzes ocorrem em sequência rápida.

### PROGRAMADO / RITMO DO RELÓGIO

- Só entra em PROGRAMADO por decisão do operador. O operador confere o caixa central **já liquidado**, define a **meta diária de centros** e o sistema exige/prova a segregação do dinheiro suficiente para essa meta.
- Para cada centro, o relógio distribui **seis luzes** durante a janela de abertura e fechamento escolhida pelo operador. Abertura/fechamento **não mudam ao editar a meta**; a data da meta é opcional.
- **Exemplo 09h–18h:** 9 horas = 540 minutos; 1 centro = 6 luzes, 90 min/luz; 5 centros = 30 luzes, 18 min/luz; 10 centros = 60 luzes, 9 min/luz.
- Nesse modo, cada luz é autorizada pelo **caixa acumulado e reservado**, **sem exigir venda nova no momento de acender**. Compras novas seguem alimentando filas e entradas de caixa não gastas na mesma luz.
- Meta zero é 'sem meta' e **não autoriza giro automático**. Se caixa reservado for insuficiente, houver estorno, conflito ou prova bancária ausente, parar com motivo auditável, sem saldo descoberto.

## 5. Fluxo contábil que não pode ser violado

COMPRA QUALIFICADA -> PEDIDO E RECEBIMENTO REAL -> COMPROVANTE DE LIQUIDAÇÃO -> FORNECEDOR / CUSTOS / SPLIT COMERCIAL -> CAIXA CENTRAL LOOP -> AUTORIZAÇÃO DA LUZ SEGUNDO LIVRE OU PROGRAMADO -> DESTINO DA LUZ -> CRÉDITO CONTÁBIL COMPROVADO -> SALDO SACÁVEL E PIX (somente depois da habilitação externa).

- **Uma mesma entrada financeira não pode financiar duas luzes**: chave de idempotência, livro-razão, conciliação de saldo antes/depois, auditoria e estornos preservados. Não utilizar reserva programada para pagar luz livre, ou vice-versa.
- Diferenciar: pedido criado, dinheiro efetivamente liquidado, repasse confirmado, caixa disponível, caixa reservado, luz autorizada, crédito devido, crédito liberado, saque solicitado, Pix pago.
- Bloqueios de recebimento ou saque não devem destruir contas, posições, filas ou histórico; sem prova externa, bloquear a operação financeira correspondente.
- Operação deve respeitar os contratos, a legislação aplicável e as políticas de pagamentos e publicidade antes da ativação pública. **Não garantir rendimento ou contemplação sem recursos reais comprovados.**

## 6. Correspondência atual do código (17/11/2026)

- A sequência de destinos existe em src/domain/destino-financeiro-centro-loop.js; posição dourada tem regra integral própria.
- O cálculo de meta e seis luzes está em src/domain/meta-lotes-catraca-loop.js.
- A programação administrativa real está em src/producao/operacao-catraca-admin-sqlite.js e a reserva de caixa/autorizações em src/producao/controle-caixa-catraca-loop-sqlite.js.
- Os contratos de conectores estão em src/producao/portas-financeiras-modulares.js. **Não são comprovantes de bancos conectados.**
- O livro de luzes candidato src/domain/livro-luzes-financeiras-candidato-sqlite.js **ainda acopla luz e compra e não é a liquidação real**.
- A transferência real em duas etapas e o consumo transacional da reserva pelo motor definitivo **ainda exigem integração e provas externas**. Não chamar esse mecanismo de 100% concluído com base apenas no modelo ou nos testes de ensaio.

## 7. Regra de preservação

Se o código, um teste antigo, uma tela, um manual anterior ou a próxima IA contradisserem esta descrição, **abrir divergência, não apagar a regra silenciosamente**. Solicitar decisão de alteração ao proprietário, alterar implementação e testes, registrar revisão e comprovar no ambiente real. Preservar histórico e dados. Esta especificação serve de fonte única para o futuro pacote limpo do MARCO ZERO.
