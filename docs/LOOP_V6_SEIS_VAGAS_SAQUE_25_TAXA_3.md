# LOOP V6 — seis vagas, seis vendas, saque R$ 25 e taxa 3%

**Regra aprovada para o desenvolvimento, em 16/10/2026.** Documento que prevalece sobre textos históricos do V5 quando houver divergência. Esta implementação é exclusivamente de laboratório: pagamentos, saques, CPFs e contemplações reais não estão ativos.

## Tabuleiro e catraca

A estrutura continua sendo uma única fila B com promoção por indicação para a fila A, mantida a prioridade A/B existente e o mesmo motor de catraca.

- O tabuleiro possui **um centro e seis posições periféricas**, numeradas de 1 a 6.
- A entrada de cada nova posição selecionada da fila ocorre **exclusivamente pela vaga 6**. Enquanto a posição aguarda nas filas A/B, pode permanecer azul sem transferência para a empresa. Se, ao cruzar a vaga 6, o CPF e o aceite não tiverem sido confirmados, ela se torna dourada e a titularidade operacional passa ao LOOP naquele instante. A montagem inicial usa a mesma fronteira lógica de entrada antes de distribuir as posições nos lugares iniciais. Aceite posterior não reverte a titularidade dourada.
- Após conclusão do ciclo e liberação da catraca, o centro sai, a vaga 1 vira o novo centro, 2 vai para 1, 3 para 2, 4 para 3, 5 para 4 e **6 para 5**. Outra posição da fila ocupa a vaga 6, se houver. Ninguém pula etapas.
- O tabuleiro inicialmente cheio requer **sete posições** (centro + 6); a montagem gradual pode deixar vagas vazias.
- Um ciclo completo requer **seis vendas fictícias** confirmadas e vinculadas ao ocupante do centro; a catraca permanece pausada até a autorização de giro, inclusive depois da sexta venda.
- A regra A/B de prioridade **3A/1B** foi preservada.

## Destinação do valor referencial de seis eventos

| Evento | Destino | Cofre demonstrativo |
|---|---|---|
| 1 | Participante do centro | LOOP_CENTRO |
| 2 | Empresa: investimento | LOOP_ESQUERDA |
| 3 | Participante do centro | LOOP_CENTRO |
| 4 | Empresa: reserva | LOOP_DIREITA |
| 5 | Participante do centro | LOOP_CENTRO |
| **6** | **Empresa: investimento adicional** | **LOOP_ESQUERDA** |

Para referência de R$ 250 por evento, somente como **projeção aritmética**, isso representa três parcelas de R$ 250 (R$ 750) ao centro, duas (R$ 500) ao investimento e uma (R$ 250) à reserva, em seis eventos totalizando R$ 1.500 na referência do ciclo. Não se trata de dinheiro novo, renda ou recebimento garantido. Os ciclos dependem de vendas efetivas, custos e análise de solvência.

## Caixa exclusivo das bolas douradas e das desistências

A distribuição **não muda** na ordem das seis vendas. Quando o centro pertence a uma pessoa real e mantém a titularidade, suas parcelas continuam em `LOOP_CENTRO`. Quando a posição do centro é assumida operacionalmente pela empresa, seja por **prazo de ativação encerrado** (posição dourada) ou **desistência expressa após a entrada na vaga 6** (posição desistente, convertida em dourada), as parcelas originalmente destinadas ao participante (1ª, 3ª e 5ª) passam **integralmente para o caixa separado `LOOP_DOURADAS`**.

| Evento do ciclo | Centro normal | Centro dourado ou desistente |
|---|---|---|
| 1 | LOOP_CENTRO | LOOP_DOURADAS |
| 2 | LOOP_ESQUERDA (investimento) | LOOP_ESQUERDA (investimento) |
| 3 | LOOP_CENTRO | LOOP_DOURADAS |
| 4 | LOOP_DIREITA (reserva) | LOOP_DIREITA (reserva) |
| 5 | LOOP_CENTRO | LOOP_DOURADAS |
| 6 | LOOP_ESQUERDA (investimento) | LOOP_ESQUERDA (investimento) |

A referência hipotética de R$ 250 por evento resulta, no centro dourado, em **R$ 750 para o caixa das douradas, R$ 500 para investimento e R$ 250 para reserva**; nenhum desses valores é pagamento real. A empresa não pode tratar as três parcelas douradas como renda ou saque de um CPF de participante.

No laboratório, a desistência exige **aceite expresso do próprio titular autenticado** e somente pode ser registrada para a posição dele que já ocupa a **vaga 6**. A posição mantém ID e posição física, passa a pertencer operacionalmente ao LOOP, ganha estado `DESISTENTE` e aparece em dourado. A vaga anteriormente ocupada no limite daquele titular fica livre. O livro de desistências é imutável e o mesmo ato não pode ser duplicado; a desistência fictícia não realiza estorno, reembolso ou movimentação bancária.

O roteamento é derivado da **titularidade operacional** (inclusive empresa/dourada), e não apenas da cor CSS. Para um centro real, o caixa das douradas não recebe suas parcelas. O Escritório Administrativo mostra um quarto caixa LOOP, separado do centro, investimento e reserva; permite visualizar cenários demonstrativos de centro real, dourado ou desistente. A simulação de saque mínimo R$ 25 com taxa de 3% também registra solicitações em livro fictício idempotente, mas não autoriza dinheiro real. Saque de participação de lucro continua bloqueado enquanto não existir saldo específico verificado.

## Limite por CPF e pacote de seis

- **Seis posições abertas simultaneamente** no máximo, por CPF quando houver identidade real validada. No laboratório, o limite é aplicado por **conta fictícia**.
- Uma posição que conclui um ciclo deixa de contar como aberta e libera uma vaga para uma próxima posição; histórico e referência da posição anterior são preservados.
- Produto comum gera uma posição por pedido qualificado.
- Produto especial escolhido no painel administrativo gera **seis posições próprias numa só compra qualificada**, sem criar a sétima. A regra é atômica: se o titular já tem uma ou mais posições abertas, o pacote de seis não cria parcialmente vagas.
- O subtotal elegível do produto especial deve atingir seis referências (por exemplo, R$ 1.500 para referência R$ 250), sem o sistema calcular ou impor o preço de venda/margem do comerciante. A margem real e os custos continuam sob responsabilidade da administração.
- Configurações novas só afetam pedidos novos. A modalidade antiga de cinco posições, se já contratada/registrada no laboratório antes da alteração, conserva seus cinco IDs históricos no pedido congelado. As configurações ativas que eram de cinco passam a seis com nova revisão histórica e registros anteriores não são sobrescritos.

## Saques demonstrativos

- **Mínimo de R$ 25 brutos por solicitação**, seja de bônus por indicação ou participação de lucro.
- **Taxa de 3% sobre o valor bruto solicitado** em ambos os tipos, calculada em centavos e arredondada ao centavo mais próximo. Exemplo: R$ 25,00 solicitado, taxa R$ 0,75, valor líquido R$ 24,25; R$ 100,00 solicitado, taxa R$ 3,00, líquido R$ 97,00.
- Sem CPF e aceite dos termos registrados no laboratório, o simulador bloqueia elegibilidade. A primeira compra libera o link, mas não substitui CPF e aceite.
- Bônus simulado utiliza como origem exclusiva o caixa reserva; participação de lucro simulada usa como origem o centro. Não são transferências, nem saques, nem compromisso de pagamento.
- O parâmetro de tipo de saque é validado, e um saque solicitado não pode superar o saldo fictício da origem. Não há conta bancária, transferência PIX, retirada efetiva, nem integração com PSP real.

## Proteção de dados e segurança comercial

Este projeto não coleta CPF real nem oferece checkout real; o limite por CPF real, controle de estornos, saldo disponível efetivo, aprovação legal do modelo, LGPD, contratos, segregação de reservas, lucro líquido e sustentabilidade financeira exigem validação antes da operação comercial.

Os testes automatizados conferem a arquitetura de **seis eventos**, a catraca, IDs e limite, o financeiro, as migrações de snapshots e os saques fictícios. A documentação V5 continua acessível exclusivamente como histórico das decisões anteriores.
