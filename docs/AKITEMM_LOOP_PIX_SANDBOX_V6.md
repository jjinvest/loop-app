# AKITEMM + LOOP: integração Pix exclusivamente sandbox (fase 1)

## Uma única plataforma, duas abas, dois links

**LOOP é a plataforma**. **AKITEMM é a aba comercial** dentro dela. O **Escritório LOOP é a experiência principal** de cada conta (filas, tabuleiro, contemplaçōes concluídas, extrato e saques). A AKITEMM exibe catálogo, carrinho, pedidos e entrega. Identidade do usuário é compartilhada, mas os livros financeiros são separados.

Cada participante recebe **dois links próprios personalizáveis**: `/loja/convite/{codigo}/{apelido}` e `/escritorio/convite/{codigo}/{apelido}`. Os dois registram o MESMO indicador pela parte imutável `{codigo}`; o apelido do participante pode ser trocado sem alterar rastreio. Por compatibilidade, `/loja-vilela/...` e `/escritorio-vilela/...` antigos continuam aceitos, mas Vilela não é a marca da loja.

## Provedor de teste escolhido

**Asaas Sandbox**, sem dinheiro real. Fontes oficiais:

- https://docs.asaas.com/reference/criar-nova-cobranca (POST `/v3/payments`, customer, PIX, value, dueDate, externalReference).
- https://docs.asaas.com/reference/recuperar-uma-unica-cobranca (GET `/v3/payments/{id}`).
- https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix (Pix dinâmico; ainda NÃO aparece no checkout público).

O adaptador `src/domain/asaas-sandbox-loja-v6.js` usa **apenas** `https://api-sandbox.asaas.com/v3`, com chave de TESTE injetada do lado servidor. O domínio não é configurável por cliente, administrador ou variável de ambiente. Faz requisições de cobrança e consulta com limites de tempo e validação de ID/valor.

`src/domain/cobrancas-akitemm-asaas-sandbox-v6.js` registra uma intenção por pedido comercial, garantindo origem PDF ou CARRINHO e preço congelado exclusivamente no SQLite da loja. Não usa preço vindo do navegador. Após reserva local, solicita criação remota. Se a rede falhar, o pedido fica como `CRIACAO_INDETERMINADA_SANDBOX`: uma segunda chamada NÃO gera nova cobrança; o operador precisa localizar eventual cobrança pelo `externalReference` do provedor antes de liberar nova operação.

Consultas de estado (`conferir`) verificam ID da cobrança, valor exato em centavos, referência e tipo Pix com fonte remota. Estados `PENDING`, `CONFIRMED` e `OVERDUE` são pendências; `RECEIVED` e `RECEIVED_IN_CASH` são **recebimentos informados pelo sandbox, não liquidação bancária real**. Reversões informadas prevalecem; um status mais antigo não pode desfazer uma reversão já registrada. O histórico de consultas é imutável.

## Ativação exclusiva do laboratório

- A API de administração `/api/admin/akitemm/sandbox/status` é protegida e informa se a função está habilitada.
- Com o laboratório local desligado ou sem `ASAAS_SANDBOX_API_KEY`, **nenhuma conexão externa é configurada**.
- Em ambiente local de desenvolvimento, o operador pode definir `ASAAS_SANDBOX_API_KEY` **somente no ambiente seguro do servidor** usando uma chave de conta de teste do Asaas. Não enviar segredos no chat, no GitHub ou no frontend.
- POST `/api/admin/akitemm/sandbox/cobrancas`: `{"pedidoId":"...","origem":"PDF","clienteAsaasId":"cus_..."}`; também aceita origem CARRINHO. `clienteAsaasId` é um identificador fictício cadastrado no próprio Asaas Sandbox, não CPF real.
- POST `/api/admin/akitemm/sandbox/cobrancas/:id/conferir` com `{}` reconsulta cobrança no Asaas Sandbox. GET `/api/admin/akitemm/sandbox/cobrancas/:id` exibe status e trilha do teste.
- Não existe checkout Pix público; o cliente não fornece dados bancários nem autoriza recebimento real. Não há webhook externo do Asaas nessa etapa; próxima implementação precisará de autenticação de eventos específica do provedor, deduplicação e reconciliação.

## Bloqueios expressos

Recebimento sandbox **NÃO** confirma pagamento comercial real, **NÃO** cria posição, **NÃO** autoriza entregas reais, **NÃO** transfere R$250 aos cofres do LOOP, **NÃO** completa giros e **NÃO** cria saldo sacável. Financeiro comercial da AKITEMM, três cofres básicos e quarto cofre DOURADAS mantêm razões contábeis distintas. Um pagamento confirmado no sandbox não prova saldo bancário conciliado e não pode autorizar transferência.

## Antes de operar dinheiro real

Concluir escolha contratual de PSP, cadastro e requisitos de produção, criação e verificação de clientes, autorização adequada do titular, tratamento de dados pessoais, webhooks autenticados, baixa realmente liquidada, reconciliação bancaria, estornos e devoluções da AKITEMM, entrega de produtos, proteção contra fraude, infraestrutura e segurança de produção. Separar aporte efetivo R$250 ao LOOP, não inferir a origem do dinheiro pelo evento de venda. Testar Pix de saque e retorno somente com confirmação bancária e limites de obrigação legal. Validar modelo comercial e a legislação aplicável antes de lançamento.

**PR #1 permanece rascunho. Não há conexão com produção nem credenciais reais.**