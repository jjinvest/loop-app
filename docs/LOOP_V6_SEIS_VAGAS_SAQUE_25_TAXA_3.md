# LOOP V6 — seis vagas, seis vendas, saque R$ 25 e taxa 3%

**Regra aprovada para o desenvolvimento, em 16/10/2026.** Documento que prevalece sobre textos históricos do V5 quando houver divergência. Esta implementação é exclusivamente de laboratório: pagamentos, saques, CPFs e contemplações reais não estão ativos.

## Tabuleiro e catraca

A estrutura continua sendo uma única fila B com promoção por indicação para a fila A, mantida a prioridade A/B existente e o mesmo motor de catraca.

- O tabuleiro possui **um centro e seis posições periféricas**, numeradas de 1 a 6.
- A entrada de cada nova posição selecionada da fila ocorre **exclusivamente pela vaga 6**.
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
