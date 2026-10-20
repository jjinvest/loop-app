'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {IndicacoesLinksComissoesDemoSQLite,extrairLink}=require('../src/domain/indicacoes-links-comissoes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

test('mesma indicacao apresenta loja ou escritorio, com vitrine e precos livres',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const produto={id:'produto-livre-600',nome:'Item de fornecedor',
  tipo:'FISICO',estado:'PUBLICADO',descricao:'Demonstracao de preco livre',
  precoCentavos:60000,entrega:'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
 repo.salvar({produto,revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const senha='senha-exemplo-segura-2026';
 const indicador=contas.cadastrar({nome:'Pessoa que apresenta LOOP',
  email:'apresentador@exemplo.invalid',senha});
 const servidor=criarAppAdminLaboratorio({repositorio:repo,
  segredo:'admin-ficticio-links-dois-destinos-2026'}).listen(0,'127.0.0.1');
 await once(servidor,'listening');
 t.after(()=>new Promise(resolve=>servidor.close(resolve)));
 const base='http://127.0.0.1:'+servidor.address().port;
 const links=new IndicacoesLinksComissoesDemoSQLite({banco:repo.banco,contas});
 const ini=links.linkDaConta(indicador.contaId);
 assert.equal(ini.ativo,false);
 assert.equal(ini.linkEscritorioCurto,null,'sem nick, endereço curto fica em branco');
 assert.equal(ini.linkLojaCurto,null,'não usar nome de exemplo como valor padrão');
 assert.equal(ini.mesmoCodigoIndicador,true);
 assert.notEqual(ini.linkLoja,ini.linkEscritorio);
 assert.equal(extrairLink(ini.linkLoja).token,extrairLink(ini.linkEscritorio).token);
 assert.equal(extrairLink(ini.link).token,extrairLink(ini.linkEscritorio).token);
 assert.equal(extrairLink(ini.linkLoja).destino,'loja');
 assert.equal(extrairLink(ini.linkEscritorio).destino,'escritorio');
 assert.equal(extrairLink(ini.link).destino,'escritorio');
 for(const ruim of [ini.link+'?destino=outro',ini.link+'?destino=loja&extra=1',
   ini.link+'?destino=loja&destino=escritorio',ini.link+'?destino=',ini.link+'#hack']){
  assert.throws(()=>extrairLink(ruim),e=>e.codigo==='LINK_INVALIDO');
 }
 const convite='api/laboratorio/convite/';
 const ler=async url=>{
  const r=await fetch(base+'/'+url);
  return {status:r.status,data:await r.json()};
 };
 let before=await ler(convite+'estado?link='+encodeURIComponent(ini.linkLoja));
 assert.equal(before.status,200);
 assert.equal(before.data.destino,'loja');
 assert.equal(before.data.ativo,false);
 assert.equal((await ler(convite+'vitrine?link='+encodeURIComponent(ini.linkLoja))).status,403);
 repo.banco.prepare(`INSERT INTO admin_ponte_vendas_loja_sem_loop_demo
  (pedido_id,conta_id,produto_id,valor_centavos,confirmado_em)
  VALUES (?,?,?,?,?)`).run('primeira-compra-liberar-link',indicador.contaId,
  'item-50',5000,'2030-01-01T12:00:00.000Z');
 const ativo=links.linkDaConta(indicador.contaId);
 assert.equal(ativo.ativo,true);
 const apresentacao=await ler(convite+'estado?link='+encodeURIComponent(ativo.linkEscritorio));
 assert.equal(apresentacao.data.destino,'escritorio');
 assert.equal(apresentacao.data.cadastroPermitido,true);
 const loja=await ler(convite+'vitrine?link='+encodeURIComponent(ativo.linkLoja));
 assert.equal(loja.status,200);
 assert.equal(loja.data.produtos[0].precoCentavos,60000);
 assert.equal(loja.data.produtos[0].nome,produto.nome);
 assert.equal(JSON.stringify(loja.data).includes('fornecedorId'),false);
 assert.equal(JSON.stringify(loja.data).includes('custoFornecedorCentavos'),false);
 repo.atualizar({id:produto.id,revisaoEsperada:1,alteracoes:{precoCentavos:65000}});
 const vitrineReprecificada=await ler(convite+'vitrine?link='+encodeURIComponent(ativo.linkLoja));
 assert.equal(vitrineReprecificada.data.produtos[0].precoCentavos,65000);
 for(const link of [ativo.linkLoja,ativo.linkEscritorio]){
  const resposta=await fetch(base+'/'+convite+'cadastrar',{
   method:'POST',headers:{'Content-Type':'application/json','X-LOOP-LAB':'convite'},
   body:JSON.stringify({
    nome:link===ativo.linkLoja?'Convidado Pela Loja':'Convidado Pelo Escritorio',
    email:link===ativo.linkLoja?'convidado-loja@exemplo.invalid':'convidado-escritorio@exemplo.invalid',
    telefone:link===ativo.linkLoja?'(24) 99999-8611':'(24) 99999-8622',senha,link
   })
  });
  assert.equal(resposta.status,201);
  const cadastrado=await resposta.json();
  assert.equal(contas.buscar(cadastrado.contaId).indicadoPorId,indicador.contaId);
  assert.equal(cadastrado.linkDoNovoCliente.ativo,false);
 }
 const login=await fetch(base+'/api/laboratorio/participante/entrar',{
  method:'POST',headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
  body:JSON.stringify({nome:indicador.nome,senha})
 });
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const meus=await fetch(base+'/api/laboratorio/participante/meus-links',{headers:{Cookie:cookie}});
 assert.equal(meus.status,200);
 const meusLinks=await meus.json();
 assert.equal(meusLinks.linkLoja,ativo.linkLoja);
 assert.equal(meusLinks.linkEscritorio,ativo.linkEscritorio);
 assert.equal((await fetch(base+'/api/laboratorio/participante/meus-links')).status,401);
 const siteLoja=await(await fetch(base+'/laboratorio/loja')).text();
 const siteEscritorio=await(await fetch(base+'/laboratorio/participante')).text();
 const siteConvite=await(await fetch(base+ativo.linkLoja)).text();
 assert.match(siteLoja,/copiarDivulgarLojaLoop/);
 assert.match(siteEscritorio,/copiarLinkLojaParticipante/);
 assert.match(siteConvite,/produtosVitrineConvite/);
 const scripts=await Promise.all(['/laboratorio/participante.js','/laboratorio/loja.js',
  '/laboratorio/convite.js'].map(x=>fetch(base+x).then(x=>x.text())));
 assert.match(scripts[0],/linkEscritorio/);
 assert.match(scripts[1],/linkLoja/);
 assert.match(scripts[2],/linkConvite/);
 assert.ok(scripts.every(x=>!/innerHTML|localStorage|sessionStorage/.test(x)));
});


test('urls curtas Loja e Escritório preservam indicação e ocultam token',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const conta=contas.cadastrar({nome:'Titular Curto',apelido:'Vilela',
  email:'curto@exemplo.invalid',senha:'senha-forte-exemplo-2026'});
 const srv=criarAppAdminLaboratorio({repositorio:repo,segredo:'admin-test-nick-curto-2026-segredo-alto'})
  .listen(0,'127.0.0.1');
 await once(srv,'listening');t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const links=new IndicacoesLinksComissoesDemoSQLite({banco:repo.banco,contas});
 const dados=links.linkDaConta(conta.contaId);
 assert.equal(dados.linkLojaCurto,'/loja/Vilela');
 assert.equal(dados.linkEscritorioCurto,'/escritorio/Vilela');
 assert.doesNotMatch(dados.linkLojaCurto,/convite|lp-/);
 assert.equal(links.resolver('/loja/vilela').indicadorId,conta.contaId);
 assert.equal(links.resolver('/escritorio/VILELA').indicadorId,conta.contaId);
 assert.equal(links.resolver(dados.linkEscritorio).indicadorId,conta.contaId);
 assert.equal((await fetch(base+dados.linkLojaCurto)).status,200);
 assert.equal((await fetch(base+dados.linkEscritorioCurto)).status,200);
 assert.equal((await fetch(base+'/loja/nick-inexistente')).status,404);
 const resposta=await fetch(base+'/api/laboratorio/convite/estado?link='+
  encodeURIComponent(dados.linkLojaCurto));
 assert.equal(resposta.status,200);
 const info=await resposta.json();
 assert.equal(info.destino,'loja');
 assert.equal(info.ativo,false);
});
