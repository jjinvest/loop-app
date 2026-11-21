# LOOP 3.0 + AKITEMM — CÓPIA LIMPA EM EVOLUÇÃO (V0)

**Projeto atual, separado da construção. Não é certificação de lançamento nem garantia de 100 mil usuários.**

Origem do código: `jjinvest/loop-app`, branch `feature/unificar-escritorio-real-20261105`, revisão `e88a14601b3b20475098f489d44fac01acedf2c9`. Última revisão funcional confirmada no Railway na extração: `a77d8d1e5355e7eb19fb7d12ea1eb5616c79132a`. Arquivos iguais aos da aplicação, com referências Git individuais no manifesto. Esta cópia é independente do ambiente de construção, não altera banco, domínio nem pagamento.

## As três camadas — não confundir

1. **Rascunho/construção:** branch operacional `feature/unificar-escritorio-real-20261105`, onde se corrigem e testam as mudanças. Não sincronizar automaticamente toda tentativa.
2. **Prova real:** sistema efetivamente publicado em `https://akitemmloop.com.br`; aprovação de comportamento pelo proprietário, exames de logs, testes de segurança, integração e retenção de dados.
3. **Cópia limpa:** esta base para revisão por outra IA e especialistas, atualizada por versões fechadas depois de verificação. Ao final, uma versão aprovada poderá assumir o papel de original sem apagar o histórico de construção.

## Operação do LOOP — fonte vigente

Leia `docs/LEIA_PRIMEIRO_ESSENCIA_UNICA_LOOP_AKITEMM_21NOV2026.md` e `docs/ESSENCIA_DEFINITIVA_LOOP_FINANCEIRO_CATRACA_MARCO_ZERO.md`. Venda qualificada → filas A/B contínuas → porteira operacional → catraca / seis luzes / tabuleiro → reservas financeiras confirmadas. Filas e caixa podem crescer com a porteira fechada. A fila determina quem avança; o operador/relógio determina quando; o caixa comprova se a execução financeira tem cobertura. Não simular crédito real.

## Telas REALMENTE em uso

A renderização atual usa `src/producao/interface-aprovada-loop.js` e `src/producao/interface-admin-comercial-aprovada.js`. As telas provêm de `src/candidato/checkout-candidato-ui.html`, `src/candidato/escritorio-admin-candidato-ui.html` e `src/laboratorio/loja-cliente-demo.html`; os respectivos CSS do cliente/loja também são lidos por essa renderização. **Esses quatro arquivos com nomes históricos de laboratório permanecem exclusivamente porque a aplicação REAL ainda os usa como modelos visuais.** Não representam uma segunda loja ou uma prévia. Removê-los ou renomeá-los exige refatoração e prova de equivalência visual antes de copiar a mudança para a base limpa. Páginas antigas não utilizadas foram excluídas da cópia.

## Como auditar

- Node 24; `npm ci` instala as dependências travadas em `package-lock.json`.
- `npm run verificar` audita arquivos, hash Git e imports locais presentes.
- `npm test` executa a bateria direcionada de testes sobre os módulos copiados, sem usar banco real.
- A CI da própria cópia verifica isso a cada atualização. Sem testes e provas não marcar a versão como pronta.
- `MANIFESTO_BASE_LIMPA.json` contém origem, nomes, hashes, exclusões e estados dos gates.

## O que NÃO está certificado

**Faltam:** split bancário Celcoin/Asaas em produção, fornecedor integrado, conciliação e reservas reais, giro financeiro e saque produtivos, testes de carga p95/p99 e concorrência para **100 mil usuários**, auditoria independente de segurança e jurídico/contabilidade. Um teste sintético de filas não equivale à capacidade de 100 mil pessoas simultâneas. O botão/relógio visual não autoriza pagamento.

Não incluir SQLite, CPFs, chaves de API, fotos privadas, backups, .env reais ou informação bancária privada ao entregar esta cópia. Reproduzir a construção em ambiente isolado, nunca apontar a auditoria ao banco dos clientes.

**Links personalizados de validação do proprietário:**
- Escritório: https://akitemmloop.com.br/escritorio/VILELA
- Loja: https://akitemmloop.com.br/loja/VILELA
