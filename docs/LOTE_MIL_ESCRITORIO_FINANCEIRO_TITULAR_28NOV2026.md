# Lote de mil — Escritório e Financeiro por titular — 28/11/2026

## Decisão do proprietário

O teste precisa percorrer o mesmo motor, relógio, fila, eventos e livro, com a participação e o bônus visíveis no escritório do destinatário correto. Ele fará a futura limpeza e comandará START. Nenhuma dessas operações é executada por esta missão.

## Conexão implementada

O lote já registra recebimentos, eventos e bônus por número de posição. Faltava associar explicitamente uma posição desse lote à conta de um participante para observar seus lançamentos nas telas privadas. Não associar por semelhança de nome nem presumir que P001 é a conta da Thaiza.

Na ficha existente de Minha Equipe/Cadastros, o operador localiza o cadastro correto e informa o ID da posição do lote a acompanhar. A rota administrativa exige sessão, origem, CSRF, conta existente, posição confirmada e catraca parada. A associação é persistida no próprio SQLite do lote, não no banco de contas. Até dez posições por titular; empresa e azul pendente são recusadas. Uma posição não pode ser reatribuída a outro titular. Repetir a operação é idempotente.

As rotas existentes de estado, Financeiro e Histórico consultam essa associação a partir do titular da sessão. A ficha financeira de Minha Equipe consulta a mesma projeção. Eventos roxos do ID associado entram na participação; bônus pagos e pendentes vêm das indicações desse ID e da reserva. Os LEDs, centros, filas e contadores do cliente associado consultam o mesmo estado persistido usado pelo operador. O apelido exibido na posição própria vem da sessão; nenhuma identidade de outra conta é exposta.

Financeiro → participação de lucro e bônus. Histórico de ganhos → cada lançamento com valor, ID da posição e referência única do lote. A atualização automática renova dados enquanto a aba estiver aberta. Sem meta, Luzes de hoje apresenta a quantidade, sem denominador zero.

## Como conferir no sistema publicado

1. Manter a catraca pausada.
2. Operador → Minha Equipe/Cadastros → localizar a conta correta pelo nick/nome.
3. Na ficha, informar o número da posição confirmada escolhida no lote e clicar Vincular acompanhamento. Isso não muda a prioridade nem a ordem da fila e não executa START.
4. Entrar no escritório dessa mesma conta. Distribuição acompanha o lote; Financeiro e Histórico de ganhos mostram apenas os lançamentos das posições associadas ao titular.
5. Somente o proprietário libera START para o teste público. Observar cada evento e, no sexto, o centro concluído e o próximo da fila.
6. Ao finalizar, pausar e usar Encerrar acompanhamento desta posição na ficha. Repetir para as demais posições associadas. O escritório volta a consultar seu fluxo comercial habitual; o livro e a associação histórica permanecem preservados. Uma nova geração do lote não herda automaticamente associações da anterior.

## Proteções e limites

Não cria conta, compra, posição comercial, crédito no livro financeiro real, saque ou pagamento externo. A observação do lote é uma fonte identificada separadamente nas APIs; nunca é somada silenciosamente ao saldo comercial. Nenhuma trava financeira é removida. Todas as consultas usam somente o titular autenticado, e a API não aceita titularId arbitrário. Não houve associação da conta publicada da Thaiza por suposição. A escolha do cadastro e do ID precisa ser explícita na ficha administrativa.

## Evidências

Testes HTTP com as classes reais, bancos isolados e duas contas locais: seis eventos da primeira posição geram três participações somando R$750; bônus vêm da reserva; Financeiro, Histórico e ficha do operador apresentam o mesmo livro; a outra conta não recebe participação alheia. Cobertos origem/CSRF, cliente sem privilégio, conta ausente, azul, empresa, associação imutável, limite de dez, reinício, leitura sem gravação e retorno ao normal sem apagar registros. Conferência de navegador em PC e celular verifica os contadores, participação, histórico e controles de saque inalterados.

Os testes não são prova de START publicado. Publicação e conferência dos arquivos serão registradas no PR correspondente. O proprietário realiza o teste com seu comando.
