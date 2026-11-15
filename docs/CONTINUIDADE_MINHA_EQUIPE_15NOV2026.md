# Minha Equipe — publicação verificada em 15/11/2026

## Primeiro bloco concluído e publicado

- Domínio atual: https://akitemmloop.com.br, serviço Railway `akitemm-escritorio-preview`, mantendo o volume `/dados-preview` existente.
- Commit publicado: `8d55e3ae504db8d67d9491c18ac96b5b48193f39`.
- Deployment: `6ca59dc9-4320-4e22-8de7-118fa28b88ab`: SUCCESS, online, 0 avisos. Backup offsite do volume: cifrado, enviado, baixado e restaurado (comprovação no log).
- Auditoria integral GitHub Actions #43755591380: regressão completa, controles de segurança, navegação PC/celular SUCCESS. Navegação protegida #43755591399: SUCCESS.
- Contrato visual de 24 arquivos preservado, autorizada somente a mudança explícita do HTML de ficha e contato.

## Campos da ficha

- Número ordinal no mínimo com quatro algarismos: `#0001`, `#1000`, `#1000000`, sem teto imposto pelo `padStart`.
- Nick, data e hora de Brasília do registro (timestamp persistente); fila de *entrada* B, sem inventar posição comercial nem giro no motor.
- A mensagem do cadastro na ficha é: “Aguardando confirmação de ativação no LOOP.”
- Foram retiradas mensagens do laboratório, de Sandbox e de compra/PSP da ficha, sem expor CPF, e-mail, senha ou nome civil.

## Ponto de continuidade imediatamente posterior — instrução de 15/11/2026

O proprietário corrigiu a exigência: **o telefone deve aparecer automaticamente para o indicador direto a partir do vínculo de cadastro originado em seu link**, sem caixa adicional de autorização na ficha ou Minha Conta. O vínculo é conferido *no servidor* e nenhuma outra conta pode consultar o telefone. Indicados existentes NÃO refazem cadastro.

**Código da correção adicional:** na prévia, `src/domain/conta-unica-candidata-sqlite.js` agora consulta o telefone cifrado somente após verificar `akitemm_convites_candidatos_lab.indicador_id` e `indicado_id` ligados; a tabela opcional de permissões não é consultada e o checkbox extra foi removido de `src/candidato/checkout-candidato-ui.html` e `.js`. `scripts/servidor-escritorio-preview-railway.js` explicita no texto apresentado para aceite que o telefone ficará disponível somente ao indicador que compartilhou o link, com versão nova de termo de cadastro. Novos cadastros usam o mesmo checkbox de aceite dos termos, sem outro.
**Código preparado para a identidade definitiva:** `src/producao/identidade-cliente-loop-sqlite.js` decripta exclusivamente o telefone do indicado após conferir `loop_real_vinculos_indicacao`, a visão unificada recebe callback privado do servidor e a `interface-aprovada-contas.js` mostra número ordinal, contato, data, hora de Brasília, fila de entrada B e mensagem curta de ativação. Sem qualquer exibição de CPF/e-mail ou nome civil de terceiros.
**Auditoria aprovada:** GitHub Actions [integral #43757167736](https://github.com/jjinvest/loop-app/actions/runs/43757167736) (dependências, regressão completa, PC/celular SUCCESS), [identidade definitiva #43757167716](https://github.com/jjinvest/loop-app/actions/runs/43757167716) SUCCESS e [prévia protegida #43757167805](https://github.com/jjinvest/loop-app/actions/runs/43757167805) SUCCESS, usando código do commit `268081cd7ced545cb31fdfc2542fe05113f6093f`. A partir do commit `2f57ef6d0004b2b58d85dd1b2a78f68c61ffc3a2`, o mesmo código foi publicado com documentação adicional.
**Railway — correção automática efetivamente publicada (15/11/2026):**
- Serviço de domínio `akitemm-escritorio-preview`, com domínio real `akitemmloop.com.br` e volume de cadastros `/dados-preview` existente: deployment `d3b09dda-4546-416c-bb15-c790ea1281bd` **SUCCESS**, log `LOOP_BACKUP_OFFSITE=CIFRADO_ENVIADO_BAIXADO_E_RESTAURADO`. Não resetou cadastrados nem vínculos.
- Serviço interno `loop-identidade-real`, volume separado `/dados-reais`: deployment `b95c3acf-197e-488b-86ce-dceac8489612` **SUCCESS**, `LOOP_NUCLEO_OPERACIONAL_REAL=COMPROVADO;COMPONENTES=17;SEM_CLIENTES_OU_PAGAMENTOS=SIM`; backup da identidade com PUT/GET/hash/restore comprovados. O cadastro público definitivo continua com gates fechados, e a migração dos cadastros do volume da prévia ainda NÃO foi executada.
- A exposição de contato está limitada ao vínculo direto gravado no servidor e à sessão autenticada; nenhuma permissão extra é requerida do indicado. Os termos apresentados no cadastro avisam expressamente o uso. Se um cadastro anterior não contém telefone cifrado, a ficha não inventará número, e isso precisará de atualização cadastral separada.

## Fora deste escopo

A migração completa da prévia para a identidade definitiva, os termos/privacidade oficiais e PSP continuam ações independentes; não afirmar que foram concluídas neste bloco.
