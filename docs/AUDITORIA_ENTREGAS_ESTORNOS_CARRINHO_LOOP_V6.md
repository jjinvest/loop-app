# LOOP V6 — auditoria de entregas e estornos da loja de laboratório

## O que foi incluído

O módulo `src/domain/auditoria-entregas-estornos-carrinho-demo.js` cruza pedidos imutáveis da loja com os registros de pagamento fictício e com as posições, convites e comissões do motor. A consulta é **somente leitura** e não gera novos registros.

Rota administrativa: **`GET /api/admin/carrinho-loop-demo/auditoria-entregas-estornos`**, sem parâmetros, protegida por autenticação administrativa e pelo servidor local do laboratório. Não existe no servidor público.

## Casos identificados

| Caso | Alerta/pendência | Ação do sistema |
|---|---|---|
| Compra confirmada ainda não sincronizada com a ponte | `CONFIRMACAO_SEM_CONCILIACAO_NA_PONTE` | Aponta o pedido; não cria posição automaticamente |
| Compra estornada que já gerou uma ou seis posições | `ESTORNO_COM_POSICAO_PRESERVADA` | Exige revisão; **não cancela a posição** |
| Estorno de compra com comissão já provisionada | `ESTORNO_COM_COMISSAO_JA_PROVISIONADA` | Exige reconciliação contábil futura; não retira valores |
| Estorno de compra que validou uma indicação | `ESTORNO_COM_INDICACAO_VALIDADA` | Alerta; **não altera fila A/B** |
| Estorno de venda simples da loja | `ESTORNO_COM_VENDA_SOMENTE_LOJA_REGISTRADA` | Alerta para revisão; mantém histórico |
| Pagamento ainda pendente, mas motor já recebeu registro | `PEDIDO_AGUARDANDO_COM_EFEITO_NO_MOTOR` | Aponta inconsistência potencial |
| Pedido com produto físico e sem entrega integrada | `ENTREGA_FISICA_SEM_VINCULO_LOGISTICO_REAL` | Pendência técnica informativa, sem despacho |

Cada resposta contém código técnico, número de pedido, posições numéricas associadas e indicadores; não traz dados pessoais do comprador. Os valores são sempre de **pedidos fictícios**.

O estado `SEM_ALERTAS_DE_CONCILIACAO` não significa comprovação de entrega, de pagamento, ausência de riscos de produto, nem homologação legal. A simulação independente de logística do laboratório ainda não está acoplada à loja: o relatório não inventa um vínculo, não chama um fornecedor e não emite código de rastreio.

## Reembolso e direitos do consumidor

O protótipo **não** aplica a regra de reter R$ 250 do cliente automaticamente, não desconta do reembolso o valor de uma posição e não estabelece a irrevogabilidade de uma compra. Uma política assim precisaria de revisão jurídica específica e de mecanismos legítimos para cancelamento, arrependimento, problemas de entrega, estorno e proteção ao consumidor.

Pagamento estornado após a criação de uma posição deixa o caso marcado para análise operacional, mas não reescreve o passado nem assume que o cliente perdeu seus direitos. Compensações financeiras futuras devem surgir apenas de registros reais autenticados e aprovados juridicamente.

## Testes automatizados

`test/auditoria-entregas-estornos-carrinho-demo.test.js` cobre:

- Carrinho misto PDF/físico de R$ 250 em todos os estados fictícios;
- Confirmação anterior à sincronização, e reconciliação posterior;
- Estorno **após** criação de posição, mantendo o estado da catraca inalterado;
- Estorno com comissão e indicação validadas;
- Estorno de venda somente-loja;
- Ausência de dados pessoais no relatório;
- Rota administrativa com autenticação, sem query arbitrária e ausente no servidor público;
- Relatório sem transferência, saldo bancário real, exclusão de posição ou envio a fornecedor.

Todas as operações permanecem no ambiente local do laboratório. O visual da plataforma ficou intocado.
