'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {NovidadesLojaCandidatoSQLite}=require('../src/domain/novidades-loja-candidato-sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const SECRET='operador-novidades-teste-'+('X'.repeat(40));
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+anxrAAAAAElFTkSuQmCC','base64');
function preparar(t){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;');
 if(t)t.after(()=>db.close());return db;
}
test('novidades livres: texto, imagem, ambas, varias, ordenacao e revisao SQLite',t=>{
 const db=preparar(t),n=new NovidadesLojaCandidatoSQLite({banco:db});
 assert.deepEqual(n.listar({publicadas:true}),[]);
 const msg=n.criar({titulo:'Super Oferta',texto:'Mensagem sem automatizar beneficio',ordem:30});
 assert.equal(msg.estado,'RASCUNHO');
 assert.deepEqual(n.listar({publicadas:true}),[]);
 const img=n.criar({titulo:'',texto:'',ordem:10});
 assert.throws(()=>n.atualizar({id:img.id,revisaoEsperada:1,
  alteracoes:{estado:'PUBLICADA'}}),{codigo:'NOVIDADE_SEM_CONTEUDO'});
 const salvo=n.gravarImagem({id:img.id,revisaoEsperada:1,mime:'image/png',dados:PNG});
 assert.equal(salvo.temImagem,true);
 const aoVivo=n.atualizar({id:img.id,revisaoEsperada:salvo.revisao,
  alteracoes:{estado:'PUBLICADA'}});
 const aoVivo2=n.atualizar({id:msg.id,revisaoEsperada:msg.revisao,
  alteracoes:{estado:'PUBLICADA'}});
 assert.deepEqual(n.listar({publicadas:true}).map(x=>x.id),[img.id,msg.id]);
 const reaberto=new NovidadesLojaCandidatoSQLite({banco:db});
 assert.equal(reaberto.imagem({id:img.id,publicada:true}).mime,'image/png');
 assert.deepEqual(reaberto.imagem({id:img.id}).bytes,PNG);
 assert.equal(reaberto.listar().length,2);
 assert.equal(reaberto.listar({publicadas:true})[0].semBeneficioAutomatico,true);
 assert.throws(()=>n.atualizar({id:msg.id,revisaoEsperada:1,
  alteracoes:{titulo:'obsoleto'}}),{codigo:'NOVIDADE_CONFLITO_REVISAO'});
 const oculto=n.atualizar({id:img.id,revisaoEsperada:aoVivo.revisao,
  alteracoes:{estado:'ARQUIVADA'}});
 assert.equal(oculto.estado,'ARQUIVADA');
 assert.throws(()=>reaberto.imagem({id:img.id,publicada:true}),
  {codigo:'NOVIDADE_NAO_PUBLICADA'});
 assert.deepEqual(n.listar({publicadas:true}).map(x=>x.id),[msg.id]);
 assert.throws(()=>db.exec('DELETE FROM akitemm_novidades_loja_auditoria_lab'),
  /historico imutavel/);
 assert.ok(db.prepare('SELECT COUNT(*) AS n FROM akitemm_novidades_loja_auditoria_lab').get().n>=5);
 assert.equal(aoVivo2.titulo,'Super Oferta');
});
test('bloqueios: tipo de imagem, campo desconhecido, tamanho e status transacional',t=>{
 const db=preparar(t),n=new NovidadesLojaCandidatoSQLite({banco:db});
 for(const v of [
  {titulo:'ok',valor:0},{titulo:'ok',estado:'PUBLICADA'},
  {titulo:'mal\u0000formatado'},{titulo:'ok',produtoId:'../secreto'},
  {titulo:'ok',ordem:-1}
 ])assert.throws(()=>n.criar(v));
 const um=n.criar({titulo:'Publicação'});
 for(const [mime,dados] of [
  ['image/svg+xml',Buffer.from('<svg/>')],
  ['image/png',Buffer.from('<script>alert(1)</script>')],
  ['image/png',Buffer.alloc(2097153)],
  ['image/jpeg',Buffer.from('nao e jpg nem png')]
 ])assert.throws(()=>n.gravarImagem({id:um.id,revisaoEsperada:1,mime,dados}),
  {codigo:'NOVIDADE_IMAGEM_INVALIDA'});
 assert.equal(n.listar()[0].revisao,1);
 assert.throws(()=>n.gravarImagem({id:um.id,revisaoEsperada:0,mime:'image/png',dados:PNG}),
  {codigo:'NOVIDADE_CONFLITO_REVISAO'});
 assert.equal(n.listar()[0].temImagem,false);
});
test('mesma loja e admin: autenticação, publicação, imagem e nenhum Pix/posição',async t=>{
 const db=preparar(t);
 const {app}=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:SECRET,termosVersao:'LAB-novidades-testes',
  termosTexto:'Publicacoes exclusivamente em ambiente de teste sem dinheiro, posicoes ou compras reais.'
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const acesso=(rota,opts={})=>fetch(base+rota,{...opts,
  headers:{Authorization:'Bearer '+SECRET,...(opts.headers||{})}});
 const json=async(rota,method,body,extra={})=>acesso(rota,{method,
  headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
 const rota='/staging/escritorio-unificado/novidades';
 assert.equal((await fetch(base+rota)).status,401);
 const acessoNegado=await fetch(base+rota,{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({titulo:'Nao autorizado'})
 });
 assert.equal(acessoNegado.status,401);
 const criado=await json(rota,'POST',{titulo:'Ganhe um PDF (anuncio de ensaio)',
  texto:'Oferta ilustrativa, sem brinde ou preco automaticos',ordem:2,estado:'RASCUNHO'});
 assert.equal(criado.status,201);
 let r=await criado.json();
 assert.equal((await fetch(base+'/staging/vitrine/novidades')).status,401);
 const imagem=await acesso(rota+'/'+r.id+'/imagem',{
  method:'PUT',headers:{'Content-Type':'image/png','X-Novidade-Revisao':String(r.revisao)},
  body:PNG
 });
 const corpoImagem=await imagem.text();
 assert.equal(imagem.status,200,corpoImagem);r=JSON.parse(corpoImagem);
 assert.equal(r.temImagem,true);
 const live=await json(rota+'/'+r.id,'PATCH',
  {alteracoes:{estado:'PUBLICADA'},revisaoEsperada:r.revisao});
 assert.equal(live.status,200);r=await live.json();
 const cadastrado=await fetch(base+'/staging/contas/cadastrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nome:'Teste Novidades',nick:'novidades2026',
   email:'novidades@example.invalid',senha:'SenhaTesteNovidades2026!',
   aceiteExplicito:true})
 });
 assert.equal(cadastrado.status,201);
 const login=await fetch(base+'/staging/contas/entrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nick:'novidades2026',senha:'SenhaTesteNovidades2026!'})
 });
 assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().find(x=>x.startsWith('loop_candidato_s=')).split(';')[0];
 const pub=await fetch(base+'/staging/vitrine/novidades',{headers:{Cookie:cookie}});
 assert.equal(pub.status,200);
 const dados=await pub.json();
 assert.equal(dados.itens[0].titulo,'Ganhe um PDF (anuncio de ensaio)');
 assert.equal(dados.semBeneficioAutomatico,true);
 assert.ok(!('precoCentavos' in dados.itens[0]));
 const foto=await fetch(base+'/staging/vitrine/novidades/'+r.id+'/imagem',{headers:{Cookie:cookie}});
 assert.equal(foto.status,200);
 assert.equal(foto.headers.get('content-type'),'image/png');
 assert.deepEqual(Buffer.from(await foto.arrayBuffer()),PNG);
 const html=await fetch(base+'/staging/loja',{headers:{Cookie:cookie}});
 assert.equal(html.status,200);
 assert.match(await html.text(),/id="novidadesVitrineAkitemm"/);
 const script=await fetch(base+'/staging/assets/loja-aprovada.js');
 assert.equal(script.status,200);
 assert.match(await script.text(),/renderizarNovidadesEditorais/);
 const arquivado=await json(rota+'/'+r.id,'PATCH',
  {alteracoes:{estado:'ARQUIVADA'},revisaoEsperada:r.revisao});
 assert.equal(arquivado.status,200);
 assert.deepEqual((await (await fetch(base+'/staging/vitrine/novidades',
  {headers:{Cookie:cookie}})).json()).itens,[]);
 const agora=await fetch(base+'/staging/vitrine/novidades/'+r.id+'/imagem',{headers:{Cookie:cookie}});
 assert.equal(agora.status,404);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes').get().n,0);
});
