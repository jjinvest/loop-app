# LOOP V6 — Bolas douradas administradas pelo LOOP e auditoria de ciclo

## Regra vigente — criação sem consumir reserva (07/11/2026)

Por decisão expressa do proprietário, **novas bolas douradas criadas manualmente pelo administrador não podem mais consumir, comprometer nem reduzir o cofre direito de reserva**. Este caixa permanece reservado a outras obrigações da empresa, inclusive planejamento tributário.

- Criar **uma dourada por solicitação**, com identificador sequencial, evento idempotente, titular operacional `LOOP_EMPRESA`, cor **DOURADO** inalterada, sem CPF, pedido ou venda inventados, ao **fim da fila B**.
- Cada nova dourada fica identificada como `ADMIN_MANUAL_SEM_COMPRA`, `aporteInternoCentavos=0`, `geradaSemCompra=true`. O retorno da API declara `reservaConsumidaCentavos=0`, `aporteRegistrado=false` e `receitaNovaCentavos=0`.
- Douradas antigas criadas sob a regra de aporte são **históricas** e não têm seus lançamentos revertidos, apagados ou reclassificados: a tabela imutável `admin_ponte_douradas_financiadas_demo` permanece no cálculo do comprometimento anterior, se houver. Não devolver artificialmente dinheiro à reserva.
- Quando uma dourada da empresa chega ao **centro**, os seis eventos mantêm exatamente os destinos existentes: parcelas **1, 3 e 5 ao cofre exclusivo `LOOP_DOURADAS`**, parcela 2 e 6 ao investimento (`LOOP_ESQUERDA`) e parcela 4 à reserva (`LOOP_DIREITA`). Não mudou o tabuleiro, as cores, as filas, os seis eventos nem a proporção 3A:1B.
- Nenhuma criação automática de saldo, pagamento, saque ou crédito bancário. Eventos de laboratório apenas simulam destinação; obrigação real exige comprovação de recebimentos, passivos, custos e conciliação.
- Esta alteração foi aplicada **à ponte administrativa de demonstração**, e **não cria automaticamente o comando de emissão na interface unificada `/staging/escritorio-admin`**, onde a integração com o mesmo motor permanece pendente. Não reintroduzir outra base nem simular botão funcional.
- Ensaios específicos: `test/dourada-manual-auditoria-pontas-loop-v6.test.js` e `test/disponibilidade-caixa2-integracao-v6.test.js`. Caminho de validação no CI `preview-escritorio-protegido.yml`.

O requisito antigo de pré-financiar cada nova dourada foi **revogado para novas criações**, não para o histórico contábil já comprometido. O uso de reserva tributária não deve ser confundido com cálculo automático ou pagamento de impostos.

## Criação manual (apenas laboratório, 16/10/2026)

O administrador abre **Financeiro administrativo → Criar bola dourada do LOOP** e pressiona **Criar 1 bola dourada**. O servidor, autenticado como administrador local, cria exatamente **uma posição operacional**:

- ID sequencial e único compartilhado com todas as outras posições do motor;
- titular operacional `LOOP_EMPRESA`, `empresa=true`, `statusAdesao=POSICAO_LOOP`;
- registro imutável com ID do evento administrativo e horário;
- entrada no **fim da fila B**, sem antecipar o avanço da catraca;
- nenhuma conta de cliente, CPF, indicação, pedido, fatura ou comprovante de compra;
- nenhum dinheiro, comissão, crédito para a empresa ou participante é criado ao apertar o botão;
- a posição segue as mesmas regras 3A/1B e os mesmos seis deslocamentos até o centro. A bola não é uma identidade que pode receber convites;
- a mesma requisição reenviada com o mesmo `eventoId` é idempotente: **não gera outra posição**.

As bolas douradas **também podem surgir automaticamente** quando uma posição azul cruza a entrada da vaga 6 sem confirmar CPF e termos. **Outra origem** é a desistência expressa de uma posição já na vaga 6. Nessas duas situações, a posição anterior é assumida operacionalmente pelo LOOP, preservando ID e motivo histórico. Não se cria posição extra.

## Destino do centro: seis eventos — regra V2 vigente

**A partir de 07/11/2026, todo NOVO ciclo cujo centro pertença à empresa (bola dourada) tem 100% de seus SEIS eventos atribuídos ao cofre exclusivo `LOOP_DOURADAS`.** Não dividir as parcelas do centro dourado com `LOOP_CENTRO`, `LOOP_ESQUERDA` ou `LOOP_DIREITA`:

1. Evento 1 → `LOOP_DOURADAS`.
2. Evento 2 → `LOOP_DOURADAS`.
3. Evento 3 → `LOOP_DOURADAS`.
4. Evento 4 → `LOOP_DOURADAS`.
5. Evento 5 → `LOOP_DOURADAS`.
6. Evento 6 → `LOOP_DOURADAS`.

Inclui douradas administrativas e posições assumidas pelo LOOP após cruzar a vaga 6 sem termos/CPF ou por desistência. A cor **continua dourada**, sem alteração nas filas, na sequência 3A:1B, na catraca ou nos seis eventos. **Criar a dourada permanece sem consumir o cofre de reserva**, conforme a decisão anterior.

**Centro de participante:** a regra do cliente continua inalterada: `LOOP_CENTRO`, `LOOP_ESQUERDA`, `LOOP_CENTRO`, `LOOP_DIREITA`, `LOOP_CENTRO`, `LOOP_ESQUERDA`.

**Histórico imutável (V1):** ciclos dourados já iniciados sob a regra anterior continuam com os destinos efetivamente registrados — `LOOP_DOURADAS`, `LOOP_ESQUERDA`, `LOOP_DOURADAS`, `LOOP_DIREITA`, `LOOP_DOURADAS`, `LOOP_ESQUERDA`. Não estornar, apagar, reclasificar retroativamente ou reinterpretar lançamentos históricos. Um ciclo antigo não pode misturar V1 e V2. A emissão de uma nova dourada não gera receita.

**Conciliação:** os seis eventos V2 são registrados como fontes diferentes no ledger imutável; na projeção de pré-lançamento, as cotas inicialmente separadas nas três origens são reclassificadas para o cofre dourado com conservação integral e sem contagem dupla. Só eventos com aportes demonstrativos já documentados podem alimentar essa projeção. Isto continua sendo **ensaio sem saldo bancário comprovado nem saque autorizado**.

## Amarração técnica e limites contábeis

- `src/domain/ponte-compras-convites-demo-sqlite.js`: criação manual, histórico administrativo, leitura de snapshot e auditoria direta da posição central.
- `src/domain/tabuleiro-loop.js` e `src/domain/destino-financeiro-centro-loop.js`: ordem de seis parcelas e identificação de titularidade.
- `src/domain/financeiro-admin-demo.js` e `src/domain/razao-financeiro-demo-sqlite.js`: livro e cenário demonstrativos por tipo de centro.
- `src/domain/conciliacao-cofres-demo.js`: cenários e comparações do quinto cofre, inclusive posições douradas/desistentes.
- `src/routes/admin-financeiro-demo.js`: auditoria de conciliação com tipo de centro validado no servidor.
- `src/routes/admin-ponte-compras-convites-demo.js`: criação e consulta de auditoria protegidas por chave administrativa.
- `src/laboratorio/financeiro-admin-demo.html` e `.js`: botões e status visíveis no painel administrativo.
- `test/dourada-manual-auditoria-pontas-loop-v6.test.js`: ID único, fila B, idempotência, proteção de acesso, exclusão de compra e comissão, seis destinos e nenhuma entrada de saldo.

**Separação essencial:** os seis `vendaId` usados para mover o tabuleiro são **marcadores de simulação**, não confirmações externas de pagamentos ou faturamento real. A auditoria confronta os destinos desses marcadores com os destinos previstos; ela informa `recebimentosFinanceirosComprovados=false` e `podeGerarCreditoFinanceiro=false`. Os cenários financeiros, PSP fictício e livros exemplificativos continuam separados de pagamentos reais. Para efetivamente creditar caixas de uma operação comercial, será necessária a integração segura com comprovantes autenticados, repasses, custos, estornos e conciliação de PSP, que ainda não existe. A criação de posições manuais sem venda **jamais pode representar receita**.

**Limitações:** implantação real não autorizada. Exige avaliação de legalidade do modelo e dos direitos dos consumidores, adequação LGPD, separação de recursos, sustentabilidade e regras de estorno e responsabilidade contábil antes de operação com dinheiro verdadeiro.
