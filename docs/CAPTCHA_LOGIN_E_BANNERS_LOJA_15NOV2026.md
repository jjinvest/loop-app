# Conclusão publicada — CAPTCHA e banners da AKITEMM (15/11/2026)

**Código:** `a10c9d465b8116e7029d13a2777445d794226d01`, branch `feature/unificar-escritorio-real-20261105`, repositório `jjinvest/loop-app`.

## Auditoria

- Auditoria integral [#43768901563](https://github.com/jjinvest/loop-app/actions/runs/43768901563): dependências e bloqueios SUCCESS; **regressão total SUCCESS**; **navegação PC/celular SUCCESS**.
- Prévia protegida [#43768901549](https://github.com/jjinvest/loop-app/actions/runs/43768901549): SUCCESS.
- Testes específicos: `test/captcha-login-sqlite.test.js`, `test/api-identidade-real-sem-pagamentos.test.js`, `test/loja-escritorio-conta-unica-candidata.test.js`, `test/loja-banner-upload-persistencia.test.js`.

## Serviços efetivamente publicados

- `loop-identidade-real` Railway `adf6e382-b309-4933-8197-2f13c15b6820` **SUCCESS**. Volume real e dados preservados; `LOOP_NUCLEO_OPERACIONAL_REAL=COMPROVADO;COMPONENTES=17;CONTAS_MIGRADAS=2;SEM_PAGAMENTOS=SIM`; `LOOP_BACKUP_IDENTIDADE_PRIMEIRA_COPIA=COMPROVADA;PUT_GET_HASH_RESTORE_CHAVES=SIM;BYTES=409656;CONTAS=2`.
- `akitemm-escritorio-preview`, domínio público atual `https://akitemmloop.com.br`, Railway `ca478218-07ec-4a5d-89c8-0504d5c298f8` **SUCCESS**. Volume `/dados-preview` preservado; `LOOP_MIGRACAO_IDENTIDADES=COMPROVADA;CONTAS=2;VINCULOS=1;PRIMEIRA_INDICACAO_VILELA=true;BACKUP_REAL_RESTAURADO=SIM` e `LOOP_BACKUP_OFFSITE=CIFRADO_ENVIADO_BAIXADO_E_RESTAURADO`.
- Na verificação final, três serviços do ambiente Railway online, zero alertas ou falhas críticas.

## Fluxos implementados

**Login:** primeira tentativa sem CAPTCHA. Credencial errada ativa exigência de CAPTCHA textual de seis caracteres para próxima tentativa. Código expira em 150 segundos, é de uso único e validado no SQLite do próprio servidor. Os erros persistem por 15 minutos por nick normalizado (HMAC) ou são limpos após login. Os controles de bloqueio e limite existentes permanecem. CAPTCHA textual **não oferece garantia contra IA/OCR**, mas reduz automação simples.

**Cadastro:** Política de Privacidade e Termos de Uso ficam em único painel expansível, um abaixo do outro, com uma única confirmação visível. No backend são preservados separadamente os hashes e versões de ambos. CAPTCHA adicional de cadastro permanece configurado na prévia. O cadastro comercial definitivo do serviço `loop-identidade-real` permanece **fechado** até aprovação dos textos e ativação dos gates.

**AKITEMM:** administrador → `Vitrine e atendimento · banners` pode carregar arquivo JPEG, PNG ou WebP de até 4 MB para cada banner do carrossel (máximo 8). Os bytes são persistidos no SQLite da loja; o editor guarda automaticamente URL interna de imagem, preservando ordem de banners, sem caminho manual. A imagem só fica pública após o operador salvar a configuração que a referencia. A API exige operador. O backend foi testado de ponta a ponta para upload, ausência de autorização, publicação, leitura e persistência. **Nenhuma arte foi automaticamente inserida**: é necessário selecionar uma imagem já criada e clicar em Salvar no administrador.

## Limites que NÃO mudaram

- O domínio público ainda é atendido pelo serviço historicamente chamado `akitemm-escritorio-preview` e sua fonte de dados existente: esta entrega não equivale à migração de todo o portal para o novo serviço final.
- Venda com checkout real, Asaas/Celcoin, saques e pagamentos permanecem fechados.
- Identificação jurídica formal e aprovação de Termos/Privacidade definitivos ainda são gates independentes.
