'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
test('AKITEMM: só comprador de produto entregue ficticiamente avalia; moderação protege privacidade',async t=>{
 const repositorio=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repositorio.fechar());
 repositorio.salvar({produto:{
  id:'kit-fisico-teste',nome:'Kit físico fictício',tipo:'FISICO',estado:'PUBLICADO',
  descricao:'Produto fictício para ensaio de avaliações',precoCentavos:8000,
  entrega:'FORNECEDOR_INTEGRADO',fotos:[],detalhes:['Peso 150g'],
  videoApresentacaoUrl:null
 },revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repositorio.banco});
 const senha='senha-avaliacao-testes-2026';
 const a=contas.cadastrar({nome:'Comprador Avaliação Demo',email:'avaliacao-um@exemplo.invalid',senha});
 const b=contas.cadastrar({nome:'Outro Comprador Demo',email:'avaliacao-dois@exemplo.invalid',senha});
 const segredo='segredo-admin-avaliacoes-123456789012345678';
 const app=criarAppAdminLaboratorio({repositorio,segredo});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const headersCliente={'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 const headersAdmin={'Content-Type':'application/json',Authorization:'Bearer '+segredo};
 const call=async(path,{method='GET',cookie=null,body=null,admin=false}={})=>{
  const resp=await fetch(base+path,{
   method,headers:{...(admin?headersAdmin:headersCliente),...(cookie?{Cookie:cookie}:{})},
   ...(body===null?{}:{body:JSON.stringify(body)})
  });
  return {status:resp.status,data:await resp.json(),cookie:resp.headers.get('set-cookie')};
 };
 const login=async nome=>{
  const r=await call('/api/laboratorio/participante/entrar',{method:'POST',body:{nome,senha}});
  assert.equal(r.status,200);return r.cookie.split(';')[0];
 };
 const cookieA=await login(a.nome),cookieB=await login(b.nome);
 const prefix='/api/laboratorio/participante/loja';
 const adm='/api/admin';
 const pedidoItens={itens:[{produtoId:'kit-fisico-teste',quantidade:1}]};
 assert.equal((await call(prefix+'/pedidos',{method:'POST',cookie:cookieA,body:pedidoItens})).status,409);
 const endereco={destinatario:'Pessoa destinatária fictícia',cep:'27260000',logradouro:'Rua Exemplo',
  numero:'12',complemento:'',bairro:'Centro',cidade:'Volta Redonda',uf:'RJ',
  telefone:'21999999999',referencia:''};
 assert.equal((await call(prefix+'/entrega',{method:'POST',cookie:cookieA,body:endereco})).status,200);
 const criado=await call(prefix+'/pedidos',{method:'POST',cookie:cookieA,body:pedidoItens});
 assert.equal(criado.status,201);const pedidoId=criado.data.pedido.pedidoId;
 const aval={pedidoId,produtoId:'kit-fisico-teste',nota:5,
  comentario:'Minha experiência fictícia foi bem organizada.'};
 assert.equal((await call(prefix+'/avaliacoes',{method:'POST',cookie:cookieA,body:aval})).status,409);
 assert.equal((await call(adm+'/akitemm-avaliacoes-demo/entregas',{
  method:'POST',admin:true,body:{pedidoId}
 })).status,409,'Sem pagamento confirmado não há entrega autorizada');
 const confirmou=await call(adm+'/carrinho-loop-demo/'+pedidoId+'/eventos',{
  method:'POST',admin:true,body:{eventoId:'pagamento-para-avaliacao-teste',tipo:'CONFIRMAR_FICTICIO'}
 });
 assert.equal(confirmou.status,200);
 const entregue=await call(adm+'/akitemm-avaliacoes-demo/entregas',{
  method:'POST',admin:true,body:{pedidoId}
 });
 assert.equal(entregue.status,200);assert.equal(entregue.data.semEntregaReal,true);
 const novamente=await call(adm+'/akitemm-avaliacoes-demo/entregas',{
  method:'POST',admin:true,body:{pedidoId}
 });
 assert.equal(novamente.status,200);assert.equal(novamente.data.repetido,true);
 const aptos=await call(prefix+'/avaliacoes/pendentes',{cookie:cookieA});
 assert.equal(aptos.data.itens.length,1);
 assert.equal(aptos.data.itens[0].statusAvaliacao,null);
 assert.equal((await call(prefix+'/avaliacoes/pendentes',{cookie:cookieB})).data.itens.length,0);
 assert.equal((await call(prefix+'/avaliacoes',{method:'POST',cookie:cookieB,body:aval})).status,409);
 const publicado=await call(prefix+'/avaliacoes/kit-fisico-teste',{cookie:cookieB});
 assert.deepEqual(publicado.data.avaliacoes,[]);
 assert.equal((await call(prefix+'/avaliacoes',{method:'POST',cookie:cookieA,body:aval})).status,201);
 assert.equal((await call(prefix+'/avaliacoes',{method:'POST',cookie:cookieA,body:aval})).status,409);
 assert.deepEqual((await call(prefix+'/avaliacoes/kit-fisico-teste',{cookie:cookieB})).data.avaliacoes,[]);
 const moderacao=await call(adm+'/akitemm-avaliacoes-demo',{admin:true});
 assert.equal(moderacao.data.pendentes.length,1);
 const id=moderacao.data.pendentes[0].id;
 assert.equal((await call(adm+'/akitemm-avaliacoes-demo/moderar',{
  method:'POST',admin:true,
  body:{id,status:'APROVADA',imagemCaminho:'/imagens/catalogo/depoimento.webp'}
 })).status,200);
 assert.equal((await call(adm+'/akitemm-avaliacoes-demo/moderar',{
  method:'POST',admin:true,
  body:{id,status:'APROVADA',imagemCaminho:null}
 })).status,409);
 const publicas=await call(prefix+'/avaliacoes/kit-fisico-teste',{cookie:cookieB});
 assert.equal(publicas.data.avaliacoes.length,1);
 assert.equal(publicas.data.avaliacoes[0].nota,5);
 assert.equal(publicas.data.avaliacoes[0].imagemCaminho,'/imagens/catalogo/depoimento.webp');
 assert.equal(JSON.stringify(publicas.data).includes(cookieA),false);
 assert.equal(JSON.stringify(publicas.data).includes(a.contaId),false);
 assert.equal(JSON.stringify(publicas.data).includes(pedidoId),false);
 const pend=await call(prefix+'/avaliacoes/pendentes',{cookie:cookieA});
 assert.equal(pend.data.itens[0].statusAvaliacao,'APROVADA');
});
