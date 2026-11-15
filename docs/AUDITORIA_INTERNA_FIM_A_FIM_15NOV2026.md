# LOOP 3.0 / AKITEMM — Auditoria integral do primeiro pilar (15/11/2026)

## Escopo e limites
Auditoria de **infraestrutura interna** após solicitação do proprietário. A jornada considerada é convite/cadastro → identidade e sessão → AKITEMM catálogo/PDF/estoque/carrinho → pedido congelado → PSP sandbox/reconsulta → indicação e posição individual → filas A/B, tabuleiro 1+6, motor e catraca → provisões/financeiro/saques bloqueados → administração → backup/restauração.

Não declarar operação comercial pronta por terem passado testes de laboratório. Não ligar pagamentos reais, não alterar dados de clientes reais, não mesclar PR #1 em DRAFT, não interpretar arquivo/pedido de ensaio como saldo bancário.

## Provas obtidas
- CI integral criado: `.github/workflows/auditoria-integral-pilar-interno.yml`. Executa todos os testes de código Node, auditoria de dependências de produção, bloqueios financeiros, proteção das APIs do administrador, recuperação local e três fluxos Chromium em PC/celular, guardando evidências quando produzidas.
- **Suíte ampla: 1.409/1.409 testes aprovados**, sem falha no job `regressao-total` da execução [43729521323](https://github.com/jjinvest/loop-app/actions/runs/43729521323). Também aprovadas as verificações `dependencias-e-bloqueios`. Esta aprovação é da suíte de código; o run completo ainda tem regressão browser.
- **Identidade real + Escritório/AKITEMM em Chromium PC e celular: SUCCESS** na execução [43729521352](https://github.com/jjinvest/loop-app/actions/runs/43729521352), SHA `6b3e7a5c69ba89dd19fff2e0b0745a968bbc27fd` (execução em ambiente isolado, não prova lançamento público).
- **Loja e admin com mesmas funções PC/celular**, filtros das quatro cores e sininho AKITEMM testados por navegador em [43725179921](https://github.com/jjinvest/loop-app/actions/runs/43725179921) SUCCESS.
- **Railway**: `loop-identidade-real`, `akitemm-escritorio-preview` e `asaas-webhook-staging` consultados online (1/1, zero alertas críticos) no início desta auditoria. Estarem online não comprova integração integral entre bancos/serviços.

## Falhas identificadas e correções feitas no código
1. Regressão de aceites individuais: testes de PSP e de duas instâncias não enviavam CPF no contrato de aceite; restaurados payloads de ensaio com CPF próprio, mantendo recusa sem CPF/termos e sem KYC real.
2. Nick: testes esperavam converter `Alice` para `alice`; o contrato visual vigente preserva maiúsculas/minúsculas para exibição. Testes adequados sem quebrar unicidade do cadastro.
3. Cores da vitrine: testes usavam textos antigos `Dourado · Integral` e `Roxo · Evento especial`; atualizados para as legendas oficiais, sem mudança do motor.
4. **Falha real de integração da identidade**: o HTML solicitava CPF e telefone e o backend definitivo não os custodiava. Implementada tabela aditiva `loop_real_contatos_cadastro` com CPF HMAC exclusivo, CPF/telefone AES-256-GCM, vínculo no cadastro, leitura pelo próprio titular, máscara de CPF, sem declarar KYC. Interface e contrato de entrada ligados; backups reconhecem tabela, contas antigas não são apagadas; testes dedicados de cifragem/migração.
5. **Falha real de inicialização da interface**: dois listeners de botões removidos na interface aprovada e um botão `atualizarPosicoes` ausente causavam exceção JS e tela vazia após login; corrigida compatibilidade do frontend sem repor botões redundantes.
6. Navegação e fila: teste antigo assumia sigla `B` e texto de fila sem paginação; a interface atual usa **ordinal de espera** e dados reais do motor. Atualizadas provas de fila/posições sem inventar identificadores de terceiros.
7. Cadastros ensaiados no navegador passaram a preencher CPF/telefone fictícios obrigatórios e a comprovar persistência criptografada na identidade real. Testes da conta de ensaio adaptados para não exigir o mesmo CPF duas vezes.
8. Quatro banners, sem duplicar telas: teste legado de dois banners adaptado para quatro aprovados; botão de atualizar removido não deve voltar só para satisfazer teste.

## Status ainda aberto, sem maquiar
- O run integral `regressao-total` e segurança está verde, **mas a jornada antiga de navegação do escritório de homologação ainda não passou integralmente**. O teste de browser de homologação foi escrito antes da reorganização administrativa em abas, e tenta acessar campos ocultos enquanto outra aba está selecionada. Correção de navegação por abas iniciada em `scripts/validar-conta-unica-candidato-browser.js`; validar sua próxima execução antes de dar o primeiro pilar como concluído.
- O novo código de custódia CPF/telefone é **PREPARAÇÃO NA BRANCH**; não foi aplicado ao serviço de identidade com dados reais nem homologado como migração pública. Verificar backup/rollback e proteção jurídica antes de deploy.
- **Backup offsite com recuperação comercial independente permanece sem aceite**: issue [#2](https://github.com/jjinvest/loop-app/issues/2) OPEN. Há bucket `loop-backup-offsite` e prova isolada de sandbox, mas falta restore comercial em local/conta/região segregados, medir RPO/RTO e demonstrar continuidade do livro financeiro e identidade.
- A loja pública e a identidade real ainda têm **persistências/serviços separados** e o checkout comercial permanece bloqueado. A prova de ensaio ou suíte verde não equivale a confirmar a cadeia real **pedido pago → PSP externo → motor → financeiro → entrega**.
- PSP Asaas/Celcoin, fornecedor de dropshipping, liquidação/extrato bancário, atendimento/privacidade, autenticação definitiva/KYC e avaliação jurídica e fiscal requerem homologação/autorizações externas distintas, não podem ser confundidas com bug interno resolvido.
- Branch histórica `fix/teste-escrita-catraca-20261014` e feature atual divergem; **não executar merge automático**. PR #1 permanece DRAFT.
- Sem indicador percentual confiável de conclusão por quantidade de testes; progresso será contabilizado por fluxos efetivamente ligados e gates fechados.

## Critério objetivo de encerramento do pilar interno
1. Fluxos cliente e administrador em navegador PC/celular sem falhas nas três jornadas atuais, na mesma revisão exata da entrega.
2. CI completo (testes, dependências, controles de acesso, concorrência e cenários negativos) verde no SHA final.
3. Contratos e estado durável compatíveis entre serviços; sem fila, posições, pedidos ou saldo criados por fake/sandbox em contas públicas.
4. Provas locais de restart, idempotência, concorrência e rollback; armazenamento comercial persistente e auditoria sem duplicação.
5. Nenhuma mudança em produção com dados reais sem backup e recuperação comercial independente demonstrados; operações externas permanecem bloqueadas até a homologação.

Este documento registra o estado verificável da auditoria, não autoriza GO comercial.
