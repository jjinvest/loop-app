# LOOP 3.0 — Revisão integrada da jornada, interface, caixa e riscos de lançamento (21/10/2026)

**Escopo:** revisão técnica de laboratório, sem usuários, dinheiro ou PSP reais. Não equivale a auditoria financeira, certificação de segurança, parecer jurídico ou liberação comercial.

## 1. Jornada ponta a ponta

Ensaio `test/loop-v6-ponta-a-ponta-cliente-loja-equipe-tabuleiro-saque.test.js`, GitHub Actions [39687269737](https://github.com/jjinvest/loop-app/actions/runs/39687269737), **494/494 aprovado**.

- **9 contas fictícias e 11 pedidos:** dez compras qualificáveis geraram dez posições; um produto físico comum de R$190 não gerou posição.
- Titular com duas posições ativadas individualmente; segunda confirmação não repetiu CPF/aceite inicial. Convite azul sem ativação não promoveu fila; convidado verde validado foi vinculado explicitamente a **uma única** posição do titular. Essa posição passou B→A, a outra permaneceu em B. Repetição idempotente e recusa de transferência indevida conferidas.
- Minhas Posições, Minha Equipe, fila A/B e SQLite refletiram a mesma fonte; bônus provisionado de **R$25** gerou solicitação de saque **simulado R$25 brutos, R$0 taxa, R$25 líquidos**, sem Pix real ou segundo débito da reserva.
- Tabuleiro inicialmente preenchido, depois oito giros em **simulador em memória** com seis marcadores fictícios cada (48 eventos), fazendo a posição avançar vaga 6→1→centro→ciclo concluído. **Crítico:** esses giros não foram persistidos como eventos de venda liquidada da ponte, nem pagaram qualquer benefício; não descrever a catraca financeira integrada a PSP como pronta.
- Reinício de arquivo SQLite conservou pedidos, vínculos, posição e solicitação. Sem divergências detectadas no teste.

## 2. Conferência visual e não regressão

Foi inspecionado o código aprovado de `src/laboratorio/loop-03-shell.js`, `participante-demo.js` e CSS. O novo teste `test/loop-v6-contrato-ui-aprovado-regressao.test.js` protege referências às abas Tabuleiro, Minhas Posições e Minha Equipe, a coroa apenas quando posição selecionada está no tabuleiro/centro, nick público opcional no rodapé e mapa, seis vagas, limite de seis posições por titular e ausência da antiga aba “Minhas Ativações”. **Nenhuma alteração visual foi feita**. Os testes existentes de navegador (celular/computador) e esta verificação estrutural **não substituem comparação humana de tela/pixel nem acessibilidade completa**.

## 3. Cobertura de produto versus LOOP: exemplos ilustrativos, NÃO lucro real

Calculador puro `src/domain/ponte-financeira-simples-akitemm-loop-v6.js` verificado pelo novo teste `test/loop-v6-revisao-margem-cobertura-financeira.test.js`, sem modificar a regra comercial.

| Hipótese de laboratório | Receita bruta | Custo de produto hipotético | Referência LOOP | Saldo antes das demais despesas |
| --- | ---: | ---: | ---: | ---: |
| PDF R$250, sem custo de aquisição | R$250 | R$0 | R$250 | R$0 |
| PDF R$250 com custo de R$10 | R$250 | R$10 | R$250 | **Insuficiência de R$10** no cálculo de cobertura |
| Carrinho de R$380 com custo R$100 | R$380 | R$100 | R$250 | R$30 |
| Produto comum R$190 com custo R$50 | R$190 | R$50 | Não elegível | R$140 apenas da loja |

**Não há lucro líquido demonstrado.** A coluna “saldo” é meramente aritmética, antes de impostos, despesas administrativas, logística, devoluções, benefícios, PSP, banco, fraude, comissões e marketing. A provisão de R$250 não comprova caixa liquidado e os benefícios prometidos **não podem depender de lucros ou vendas futuras presumidas**. Condições contratuais e custos reais ainda precisam ser fornecidos e conciliados. A política vigente é **taxa de saque ao participante 0%**, com eventual tarifa PSP paga pela empresa e **ainda desconhecida**.

## 4. Risco jurídico material — validação externa obrigatória

O modelo LOOP descrito combina **compras, posições numa fila, prioridade por indicação e benefícios condicionados a vendas posteriores**. Apenas haver um curso ou produto de verdade não basta para demonstrar sustentabilidade nem regularidade. É necessário parecer jurídico específico do negócio integral, contratos, material de divulgação, forma de remuneração, origem dos recursos e direitos dos consumidores **antes de qualquer comercialização com benefícios reais**.

Fontes oficiais verificadas:
- CVM/Senacon, orientação sobre diferença entre marketing multinível/venda de produtos e pirâmides financeiras: https://www.gov.br/cvm/pt-br/assuntos/noticias/2013/distincao-entre-marketing-multinivel-e-piramides-financeiras-e-tema-do-6-boletim-de-protecao-do-consumidor-investidor-00d2f80d3c9d4a41860a973cf591a4d2
- Portal do Investidor (CVM), fatores de risco de pirâmides/Ponzi: https://www.gov.br/investidor/pt-br/investir/cuidados-ao-investir/evitando-problemas/principais-fraudes-e-esquemas-irregulares/piramides-financeiras-e-esquemas-ponzi
- Decreto 7.962/2013, obrigações de e-commerce e direitos do consumidor: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm
- Guia ANPD sobre agentes de tratamento de dados pessoais: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado

**Atenção:** Não se conclui que o LOOP seja ilegal ou legal sem análise dos elementos específicos por profissional habilitado. A natureza da contraprestação, independência econômica da venda dos produtos, sustentabilidade sem adesões contínuas, risco de recrutamento e promessas de contemplação devem ser examinados com extrema atenção. Não prometer renda ou resultado garantido, nem equiparar simulador a operação bancária.

## 5. Plano de ação após testes locais

1. Desenhar integração persistente entre **seis vendas efetivamente liquidadas por ciclo**, origem confiável, reconciliação e mudança de estado da catraca; hoje simulador e ponte de compras ainda não demonstram essa ligação real.
2. Obter custos SKU a SKU e compor DRE/fluxo de caixa sob cenários conservadores, inclusive vendas estáveis, desaceleração e estornos. Confirmar passivos por posição, bônus, benefícios, cofre e tributos com contador.
3. Exigir parecer jurídico independente sobre o modelo completo, regras de indicações, benefícios, CDC e LGPD. Não usar ausência de parecer como autorização implícita.
4. Contratar e homologar PSP, Pix, reversão de pagamentos, autenticação de eventos, prova de liquidação e saldos reais. Nunca usar webhook HMAC fictício para operar.
5. Segurança, backup externo e RPO/RTO em infraestrutura real, piloto só com autorização expressa e após essas aprovações.

**Preservação:** PR #1 rascunho, branch `fix/teste-escrita-catraca-20261014`, sem merge/deploy; telas aprovadas intactas, Escritório do Administrador não criado, taxa de saque ao participante 0% mantida. Não considerar o produto pronto para clientes e dinheiro reais.
