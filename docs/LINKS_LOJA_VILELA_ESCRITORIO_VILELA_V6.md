# LOOP V6 — Loja Vilela e Escritório Vilela: dois endereços, um indicador

Decisão ratificada em 17/10/2026: o sistema se chama **LOOP V6 — Escritório Virtual**, mas a navegação e a divulgação devem separar claramente as duas portas, com os nomes pedidos pelo idealizador.

| Acesso | Caminho amigável do laboratório | Função |
|---|---|---|
| **Loja Vilela** | `/loja-vilela` | Vitrine, cursos em PDF, mercadorias, compras e histórico comercial |
| **Escritório Vilela** | `/escritorio-vilela` | Cadastro, informações individuais, indicações, posições, filas e tabuleiro |

Cada participante que estiver habilitado a divulgar mantém **um único código de indicador** que serve para os dois destinos. Os exemplos abaixo são caminhos de teste relativos ao servidor local, não links públicos operacionais:

- Loja Vilela: `/loja-vilela/convite/lp-0123456789abcdef0123/vilela`
- Escritório Vilela: `/escritorio-vilela/convite/lp-0123456789abcdef0123/vilela`

Ambos contêm exatamente o mesmo token fictício; é o prefixo de rota, e não o token, que determina a experiência de apresentação. O apelido `vilela` é apenas identificador amigável; a conta do indicador é determinada pelo token verificável. Nenhum domínio `.com`, `.com.br` ou subdomínio real foi contratado, publicado ou ativado. Quando houver infraestrutura autorizada, usar **HTTPS** e um domínio sob controle da empresa; não usar endereços inventados em anúncios ou contratos.

## Preservação e compatibilidade

1. O código único de indicação não muda quando o usuário personaliza o apelido.
2. Links históricos no padrão `/laboratorio/convite/<token>/<apelido>?destino=loja` ou `?destino=escritorio` continuam reconhecidos. Não trocar a autoria dos cadastros já atribuídos.
3. Os novos caminhos não aceitam parâmetro contraditório `destino`; rejeitam parâmetros arbitrários, fragmentos, token malformado e destinos ambíguos.
4. O cadastro apresentado por qualquer destino preserva a mesma atribuição do indicador. A primeira compra confirmada libera a divulgação no laboratório, mas termos/CPF fictício e elegibilidade para bônus são separados.
5. Os atalhos dentro das telas foram identificados **Loja Vilela** e **Escritório Vilela**, inclusive os botões de copiar links.
6. Todo o código dessas rotas permanece restrito ao laboratório local, sem autenticação de produção, checkout real, saques, repasses ou hospedagem pública.
7. A referência visual futurista e imersiva aprovada para a V6 permanece intacta: esta alteração só renomeia destinos e oferece aliases de URL.

## Testes de regressão

O arquivo `test/links-vilela-dois-destinos-v6.test.js` verifica os links e o código compartilhado, troca segura do apelido, validação do destino, rejeição de rotas inválidas, compatibilidade retroativa, abertura de ambos os acessos locais, isolamento da aplicação pública e API de reconhecimento do indicador.

O PR #1 deve continuar **em rascunho, sem merge e sem publicação**, até autorização expressa do idealizador.

## Próximo módulo separado: controle da catraca

O Circuit Break é uma ferramenta **administrativa de ritmo** e deve permitir, futuramente, pausar e liberar lotes de giros, visualizar a fila e conferir condições do ciclo sem transformar o botão em autorização de pagamento. Para qualquer valor financeiro real, exigem-se fontes de caixa liquidadas, reconciliação independente, obrigações e proteção do consumidor. A fase de botões/controle não é implementada por este documento de links.