'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const {auditarEntregasEstornosCarrinhoDemo}=require('../src/domain/auditoria-entregas-estornos-carrinho-demo');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CarrinhoLojaLoopDemoSQLite}=require('../src/domain/carrinho-loja-loop-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');

function produto(id,precoCentavos,tipo){
 return {id,nome:'Produto ficticio '+id,tipo,estado:'PUBLICADO',
  descricao:'Unicamente laboratorio',precoCentavos,
  entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
function contexto(){
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 repo.salvar({produto:produto('produto-pdf-aud',10000,'PDF'),revisaoEsperada:0});
 repo.salvar({produto:produto('produto-fisico-aud',15000,'FISICO'),revisaoEsperada:0});
 repo.salvar({produto:produto('produto-pdf-250',25000,'PDF'),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const pedidosIdentificados=new PedidosTitularidadeDemoSQLite({banco:repo.banco,contas});
 let carrinhos;
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,pedidosIdentificados,
  consultarPagamentoConfiavel:async id=>carrinhos.comprovanteConfirmado(id)
 });
 carrinhos=new CarrinhoLojaLoopDemoSQLite({catalogo:repo,contas,pedidosIdentificados,ponte});
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte});
 return {repo,contas,carrinhos,ponte,adesoes};
}
const diagnostico=c=>auditarEntregasEstornosCarrinhoDemo({carrinhos:c});
test('trilha carrinho misto: aguarda, confirma, sincroniza e estorna sem cancelar vaga automaticamente',async t=>{
 const {repo,contas,carrinhos,ponte}=contexto();t.after(()=>repo.fechar());
 const pessoa=contas.cadastrar({nome:'Comprador Auditoria Estorno',
  email:'estorno@exemplo.invalid',senha:'senha-ficticia-longa'});
 let vazio=diagnostico(carrinhos);
 assert.equal(vazio.situacao,'SEM_ALERTAS_DE_CONCILIACAO');
 assert.equal(vazio.totais.pedidos,0);
 const pedidoId='pedido-conciliacao-estorno';
 const criar=carrinhos.criar({pedidoId,contaId:pessoa.contaId,itens:[
  {produtoId:'produto-pdf-aud',quantidade:1},
  {produtoId:'produto-fisico-aud',quantidade:1}
 ]});
 assert.equal(criar.totalCentavos,25000);
 let r=diagnostico(carrinhos);
 assert.equal(r.totais.aguardandoFicticio,1);
 assert.equal(r.totais.pedidosFisicosAguardandoIntegracao,1);
 assert.deepEqual(r.relatorios[0].pendencias,['ENTREGA_FISICA_SEM_VINCULO_LOGISTICO_REAL']);
 assert.equal(r.relatorios[0].exigeRevisaoOperacional,false);
 carrinhos.registrarEvento({pedidoId,eventoId:'evento-conf-estorno-a',tipo:'CONFIRMAR_FICTICIO'});
 r=diagnostico(carrinhos);
 assert.equal(r.totais.confirmacoesSemConciliacao,1);
 assert.deepEqual(r.relatorios[0].alertas,['CONFIRMACAO_SEM_CONCILIACAO_NA_PONTE']);
 assert.equal(r.totais.pedidosFisicosAguardandoIntegracao,1);
 const sincronizado=await carrinhos.sincronizar(pedidoId);
 assert.equal(sincronizado.posicaoCriada,true);
 assert.equal(sincronizado.posicaoId,1);
 r=diagnostico(carrinhos);
 assert.equal(r.totais.confirmacoesSemConciliacao,0);
 assert.equal(r.relatorios[0].quantidadePosicoes,1);
 assert.equal(r.situacao,'SEM_ALERTAS_DE_CONCILIACAO');
 carrinhos.registrarEvento({pedidoId,eventoId:'evento-estorno-a',tipo:'ESTORNAR_FICTICIO'});
 const estadoAntes=ponte._restaurar().exportarSnapshot();
 const countAntes=repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_carrinho_loop_eventos_demo').get().n;
 r=diagnostico(carrinhos);
 assert.equal(r.situacao,'EXIGE_REVISAO');
 assert.equal(r.totais.estornadosComPosicao,1);
 assert.equal(r.totais.valorBrutoEstornadoFicticioCentavos,25000);
 assert.deepEqual(r.relatorios[0].posicoesIds,[1]);
 assert.deepEqual(r.relatorios[0].alertas,['ESTORNO_COM_POSICAO_PRESERVADA']);
 assert.equal(r.relatorios[0].exigeRevisaoOperacional,true);
 assert.equal(r.nenhumDireitoCanceladoAutomaticamente,true);
 assert.equal(r.creditoDeCaixaRealGerado,false);
 assert.equal(r.reembolsoRealExecutado,false);
 assert.equal(r.entregaRealNaoComprovada,true);
 assert.equal(r.fornecedorRealNaoAcionado,true);
 assert.deepEqual(ponte._restaurar().exportarSnapshot(),estadoAntes);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_carrinho_loop_eventos_demo').get().n,countAntes);
 assert.equal(JSON.stringify(r).includes('estorno@exemplo.invalid'),false);
 assert.equal(JSON.stringify(r).includes(pessoa.contaId),false);
 assert.equal((await carrinhos.sincronizar(pedidoId)).situacao,'ESTORNADO_REQUER_CONFERENCIA');
 assert.equal(ponte.consultar().compras.length,1);
 assert.equal(ponte.consultar().comprasLojaSemLoop.length,0);
});
test('estorno com convite e comissao alerta sem reversao automatica ou nova provisao',async t=>{
 const {repo,contas,carrinhos,ponte,adesoes}=contexto();t.after(()=>repo.fechar());
 const senha='senha-ficticia-longa';
 const a=contas.cadastrar({nome:'Indicador Teste',email:'indicador@exemplo.invalid',senha});
 const b=contas.cadastrar({nome:'Indicado Teste',email:'indicado@exemplo.invalid',senha,
  codigoIndicador:a.codigoConvite});
 const inicio=carrinhos.criar({pedidoId:'pedido-basico-indicador',contaId:a.contaId,itens:[
  {produtoId:'produto-pdf-aud',quantidade:1}
 ]});
 assert.equal(inicio.totalCentavos,10000);
 carrinhos.registrarEvento({pedidoId:inicio.pedidoId,eventoId:'conf-base-a',tipo:'CONFIRMAR_FICTICIO'});
 await carrinhos.sincronizar(inicio.pedidoId);
 adesoes.ativar({contaId:a.contaId,cpfFicticio:'11144477735',
  aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
 const elegivel=carrinhos.criar({pedidoId:'pedido-indicado-comissao',contaId:b.contaId,itens:[
  {produtoId:'produto-pdf-250',quantidade:1}
 ]});
 carrinhos.registrarEvento({pedidoId:elegivel.pedidoId,eventoId:'conf-indicado-b',tipo:'CONFIRMAR_FICTICIO'});
 const ligado=await carrinhos.sincronizar(elegivel.pedidoId);
 assert.equal(ligado.posicaoCriada,true);
 assert.equal(ligado.indicacaoNova,true);
 assert.ok(ligado.comissaoSimuladaCentavos>0);
 carrinhos.registrarEvento({pedidoId:elegivel.pedidoId,eventoId:'estorno-indicado-b',tipo:'ESTORNAR_FICTICIO'});
 const antes=ponte.consultar();
 const audit=diagnostico(carrinhos);
 const linha=audit.relatorios.find(x=>x.pedidoId==='pedido-indicado-comissao');
 assert.deepEqual(linha.alertas.sort(),[
  'ESTORNO_COM_POSICAO_PRESERVADA',
  'ESTORNO_COM_COMISSAO_JA_PROVISIONADA',
  'ESTORNO_COM_INDICACAO_VALIDADA'
 ].sort());
 assert.equal(audit.totais.estornadosComPosicao,1);
 assert.equal(audit.totais.estornadosComComissao,1);
 assert.equal(audit.totais.estornadosComConvite,1);
 assert.ok(linha.comissoesProvisionadasCentavos>0);
 assert.equal(linha.conviteValidado,true);
 assert.equal(audit.reembolsoRealExecutado,false);
 assert.deepEqual(ponte.consultar(),antes);
});
test('estorno de venda pequena nao simula credito nem cancela produto em estoque',async t=>{
 const {repo,contas,carrinhos,ponte}=contexto();t.after(()=>repo.fechar());
 const p=contas.cadastrar({nome:'Somente Loja',email:'somente@exemplo.invalid',
  senha:'senha-ficticia-longa'});
 carrinhos.criar({pedidoId:'pequena-sem-loop',contaId:p.contaId,itens:[
  {produtoId:'produto-pdf-aud',quantidade:1}
 ]});
 carrinhos.registrarEvento({pedidoId:'pequena-sem-loop',eventoId:'conf-pequena',tipo:'CONFIRMAR_FICTICIO'});
 assert.equal((await carrinhos.sincronizar('pequena-sem-loop')).posicaoCriada,false);
 carrinhos.registrarEvento({pedidoId:'pequena-sem-loop',eventoId:'estorno-pequena',tipo:'ESTORNAR_FICTICIO'});
 const r=diagnostico(carrinhos);
 assert.equal(r.relatorios[0].vendaSomenteLojaRegistrada,true);
 assert.deepEqual(r.relatorios[0].posicoesIds,[]);
 assert.deepEqual(r.relatorios[0].alertas,['ESTORNO_COM_VENDA_SOMENTE_LOJA_REGISTRADA']);
 assert.equal(r.totais.estornadosComPosicao,0);
 assert.equal(ponte.consultar().compras.length,0);
 assert.equal(ponte.consultar().comprasLojaSemLoop.length,1);
});
test('API do relatorio apenas admin, sem parametro e sem exposicao publica',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const segredo='auditoria-entregas-estornos-carrinho-demo-admin';
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port;
 const path='/api/admin/carrinho-loop-demo/auditoria-entregas-estornos';
 const headers={Authorization:'Bearer '+segredo};
 assert.equal((await fetch(url+path)).status,401);
 assert.equal((await fetch(url+path,{headers:{...headers,Origin:'https://externo.invalid'}})).status,403);
 assert.equal((await fetch(url+path+'?forcar=true',{headers})).status,400);
 const res=await fetch(url+path,{headers});
 assert.equal(res.status,200);
 assert.equal(res.headers.get('cache-control'),'no-store');
 const body=await res.json();
 assert.equal(body.somenteLeitura,true);
 assert.equal(body.semsDadosPessoaisNoRelatorio,undefined);
 assert.equal(body.semDadosPessoaisNoRelatorio,true);
 assert.equal(body.totais.pedidos,0);
 assert.equal((await fetch(url+path,{method:'POST',headers:{...headers,
  'Content-Type':'application/json'},body:'{}'})).status,404);
 const publicServer=require('../src/server').listen(0,'127.0.0.1');
 await once(publicServer,'listening');
 t.after(()=>new Promise(resolve=>publicServer.close(resolve)));
 assert.equal((await fetch('http://127.0.0.1:'+publicServer.address().port+path,{headers})).status,404);
});
