# LOOP 3.0 / AKITEMM — Vitrine aprovada + Loja + Cliente + Administrador

Data: 04/11/2026. Escopo: **homologação LOCAL somente**, PR #1 DRAFT. Não foi habilitado checkout comercial, pagamentos reais, giro, bônus, saques ou criação de posições no motor.

## Fonte unificada e visual aprovado
- A rota local autenticada `/staging/loja` reutiliza a **mesma estrutura HTML e folhas de estilo** da vitrine AKITEMM aprovada em `src/laboratorio/loja-cliente-demo.html` e `src/laboratorio/loja-cliente-demo.css`. Evita redesenhar as telas já aprovadas. Os assets são oferecidos em caminhos locais de ensaio sem alterar a vitrine pública original.
- O JS original da vitrine é adaptado **apenas na cópia de ensaio servida por esta rota**, para compartilhar CSRF da sessão candidata e a chave idempotente do pedido, sinalizar evento visual sem prometer posições e preservar navegação local. O arquivo original não é substituído.
- A vitrine usa exatamente o `CatalogoAdminCandidatoSQLite` que alimenta o Escritório do Cliente, as cotações e o preparo de pré-pedidos. Produtos publicados no Administrador entram no catálogo; rascunhos não aparecem. Pedido antigo preserva fotografia e valor; preço novo exige cotação nova.
- O mesmo cookie de sessão do candidato autoriza as consultas e cria pré-pedidos de laboratório (nunca Pix, entrega comercial, posição real nem ativo financeiro). O Escritório do Cliente recebe esses pré-pedidos em Meus Pedidos. A vitrine encaminha visitantes sem sessão para `/staging/cliente`; uma ligação foi adicionada ao painel do cliente.

## Cores administráveis, somente sinalização
- O Escritório do Administrador ganhou campos por produto para CINZA (**compra comum sem LOOP**), VERDE (**sinalização de produto que pode qualificar segundo regras vigentes**) e EVENTO (**dourado/roxo; destaque visual de evento especial**).
- Quantidade mínima de unidades é um campo validado de 1 a 50; cinza exige 1, sem regra especial. O catálogo só gera **classificação visual** na vitrine, não atribui `eventoId`, `posicoesPorPedidoLoop` nem habilita o motor.
- A classificação é armazenada no mesmo SQLite em `akitemm_vitrine_sinalizacao_staging`, com revisão otimista, histórico append-only e controles de operador. As rotas `GET/PATCH /staging/escritorio-unificado/sinalizacao/:id` exigem autorização do operador para ler e alterar, e mudanças de revisão divergente são recusadas.
- O script da vitrine mostra a borda dourado/roxa para classe EVENTO e um aviso explícito de **benefícios reais desativados**; nunca inventa período, posições, premiações ou pagamentos.
- **A regra comercial definitiva de elegibilidade NÃO nasce deste rótulo visual**. Antes de produção é necessário unificar essa classificação com o motor de ofertas aprovado, verificar marcos jurídicos e autorizações, evitar inconsistências de motor e apresentação.

## Segurança e limites
- Somente tráfego loopback, servidor candidato proibido com `NODE_ENV=production`; o serviço principal não monta essas rotas.
- POST de pré-pedido exige sessão por cookie + token CSRF do titular + marcador do laboratório + chave idempotente, com cotação calculada do lado servidor e revalidação antes do snapshot. Replays retornam o mesmo pré-pedido. O servidor recusa `participarLoop` imposto pelo navegador e não concede posições.
- Entregas reais, avaliações e links de divulgação são recusados ou marcados indisponíveis; os dados fictícios da vitrine não passam a ser vendas.
- O ambiente público principal mantém seus caminhos e comportamentos existentes; a consolidação aqui é da **prévia de homologação**, não aprovação para produção.

## Evidências e pendências
Foram configurados testes de integração (autenticação, sessão, catálogo, classificação, histórico, idempotência, ausência de pagamento real, separação entre clientes, snapshots imutáveis) e navegador com capturas PC/celular da vitrine, cliente e administrador. **Consultar a execução do CI do SHA efetivamente modificado antes de declarar sucesso**.
Pendentes para o Marco Zero: integração única com o motor comercial de ofertas, habilitação de pagamento com Asaas homologado, controle de posições e saques, transições de filas/catraca com limites, segurança e recuperação de infraestrutura, validações externas e análise jurídica independente.


**Evidências finais da seção 196, 04/11/2026:**
- [Segurança, integração e bloqueio financeiro — SUCCESS](https://github.com/jjinvest/loop-app/actions/runs/41811514601).
- [Navegador real PC + celular, loja visual aprovada, cores, produtos administrados e pré-pedidos sincronizados ao Escritório do Cliente — SUCCESS](https://github.com/jjinvest/loop-app/actions/runs/41811862493).
- [Artefatos das capturas reais PC/celular (vitrine, cliente e administrador)](https://github.com/jjinvest/loop-app/actions/runs/41811862493/artifacts/13311999734).
- Evidência do fluxo em banco SQLite e do teste automatizado: sucesso, sem falhas.
- Prova permanece **somente de homologação local**, NÃO representa GO do Marco Zero, deploy comercial ou movimentação financeira real.
