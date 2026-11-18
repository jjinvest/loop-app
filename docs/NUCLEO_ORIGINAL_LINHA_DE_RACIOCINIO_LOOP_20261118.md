# NÚCLEO ORIGINAL DO LOOP 3.0 + AKITEMM
**Versão de continuidade: 18/11/2026 — interpretação operacional da ideia aprovada pelo proprietário, não um desenho de outra plataforma.**

## A regra acima do código
**A ideia original do proprietário é a fonte de verdade do produto.** Código, telas, registros, documentos antigos, testes e ambiente publicado são apenas implementações e evidências que PRECISAM SER CONFRONTADAS com ela; não se deve tomar o que está implementado como correto só porque já existe. Quando algo divergir, separar de modo explícito: **REGRA DO PROPRIETÁRIO** / **IMPLEMENTAÇÃO EXISTENTE** / **DIVERGÊNCIA** / **CORREÇÃO** / **EVIDÊNCIA**. Nunca reinterpretar regra para combinar com a implementação atual.

Não construir de novo; não abrir uma segunda plataforma. A **OBRA ORIGINAL** é o repositório e seus dados reais/históricos existentes. A **LINHA PARALELA DE RACIOCÍNIO** registra por que cada peça foi construída, como liga a anterior, por onde passa a informação, o que está comprovado e o que falta. A linha de raciocínio deve permanecer atualizada em GitHub e vinculada ao código e à operação. Ela começa com a ideia original, **não** com a metade do código encontrada em novembro.

O 01 é responsável por compreender, construir, integrar, verificar e atualizar a continuidade. Codex/Claude podem ajudar quando escolhidos; não são necessários para compensar falta de continuidade do 01. Revisão de outra IA é opcional por decisão do proprietário, e nunca pode ser alegada se não aconteceu.

## O mecanismo original — um único fio causal
```text
PESSOA ENTRA POR LINK / LOJA AKITEMM
  → CADASTRO ÚNICO com nick e indicação correta
  → VITRINE DE PRODUTOS com fotos, preço e cor/regra publicados pelo operador
  → PEDIDO identificado e persistido na conta do comprador
  → PAGAMENTO comprovado e conciliado pelo PSP real (GATE EXTERNO)
  → CLASSIFICAÇÃO congelada do pedido (cinza / verde / dourado / roxo)
  → QUALIFICAÇÃO: gera 0, 1 ou N posições legítimas, sem duplicar o pedido
  → FILA: cada posição elegível entra em B, podendo ser promovida para A
  → MOTOR DAS FILAS: ordena todas as posições com prioridade A:B = 3:1
  → EVENTO DE VENDA comprovado: alimenta UMA LUZ do ciclo, nunca uma luz fictícia
  → CATRACA DAS LUZES: seis eventos distintos compõem um ciclo
  → CATRACA DAS PESSOAS: quando autorizada, move centro e seis periféricas
  → REGISTROS/COFRES: contabilização condicionada ao evento e à origem financeira
  → ESCRITÓRIO DO CLIENTE + FINANCEIRO + OPERADOR: leem a MESMA história
```

### 1. Loja e incentivo comercial
- AKITEMM é a loja ligada ao LOOP. Uma compra qualquer pode ativar o link de indicação, mas **não** necessariamente cria posição; posição exige cumprimento da regra de qualificação.
- **CINZA:** não qualifica.
- **VERDE:** por pedido que atingir a base elegível de R$250 em produtos verdes, no máximo **uma** posição verde para aquele carrinho; não multiplicar pela quantidade de verdes.
- **DOURADO DE PRODUTO:** pode gerar uma posição por unidade elegível conforme classificação comercial congelada do produto/pedido; não confundir com **posição DOURADA DA EMPRESA** originada de azul sem aceite.
- **ROXO:** posições conforme pacote/combinação/unidade configurada no anúncio, inclusive combos/eventos; não restringir roxo exclusivamente a eventos. Combos também podem existir em dourado. Exemplo de pacote especial: cinco posições; não aplicar isso a um produto qualquer por aproximação.
- Carrinho misto soma as posições previstas por tipo, observando capacidade e elegibilidade; **pedido e cobrança não são duplicados** para fabricar posições.
- **Uma VENDA elegível é um evento luminoso**, mesmo se dela nascerem várias posições legítimas; seis vendas distintas são necessárias para seis luzes. Nunca criar seis luzes por um lote de seis posições de um único pedido.
- A classificação e o custo no pedido devem permanecer congelados para auditoria, idempotência, reversões e reconciliação. Não inventar fornecedor, custo, preço, pagamento ou lucro.

### 2. Posições, indicação e o MOTOR — filas primeiro, catraca depois
- Uma posição representa o direito operacional condicionado às regras aprovadas; não é dinheiro já creditado nem comprovante de compra inexistente.
- **Até dez posições ativas por titular**, todas podem estar na fila A quando qualificadas para A; máximo de **duas posições no tabuleiro** por titular quando o motor as seleciona.
- A **fila B** é a entrada inicial e segue sua ordem; convite/cadastro indicado, compra elegível e confirmação das condições aplicáveis validam indicação. Um convite pode promover **as posições do indicador** de B para A; ordem e desempate da A levam em conta quantidade de indicações e horário, sem duplicar posições. A alimentação do tabuleiro alterna **3 posições de A para 1 de B**; sem A, B alimenta. Posições temporariamente impedidas aguardam, sem paralisar as demais.
- O MOTOR é a fila organizada, alimentada por vendas/indicações. A catraca executa movimentos sobre o estado do motor. **Pausar a catraca jamais pausa cadastro, vendas ou inclusão válida nas filas.** Sem vendas qualificadas, não se fabricam posições.
- **AZUL pendente de CPF/aceite individual:** circula normalmente em B e pode ir para A. A falta de aceite NÃO bloqueia a fila, o motor nem a catraca. **Ao entrar pela vaga 6**, se ainda pendente, converte-se em posição dourada operacional da empresa, sem apagar histórico ou reutilizar ID. Aceite depois da conversão não desfaz o evento. O azul confirmado antes da vaga 6 permanece do titular conforme regras. Individualizar aceite para cada posição, inclusive pacotes.
- Diferenciar cor comercial do produto (verde/dourado/roxo/cinza) de cor/estado da **posição** (cadastro, pendência, azul, verde, dourada de empresa).

### 3. Tabuleiro e DUAS catracas conectadas, não uma só
- Tabuleiro: **um centro + seis vagas periféricas**, entrada na **vaga 6**, movimento **6→5→4→3→2→1→centro**, centro anterior sai; respeitar ordem e limite de dois por titular. Não voltar à antiga versão de cinco vagas.
- **Catraca das luzes / financeira:** cada venda elegível, já validada pelo mecanismo de prova de origem, pode gerar **um evento luminoso único por pedido**, consumido conforme política do temporizador/operador. Luzes: roxo/preto/roxo/preto/roxo/preto, seis eventos por ciclo. A cada luz, livro contábil registra obrigação/provisão segundo centro, destino e prova comercial. **Provisão não significa Pix executado, saldo liberado nem crédito imediato.**
- **Catraca das pessoas / física:** ao completar seis luzes, fica habilitado **um** giro físico. O giro aguarda permissão da agenda/modo/operador; quando ocorre, move as posições e zera só as luzes da nova rodada, sem regravar as seis obrigações que já foram contabilizadas. Uma posição pode permanecer no centro durante as seis luzes.
- **A agenda regula a execução e a emissão de luzes, mas não cria vendas**. Modos NATURAL, AGENDADA, MANUAL e STOP conforme regras consolidadas; metas/intervalos configuráveis sem teto artificial de dez giros/ciclos, e sem vender posição pelo relógio. O modo fechado não apaga a fila. Um pedido cancelado/inválido não congela os demais titulares.
- **Centro cliente x centro dourado da empresa:** centros e destinos de cofres diferem; em ciclo novo de centro dourado, os seis eventos contábeis pertencem integralmente ao cofre douradas, sem debitar caixa artificialmente por criação manual de posições douradas. As regras detalhadas de rateio de centro cliente e cofres ficam vinculadas às continuidades 275–281 do HUB; implementação não pode recalcular retroativamente histórico por regra nova.
- Saques, repasses bancários e dinheiro real dependem de reconciliação PSP/banco, lastro, documentos/KYC, reserva e autorização; desligar um PSP não deve apagar fila, posição ou histórico. A abertura pública não foi autorizada.

### 4. A mesma pessoa e as mesmas informações em todas as telas
- **Uma identidade** e uma história: `/loja/NICK` e `/escritorio/NICK` preservam atribuição e levam à mesma pessoa. Nick de 1–12 letras conforme regra mais recente; o formulário põe telefone antes de senha/confirmar senha. Admin e operador usam acesso segregado, sem tornar cliente operador.
- A experiência possui escritório do cliente, tabuleiro, posições, rede, financeiro, loja AKITEMM, pedidos e o operador; **não recriar telas paralelas** nem repetir menus. Cliente vê dados de sua própria conta, sem outra pessoa ou dados de ensaio. Operador edita catálogo, fotos e configurações com permissão; não há fotos inertes se operador autenticado. Capacidade visual de 10 abas × 40 quadradinhos = **400 espaços**, que NÃO significa 400 produtos já publicados.
- **INFORMAÇÃO DO PROPRIETÁRIO em 18/11/2026:** **ZERO produtos foram cadastrados por ele na loja**. Ele só fará o primeiro cadastro e upload quando o operador estiver integrado e funcionando. As quatro mercadorias `curso-mobile-100`, `curso-mobile-150`, `curso-cinza-30` e `curso-especial-600` existem EXCLUSIVAMENTE como fixtures sintéticas no teste de navegador local, não são mercadorias da AKITEMM e nunca devem aparecer como estoque, pedido ou catálogo publicado. **20 quadradinhos visíveis da aba** são capacidade vazia, não 20 produtos. Não dizer que existem produtos reais, pagamento, posição ou venda antes de observar fatos no banco definitivo e no sistema publicado.
- Visual **PREVIAMENTE APROVADO está congelado** (24 HTML/CSS sob proteção Git/CI). O defeito visual visto em 18/11 foi recuperado ao restabelecer os estilos; não retocar layout para corrigir falha de backend ou de carregamento. A marca oficial é LOOP 3.0, paleta preto/dourado/roxo/prata/verde, sem elementos de laboratório na operação de clientes.
- A abertura ao público precisa conferir em celular real o mesmo layout e dados que no computador, além das permissões e percurso de compra. Uma tela bonita e um teste verde não certificam operação financeira.

### 5. Verdade atual, não confundir com intenção nem com simulador
**Estado verificado nos arquivos da branch de integração e no Railway em 18/11/2026:**
| Conexão necessária | Evidência no código | Situação com base nos registros disponíveis |
|---|---|---|
| Site público → mesma identidade definitiva | `scripts/servidor-escritorio-preview-railway.js` tem opção `LOOP_PREVIEW_PUBLICO_CADASTRO_REAL`, porém domínio atual `akitemmloop.com.br` serve o gateway que ainda monta `src/candidato/servidor-loja-escritorio-candidato.js` com SQLite `/dados-preview` | **PENDENTE de corte comprovado**, ainda que os dois serviços estejam online |
| Identidade real → operador e motor no mesmo SQLite | `scripts/iniciar-identidade-real-loop.js`, `src/producao/servidor-identidade-loop.js`, `src/producao/motor-loop-integrado-sqlite.js` | Estrutura integrada **em código**, não equivale a cadastro público ou vendas reais liberadas |
| Testes de negócio → motor de produção com PSP comprovado | Motor real chama `SimuladorLoop` para estado de filas; métodos de escrita `Ensaio` bloqueados por `NODE_ENV=production`; evento comercial pode ficar `AGUARDANDO_CONCILIACAO` | **PENDENTE**. Não retirar bloqueio sem substituir origem por evento comercial real verificado |
| Vitrine real → foto → pedido → motor | `/api/loja/catalogo`, `/api/loja/produtos/:id/foto/:posicao`, `/api/loja/pedidos` existem em servidor real, mas checkout real bloqueado | **Parcial**; exigir prova de mesmo acervo, publicação do operador e passagem de pedido ao motor |
| Vilela e Taísa → demais registros | O proprietário reconhece somente Vilela e Taísa; inventário anterior indicou 9 registros migrados, 7 fora da rede comprovada | **7 registros indevidos pendentes de conciliação/remoção**, sem classificá-los como clientes. Migração automática desativada no Railway em 18/11. O código deve também proibir reimportação por qualquer flag |
| Domínio `loop.com.br` | Consulta externa histórica apontava terceiro titular; titularidade atual no Registro.br não foi confirmada | **PENDENTE COM PROPRIETÁRIO**; não mudar DNS. Não confundir com o endereço ativo `akitemmloop.com.br` |
| PSP/bancos/fornecedor/CNPJ/jurídico | Celcoin/Asaas/bancos e fornecedor ainda sem ativação comercial comprovada | **PENDÊNCIA EXTERNA**; não anunciar dinheiro real, caixa liquidado ou lançamento público |

**A tabela registra ESTADO/PROVA, não um plano de recomeço.** Em cada execução, conferir HEAD, implementação e estado efetivo do Railway; atualizar a situação sem trocar a regra original.

### 6. Proteção de dados do estágio atual
- Vilela e Taísa são os dois **únicos cadastros reconhecidos como legítimos pelo proprietário** na fase pré-lançamento. Nove linhas no banco não são nove clientes. Registros antigos podem ter dados de pessoa, mas isso não comprova legitimidade comercial.
- Há importação anterior de sete registros fora da rede reconhecida. Desligar a migração `LOOP_PREVIEW_MIGRAR_REAL` e `LOOP_PREVIEW_RECUPERAR_CONTAS_SEM_REFERENCIA` no Railway impede novos envios pelo mecanismo antigo; isso **não remove as sete linhas já importadas**.
- A migração de destino deve falhar fechada se tentar importar identificações avulsas. Antes da limpeza, identificar todas as dependências dos sete IDs, fazer backup criptografado restaurável, comprovar a primeira indicação, e só então executar remoção transacional auditada. **Nunca apagar por contagem, por suposição ou afetar Vilela/Taísa.**
- Sem acesso confirmado ao banco real, não alegar exclusão. Auditoria não destrutiva é a única ação segura enquanto faltar evidência.

## Blocos GRANDES, sempre encaixados
**BLOCO A — NÚCLEO E CUSTÓDIA:** (a) contrato canônico como este; (b) mapa `rota pública → serviço → sessão → banco → domínio → evento`; (c) travas anti-reimportação na origem e destino; (d) auditoria read-only dos sete registros e suas relações; (e) prova de preservação de Vilela/Taísa. **Não inclui exclusão automática nem mudança do site público.**

**BLOCO B — UMA ENTRADA REAL:** (a) login/conta única com operador separado; (b) convite/link no domínio existente; (c) loja e escritório lendo o definitivo; (d) sessões e identidade sem duplicação; (e) migração/remoção dos legados sob custódia; (f) prova navegador/servidor já publicado e recuperação. Só depois do A.

**BLOCO C — COMÉRCIO INTEGRADO:** (a) editor de catálogo/fotos pelo operador; (b) item publicado visível na mesma vitrine; (c) pedido rastreável no mesmo titular; (d) compra classificada e capacidade validada; (e) evento comercial único; (f) falta de PSP retornando pendência VERDADEIRA em vez de inventar pagamento. É o mesmo fluxo B, não outra loja.

**BLOCO D — MOTOR E CATRACAS REAIS:** (a) evento legítimo do pedido promove 0/1/N posições por regra; (b) entrada em B/promoção A e limites; (c) uma luz por venda; (d) seis luzes e giro físico sob agenda; (e) livro dos cofres/caixa separado; (f) operador + escritório lendo exatamente o mesmo estado; (g) reinício/idempotência/concorrência/recuperação, sem dinheiro inventado.

**BLOCO E — EXTERNOS, ESCALA E ABERTURA:** (a) integração homologada PSP, bancos, fornecedor, impostos/obrigações; (b) orçamento operacional e escalabilidade observada; (c) verificação de documentação, KYC e proteção de dados; (d) liberação do acesso público só quando suas dependências foram comprovadas. A meta de lançamento não autoriza pular os gates.

## Protocolo de continuidade entre conversas/agentes
1. Ler **este núcleo**, [issue #4](https://github.com/jjinvest/loop-app/issues/4), [HUB](./HUB_CONTINUIDADE_MARCO_ZERO_07NOV2026.md) e [índice vigente](./LEIA_PRIMEIRO_LOOP_30_INDICE_VIGENTE.md), nesta ordem; preservar histórico anterior como evidência, não como fonte de decisões revogadas.
2. Confirmar branch/HEAD e o commit realmente implantado. **A branch `work/loop-integracao-acoplada-20261118` é de desenvolvimento e NÃO deve publicar automaticamente no Railway.** A branch do serviço em uso é `feature/unificar-escritorio-real-20261105`; proteção obrigatória do visual e do banco.
3. Selecionar o **primeiro bloco ainda não comprovado** e atuar nele de ponta a ponta; não fragmentar em 30 testes ou 30 promessas desconectadas.
4. Entregar a cada bloco um documento curto de **Feito e comprovado / Pendente por causa específica / Próxima conexão**, mais as referências exatas de arquivos, testes direcionados, revisão e plano de rollback.
5. Quando regra original e código divergirem, registrar e corrigir a divergência; **não editar o enunciado do proprietário para fazer o código parecer correto**. O contrato de teste não autoriza simulação financeira em produção.
6. Revisão externa por Codex/Claude fica disponível se o proprietário solicitar; a responsabilidade da continuidade e da qualidade permanece do 01.

## Referências do repositório a manter juntas
- Regras originais e decisões: `docs/COMANDO_MESTRE_LOOP_03_CONTINUIDADE.md` e `docs/LEIA_PRIMEIRO_LOOP_30_INDICE_VIGENTE.md`.
- Alterações recentes da regra de catraca e bola azul: HUB §§ 280, 312, 313, 314, 315 e 316.
- Execução e status: `docs/HUB_CONTINUIDADE_MARCO_ZERO_07NOV2026.md`, issue #4, GitHub HEAD, Railway serviço/volume/ambiente.
- UI protegida: `docs/REGRA_IMUTABILIDADE_TELAS_LOOP.md` + testes de contrato; nunca alterar 24 arquivos congelados sem pedido específico.
