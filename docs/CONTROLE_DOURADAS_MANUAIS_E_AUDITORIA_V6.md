# LOOP V6 — Bolas douradas administradas pelo LOOP e auditoria de ciclo

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

## Destino do centro: seis eventos

Quando o centro pertence à empresa, seja por criação manual, prazo encerrado ou desistência, o próprio domínio do tabuleiro classifica as seis vendas no padrão:

1. `LOOP_DOURADAS`;
2. `LOOP_ESQUERDA` — investimento;
3. `LOOP_DOURADAS`;
4. `LOOP_DIREITA` — reserva;
5. `LOOP_DOURADAS`;
6. `LOOP_ESQUERDA` — investimento.

Quando o centro é de um participante válido, as parcelas 1/3/5 seguem para `LOOP_CENTRO`. O cálculo da destinação parte da **titularidade operacional registrada no snapshot**, não apenas da cor exibida no painel.

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
