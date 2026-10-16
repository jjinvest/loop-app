# LOOP V5 — um código de indicação, dois destinos (laboratório)

## Regra definida pelo idealizador em 16/10/2026

Cada pessoa recebe **um único código de indicação imutável** ao se cadastrar. O mesmo código pode ser divulgado em duas versões do link:

- **Escritório:** `/laboratorio/convite/<codigo>/<apelido>?destino=escritorio`. Apresenta a empresa, o convite e o cadastro no LOOP.
- **Loja:** `/laboratorio/convite/<codigo>/<apelido>?destino=loja`. Apresenta a vitrine de produtos publicados e o cadastro para quem deseja comprar.

As URLs completas não são textualmente idênticas porque incluem destinos distintos, mas **o identificador que atribui a indicação é exatamente o mesmo**. O servidor nunca confia no apelido do link como identidade e valida o código. O link legado sem `?destino=` continua funcionando como convite para o escritório. Nem mudar apelido, nem trocar destino, nem usar link antigo gera nova identidade de indicador.

No **Escritório Virtual**, o participante encontra **dois campos e dois botões de copiar**; pode divulgar ambos para pessoas diferentes. Na **Loja autenticada**, há um campo específico para compartilhar o link da loja, com o mesmo indicador. Nenhum dos dois botões de compartilhamento é liberado antes da primeira compra confirmada do indicador. A confirmação de CPF/termos continua uma segunda ativação independente, necessária para bonificações, não para liberar o link.

## Experiência de quem recebe

O link do escritório abre uma apresentação e um cadastro por indicação. O link da loja mostra uma **vitrine somente de leitura** com nome, tipo e preço de venda configurado pelo administrador. Para concluir um pedido fictício, o convidado ainda precisa cadastrar-se e entrar no Escritório Virtual, que fornece acesso à loja autenticada; após login iniciado pelo convite da loja, o navegador pode ir à loja automaticamente. **Não existe checkout público, pagamento ou entrega real.**

Ambos os cadastros registram o mesmo `codigoIndicador` do convidante. O servidor rejeita `destino` arbitrário, parâmetros adicionais, duplicados e fragmentos, preservando idempotência de comissões e a atribuição original. A vitrine não expõe custos de fornecedor, margens, CPFs, nomes de clientes, compras ou dados privados.

## Preço de venda sempre manual

O administrador define e altera diretamente o preço de venda dos produtos no catálogo. O sistema **não calcula nem acrescenta automaticamente** lucro, custos, tributos ou markup. Exemplo meramente ilustrativo do idealizador: preço R$ 600, custo fornecedor R$ 250, referência LOOP R$ 250, diferença R$ 100 **antes** de tributos, tarifas e despesas. Essa diferença não representa lucro líquido garantido.

A configuração do produto especial de cinco posições mantém as exigências de referência e de cinco vagas livres, mas não determina nem impõe margem comercial. Não há análise de rentabilidade automática neste fluxo de links.

## Implementação

- `src/domain/indicacoes-links-comissoes-demo-sqlite.js`: gera os dois endereços e resolve o mesmo código.
- `src/routes/convite-cadastro-laboratorio-demo.js`: checa link e disponibiliza vitrine somente de leitura.
- `src/laboratorio/convite-cliente-demo.html` e `.js`: apresenta o destino com cadastro atribuído.
- `src/laboratorio/participante-demo.html` e `.js`: duas opções de copiar link.
- `src/laboratorio/loja-cliente-demo.html` e `.js`: copiar o link da loja no próprio ambiente da loja.
- `src/routes/participante-laboratorio-demo.js`: consulta autenticada e individual de `/meus-links`, usando sessão.
- `test/links-unicos-loja-escritorio-demo.test.js`: atribuição de indicador pelos dois destinos, preços manuais, rejeição de links inválidos, vitrine e privacidade.

**Limitação:** essa implementação é exclusiva de laboratório local; o domínio público, sessão de produção, checkout, contratos, análise jurídica e políticas de dados reais ainda precisam ser configurados.
