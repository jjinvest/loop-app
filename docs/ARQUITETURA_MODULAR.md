# Arquitetura modular do LOOP - diretriz de longo prazo

## Principio permanente

**Mudar uma parte nao deve obrigar a reconstruir as outras.**
O projeto foi pensado para evoluir por anos. Esta e uma diretriz de
engenharia, nao uma promessa de que qualquer alteracao futura sera
automaticamente barata ou sem migracoes.

## Modulos e limites

| Modulo | Responsabilidade | Nao deve decidir |
| --- | --- | --- |
| Vitrine/catalogo | Nome, fotos, videos, tipos, preco exibido, descricoes | Se pagamento foi confirmado |
| Cadastro/autenticacao | Identidade e permissoes | Ordem das filas ou destino de valores |
| Pedidos | Registro, status, itens, estornos legalmente exigidos | Politica de prioridade da fila |
| Pagamentos | Confirmacao por provedor confiavel, conciliacao, idempotencia | Logistica ou ordenacao das filas |
| Fornecedores | SKU, disponibilidade, despacho e rastreamento via API autorizada | Contemplacoes ou confirmacao do pagamento |
| Motor das filas | Posicoes por venda valida, prioridade 3A/1B e desempates | Entrega e pagamentos |
| Tabuleiro/catraca | Centro, cinco vagas e giro apos cinco eventos validos | Cadastro e contrato do fornecedor |
| Financeiro/razao | Lancamentos e saldos auditaveis separados | Regras de exibicao da vitrine |
| Administracao | Parametros aprovados e historico de mudancas | Reescrever silenciosamente movimentos antigos |

## Pontos de substituicao ja iniciados

- `RepositorioCatalogoMemoria` oferece `listar()`, `buscar()`,
  `salvar()` e `atualizar()`; a rota de leitura `criarRouterCatalogo()`
  recebe outro repositorio com o contrato `listar()/buscar()`, inclusive
  assincrono, sem modificar o endereco `GET /catalogo`.
- `RepositorioCatalogoSQLite` implementa `listar()/buscar()` para a
  vitrine e `buscarRegistro()/salvar()/atualizar()` para manutencao
  exclusivamente interna em testes. O arquivo SQLite e local, com controle
  de revisao, versao inicial do esquema e gravacao transacional. O
  repositorio em memoria continua como padrao da interface por enquanto.
- O esquema do catalogo SQLite evoluiu de **v1 para v2**, com
  tabela de historico de alteracoes. Criacao e edicao sao registradas
  atomicamente junto ao produto e contam com revisao e data. A migracao
  dos bancos v1 conserva o estado atual e o identifica como `IMPORTADO_V1`,
  sem fabricar dados de edicoes anteriores. Triggers bloqueiam alteracao
  casual do historico, mas nao substituem uma trilha auditavel externa,
  backups e identidade de operadores em producao.
- `produtoParaVitrine()` delimita o contrato publico: produtos
  `RASCUNHO` nao aparecem; campos internos do fornecedor, tokens,
  custos privados e revisoes nunca devem ser copiados para a resposta
  ao cliente. `PUBLICADO` representa apenas visibilidade, nao
  autorizacao para compra ou pagamento.
- O banco de catalogo deve ser **separado** do SQLite do simulador de
  ciclos e mantido fora de `public/` e do Git.
- `RegistroFornecedores` e um registro de **adaptadores v1**. Cada fornecedor
  fornece `consultarEstoque({sku})` e
  `consultarStatus({pedidoParceiroId})`. Substituir um adaptador nao exige
  alterar o banco, o catalogo ou o motor da fila.
- `src/domain/motor-filas.js`, `tabuleiro-loop.js` e `simulador-loop.js`
  ja estao separados. O registro de posicoes deve continuar ligado apenas
  a confirmacao de venda confiavel, nao a clicadas na interface.
- `VinculosFornecedoresSQLite` persiste separadamente o relacionamento
  produto LOOP ↔ fornecedor/SKU com a mesma base SQLite do catalogo.
  O esquema evoluiu de **v2 para v3** com migracao, revisao
  concorrente, desativacao e historico de trocas. Mudar o parceiro
  nao modifica o identificador, preco, fotos nem dados publicos
  do produto. Nao ha envios de pedido nem APIs reais.
- `ImportadorCatalogoSimulado` usa uma extensao **opcional**
  `listarProdutos()` nos adaptadores de fornecedor v1. A previa gera um
  identificador de revisao do lote; a aplicacao recusa lote alterado e
  so insere produtos como rascunho, sem preco, fotos externas ou checkout.
  Importar novamente nao altera o produto ja editado pelo administrador.
  A importacao continua interna e de laboratorio, sem ligacao com API real.
  Os vinculos SKU↔produto persistem no laboratorio
  (`docs/VINCULOS_FORNECEDORES.md`). Para SQLite, a importacao simulada
  cria rascunhos, vinculos e seus historicos **na mesma transacao**.
  Produtos ja cadastrados sao preservados; vinculos ausentes ou trocados
  sao sinalizados para revisao manual. Nao existe sincronizacao real.
- O **painel local de laboratorio** recebeu uma interface de previa de
  importacao: dois fornecedores ficticios, identificacao dos produtos
  novos, confirmacao explicita e retorno dos rascunhos gravados.
  Rotas administrativas isoladas revalidam o hash antes de aplicar
  o lote. `docs/IMPORTACAO_CATALOGO_SIMULADA.md` descreve os limites.
- `PedidosLogisticosSimuladosSQLite` registra estados de entrega,
  ocorrencia, cancelamento, devolucao e reembolso **ficticios**, com
  transicoes controladas e eventos auditaveis. O painel local tem dois
  pedidos predefinidos para consulta e testes de eventos, sem CPF,
  enderecos, valores, pagamento real ou movimentacao de fila.
  A tela usa um banco em memoria, nao duravel entre reinicios.
  Ver `docs/PEDIDOS_LOGISTICOS_SIMULADOS.md`.
- `docs/INTEGRACAO_FORNECEDORES.md` estabelece o fluxo futuro de pedidos
  e o que depende da API real do parceiro.

Estes contratos sao demonstrativos: **nenhum fornecedor foi conectado**,
nenhum pedido real e enviado, nenhum CPF e coletado nesta etapa.

## Regras de evolucao

1. **Contrato e versao:** quando alterar formato de dados ou uma integracao,
   versionar a API e documentar compatibilidade.
2. **Migracao:** mudanças de banco devem acompanhar migracoes reversiveis
   quando viavel, backup testado e plano de recuperacao; nunca assumir
   que o mesmo formato de snapshot servira para sempre.
3. **Parametros em vez de alteracoes espalhadas:** consolidar regras de negocio
   aprovadas em modulos ou politicas versionadas, sem liberar alteracao
   arbitraria de prioridades com ciclos em andamento.
4. **Historico imutavel:** ajustes nao apagam eventos ja ocorridos; registrar
   reversao/compensacao quando juridica e contabilmente aplicavel.
5. **Testes de contrato:** rodar o mesmo conjunto de testes para qualquer
   novo fornecedor, repositorio, provedor financeiro ou estrategia aprovada.
6. **Mudancas progressivas:** ativar novidades primeiro em teste, depois
   em ambiente controlado, com flags e caminho de retorno.
7. **Politicas por data ou versao:** mudancas relevantes precisam identificar
   quais pedidos e ciclos estao sujeitos a quais regras; evitar mudanca
   retroativa silenciosa.
8. **Separacao de credenciais e dados:** tokens de fornecedores, CPFs,
   enderecos e dados financeiros nao entram no codigo, arquivos publicos
   ou logs de desenvolvimento.

## O que ainda falta para cumprir plenamente a diretriz

Os repositorios de filas/tabuleiro ainda usam simulacao e snapshots;
regras de negocio de producao nao sao configuraveis nem aprovadas; nao ha
painel administrativo de producao autenticado, catalogo persistente
definitivo de producao ou despacho real. O painel de laboratorio e seu
historico ainda nao possuem identidade individual do operador.
A arquitetura modular atual e **fundacao para evolucao**, nao garantia
de manutencao futura sem trabalho.
