# Corte da entrada pública AKITEMM → LOOP real — 18/11/2026

> **Contrato de implantação, ainda não é autorização de corte.** Objetivo: manter `akitemmloop.com.br` e a aparência comercial aprovada, usando somente cadastro, catálogo, operador, dados e motor real, sem iniciar o laboratório legado nem abrir pagamento ou saque.

## O que foi desenvolvido

- `scripts/iniciar-gateway-publico-real-loop.js` é um novo **entrypoint de rede isolado**, sem importar `src/candidato/servidor-loja-escritorio-candidato`, abrir banco SQLite de prévia, timers da catraca de ensaio, provedor Asaas sandbox, jobs de migração ou gateways financeiros. Ele não cria conta nem contém imagens/telas alternativas: serve estritamente como proxy ao serviço de identidade já existente.
- Preserve `akitemmloop.com.br` no **mesmo serviço Railway e no mesmo DNS**, sem criar outra conta, outro aplicativo público ou mover o domínio. O backend real continua no volume `/dados-reais`; o legado no `/dados-preview` fica em custódia, sem inicialização e sem novas escritas no novo entrypoint.
- A entrada só admite rotas públicas reais necessárias a cadastro, loja, escritório, convites, administração, imagens e APIs autorizadas. Rejeita `/staging`, `/laboratorio`, `/internal`, endpoints de ensaio e checkout não homologado; qualquer falha no serviço real retorna erro seguro, nunca alterna silenciosamente ao banco antigo.
- Cookies de conta `loop_real_s` e operador `akitemm_real_admin_v1` seguem autenticados no backend real. Os cookies antigos `akitemm_preview_*` não são encaminhados nem viram credenciais de conta definitiva. Operador pode consultar catálogo e editar somente pelas rotas administrativas protegidas, sem herdar pedidos, saldo ou CPF de clientes.
- O gateway valida o Host público e a Origin do navegador, remove segredos e headers internos forjados, limita a carga, rejeita caminhos codificados/traversal e encaminha o Origin interno **somente após validar** a origem pública. Esse Origin interno deve corresponder exatamente à configuração segura `LOOP_REAL_ORIGEM` do backend, com POST/PATCH e CSRF testados. Cookies de resposta tornam-se host-only no domínio AKITEMM.
- Testes criados: `test/gateway-publico-real-sem-laboratorio.test.js` (isolamento de rotas, cookies, CSRF, arquivos, redirecionamentos, limites, falha fechada) e `test/gateway-publico-real-integracao-conta-operador.test.js` (serviço de identidade real em SQLite de teste, login de cliente e operador, telas aprovadas byte a byte, vitrine e cadastro financeiro fechado). A conclusão da auditoria deve ser registrada após o workflow e não presumida.

## Configuração exigida ANTES do corte

1. Configuração explícita no serviço público: `LOOP_PUBLICO_ENTRADA_REAL=SIM` e `LOOP_PUBLICO_CADASTRO_ANTIGO_FECHADO=SIM`. O novo entrypoint rejeita a inicialização sem essas flags, inclusive no modo produção.
2. `LOOP_PUBLICO_URL_IDENTIDADE_INTERNA` = URL **HTTP PRIVADA** da instância `loop-identidade-real` no mesmo ambiente Railway (domínio `*.railway.internal`, porta real do processo). Não usar `loop.com.br`, link público, sandbox, host de outro serviço nem a rota de tabuleiro por engano. Confirmar origem e porta com probe autenticado/healthcheck pela rede privada.
3. `LOOP_PUBLICO_ORIGEM_IDENTIDADE_REAL` = **exatamente** o valor vigente de `LOOP_REAL_ORIGEM` do serviço de identidade (HTTPS), preferencialmente por referência de variável Railway, sem copiar chaves/segredos. A leitura de valores é restrita pelo conector OAuth; tratar como pré-requisito pendente, não adivinhar.
4. Mudar `deploy.startCommand` do serviço público existente para `node scripts/iniciar-gateway-publico-real-loop.js`, preservando domínio e DNS. Atualizar `preDeployCommand` para verificação do gateway real e backup sem executar testes de checkout de laboratório. Usar fonte GitHub auditada, pinada ao commit realmente aprovado.
5. **Não executar esse passo enquanto o cadastro real estiver desligado** caso o objetivo seja aceitar novos clientes. No momento a execução real foi descrita em modo `OPERACAO_INTERNA_REAL` com `permitirCadastro:false`; a abertura exige backup/restauração comprovados, documentos e GO formal. Nenhuma flag de dinheiro ou fintech fica habilitada por causa do gateway.

## Gates de corte: precisam estar verdes

- Verificar que a loja e escritório mantêm **as telas aprovadas** no domínio final, incluindo 10 abas, 400 posições, fotos de produtos, botões, enquadramentos, seis ícones de topo e navegação no celular; não substituir pelas telas simplificadas da identidade sem conferir equivalência visual.
- Provar catálogo e acervo: conta única, vínculo dos 400 slots, backup/restauração das imagens, permissões do operador, sequência de leitura e upload, não duplicação de produtos e recuperação após restart.
- Confirmar que os clientes já migrados (9 contas e vínculos previamente observados) seguem recuperáveis no mesmo SQLite real, sem presumir números invariáveis: obter inventário e reconciliação imediatamente antes do corte. Verificar login, troca de senha, e-mail, convite `/loja/NICK`, rede e permissões.
- Provar `GET /healthz` e APIs reais pela rede PRIVADA com destino correto, `POST /api/contas/entrar` e `/api/operador/entrar` com Origin validado, cookies host-only, atualização de fotos 1–10, CSRF e trava de revisão concorrente. Confirmar cadeias de redirecionamento sem fuga de domínio.
- Fluxos financeiros devem permanecer **sem dinheiro real**, checkout real fechado, nenhum webhook sandbox ativo no processo público. A catraca programada/livre não poderá lançar créditos sem reserva ou liquidação externa comprovada.
- Ter backup/offsite recuperável, inventário de volumes, plano de rollback pré-escritas e verificação de certificados. **Se qualquer nova conta ou escrita for feita no banco real após o corte, NÃO restaurar automaticamente o gateway legado:** isso produziria divergência de titulares. Em incidente, manter manutenção segura no domínio, preservar o SQLite real e recuperar o serviço real. Nunca apagar `/dados-preview` para simular limpeza.

## Estado

- Arquitetura e testes do gateway em desenvolvimento na branch ativa; o **serviço público atual continua no entrypoint legado** até os gates acima serem efetivamente comprovados. Não confundir arquivo novo com deploy.
- `loop-identidade-real` continua a fonte única definitiva no Railway, com dados/backup próprios. A troca futura não deve exigir DNS novo nem expor chaves de fintech a clientes.
