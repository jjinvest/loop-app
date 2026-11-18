# LOOP 3.0 / AKITEMM — SITUAÇÃO REAL DEPOIS DO CORTE PÚBLICO
**Atualizado em 18/11/2026.** Este é o registro operacional atual, não substitui a regra original do proprietário.

## Ordem obrigatória para continuar
1. **Ideia original do proprietário:** `docs/NUCLEO_ORIGINAL_LINHA_DE_RACIOCINIO_LOOP_20261118.md`.
2. **Situação efetiva publicada:** este arquivo, sempre confrontando o GitHub e Railway novamente.
3. **Implementação e provas:** `feature/unificar-escritorio-real-20261105`, testes e logs abaixo.
4. **Decisões ou alterações posteriores:** atualizar este documento, com prova. Nunca aceitar fixtures como dados reais.

## Comprovado em GitHub + Railway, 18/11
| Peça | Estado fundamentado | Limite dessa prova |
|---|---|---|
| Branch ativa dos dois serviços do LOOP | `feature/unificar-escritorio-real-20261105` — Railway configurado na revisão `9329594a58b70f885386dbf61890dc6a985c079e` | Não confundir com branch de trabalho, PR ou página em cache |
| Serviço público AKITEMM | `akitemm-escritorio-preview` ONLINE, deploy SUCCESS e comando de gateway real inicializado com `LOOP_GATEWAY_PUBLICO=REAL_SEM_LAB_SEM_FINANCEIRO` | O NOME do serviço ainda contém “preview”; seu processo de execução é o gateway real. Nenhuma das duas coisas prova venda autorizada |
| Identidade definitiva | `loop-identidade-real` ONLINE, deploy SUCCESS, SQLite persistente `/dados-reais/clientes.sqlite` | Banco de identidade real não equivale a pagamentos ou cadastro público liberado |
| Custódia das contas | Logs de 18/11, 22:17:22 UTC: **7 legados removidos; 2 reconhecidas preservadas; 1 indicação legítima preservada; chaves estrangeiras OK**. Backups anteriores/posteriores cifrados, baixados e restaurados | NÃO repetir exclusão ou ressuscitar cadastros antigos. A rotina foi excepcional, não é operação normal |
| Loja do proprietário | Auditoria de 18/11, 22:18:39 UTC: **0 produtos principais; 0 produtos de mídia; 0 fotos; 0 posições de vitrine ocupadas** | A interface tem **400 QUADRADINHOS**, mas capacidade não é estoque. Qualquer curso, produto ou compra nos testes vem de bancos descartáveis |
| Autenticação de operador e fotos | Testes de navegador isolado comprovam o código da entrada/edição/foto/rascunho com interface original; o acabamento deixou de apagar o atalho protegido | **Não** comprova que o proprietário já cadastrou produto na loja publicada, nem que seu próprio navegador autenticado foi exercitado |
| Compra/PSP/motor/catracas financeiros | Checkout não liberado, eventos financeiros externos ainda não demonstrados | **Não** habilitar posição, luz, recompensa, extrato liquidado ou saque a partir de simulação |
| `loop.com.br` | Railway descreve este domínio associado ao serviço `loop-identidade-real` | Associação no Railway não comprova DNS/TLS/acesso de ponta a ponta; não declarar este domínio validado sem checar |
| Site público de AKITEMM pós-corte | **Prova EXTERNA REAL aprovada**: GitHub Actions [run 44419392685](https://github.com/jjinvest/loop-app/actions/runs/44419392685), 18/11/2026 às 23:17 UTC, consultou diretamente o domínio publicado, apenas com GET anônimo. Cadastro público reportou **FECHADO**, financeiro real **false**, convite Vilela correto, sessões protegidas e rotas de laboratório 410 | Prova de rede pública NÃO comprova login pessoal do proprietário, alteração de foto no banco definitivo nem compra liquidada |

## Prova de URL pública anônima pós-corte
Ferramenta criada neste bloco: `scripts/provar-portal-publico-real-readonly.js` e o CI `.github/workflows/portal-real-pos-corte-readonly.yml`.

Ela realiza **somente GET sem cookies** contra `https://akitemmloop.com.br`, sem depender de credenciais do proprietário, conferindo:
- `/` encaminha ao `/minha-conta`, que contém formulário real de login/cadastro; `/escritorio` mantém tabuleiro aprovado.
- Identidade anuncia `SERVICO_IDENTIDADE_SEPARADO`, `financeiroReal=false`; `/readyz` informa aberta ou fechada sem inferir por teste.
- `/loja`, `/api/loja/catalogo` e `/api/contas/me` não revelam dados a visitante anônimo.
- `/api/operador/estado` retorna `operador=false` sem autenticação.
- `/staging/*`, `/laboratorio/*` e a tesouraria de ensaio não abrem.
- `/loja/VILELA` preserva o nick de indicação no encaminhamento ao **mesmo** escritório.
- Ativos do operador/fotos e vitrine horizontal permanecem disponíveis sem editar HTML/CSS.

**Resultado observado:** a execução [44419392685](https://github.com/jjinvest/loop-app/actions/runs/44419392685) passou e emitiu `LOOP_PORTAL_PUBLICO_READONLY` com `gateway=REAL_SEM_LABORATORIO`, `identidade=DEFINITIVA`, `cadastroPublico=FECHADO`, `dinheiroRealHabilitado=false`, sem modificação de dados. Foi prova de transporte e rotas, NÃO de produtos ou transações reais.

**Somente um resultado SUCCESS de execução EXTERNA** prova que as rotas responderam no domínio. Testes de servidor local, logs de inicialização, códigos 200 anteriores ao corte e status ONLINE não substituem essa evidência. Falhas de rede devem ser relatadas, jamais corrigidas liberando login, dados ou laboratório.

## Próximo bloco — ponta a ponta sem mexer nos dados do proprietário
1. **Prova externa de URL CONCLUÍDA e APROVADA** em 18/11 (run 44419392685). Manter cadastro público/PSP bloqueados até autorização expressa e dependências externas cumpridas.
2. Conferir operator path no domínio real, com sessão autorizada, verificando criar rascunho, upload e foto; **não** gerar produto falso no banco definitivo. O proprietário fará o primeiro upload quando o fluxo estiver aprovado.
3. Garantir que catálogo publicado, pedido comprovado, classificação, fila A/B, luzes e giro leiam **uma única origem**. Sem Celcoin/Asaas de produção, limitar-se a estrutura e estados pendentes honestos, sem dinheiro ou posição inventados.
4. Verificar integridade e restauração de backup após alterações antes de habilitar qualquer rota nova. Preservar visual aprovado e as duas contas reconhecidas.
5. Toda nova ação deve registrar **feito + prova + pendência**, distinguindo banco verdadeiro, teste descartável e configuração do Railway.

## Travas permanentes
- Nunca reconstruir um segundo LOOP. O contrato original manda; se o código discordar, corrigir o código.
- Não reabrir a migração antiga, criar contas artificiais, converter saldos de testes nem ativar pagamento sem confirmação externa.
- Não executar novamente `LOOP_REAL_SANEAMENTO_LEGADOS=EXECUTAR`. O estado correto é modo normal `NAO`; conferir pelo ambiente, não supor.
- O saneamento excepcional foi transacional e com backups. Não tratar isso como autorização geral para apagar contas em produção.
- Manter rascunho, foto, status de publicação e comprador separados; um quadradinho vazio não é produto.
