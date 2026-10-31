# Homologacao externa Asaas -> pedido identificado -> posicao LOOP (31/10/2026)

## Evidencia confirmada
- GitHub Actions run 41225172655: sucesso na consulta autenticada ao Asaas Sandbox.
- Referencia externa LOOPLAB-akitemm-pix-teste-001, PIX R$ 250, status RECEIVED.
- Tres consultas, nenhuma gravacao nessa execucao, nenhum saque ou credito LOOP.

## Limite da evidencia
O pagamento acima nao comprova posicao criada: nao foi preparado com titularidade persistida previamente no mesmo SQLite do LOOP. Nao vincular retroativamente esse pagamento a um titular inventado.

## Proximo teste ponta a ponta (somente laboratorio)
1. Criar conta de teste, pedido identificado e carrinho qualificado R$ 250 no mesmo SQLite, antes da cobranca.
2. Registrar referencia e cliente Asaas Sandbox do pedido; criar cobranca PIX exclusiva para esse pedido. Nao reutilizar referencia ja paga.
3. Confirmar pagamento somente no ambiente Asaas Sandbox, mediante disparo manual autorizado.
4. Reconsultar API autenticada e verificar id, externalReference, valor, tipo PIX, cliente e estado RECEIVED.
5. Conciliar com montarIntegracaoAsaasSandboxLoopLab, criando exatamente uma posicao pendente para o titular previamente fixado.
6. Reprocessar em paralelo e apos reiniciar SQLite; confirmar que nao surgem posicoes duplicadas.
7. Confirmar que CPF e aceite individual nao sao preenchidos automaticamente; nenhuma catraca, saque ou movimentacao real.
8. Registrar logs sem chave, CPF, QR Pix ou dados pessoais.

## Portao de seguranca
Nao acionar rotas publicas, producao, merge ou deploy. Aprovacao de testes simulados e do pagamento externo isolado nao equivale a homologacao integral.
