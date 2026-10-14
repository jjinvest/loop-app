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
- `RegistroFornecedores` e um registro de **adaptadores v1**. Cada fornecedor
  fornece `consultarEstoque({sku})` e
  `consultarStatus({pedidoParceiroId})`. Substituir um adaptador nao exige
  alterar o banco, o catalogo ou o motor da fila.
- `src/domain/motor-filas.js`, `tabuleiro-loop.js` e `simulador-loop.js`
  ja estao separados. O registro de posicoes deve continuar ligado apenas
  a confirmacao de venda confiavel, nao a clicadas na interface.
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
painel administrativo, catalogo persistente definitivo ou despacho real.
A arquitetura modular atual e **fundacao para evolucao**, nao garantia
de manutencao futura sem trabalho.
