# LOOP V5 — Ativação das posições e cores (laboratório)

> Atualização V6 em 16/10/2026: entrada do tabuleiro pela **vaga 6**, limite de **seis** posições abertas. Este documento foi atualizado para registrar o instante exato da transição azul → dourado.

## Regra confirmada

- Compra individual confirmada de R$ 250 ou mais, ou da referência futura vigente, gera UMA posição na fila B. A loja vende por qualquer valor, e compras menores não geram posição.
- Sem CPF e aceite anteriores, a posição nasce **PENDENTE (azul)**. Com CPF e termos já aceitos antes dessa compra, a nova posição nasce **ATIVA**. Não há botão de recusa.
- A partir da primeira compra confirmada de qualquer valor, mesmo sem posição, o titular pode realizar a segunda ativação para bonificações com CPF fictício e aceite expresso dos termos. Enquanto a posição estiver em A ou B, esse aceite também ativa a posição. A posição vira **ATIVA (vermelho para o próprio titular, cinza para terceiros)**.
- A posição **permanece azul durante toda a espera nas filas A ou B**. Nenhum prazo de relógio nem simples avanço da fila muda sua cor. **Somente ao cruzar a entrada pela vaga 6 do tabuleiro**, se o CPF e os termos não tiverem sido confirmados antes dessa entrada, ela passa a **PRAZO_ENCERRADO**, sua titularidade operacional torna-se **LOOP_EMPRESA** e a cor muda para **dourada**. Durante a montagem inicial o simulador aplica essa mesma verificação de entrada pela vaga 6 antes de distribuir os ocupantes pelas posições internas e pelo centro, preservando sua ordem.
- A cor **dourada** também representa qualquer posição operacionalmente pertencente à empresa.
- A mudança de estado não reorganiza A/B, não muda a proporção 3A:1B, não move a catraca por si só e não apaga o pedido original.
- Uma posição dourada deixa de contar entre as seis posições abertas do comprador. A compra original permanece rastreável no livro de pedidos do laboratório.

## Implementação atual

- Os snapshots do motor guardam os estados de adesão.
- Serviço de ativação `AdesoesPosicoesDemoSQLite` exige sessão autenticada, versão dos termos, aceite expresso e identificador fictício. O número não é retornado nas consultas.
- A API do escritório oferece `POST /api/laboratorio/participante/ativar-posicoes` apenas no servidor local.
- O mapa pessoal apresenta a cor de cada posição sem expor identidade ou contato dos outros clientes.
- O botão **Testar entrada no tabuleiro** usa uma API exclusivamente administrativa para simular a seleção inicial e observar a transição de azul para dourado.
- Ainda não existe checkout/recebimento real. O acionamento do verificador de compras segue limitado aos testes internos.
- A transferência de titularidade operacional e a previsão de destinos de ciclo continuam demonstrações do motor, sem repasse de dinheiro. O registro `entradaPelaVaga6Em` identifica o momento da passagem; posições assumidas por falta de aceite recebem `motivoAssuncao=SEM_CPF_E_TERMOS_NA_ENTRADA_VAGA_6`. CPF e termos aceitos depois desse momento não devolvem a posição dourada.

## Testes

`test/adesao-cores-tabuleiro-demo.test.js`,
`test/adesao-participante-http-demo.test.js`,
`test/admin-preparar-tabuleiro-cores-demo.test.js`,
`test/entrada-vaga-6-azul-dourado.test.js`.

- Nenhum bônus é gerado por indicação anterior à aceitação dos termos; o link, por sua vez, continua liberado pela primeira compra de qualquer valor.\n\n## Próximas integrações

Cadastrar telefone no fluxo de entrada, conectar a compra real ao verificador de pagamento e definir políticas de versionamento de termos para produção; manter a vista pública do escritório limitada à própria sessão.
