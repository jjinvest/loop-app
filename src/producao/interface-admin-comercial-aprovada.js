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
 return base+"\n<section class=\"painel\" aria-labelledby=\"tituloProdutosAdmin\">\n <div class=\"linha\"><h2 id=\"tituloProdutosAdmin\">Produtos · preços e distribuidores</h2>\n  <button type=\"button\" id=\"recarregarProdutos\">Atualizar</button></div>\n <p class=\"subtexto\">Selecione um produto para conferir preço de venda, custo do distribuidor e diferença bruta. O custo é privado e não aparece ao cliente.</p>\n <div id=\"listaProdutosAdmin\" aria-live=\"polite\"></div>\n <h3 id=\"tituloFormularioProduto\">Editar valores do produto</h3>\n <form id=\"formEconomiaProduto\" autocomplete=\"off\">\n  <div class=\"duas-colunas\">\n   <div><label for=\"produtoIdAdmin\">Produto</label>\n    <input id=\"produtoIdAdmin\" readonly required></div>\n   <div><label for=\"distribuidorIdAdmin\">Distribuidor</label>\n    <input id=\"distribuidorIdAdmin\" readonly required></div>\n  </div>\n  <label for=\"skuAdmin\">SKU do distribuidor</label>\n  <input id=\"skuAdmin\" readonly>\n  <div class=\"duas-colunas\">\n   <div><label for=\"produtoPrecoAdmin\">Preço de venda (R$)</label>\n    <input id=\"produtoPrecoAdmin\" inputmode=\"decimal\" required\n     placeholder=\"0,00\" maxlength=\"14\">\n    <button type=\"button\" id=\"salvarPrecoAdmin\" class=\"primario\" disabled>\n     Salvar preço de venda</button></div>\n   <div><label for=\"produtoCustoAdmin\">Custo do fornecedor (R$)</label>\n    <input id=\"produtoCustoAdmin\" inputmode=\"decimal\"\n     placeholder=\"A cadastrar\" maxlength=\"14\">\n    <button type=\"button\" id=\"salvarCustoAdmin\" class=\"primario\" disabled>\n     Salvar custo do fornecedor</button></div>\n  </div>\n  <p id=\"diferencaBrutaAdmin\" class=\"subtexto\" aria-live=\"polite\">\n   Diferença bruta: aguardando seleção.</p>\n  <p class=\"subtexto\">A diferença bruta ainda não deduz frete pago, tarifa do PSP, impostos, estornos e despesas. Não é lucro líquido nem saldo do LOOP.</p>\n </form>\n <p id=\"resultadoProdutoAdmin\" class=\"subtexto\" role=\"status\"\n  aria-live=\"polite\">Selecione uma oferta para editar.</p>\n</section>\n<section class=\"painel\" aria-labelledby=\"tituloContabilidadeAdmin\">\n <h2 id=\"tituloContabilidadeAdmin\">Contabilidade · exportação</h2>\n <p class=\"subtexto\">Relatórios de preços, custos e vendas registrados. Tributos e lucro líquido devem ser apurados pelo contador.</p>\n <div class=\"linha\">\n  <a id=\"exportarCatalogoAdmin\" href=\"/api/admin/comercial/contador/catalogo.csv\">Exportar catálogo e custos (CSV)</a>\n  <a id=\"exportarPedidosAdmin\" href=\"/api/admin/comercial/contador/pedidos.csv\">Exportar vendas (CSV)</a>\n </div>\n</section>\n<p id=\"estadoAdminComercial\" role=\"status\" aria-live=\"polite\"></p>\n<p class=\"rodape\">Acesso exclusivo ao administrador. Esta tela não libera pagamentos, posições ou saques.</p>\n</main></body></html>";
}
function montarAdminComercialAprovado(app,{
 controle,pedidosComerciais=null,autorizarAdministrador,
 validarCsrfAdmin,obterCsrfAdmin,origemHttps
}={}){
 if(typeof autorizarAdministrador!=='function'||
    typeof validarCsrfAdmin!=='function'||
    typeof obterCsrfAdmin!=='function')
  throw Error('ADMIN_REAL_SEM_SESSAO_SEGURA');
 const html=renderizarAdminComercialAprovado();
 const router=criarRouterAdminEconomiaAkitemm({
  controle,pedidosComerciais,autorizarAdministrador,
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
   .sendFile(path.join(__dirname,'interface-admin-comercial-aprovada.js'));});
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
