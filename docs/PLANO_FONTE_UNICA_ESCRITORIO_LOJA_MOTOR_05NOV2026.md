# LOOP 3.0 / AKITEMM — Convergência para um único Escritório

Data: 05/11/2026. Fonte: branch `feature/unificar-escritorio-real-20261105`. Este documento fixa a continuidade técnica, não autoriza lançamento comercial.

## Decisão imutável do proprietário
- Não manter três produtos distintos: original (referência), interface funcional local aprovada e formulário técnico online.
- A interface local aprovada é a base visual e funcional. Não redesenhar as abas aprovadas.
- O cadastro e a autenticação online devem ser únicos para loja e escritório. A sessão do titular é a fonte de autorização para dados pessoais.
- O mesmo SQLite operacional é fonte de pedidos, conciliações, posições, filas e financeiros quando cada integração estiver comprovada.
- Validar PC e celular na **mesma** interface, não em protótipos paralelos.
- PR #1 permanece DRAFT. Nada de merge, pagamentos, saques, giro comercial ou liberação do Marco Zero antes dos gates externos.

## Estado verificável do bloco
- A rota do Escritório do candidato já usava o SQLite da loja para login, pedidos, links e equipe.
- A versão de unificação mantém esses handlers, sessão e APIs; reutiliza diretamente `src/laboratorio/loop-03-shell.css`, preservado sem alterações, e aplica apenas CSS de compatibilidade.
- A mesma rota `/minha-conta` passa a ter estrutura responsiva do Escritório, com menu lateral PC e menu recolhível celular, sem segundo cadastro.
- A aba tabuleiro consulta apenas o estado de ensaio do titular por API autenticada. Ela **não** lê o motor operacional real nem apresenta falsas posições/giros ou saldos.
- A interface de login/cadastro/recuperação continua a mesma e não precisa reabrir conta.
- Isolamento da migração: branch nova, Railway atual continua com código anterior e SQLite persistido. Nenhum serviço comercial foi atualizado.

## Continuidade na mesma interface — 05/11/2026

- A aba **Minhas Posições** do Escritório unificado deixou de ser apenas uma frase e reutiliza a grade de cartões da interface aprovada: até 10 espaços, três colunas no PC e adaptação para telas menores.
- Cada cartão preenchido é EXCLUSIVAMENTE um registro de ensaio pertencente à sessão e obtido de `/staging/minha-previa-filas`, que consulta o mesmo SQLite; não se atribui saldo, número de posição comercial, indicação qualificada, ocupação no tabuleiro nem giro.
- Estados de erro e revisão não são escondidos; mais de dez registros históricos permanecem sinalizados no histórico, sem confundir o limite de **dez posições ATIVAS** com a quantidade de pedidos passados.
- Teste focado em proteção de texto do pedido, isolamento da fonte e limite visual: `test/grade-posicoes-ensaios-unificada.test.js`.
- **Motor de escrita permanece desconectado**; isto é unificação de interface e leitura, não ativação. Nada foi implantado no serviço comercial.
- CI final deste lote: https://github.com/jjinvest/loop-app/actions/runs/42053672402 — sucesso em suíte completa, Chromium PC/celular e capturas. A primeira tentativa https://github.com/jjinvest/loop-app/actions/runs/42052973391 falhou por asserção de texto legado no roteiro do navegador, ajustada sem alterar a regra da aplicação.

## Pendências materiais, NÃO classificar como concluídas
1. **Motor operacional:** adaptar o motor persistente, eventos, travas e catraca à identidade da conta única, com estados e dados duráveis no mesmo repositório SQLite. Hoje o motor histórico tem classes e contas de laboratório próprias.
2. **Ordem/limites:** 3A:1B; Fila A por indicações por posição e desempate por horário; no máximo 10 posições ativas por titular e 2 simultâneas no tabuleiro; ciclo de 6 eventos; azul não confirmada assumida pela empresa ao entrar na vaga 6. Não habilitar giros com pré-pedidos ou confirmações hipotéticas.
3. **Conciliação:** uma compra de R$ 250 qualificada -> uma posição, somente após conferência PSP independente, fotografia de oferta, CPF/termos e autorização. Eventos idempotentes, sem duplicação ou contagem do webhook bruto como pagamento.
4. **Financeiro/razão:** cofre das douradas, reservas/investimento, bônus 10% sobre R$ 250, histórico de ciclos, mínimo R$ 25, taxa 0%, bloqueio somente do valor solicitado, auditoria 24h. Manter ledger separado do dinheiro de loja, sem simular saldo bancário.
5. **Administrador:** delegações, permissões separadas, auditoria, controles da catraca e cofres, com ações reais apenas quando os pré-requisitos forem satisfeitos; missões são apenas registro de trabalho.
6. **Produção comercial:** identidade e consentimento homologados, PSP comercial e meios de recebimento reais auditáveis, backups offsite, segurança e revisão jurídica/contábil. Nenhum deploy de homologação supre esses gates.

## Não realizar
- Não ligar o simulador a pagamentos reais.
- Não criar uma segunda conta para mostrar o motor.
- Não reproduzir números simulados como saldo disponível.
- Não remover a interface aprovada para abrir outra tela de testes.
- Não migrar ou apagar o banco persistido do usuário para trocar o estilo.

## Validação do bloco
O CI na branch `feature/unificar-escritorio-real-20261105` executou suíte completa, autenticação, testes de regressão e Chromium PC/celular: https://github.com/jjinvest/loop-app/actions/runs/42050314485

## Próxima implementação técnica
Construir uma ponte transacional versionada entre `ContaUnicaCandidataSQLite` e o motor de posições/filas/ciclos, com provas de idempotência e titularidade; só depois mover o Railway da versão anterior para a integrada. Preferir migração em etapas de código **na mesma interface e base de dados**, sem múltiplos sistemas de usuários.
