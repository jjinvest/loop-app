# Missão 3 — fronteira antifraude dos vínculos SQLite

No laboratório LOOP 0.3 / motor V6, a confirmação explícita pela interface autenticada já era validada no servidor. Esta missão adiciona **defesa em profundidade no próprio SQLite**: o gatilho `admin_loop_vinculos_indicacao_posicao_validar_insert` impede gravar vínculo de convite com indicador diferente do original, autoindicação, posição ainda sem ativação individual, posição pertencente a outra conta, convidado sem ativação ou indicação já consumida no modo legado.

A tabela mantém um convidado por chave primária, vínculo definitivo sem UPDATE/DELETE, `BEGIN IMMEDIATE` e repetição idempotente do fluxo autorizado. O teste `test/antifraude-vinculos-sqlite-demo.test.js` cobre gravação SQL forjada, posição alheia, status pendente, idempotência, imutabilidade, efeito restrito a uma posição e chamadas HTTP hostis sem sessão, com Origin/Fetch-Site externo e body com contaId fabricado.

**Limites:** quem tem acesso irrestrito ao arquivo SQLite ainda pode modificar dados e gatilhos; não é substituto de banco protegido, autenticação de produção, proteção contra CSRF em implantação real, auditoria externa, provedor de pagamentos, LGPD, análise econômica/jurídica ou antifraude de identidade. Nenhum CPF real, pagamento real ou benefício foi criado. A compatibilidade de testes antigos continua a exigir revisão separada.

**Preservado:** sequência 3A:1B, trava por titular e promoção por posição, B FIFO, catraca de seis eventos, tela aprovada, loja AKITEMM, contratos históricos, PR rascunho sem merge/deploy.
