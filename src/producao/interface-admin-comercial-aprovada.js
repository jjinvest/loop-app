'use strict';
// Reusa HTML, cabecalho e CSS aprovados do Escritório Administrativo AKITEMM.
// Não publica JS do LAB ou controles fictícios. Exige sessão ADMIN distinta.
const fs=require('node:fs');
const path=require('node:path');
const {criarRouterAdminEconomiaAkitemm}=
 require('./rotas-admin-economia-akitemm');
const original=fs.readFileSync(path.join(__dirname,
 '../candidato/escritorio-admin-candidato-ui.html'),'utf8');
function renderizarAdminComercialAprovado(){
 const inicio=original.indexOf('<section class="painel" id="acesso">');
 if(inicio<0)throw Error('TEMPLATE_ADMIN_APROVADO_DESATUALIZADO');
 let base=original.slice(0,inicio);
 for(const [antes,depois] of [
  ['AKITEMM · Escritório do Administrador (laboratório)',
   'AKITEMM · Escritório do Administrador'],
  ['/staging/assets/cliente.css','/identidade/assets/cliente.css'],
  ['/staging/assets/admin.css','/identidade/assets/admin.css'],
  ['/staging/assets/admin.js','/identidade/assets/admin-comercial.js'],
  ['LABORATÓRIO · SEM VENDAS REAIS','GESTÃO COMERCIAL · ACESSO RESTRITO'],
  ['Painel operacional conectado ao mesmo banco da loja e do cliente. Missões não criam pagamento, posição, giro nem benefício.',
   'Preços e custos por distribuidor com histórico e relatórios para contabilidade.']
 ]){
  if(base.split(antes).length!==2)
   throw Error('TEMPLATE_ADMIN_APROVADO_DESATUALIZADO');
  base=base.replace(antes,depois);
 }
 let pagina=base+"\n<section class=\"painel\" aria-labelledby=\"tituloProdutosAdmin\">\n <div class=\"linha\"><h2 id=\"tituloProdutosAdmin\">Produtos · preços e distribuidores</h2>\n  <button type=\"button\" id=\"recarregarProdutos\">Atualizar</button></div>\n <p class=\"subtexto\">Selecione um produto para conferir preço de venda, custo do distribuidor e diferença bruta. O custo é privado e não aparece ao cliente.</p>\n <div id=\"listaProdutosAdmin\" aria-live=\"polite\"></div>\n <h3 id=\"tituloFormularioProduto\">Editar valores do produto</h3>\n <form id=\"formEconomiaProduto\" autocomplete=\"off\">\n  <div class=\"duas-colunas\">\n   <div><label for=\"produtoIdAdmin\">Produto</label>\n    <input id=\"produtoIdAdmin\" readonly required></div>\n   <div><label for=\"distribuidorIdAdmin\">Distribuidor</label>\n    <input id=\"distribuidorIdAdmin\" readonly required></div>\n  </div>\n  <label for=\"skuAdmin\">SKU do distribuidor</label>\n  <input id=\"skuAdmin\" readonly>\n  <div class=\"duas-colunas\">\n   <div><label for=\"produtoPrecoAdmin\">Preço de venda (R$)</label>\n    <input id=\"produtoPrecoAdmin\" inputmode=\"decimal\" required\n     placeholder=\"0,00\" maxlength=\"14\">\n    <button type=\"button\" id=\"salvarPrecoAdmin\" class=\"primario\" disabled>\n     Salvar preço de venda</button></div>\n   <div><label for=\"produtoCustoAdmin\">Custo do fornecedor (R$)</label>\n    <input id=\"produtoCustoAdmin\" inputmode=\"decimal\"\n     placeholder=\"A cadastrar\" maxlength=\"14\">\n    <button type=\"button\" id=\"salvarCustoAdmin\" class=\"primario\" disabled>\n     Salvar custo do fornecedor</button></div>\n  </div>\n  <p id=\"diferencaBrutaAdmin\" class=\"subtexto\" aria-live=\"polite\">\n   Diferença bruta: aguardando seleção.</p>\n  <p class=\"subtexto\">A diferença bruta ainda não deduz frete pago, tarifa do PSP, impostos, estornos e despesas. Não é lucro líquido nem saldo do LOOP.</p>\n </form>\n <p id=\"resultadoProdutoAdmin\" class=\"subtexto\" role=\"status\"\n  aria-live=\"polite\">Selecione uma oferta para editar.</p>\n</section>\n<section class=\"painel\" aria-labelledby=\"tituloContabilidadeAdmin\">\n <h2 id=\"tituloContabilidadeAdmin\">Contabilidade · exportação</h2>\n <p class=\"subtexto\">Relatórios de preços, custos e vendas registrados. Tributos e lucro líquido devem ser apurados pelo contador.</p>\n <div class=\"linha\">\n  <a id=\"exportarCatalogoAdmin\" href=\"/api/admin/comercial/contador/catalogo.csv\">Exportar catálogo e custos (CSV)</a>\n  <a id=\"exportarPedidosAdmin\" href=\"/api/admin/comercial/contador/pedidos.csv\">Exportar vendas (CSV)</a>\n </div>\n</section>\n<p id=\"estadoAdminComercial\" role=\"status\" aria-live=\"polite\"></p>\n<p class=\"rodape\">Acesso exclusivo ao administrador. Esta tela não libera pagamentos, posições ou saques.</p>\n</main></body></html>";
 const adicao="<section class=\"painel\" aria-labelledby=\"cadastroProdutoAdminTitulo\">\n <h2 id=\"cadastroProdutoAdminTitulo\">Cadastrar produto e distribuidor</h2>\n <p class=\"subtexto\">Cadastre produtos e ofertas no rascunho comercial. Nenhuma oferta é publicada ou vendida até a homologação do distribuidor.</p>\n <div id=\"listaProdutosCadastrados\" aria-live=\"polite\"></div>\n <h3>Novo produto</h3>\n <form id=\"formNovoProduto\" autocomplete=\"off\">\n  <label for=\"novoProdutoId\">Código do produto (somente letras, números, traço e sublinhado)</label>\n  <input id=\"novoProdutoId\" required maxlength=\"80\" pattern=\"[A-Za-z0-9_-]{1,80}\">\n  <label for=\"novoProdutoTitulo\">Nome do produto</label>\n  <input id=\"novoProdutoTitulo\" required minlength=\"2\" maxlength=\"150\">\n  <label for=\"novoProdutoDescricao\">Descrição</label>\n  <textarea id=\"novoProdutoDescricao\" maxlength=\"2000\" rows=\"2\"></textarea>\n  <button type=\"submit\" id=\"salvarNovoProduto\" class=\"primario\" disabled>\n   Cadastrar produto como rascunho</button>\n </form>\n <h3>Adicionar distribuidor ao produto</h3>\n <form id=\"formNovaOferta\" autocomplete=\"off\">\n  <div class=\"duas-colunas\">\n   <div><label for=\"ofertaProdutoId\">Produto cadastrado</label>\n    <select id=\"ofertaProdutoId\" required></select></div>\n   <div><label for=\"ofertaDistribuidorId\">Código do distribuidor</label>\n    <input id=\"ofertaDistribuidorId\" required maxlength=\"80\"\n     pattern=\"[A-Za-z0-9_-]{1,80}\"></div>\n  </div>\n  <label for=\"ofertaSku\">SKU informado pelo distribuidor</label>\n  <input id=\"ofertaSku\" required maxlength=\"80\" pattern=\"[A-Za-z0-9_-]{1,80}\">\n  <div class=\"duas-colunas\">\n   <div><label for=\"ofertaPreco\">Preço de venda (R$)</label>\n    <input id=\"ofertaPreco\" required inputmode=\"decimal\" placeholder=\"0,00\"></div>\n   <div><label for=\"ofertaPrioridade\">Prioridade (1 = maior)</label>\n    <input id=\"ofertaPrioridade\" type=\"number\" min=\"1\" max=\"9999\"\n     value=\"100\" required></div>\n  </div>\n  <button type=\"submit\" id=\"salvarNovaOferta\" class=\"primario\" disabled>\n   Vincular distribuidor sem ativar a venda</button>\n </form>\n <p id=\"resultadoCadastroAdmin\" class=\"subtexto\" role=\"status\"></p>\n</section>\n";
 const manutencaoPainel=
  '<section class="painel" aria-labelledby="tituloManutencaoComercial">'+
  '<h2 id="tituloManutencaoComercial">Manutenção segura da AKITEMM</h2>'+
  '<p class="subtexto">Suspende novas cotações, novos pedidos e mudanças de preços/produtos. '+
  'O cliente continua entrando e acompanhando pedidos já pagos; entregas pagas não param.</p>'+
  '<p id="estadoManutencaoAdmin" role="status" aria-live="polite"></p>'+
  '<label for="motivoManutencaoAdmin">Motivo da alteração</label>'+
  '<select id="motivoManutencaoAdmin">'+
  '<option value="CORRECAO_TECNICA">Correção técnica</option>'+
  '<option value="VALIDACAO_CATALOGO">Conferir produtos e valores</option>'+
  '<option value="INCIDENTE_OPERACIONAL">Incidente operacional</option>'+
  '<option value="RETOMADA_OPERACAO">Retomar operações</option>'+
  '</select>'+
  '<div class="linha">'+
  '<button id="suspenderComercialAdmin" type="button" disabled>Suspender novas operações</button>'+
  '<button id="retomarComercialAdmin" type="button" disabled>Retomar novas operações</button>'+
  '<button id="atualizarManutencaoAdmin" type="button">Atualizar situação</button>'+
  '</div></section>';
 const classificacaoPainel='<section class="painel" aria-labelledby="tituloClassificacaoAdmin">'+
  '<h2 id="tituloClassificacaoAdmin">Cores dos produtos · LOOP</h2>'+
  '<p class="subtexto">Classificação aplicada aos novos pedidos. Alterações não mudam'+
  ' compras anteriores nem liberam pagamentos ou posições.</p>'+
  '<label for="corProdutoAdmin">Produto</label>'+
  '<select id="corProdutoAdmin"></select>'+
  '<label for="corTipoAdmin">Classificação</label>'+
  '<select id="corTipoAdmin">'+
  '<option value="CINZA">Cinza · sem posição</option>'+
  '<option value="VERDE">Verde · carrinho a partir de R$ 250</option>'+
  '<option value="DOURADO">Dourado · uma previsão por unidade</option>'+
  '<option value="ROXO">Roxo · evento especial pendente</option>'+
  '</select>'+
  '<label for="corMinimoAdmin">Quantidade mínima do produto</label>'+
  '<input id="corMinimoAdmin" type="number" min="1" max="50" value="1">'+
  '<label for="corRoxoAdmin">Posições especiais por unidade (apenas roxo)</label>'+
  '<input id="corRoxoAdmin" type="number" min="0" max="10" value="0">'+
  '<button id="salvarCorAdmin" class="primario" type="button" disabled>Salvar regra</button>'+
  '<p id="estadoCorAdmin" role="status">Consultando regras de cores...</p>'+
  '</section>';
 const auditoriaPainel='<section class="painel" aria-labelledby="tituloAuditoriaAdmin">'+
  '<div class="linha"><h2 id="tituloAuditoriaAdmin">Auditoria das mudanças</h2>'+
  '<button id="recarregarAuditoriaAdmin" type="button">Verificar histórico</button></div>'+
  '<p class="subtexto">Registro das alterações de produtos, preços e custos.'+
  ' Histórico somente leitura. Não muda valores nem posições.</p>'+
  '<p id="estadoAuditoriaAdmin" class="subtexto" role="status"></p>'+
  '<div id="listaAuditoriaAdmin" aria-live="polite"></div></section>';
 const motorPainel='<section class="painel" aria-labelledby="tituloMotorInternoAdmin">'+
  '<h2 id="tituloMotorInternoAdmin">LOOP · catraca e filas</h2>'+
  '<p id="loopAdminEstado" role="status">Consultando mesmo motor do cliente...</p>'+
  '<button id="atualizarLoopAdmin" type="button">Atualizar estado</button>'+
  '<h3>Compras qualificadas · ligação loja e LOOP</h3>'+
  '<p id="integracaoQualificadaEstado" class="subtexto" role="status">'+
  'Consultando integração do pedido à posição e às seis luzes...</p>'+
  '<div class="linha">'+
  '<button id="sincronizarComprasLoop" type="button" disabled>Sincronizar compras qualificadas</button>'+
  '<button id="prepararTabuleiroLoop" type="button" disabled>Preparar tabuleiro</button>'+
  '<button id="atualizarIntegracaoLoop" type="button">Atualizar integração</button>'+
  '</div>'+
  '<h3>Controle operacional da catraca</h3>'+
  '<p class="subtexto">As compras qualificadas continuam nas filas A/B mesmo com a catraca pausada. '+
  'São necessários seis eventos por ciclo. Configurações e giros aqui usam o motor interno de ensaio; '+
  'dinheiro real e saques permanecem desligados até homologação externa.</p>'+
  '<p id="estadoCatracaAdmin" role="status" aria-live="polite">Consultando política da catraca...</p>'+
  '<div class="duas-colunas">'+
  '<div><label for="modoCatracaAdmin">Funcionamento</label>'+
  '<select id="modoCatracaAdmin" disabled>'+
  '<option value="PAUSADA">Pausada por decisão do administrador</option>'+
  '<option value="MANUAL">Manual · administrador gira</option>'+
  '<option value="AUTOMATICA">Automática · dentro da agenda e seis eventos</option>'+
  '</select></div>'+
  '<div><label for="limiteCatracaAdmin">Máximo de giros por dia (vazio = sem limite)</label>'+
  '<input id="limiteCatracaAdmin" type="number" min="1" max="1000000" inputmode="numeric" placeholder="Sem limite" disabled></div>'+
  '<div><label for="inicioCatracaAdmin">Início da janela diária · Brasília</label>'+
  '<input id="inicioCatracaAdmin" type="time" value="00:00" disabled></div>'+
  '<div><label for="fimCatracaAdmin">Fim da janela diária · Brasília</label>'+
  '<input id="fimCatracaAdmin" type="time" value="00:00" disabled></div>'+
  '</div>'+
  '<label for="motivoCatracaAdmin">Motivo da configuração</label>'+
  '<input id="motivoCatracaAdmin" maxlength="200" value="AJUSTE_OPERACIONAL" disabled>'+
  '<div class="linha">'+
  '<button id="salvarCatracaAdmin" class="primario" type="button" disabled>Salvar e aplicar regras</button>'+
  '<button id="pausarCatracaAdmin" type="button" disabled>Pausar catraca</button>'+
  '<button id="liberarCatracaAdmin" type="button" disabled>Liberar modo manual</button>'+
  '<button id="girarCatracaAdmin" type="button" disabled>Executar próximo giro (6 eventos)</button>'+
  '<button id="atualizarCatracaAdmin" type="button">Atualizar controle</button>'+
  '</div></section>';
 const destino='<section class="painel" aria-labelledby="tituloContabilidadeAdmin">';
 if(!pagina.includes(destino))throw Error('PAINEL_ADMIN_APROVADO_DESATUALIZADO');
 return pagina.replace(destino,motorPainel+adicao+classificacaoPainel+manutencaoPainel+auditoriaPainel+destino);
}
function montarAdminComercialAprovado(app,{
 controle,catalogo,auditoria=null,manutencao=null,
 pedidosComerciais=null,classificacaoLoop=null,autorizarAdministrador,
 validarCsrfAdmin,obterCsrfAdmin,origemHttps
}={}){
 if(!controle||typeof controle.listarOfertas!=='function'||
    typeof autorizarAdministrador!=='function'||
    typeof validarCsrfAdmin!=='function'||
    typeof obterCsrfAdmin!=='function')
  throw Error('ADMIN_REAL_SEM_SESSAO_SEGURA');
 const html=renderizarAdminComercialAprovado();
 const router=criarRouterAdminEconomiaAkitemm({
  controle,catalogo,auditoria,manutencao,pedidosComerciais,classificacaoLoop,autorizarAdministrador,
  validarCsrfAdmin,origemHttps
 });
 const cabe=res=>{
  res.set('Cache-Control','no-store');
  res.set('X-Content-Type-Options','nosniff');
  res.set('Content-Security-Policy',
   "default-src 'none'; script-src 'self'; style-src 'self'; "+
   "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; "+
   "form-action 'self'");
 };
 app.get('/administrador',autorizarAdministrador,(_req,res)=>{
  cabe(res);return res.type('html').send(html);
 });
 app.get('/identidade/assets/admin.css',autorizarAdministrador,
  (_req,res)=>{cabe(res);return res.type('css')
   .sendFile(path.join(__dirname,'../candidato/escritorio-admin-candidato-ui.css'));});
 app.get('/identidade/assets/admin-comercial.js',autorizarAdministrador,
  (_req,res)=>{cabe(res);return res.type('js')
   .sendFile(path.join(__dirname,'interface-admin-comercial-client.js'));});
 app.get('/api/admin/comercial/sessao',autorizarAdministrador,
  async(req,res)=>{
   res.set('Cache-Control','no-store');
   try{
    const token=await obterCsrfAdmin(req);
    if(typeof token!=='string'||token.length<24||token.length>256||
       !/^[A-Za-z0-9_-]+$/.test(token))
     throw Error('CSRF_ADMIN_INVALIDO');
    return res.json({csrfToken:token,area:'ADMIN_COMERCIAL',
     pagamentosHabilitados:false});
   }catch{return res.status(503).json({erro:'SESSAO_ADMIN_INDISPONIVEL'});}
  });
 app.use('/api/admin/comercial',router);
 return {html};
}
module.exports={renderizarAdminComercialAprovado,
 montarAdminComercialAprovado};
