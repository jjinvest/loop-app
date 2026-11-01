# Homologação integral progressiva — LOOP 3.0 / AKITEMM — 01/11/2026

## Objetivo obrigatório
Executar 10.000 titulares distintos, **um por vez**, com eventos reais dos componentes de laboratório integrados. Não basta pré-carregar 10.000 posições e consultar o estado final. Nenhuma transação bancária real.

## Evidência existente — NÃO confundir com homologação integral
- `test/superteste-loop-10000.test.js`: percorre sequencialmente 10.000 compradores no **SimuladorLoop**, com 10.000 posições, 3.000 indicações, giros e uma conciliação financeira *sintética*. **Não** executa checkout HTTP, Asaas Sandbox, sessões individuais, entrega, persistência da loja, confirmação CPF/termos, saques e escritórios integrados para todos os titulares.
- `scripts/simular-5000-compradores-reserva-loop-v6.js`: cenário fechado de motor, não uma prova de todos os módulos.
- `test/loop-v6-ponta-a-ponta-cliente-loja-equipe-tabuleiro-saque.test.js`: integra componentes SQLite de laboratório para poucos titulares; ciclos do tabuleiro continuam no simulador.
- O valor de R$250 por compra **não é lucro líquido**. Separar receita bruta, custo de produto/fornecedor, bônus, obrigações com posições, investimento, reserva, douradas, caixa disponível e pagamentos efetivamente executados.

## Critérios de aceitação para 10.000 titulares
1. Criar cada titular e sessão; vincular indicação e nick quando aplicável; impedir CPF/identidade duplicada.
2. Gerar carrinho com preço congelado; classificar compras abaixo de R$250 como sem posição; aplicar limite de posições por titular.
3. Criar cobrança **somente Asaas Sandbox**; antes de RECEIVED não gerar posição; após reconsulta remota, criar exatamente uma posição pendente; repetir evento e reiniciar SQLite sem duplicar.
4. Exigir confirmação individual de posição (CPF e termos) e aplicar azul/dourada quando cabível; não autoativar.
5. Mover posições pelas filas B/A respeitando indicação validada e proporção 3A:1B; limitar 2 posições por titular no tabuleiro e 10 ativas.
6. Executar sequencialmente eventos 1 a 6 de cada ciclo, giro, saída/entrada, destino de cada parcela e cofre correto; registrar histórico de cada transição.
7. Conciliar para cada titular Escritório Virtual, Minhas Posições, Equipe, histórico de compras, bônus e saldo, e para o admin pedidos, catraca, cofres, saques e logs.
8. Simular saques com mínimo R$25, tarifa 0%, PIX apenas fictício; conferir que nenhum valor foi pago duas vezes.
9. Auditar invariantes após cada lote e ao final: pedidos = classificados; posições criadas = compras qualificadas e confirmadas pelo PSP; posições ativas + pendentes + concluídas + demais estados = criadas; ciclos = giros válidos; débitos + saldos + obrigações = créditos alocados, com custo de produto separado.
10. Produzir relatório progressivo nos checkpoints 1, 100, 1.000, 5.000 e 10.000, incluindo tempos, erros, filas, ciclos, cofre, saques, posição de cada titular e reconciliação financeira. Falha de qualquer invariante reprova a homologação.

## Estado nesta data
**NÃO EXECUTADA** a homologação integral de 10.000 titulares através de todas as camadas. O teste sintético anterior não pode ser usado para declarar a integração pronta.

## Próxima implementação
Unificar a ponte de comprovantes Asaas Sandbox com a mesma ponte de posições usada pelo servidor HTTP/Escritório Virtual; executar primeiro um fluxo HTTP real de laboratório para 1 comprador, depois 100, 1.000, 5.000 e 10.000 sem trocar o caminho de execução. Incluir testes de falha e retomada; não gerar dezenas de testes redundantes de componentes já aprovados.

## Segurança
Branch de desenvolvimento; PR em rascunho; sem merge/deploy, credenciais de produção, dinheiro real ou saques reais. A sustentabilidade financeira e a conformidade jurídica/regulatória exigem avaliação separada, não são demonstradas por simulação.
