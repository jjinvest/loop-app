> **ATUALIZAÇÃO DO LOOP V6 (16/10/2026):** este arquivo preserva decisões anteriores para consulta histórica. A regra vigente no laboratório é **centro + 6 vagas, entrada pela vaga 6, 6 vendas por ciclo (cliente, investimento, cliente, reserva, cliente, investimento), até 6 posições abertas por CPF/conta fictícia, pacote especial de 6, saque mínimo de R$ 25 e taxa de 3% sobre cada saque de bônus ou participação**. Consulte `docs/LOOP_V6_SEIS_VAGAS_SAQUE_25_TAXA_3.md`. Não há saques nem pagamentos reais.

# LOOP — regras de visibilidade e configuracao futura dos escritorios

> Registro de orientacoes do idealizador em 14 e 15/10/2026.
> Estas orientacoes complementam, e NAO revogam, as regras
> previamente definidas de filas, tabuleiro, vendas, ciclo e historico.
> Aparencia, layout definitivo e paleta final ficam para a etapa de acabamento.
> Este arquivo NAO implementa dinheiro, caixas reais, transferencia ou saques.

## 1. Separacao estrutural: cliente e administrador

**Escritorio do participante:** apresenta seu percurso no LOOP,
especialmente o tabuleiro; sua(s) posicao(oes) com numero
original imutavel, fila atual A ou B, situacao propria,
informacoes de seus convites, sua rede, suas compras,
seus pedidos e seus registros individuais, conforme permissoes.
Nao deve exibir contas internas da empresa, caixa total,
gestao de fornecedores, controle da catraca ou configuracao
operacional. O participante nao modifica posicoes ou prioridades.

**Escritorio administrativo:** exclusivo do titular da operacao
e operadores expressamente autorizados, para gerir os
modulos internos, acompanhar dados agregados, indicadores,
registros financeiros e configuracoes futuras.
As alteracoes administrativas devem ser versionadas,
autorizadas e auditadas. Cliente nao ve os controles internos.

**Esclarecimento adicional da loja (15/10/2026):**
o painel administrativo da operacao comercial deve destacar
a sobra/margem comercial BRUTA apos separar o fornecedor
e a parcela referencial do LOOP. Exemplo ja discutido:
R$600 de venda - R$300 de fornecimento - R$100 de
referencia ao LOOP = R$200 brutos antes de impostos,
taxas, garantias, estornos e demais obrigacoes.
Nao tratar isso como lucro liquido ou saldo livre pessoal.

**Registros comerciais e financeiros completos ficam
sob VISUALIZACAO E GESTAO ADMINISTRATIVA**, inclusive
valor total vendido, custo/repasse do fornecedor,
parcela do LOOP, margem bruta, tributos, tarifas,
saldos efetivamente liquidados, compromissos,
reservas, saidas e eventuais retornos. Registros
de auditoria devem ser imutaveis; correcoes sao
novos lancamentos rastreaveis e autorizados,
nao alteracoes escondidas no passado.

O cliente pode acessar SEUS proprios pedidos,
pagamentos, estornos, indicacoes, creditos e
historico individual conforme o modulo aplicavel,
sem acesso a margem comercial e registros gerais.
Essa divisao de permissao vale para consultas,
relatorios, exportacoes e APIs, nao apenas telas.
Ver `docs/ARQUITETURA_FINANCEIRA_CAIXAS_E_SPLIT.md`.

## 2. Identidade permanente da posicao e letra da fila

- **Numero nunca muda**: posicao 200 na fila B e identificada
  para o participante como **200 B**.
- Se uma indicacao validada ocasiona sua promocao, passa a
  ser apresentada como **200 A**, sem renumerar a posicao.
- A letra A/B e um estado exibido, nao parte do identificador
  principal e nem um novo numero da compra.
- A ordem dentro da fila A continua baseada em quantidade de
  indicacoes validas, com desempate pela data em que o
  participante completou a quantidade empatada.
- A selecao segue 3 da A para 1 da B quando ambas existem.
- Cada CPF tem no maximo cinco posicoes ativas simultaneas;
  cada posicao que conclui o ciclo abre capacidade para
  uma nova compra, sem apagar historico.
- Nao alterar a regra do centro, cinco vagas e cinco eventos.

## 3. Exposicao da trajetoria do participante — diretrizes para interface futura

- **Tabuleiro e o destaque principal** da area de participacao.
- A posicao individual aparece inicialmente de modo resumido,
  pelo numero e letra atual, nao por uma tabela de administracao.
- Ao tocar em sua posicao, o participante podera inspecionar
  as filas **A e B** de forma expandida, localizar seu numero
  e percorrer outras posicoes, sem alterar a fila.
- Ha interesse em rolagem/arrasto e gesto de ampliacao
  no celular. Escolha entre vertical ou horizontal,
  dimensoes, animacao e formato final **AINDA NAO APROVADOS**.
- Compras e cursos PDFs continuam na area comercial,
  sem se confundir com a visualizacao da fila.
- Area individual para **indicacoes e contatos** deve
  mostrar as pessoas convidadas, registros de cadastro
  e situacao de validacao das indicacoes conforme
  autorizacao e regras de privacidade.
- **Percentual de indicacao CONFIRMADO: 10%.**
  Base de referencia informada pelo idealizador:
  R$ 100; credito correspondente: **R$ 10 por
  indicacao elegivel**, nao 10% do preco total
  de qualquer produto. Exemplo: dez creditos
  de R$ 10 totalizam R$ 100.
- **Saque minimo desse saldo individual: R$ 100**,
  conforme esclarecimento de 15/10/2026.
  Bonus de eventos tambem podem ser registrados
  na area individual; tipos, valores e condicoes
  desses eventos ainda precisam de definicao.
- Gatilho preciso do credito de indicacao
  (somente cadastro ou compra paga validada,
  considerando a regra ja existente de
  indicacao valida) sera confirmado com
  o idealizador antes de codificar.
- **Nao executar pagamentos, saques ou creditos
  financeiros reais nesta etapa**. Antes da
  implementacao operacional, conciliar a fonte
  contabil do bonus com as alocacoes do ciclo
  e obter revisao juridica/contabil.
- Os 10% de indicacao nao definem qualquer
  outro percentual de participacao ou
  distribuicao financeira dentro do LOOP.
- 'Minha Rede' foi proposto como nome da area, mas
  aguarda escolha/confirmacao definitiva.

## 4. Tres caixas: POSICOES definidas, NOMES editaveis futuramente

A ordem espacial destes tres componentes internos
foi determinada pelo idealizador:

| Posicao fixa | Finalidade descrita | Rotulo inicial, nao definitivo |
| --- | --- | --- |
| **ESQUERDA** | Area de investimento | Caixa de Investimento |
| **CENTRO** | Valores destinados a participacao de lucro dos clientes | Caixa de Participacao de Lucros dos Clientes |
| **DIREITA** | Suporte ao empreendimento LOOP | Caixa de Suporte ao LOOP |

IMPORTANTE:
- Os tres identificadores estruturais sao **esquerda,
  centro, direita**; nome publico/interno e cores
  sao metadados configuraveis no futuro.
- Nao presumir que a palavra 'lucro' por si
  represente lucro liquido contabil efetivamente
  apurado; a classificacao juridica e contabil
  deve ser validada antes de operacoes financeiras.
- Os nomes da tabela sao **titulos provisórios**,
  nao a nomenclatura final. O idealizador
  quer digitar, substituir e ajustar os nomes
  diretamente no Escritorio Administrativo.
- O idealizador tambem quer escolher cores
  por ali. As cores de caixa sao **decorativas**:
  sua edicao nao pode redirecionar dinheiro,
  alterar saldos, mudar destinatarios, dividir
  valores nem reescrever historico.
- A ordem ESQUERDA / CENTRO / DIREITA
  nao deve ser trocada por edicao do nome/cor.
- Alteracoes de configuracao visual devem
  ter controle de permissao, validacao,
  registro de data/versao e persistencia
  somente quando implementadas.
- Saldos e movimentacoes dos caixas internos
  sao **exclusivos do administrador**.
  Participante ve apenas seu proprio
  historico e eventuais valores individuais.
- O idealizador confirmou posteriormente a
  distribuicao teorica dos cinco eventos
  do ciclo: 1o, 3o e 5o no cofre CENTRAL;
  2o no ESQUERDO; 4o no DIREITO.
  Isso complementa as regras economicas
  anteriores, mas nao constitui
  movimentacao financeira ativa.
- O central precisa registrar entradas
  e saidas. Os laterais podem destacar
  as entradas acumuladas na tela, mas
  saques, investimentos e retornos
  tambem precisam de registros contabeis
  e conciliacao para que os saldos sejam
  confiaveis.
- A loja dropshipping tem seus proprios
  controles: um caixa comercial se
  o distribuidor for pago por split
  efetivo, ou dois se houver parcela
  temporariamente reservada para pagar
  o distribuidor. Sao portanto quatro
  ou cinco caixas visuais no conjunto
  das duas areas, sem confundir fundos.
- O idealizador prefere reservas/subcontas
  financeiras efetivamente segregadas
  quando a instituicao e sua API permitirem,
  e nao apenas uma representacao virtual.
  **Nenhum caixa financeiro real foi ativado.**
  Ver `docs/ARQUITETURA_FINANCEIRA_CAIXAS_E_SPLIT.md`.

## 5. Ordem de desenvolvimento confirmada

1. Desenvolver o motor, dados, seguranca, registros e
   separacao dos modulos obedecendo regras confirmadas.
2. Preparar contratos e configuracoes modulares para
   alterar rotulos e cores SEM reescrever a logica.
3. Deixar aparencia final, gestos, refinamento visual,
   tamanhos e cores especificas para uma etapa posterior,
   com revisao/aceite do idealizador.
4. Nao transformar sugestao visual ou exemplo
   em especificacao final aprovada.

**Esta e uma especificacao documental, nao
uma autorizacao para mover dinheiro, lancar
recompensas, expor dados privados ou publicar
o painel administrativo na Internet.**

Documentacao relacionada:
- `docs/IDENTIDADE_LOOP.md`
- `docs/LIMITE_CINCO_COMPRAS_POR_CPF.md`
- `docs/REGRAS_FILAS.md`
- `docs/TABULEIRO_SIMULACAO.md`
- `docs/ESCRITORIO_VIRTUAL_DEMONSTRATIVO.md`
- `docs/PREMISSAS_FINANCEIRAS_E_RISCOS.md`
