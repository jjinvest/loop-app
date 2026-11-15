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
**Auditoria e deploy da correção adicional:** consultar a CI do commit `268081cd7ced545cb31fdfc2542fe05113f6093f` e o próximo deployment. NÃO confundir o deployment da primeira publicação com o da correção automática, que ainda exigia confirmação no momento deste registro.

## Fora deste escopo

A migração completa da prévia para a identidade definitiva, os termos/privacidade oficiais e PSP continuam ações independentes; não afirmar que foram concluídas neste bloco.
