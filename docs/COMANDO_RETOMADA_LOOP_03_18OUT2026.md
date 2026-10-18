> **ATENÇÃO — DOCUMENTO HISTÓRICO (18/10/2026).** Registro mantido apenas para rastreabilidade; não é fonte de regras vigentes. Consulte [`COMANDO_MESTRE_LOOP_03_CONTINUIDADE.md`](./COMANDO_MESTRE_LOOP_03_CONTINUIDADE.md) e [`ISOLAMENTO_PROTOTIPOS_ANTIGOS_LOOP_03.md`](./ISOLAMENTO_PROTOTIPOS_ANTIGOS_LOOP_03.md). Regras V5/cinco posições e promoções por titular foram substituídas por V6/seis posições e indicação atribuída por posição; a Fila A tem trava escalonada por titular. Não utilizar este texto como especificação para novos códigos.

# COMANDO PARA O PRÓXIMO CHAT — LOOP 0.3 / V6 — 18/10/2026

**01, retome exatamente daqui.** Somos parceiros no desenvolvimento há muitas conversas. Não reinicie, não redesenhe telas aprovadas, não troque a modelagem financeira e não me peça para repetir decisões documentadas.

## Fontes e estado GitHub
- Repositório: `jjinvest/loop-app`.
- Trabalhar APENAS na branch `fix/teste-escrita-catraca-20261014`, PR rascunho #1. Não fazer merge, deploy, pagamentos reais, saques ou habilitar dados sensíveis reais sem minha autorização.
- Antes de mexer no código, buscar HEAD atual e LER INTEGRALMENTE `docs/DIARIO_DECISOES_LOOP_03.md`, `docs/AUDITORIA_PONTAS_LOOP_03_18OUT2026.md`, `docs/COMANDO_RETOMADA_LOOP_03_18OUT2026.md`. Na Biblioteca, ler também `LOOP_03_COMANDO_CONTINUIDADE_18OUT2026.md` (material anterior e por isso sujeito às últimas correções).
- HEAD antes desta atualização documental: `9d314e47ab76fe0d51d09050862c0c0db8e8f22a`. Workflow geral **429/429 testes aprovados** em `39153491299`; navegador celular/computador aprovado em `39153491317`. Depois do commit documental, conferir os checks da última revisão e não confundir testes com prontidão de produção.
- Imagens de referência aprovadas e CONGELADAS, pacote da Biblioteca `LOOP_03_PACOTE_NOVO_CHAT_18OUT2026.zip`: `01_TABULEIRO_CLIENTE_APROVADO.png`, `02_ESCRITORIO_VIRTUAL_APROVADO.png`, `03_MINHAS_POSICOES_APROVADO.png`, `04_MINHA_EQUIPE_APROVADO.png`; vitrine artística `05_VITRINE_AKITEMM_ANIMADA.webp`. Não trocar screenshot técnico pela arte aprovada. Não mudar cabeçalhos, ícones nem áreas fora do escopo.

## Regra de fila / ciclo e catraca (CRÍTICA)
- Cada pessoa até SEIS posições compradas, cada uma independente e confirmada individualmente; CPF fictício/aceite de termos na primeira confirmação de posição, sem autoativação de todas.
- Fila B é FIFO por número da posição, SEM nomes nem contagens de indicação. Posições azuis pendentes só na B; se chegarem ao Tabuleiro pela B ainda não confirmadas, viram douradas da empresa AO ENTRAR na vaga 6, conservando ID e sem nova cobrança (a compra original já existiu).
- Fila A tem prioridade pela contagem de indicações confirmadas atribuídas EXPRESSAMENTE ÀQUELA POSIÇÃO, e não pelo total do link/conta; desempate cronológico. Uma posição de cada titular na A por vez; trava libera disputa de nova posição quando a anterior já estiver no Tabuleiro, por padrão na vaga 6 (configuração administrativa auditada).
- O mesmo titular PODE ter outra posição entrando via FIFO B e várias no Tabuleiro. Alternância 3A:1B quando as duas filas estão alimentadas; não nivelar ganhos, apenas evitar monopolização simultânea da A.
- Convidado ativo/validado é vinculado imutável, único e idempotente a exatamente uma posição ativa escolhida MANUALMENTE pelo titular. Em Minha Rede/Equipe, CONTADOR TOTAL não diminui; POSIÇÕES A DISTRIBUIR diminui com alocação manual. Nenhuma distribuição automática.
- Visual Fila A: bola amarela com A branca dentro, #ID, número de indicações DA POSIÇÃO à direita, bonequinho amarelo; B: bola branca, letra B preta, #ID; dourada: sem letra.
- Tabuleiro: centro + seis vagas periféricas, entrada na 6, seis eventos do ciclo e destinações de caixa conforme motor. **A CATRACA É SEPARADA DO REGISTRO DE VENDAS**: compras/pagamentos confirmados/posições qualificadas/filas continuam normalmente quando giros estão PAUSADOS. Apenas giro necessita liberação START, limite e autorização do administrador, além de cobertura demonstrativa do caixa central; não girar automaticamente a cada nova compra. Com caixa insuficiente, reverter tentativa de giro sem destruir vendas ou mudar fila. Teste `test/catraca-autorizacao-independente-da-compra-v6.test.js`, 12 compras com pausa e seis durante segunda pausa, limite e idempotência. Administrador controla ritmo humano sem inventar dinheiro ou giros.

## LOOP é o rosto principal. AKITEMM é loja separada comercialmente
- LOOP = escritório, posições, filas, redes, ciclos e controle de catraca. AKITEMM = aba/atalho que ABRE PÁGINA PRÓPRIA, bonita e comercial, com fotos, textos, produtos, vídeos demonstrativos quando couber, preços e oferta. Não transformar toda a navegação no visual de e-commerce. Marca AKITEMM não é o motor do LOOP.
- O idealizador adquiriu uma franquia para integração futura por API e **não quer manter estoque próprio grande/receber mercadorias**. **Fornecedor exato, credenciais, contrato e endpoints não foram fornecidos; nenhuma integração real pode ser presumida.** Desenho final da loja e essa API ficam para conversar depois.
- Produtos CINZA: venda comum, nenhuma posição nem valor na conta elegível. VERDE: compra elegível; somar itens VERDES de produtos diferentes NO MESMO pedido (exemplo R$180 + R$300 = R$480 elegíveis), respeitar mínimos por item e referência vigente, no máximo UMA posição por pedido comum, não por item nem múltiplo de R$250. CINZA não entra na soma.
- DOURADO+ROXO: promoção especial manual, temporária e datada; admin decide mínimos de unidades e 1 a 6 posições, podendo distinguir claramente multiposições na vitrine, com tarja PROMOÇÃO ESPECIAL. Não criar pacote permanente de produto. Pedidos guardam snapshot de condições, fim do evento não reescreve compra anterior. Regras de sustentabilidade/custos precisam ser conferidas.
- Bordas suavemente ANIMADAS nas duas categorias com LOOP: VERDE ~10s por volta e DOURADO/ROXO ~8s por volta, adaptáveis a celular, suporte a movimento reduzido. CINZA parado. A cor especial NÃO é vermelha. Ajustes estéticos futuros apenas após o confere da arte.

## Financeiro (simulador, não dinheiro bancário real)
- CAIXA CENTRAL (`LOOP_CENTRO`): reservado às obrigações do Tabuleiro com os participantes; não financiar bônus ou douradas manuais.
- SEGUNDO CAIXA (`LOOP_DIREITA`): saldo BRUTO distinto do LIVRE. Deduzir provisões de comissão por indicação, douradas manuais e solicitações de movimentação administrativa pendentes. Mostrar detalhamento no painel de laboratório, sem usar o mesmo dinheiro duas vezes.
- Bônus padrão de indicação após compra/validação confirmada: 10% sobre referência R$250 = R$25, NÃO precisa aguardar centro/giro. Saque mínimo previsto R$25, verificação em até 24h com possível liberação antes, MAS laboratório não envia Pix, não prova pagamento real. Campanhas de porcentagem acima do piso são regras administrativas separadas quando elegíveis.
- Dourada criada MANUALMENTE pela empresa só surge depois de comprometer a referência vigente (ex. R$250) do SEGUNDO caixa, com idempotência, auditoria e bloqueio sem saldo, no SQLite. É compromisso interno: NÃO é receita nova e NÃO é comprovante bancário. Douradas resultantes de azuis previamente compradas não são cobradas duas vezes. Verificar `test/disponibilidade-caixa2-integracao-v6.test.js`, `test/dourada-manual-auditoria-pontas-loop-v6.test.js`, controles `src/domain/disponibilidade-cofres-v6-demo-sqlite.js`.

## Aba e visual
- Menu do cliente: Escritório Virtual → Tabuleiro → Minhas Posições → Rede e Equipe (Minha Equipe) → Financeiro → AKITEMM. NÃO existe menu separado Minhas Ativações. Em Minhas Posições ficam seis quadros, confirmação individual, status vermelho da posição própria/azul pendente na B; escritório com seleções coerentes #ID/6. Evitar nomes em filas. Três pontinhos em Minha Equipe, sem distribuir automaticamente.
- Quatro artes originais mandam na identidade cósmica roxa, ouro e iluminação. Três abas encaminhadas ainda exigem pequenos ajustes do idealizador; outras telas a estabelecer. Não declarar a estética final aprovada por teste browser. Áreas não pedidas ficam intactas.

## A FOTO COM QUATRO PENDÊNCIAS — PRÓXIMO ASSUNTO A RETOMAR
1. Pacotes de cinco/seis posições: **RESOLVIDO** por evento temporário manual de loja, inclusive 1–6 posições, sem pacotes comuns permanentes; identidade dourado/roxo.
2. **PRÓXIMA PENDÊNCIA PARA DECIDIR COM O IDEALIZADOR: SEPARAÇÃO DOS PROTÓTIPOS ANTIGOS**, sem apagar dados/testes valiosos nem ligar motor legado ao V6 principal.
3. Controles antifraude, identidade, multi-contas, integridade, sustentabilidade e revisão legal/regulatória antes de produção.
4. Acabamento visual fino dos menus e abas conforme as artes aprovadas.
**Não avançar sozinho no item 3 ou 4 nem presumir aprovação do usuário.** Há outras integrações e a API da franquia futura, mas o próximo trabalho conjunto é o item 2.

## Como proceder
1. Ler tudo e consultar HEAD/CI mais recente. Confirmar em duas linhas a retomada, sem pedir ao usuário para reapresentar todo o histórico.
2. Apresentar de forma simples a segunda pendência e propor separação segura e gradual de motor legado, rotas e testes. Pedir aprovação para mudanças destrutivas ou de produção, nunca apagar sem análise.
3. Continuar executando no ramo dedicado, registrar commits e testes reais; nunca dizer '100% pronto para pagamentos reais'. Distinguir regra aprovada, código, testes e pendências.
4. Responder em português brasileiro no estilo direto/parceiro, sem mudar a identidade do LOOP nem suas decisões consolidadas.
