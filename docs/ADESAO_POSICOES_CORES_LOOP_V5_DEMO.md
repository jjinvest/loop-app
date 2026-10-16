# LOOP V5 — Ativação das posições e cores (laboratório)

## Regra confirmada

- Compra individual confirmada de R$ 250 ou mais, ou da referência futura vigente, gera UMA posição na fila B. A loja vende por qualquer valor, e compras menores não geram posição.
- A posição nasce em estado **PENDENTE (azul)**. Não há botão de recusa.
- Enquanto a posição estiver em A ou B, o titular pode ativar a participação pelo escritório, usando identificação fictícia e aceitando a versão dos termos no laboratório. A posição vira **ATIVA (vermelho para o próprio titular, cinza para terceiros)**.
- No exato ingresso no tabuleiro, posição ainda pendente perde a janela de ativação: o status vira **PRAZO_ENCERRADO**, sua titularidade operacional passa a **LOOP_EMPRESA** e a cor fica **dourada**.
- A cor **dourada** também representa qualquer posição operacionalmente pertencente à empresa.
- A mudança de estado não reorganiza A/B, não muda a proporção 3A:1B, não move a catraca por si só e não apaga o pedido original.
- Uma posição dourada deixa de contar entre as cinco posições do comprador. A compra original permanece rastreável no livro de pedidos do laboratório.

## Implementação atual

- Os snapshots do motor guardam os estados de adesão.
- Serviço de ativação `AdesoesPosicoesDemoSQLite` exige sessão autenticada, versão dos termos, aceite expresso e identificador fictício. O número não é retornado nas consultas.
- A API do escritório oferece `POST /api/laboratorio/participante/ativar-posicoes` apenas no servidor local.
- O mapa pessoal apresenta a cor de cada posição sem expor identidade ou contato dos outros clientes.
- O botão **Testar entrada no tabuleiro** usa uma API exclusivamente administrativa para simular a seleção inicial e observar a transição de azul para dourado.
- Ainda não existe checkout/recebimento real. O acionamento do verificador de compras segue limitado aos testes internos.
- A transferência de titularidade operacional e a previsão de destinos de ciclo continuam demonstrações do motor, sem repasse de dinheiro.

## Testes

`test/adesao-cores-tabuleiro-demo.test.js`,
`test/adesao-participante-http-demo.test.js`,
`test/admin-preparar-tabuleiro-cores-demo.test.js`.

## Próximas integrações

Cadastrar telefone no fluxo de entrada, conectar a compra real ao verificador de pagamento e definir políticas de versionamento de termos para produção; manter a vista pública do escritório limitada à própria sessão.
