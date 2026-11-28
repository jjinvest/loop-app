'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=require('../src/producao/motor-loop-integrado-sqlite');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');
const {VisaoEscritorioUnificadaSQLite}=require('../src/producao/visao-escritorio-unificada-sqlite');
const DOC='Termos fictícios para testar vínculos de convites, sem compras reais, '+
 'sem ganhos, sem pagamentos e sem promessa de bonificação.';
const ORIGEM='https://contas.example.invalid';
test('links institucionais do proprietário abrem loja/escritório e preservam indicação sem compra ou crédito',async t=>{
 const x=preparar();t.after(()=>x.banco.close());
 const dono=await x.cadastrar('Vilela');
 await x.cadastrar('Outro');
 const opcoes={contas:x.contas,motorLoop:x.motor,origemHttps:ORIGEM,
  permitirCadastro:true,divulgadorInstitucionalNick:'VILELA'};
 assert.throws(()=>criarAppIdentidadeLoop({...opcoes,divulgadorInstitucionalNick:'Inexistente'}),/DIVULGADOR_INSTITUCIONAL_NAO_ENCONTRADO/);
 const app=criarAppIdentidadeLoop(opcoes);
 const srv=app.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(()=>new Promise(done=>srv.close(done)));
 const base='http://127.0.0.1:'+srv.address().port;
 for(const [url,destino] of [['/loja/VILELA','/loja?ref=vilela'],
  ['/escritorio/VILELA','/escritorio?ref=vilela'],['/convite/loja?ref=VILELA','/loja?ref=VILELA']]){
  const r=await fetch(base+url,{redirect:'manual'});
  assert.equal(r.status,303,url);assert.equal(r.headers.get('location'),destino);
  assert.equal((await fetch(base+destino)).status,200);
 }
 assert.equal((await fetch(base+'/loja/Outro')).status,403);
 assert.equal((await fetch(base+'/escritorio/Inexistente')).status,404);
 const login=await x.contas.entrar({nick:'Vilela',senha:'SenhaExemplo2026!'});
 const d=await (await fetch(base+'/api/contas/divulgacao',{
  headers:{Cookie:'loop_real_s='+login.token}})).json();
 assert.equal(d.linkLiberado,true);
 assert.equal(d.fonte,'CANAL_INSTITUCIONAL_AUTORIZADO');
 assert.equal(d.compraHabilitadoraConfirmada,false);
 assert.equal(d.financeiroReal,false);
 const r=await fetch(base+'/api/contas/cadastrar',{method:'POST',
  headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({nome:'Indicado isolado',nick:'Convidado',email:'convidado@example.invalid',
   senha:'SenhaExemplo2026!',indicadorNick:'VILELA',aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:x.docs.termos.versao,hashTermos:x.docs.termos.hash,
   versaoPrivacidade:x.docs.privacidade.versao,hashPrivacidade:x.docs.privacidade.hash})});
 assert.equal(r.status,201,JSON.stringify(await r.json()));
 assert.equal(x.contas.listarIndicados(dono.titularId).total,1);
 assert.equal(x.motor.consultar().catraca.giros,0);
 assert.equal(x.motor.consultar().filaA+x.motor.consultar().filaB,0);
 assert.equal(x.banco.prepare('SELECT COUNT(*) AS n FROM loop_real_vinculos_indicacao WHERE indicador_id=?').get(dono.titularId).n,1);
});
function preparar(){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),termos:{versao:'LOOP-TERMO-2026',texto:DOC},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026',texto:DOC},
  enviarEmail:async()=>true
 });
 const motor=new MotorLoopIntegradoSQLite({banco});
 const docs=contas.documentos();
 async function cadastrar(nick,indicadorNick=null){
  return contas.cadastrar({nome:'Pessoa de Ensaio',nick,
   email:nick.toLowerCase()+'@example.invalid',
   senha:'SenhaExemplo2026!',aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,hashPrivacidade:docs.privacidade.hash,
   ...(indicadorNick?{indicadorNick}:{})
  });
 }
 return {banco,contas,motor,cadastrar,docs};
}
test('convite é atribuído uma vez, sem autoindicação nem indicação forjada',async t=>{
 const x=preparar();
 t.after(()=>x.banco.close());
 await assert.rejects(x.cadastrar('Bravo','Desconhecido'),{
  codigo:'INDICADOR_NAO_ENCONTRADO'
 });
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) AS n FROM loop_real_contas'
 ).get().n,0);
 const a=await x.cadastrar('Alpha');
 await assert.rejects(x.cadastrar('AlphaB','AlphaB'),{
  codigo:'AUTOINDICACAO_PROIBIDA'
 });
 const b=await x.cadastrar('Bravo','Alpha');
 const c=await x.cadastrar('Charlie');
 assert.equal(b.vinculoCadastro,true);
 assert.equal(x.contas.listarIndicados(a.titularId).total,1);
 assert.equal(x.contas.listarIndicados(c.titularId).total,0);
 assert.deepEqual(x.contas.listarIndicados(a.titularId).indicados.map(v=>v.nick),
  ['bravo']);
 const vinculo=x.banco.prepare(
  'SELECT indicado_id,indicador_id FROM loop_real_vinculos_indicacao'
 ).get();
 assert.equal(vinculo.indicado_id,b.titularId);
 assert.equal(vinculo.indicador_id,a.titularId);
 assert.throws(()=>x.banco.prepare(
  'UPDATE loop_real_vinculos_indicacao SET indicador_id=? WHERE indicado_id=?'
 ).run(c.titularId,b.titularId),/imutavel/);
 x.motor.registrarCompraEnsaio({
  titularId:a.titularId,pedidoId:'pedido-a'
 });
 x.motor.registrarCompraEnsaio({
  titularId:b.titularId,pedidoId:'pedido-b'
 });
 x.motor.registrarCompraEnsaio({
  titularId:c.titularId,pedidoId:'pedido-c'
 });
 const valido={indicadorId:a.titularId,indicadoId:b.titularId,
  posicaoId:1,pedidoIndicado:'pedido-b',eventoId:'convite-b'};
 const falso={indicadorId:a.titularId,indicadoId:c.titularId,
  posicaoId:1,pedidoIndicado:'pedido-c',eventoId:'convite-c'};
 assert.throws(()=>x.motor.registrarIndicacaoEnsaio(falso),
  /LOOP_SEM_CONVITE_CADASTRADO/);
 assert.throws(()=>x.motor.registrarIndicacaoEnsaio({
  ...valido,pedidoIndicado:'pedido-c',eventoId:'fraude'
 }),/LOOP_INDICADO_SEM_COMPRA_VERIFICADA/);
 assert.equal(x.motor.registrarIndicacaoEnsaio(valido).repetida,false);
 assert.equal(x.motor.registrarIndicacaoEnsaio(valido).repetida,true);
 assert.throws(()=>x.motor.registrarIndicacaoEnsaio({
  ...valido,posicaoId:2
 }),/LOOP_INDICACAO_REPLAY_DIVERGENTE/);
 assert.throws(()=>x.motor.registrarIndicacaoEnsaio({
  ...valido,eventoId:'requalificacao'
 }),/LOOP_INDICACAO_JA_QUALIFICADA/);
 assert.throws(()=>x.motor.registrarIndicacaoEnsaio({
  ...valido,indicadorId:c.titularId,eventoId:'roubo'
 }),/LOOP_SEM_CONVITE_CADASTRADO/);
 const d=await x.cadastrar('Delta','Alpha');
 const e=await x.cadastrar('Echo','Alpha');
 assert.equal(x.contas.listarIndicados(a.titularId).total,3);
 assert.deepEqual(
  x.contas.listarIndicados(a.titularId,{limite:1,offset:1}).indicados
   .map(p=>p.nick),['delta']);
 assert.equal(
  x.contas.listarIndicados(a.titularId,{limite:1,offset:2}).temMais,false);
 assert.equal(d.vinculoCadastro,true);
 assert.equal(e.vinculoCadastro,true);
 assert.equal(x.motor.verificar().integridade,'OK');
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) AS n FROM loop_real_motor_qualificacoes'
 ).get().n,1);
 assert.equal(x.motor.consultar({titularId:a.titularId}).posicoesReais,0);
});
test('API de convites usa sessão e o cadastro atribui pelo nick do link',async t=>{
 const x=preparar();
 t.after(()=>x.banco.close());
 const a=await x.cadastrar('Alpha');
 const app=criarAppIdentidadeLoop({
  contas:x.contas,motorLoop:x.motor,
  origemHttps:ORIGEM,permitirCadastro:true
 });
 const srv=app.listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const url='http://127.0.0.1:'+srv.address().port;
 assert.equal((await fetch(url+'/api/contas/minha-rede')).status,401);
 const bloqueado=await fetch(url+'/convite/loja?ref=Alpha',{redirect:'manual'});
 assert.equal(bloqueado.status,403,'cadastro sozinho nao libera divulgacao');
 // Em RAM, simular a fotografia de uma venda verde ja confirmada por PSP:
 // isso concede somente o link, sem aderir nem criar posicao no LOOP.
 x.banco.exec([
  'CREATE TABLE loja_real_pedidos(',
  'pedido_id TEXT PRIMARY KEY,titular_id TEXT,status TEXT,pagamento_id TEXT);',
  'CREATE TABLE loop_real_fotos_regras_pedido(',
  'pedido_id TEXT,cor TEXT,revisao INTEGER);'
 ].join(' '));
 x.banco.prepare('INSERT INTO loja_real_pedidos VALUES(?,?,?,?)')
  .run('VENDA_VERDE_CONF',a.titularId,'APROVADO_PARA_EXPEDICAO','PSP_VERDE');
 x.banco.prepare('INSERT INTO loop_real_fotos_regras_pedido VALUES(?,?,?)')
  .run('VENDA_VERDE_CONF','VERDE',1);
 const redir=await fetch(url+'/convite/loja?ref=Alpha',{redirect:'manual'});
 assert.equal(redir.status,303);
 assert.equal(redir.headers.get('location'),'/loja?ref=Alpha');
 assert.equal((await fetch(url+'/convite/loja?ref=%2Ffoo',{
  redirect:'manual'
 })).status,400);
 const dados=x.docs;
 const cadastro=await fetch(url+'/api/contas/cadastrar',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({
   nome:'Pessoa de Ensaio',nick:'Bravo',email:'bravo@example.invalid',
   senha:'SenhaExemplo2026!',indicadorNick:'Alpha',
   aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:dados.termos.versao,hashTermos:dados.termos.hash,
   versaoPrivacidade:dados.privacidade.versao,
   hashPrivacidade:dados.privacidade.hash
  })
 });
 assert.equal(cadastro.status,201);
 assert.equal((await cadastro.json()).vinculoCadastro,true);
 const login=await x.contas.entrar({nick:'Alpha',senha:'SenhaExemplo2026!'});
 const consulta=await fetch(url+'/api/contas/minha-rede',{
  headers:{Cookie:'loop_real_s='+login.token}
 });
 assert.equal(consulta.status,200);
 const l=await consulta.json();
 assert.equal(l.total,1);
 assert.equal(l.indicados[0].nick,'bravo');
 assert.equal(JSON.stringify(l).includes('bravo@example.invalid'),false);
 assert.equal(l.remuneracoesConfirmadas,0);
 assert.equal((await fetch(url+'/api/contas/minha-rede?offset=-2',{
  headers:{Cookie:'loop_real_s='+login.token}
 })).status,400);
 assert.equal((await fetch(url+'/api/checkout/finalizar')).status,503);
});

test('indicada escolhe destino 1..10 uma vez, com autenticação, titularidade e sem motor',async t=>{
 const x=preparar();
 t.after(()=>x.banco.close());
 const a=await x.cadastrar('Alpha');
 const b=await x.cadastrar('Bravo','Alpha');
 await x.cadastrar('Charlie','Alpha');
 await x.cadastrar('Delta');
 const app=criarAppIdentidadeLoop({
  contas:x.contas,motorLoop:x.motor,origemHttps:ORIGEM,permitirCadastro:true
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(done=>server.close(done)));
 const base='http://127.0.0.1:'+server.address().port;
 const loginA=await x.contas.entrar({nick:'Alpha',senha:'SenhaExemplo2026!'});
 const loginD=await x.contas.entrar({nick:'Delta',senha:'SenhaExemplo2026!'});
 const endpoint=base+'/api/contas/minha-rede/destino';
 const post=(session,body,csrf=session?.csrf,origin=ORIGEM)=>fetch(endpoint,{
  method:'POST',headers:{'Content-Type':'application/json',
   Origin:origin,...(session?{Cookie:'loop_real_s='+session.token}:{}),
   ...(csrf?{'X-Loop-Csrf':csrf}:{})},
  body:JSON.stringify(body)
 });
 const target={numeroCadastro:1,posicao:7};
 assert.equal((await post(null,target)).status,401);
 assert.equal((await post(loginA,target,null)).status,403);
 assert.equal((await post(loginA,target,loginA.csrf,'https://wrong.invalid')).status,403);
 assert.equal((await post(loginA,{numeroCadastro:1,posicao:0})).status,400);
 assert.equal((await post(loginA,{numeroCadastro:1,posicao:11})).status,400);
 assert.equal((await post(loginA,{numeroCadastro:1,posicao:2.5})).status,400);
 assert.equal((await post(loginA,{numeroCadastro:1,posicao:7,extra:true})).status,400);
 assert.equal((await post(loginD,target)).status,404);
 // Registro pelo link não cria indicação válida nem reserva uma posição.
 const semCpf=await post(loginA,target);
 assert.equal(semCpf.status,409);
 assert.equal((await semCpf.json()).erro,'INDICACAO_AGUARDA_CONFIRMACAO');
 // Confirmação do CPF isoladamente também não basta.
 x.banco.prepare([
  'INSERT INTO loop_real_confirmacoes_cadastro',
  '(titular_id,cpf_hmac,termos_versao,termos_hash,confirmado_em)',
  'VALUES(?,?,?,?,?)'
 ].join(' ')).run(b.titularId,randomBytes(32).toString('hex'),
  x.docs.termos.versao,x.docs.termos.hash,1700000000000);
 const semCompra=await post(loginA,target);
 assert.equal(semCompra.status,409);
 assert.equal((await semCompra.json()).erro,'INDICACAO_AGUARDA_QUALIFICACAO');
 // Somente o ensaio de integração injeta uma prova conciliada no SQLite
 // de memória; não há endpoint público que grave esta tabela.
 x.banco.prepare([
  'INSERT INTO loop_real_indicacoes_validas_financeiro',
  '(indicado_id,indicador_id,pedido_id,pagamento_id,comprovante_bancario_id,',
  'valor_qualificado_centavos,tipo,confirmado_em)',
  "VALUES(?,?,?,?,?,25000,'COMPRA_250',?)"
 ].join(' ')).run(b.titularId,a.titularId,'pedido_prova',
  'pagamento_prova','comprovante_bancario_prova',1700000000001);
 const response=await post(loginA,target);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{
  registrado:true,repetido:false,numeroCadastro:1,
  posicaoDestinoReservada:7,vinculacaoAtiva:false,financeiroReal:false
 });
 assert.equal((await post(loginA,target)).status,200);
 const twice=await post(loginA,{numeroCadastro:1,posicao:8});
 assert.equal(twice.status,409);
 assert.equal((await twice.json()).erro,'DESTINO_INDICACAO_JA_ESCOLHIDO');
 const network=await fetch(base+'/api/contas/minha-rede',{
  headers:{Cookie:'loop_real_s='+loginA.token}
 });
 assert.equal(network.status,200);
 const registered=(await network.json()).indicados;
 assert.equal(registered[0].posicaoDestinoReservada,7);
 assert.equal(registered[1].posicaoDestinoReservada,null);
 const read=new VisaoEscritorioUnificadaSQLite({banco:x.banco,motor:x.motor});
 const projection=read.listarRede({titularId:a.titularId});
 assert.equal(projection.indicados[0].posicaoDestinoReservada,7);
 assert.equal(projection.indicados[1].posicaoDestinoReservada,null);
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) n FROM loop_real_destinos_indicacao'
 ).get().n,1);
 assert.equal(x.banco.prepare(
  'SELECT numero_posicao FROM loop_real_destinos_indicacao WHERE indicado_id=?'
 ).get(b.titularId).numero_posicao,7);
 assert.throws(()=>x.banco.prepare(
  'UPDATE loop_real_destinos_indicacao SET numero_posicao=8 WHERE indicado_id=?'
 ).run(b.titularId),/destino imutavel/);
 assert.equal(x.motor.consultar({titularId:a.titularId}).posicoesReais,0);
 assert.equal(x.motor.consultar({titularId:a.titularId}).minhasPosicoes.length,0);
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) n FROM loop_real_motor_qualificacoes'
 ).get().n,0);
 assert.equal(x.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(x.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('convite institucional acessível não contorna cadastro fechado ou backup fora de dia',async t=>{
 const x=preparar();t.after(()=>x.banco.close());await x.cadastrar('Vilela');
 for(const permitirCadastro of [false,true]){
  const app=criarAppIdentidadeLoop({contas:x.contas,motorLoop:x.motor,origemHttps:ORIGEM,
   divulgadorInstitucionalNick:'VILELA',permitirCadastro,
   backupEstado:()=>({backupAtualEmDia:!permitirCadastro})});
  const srv=app.listen(0,'127.0.0.1');await once(srv,'listening');
  const base='http://127.0.0.1:'+srv.address().port;
  try{
   const link=await fetch(base+'/escritorio/VILELA',{redirect:'manual'});
   assert.equal(link.status,303);
   assert.equal(link.headers.get('location'),'/escritorio?ref=vilela');
   const docs=await (await fetch(base+'/api/contas/documentos-leitura')).json();
   assert.equal(docs.cadastroAtivo,false);
   assert.equal((await fetch(base+'/readyz')).status,503);
   const antes=x.banco.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n;
   const criar=await fetch(base+'/api/contas/cadastrar',{method:'POST',
    headers:{Origin:ORIGEM,'Content-Type':'application/json'},
    body:JSON.stringify({indicadorNick:'VILELA'})});
   assert.equal(criar.status,503);
   assert.equal((await criar.json()).erro,'CADASTRO_INATIVO');
   assert.equal(x.banco.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n,antes);
  }finally{await new Promise(r=>srv.close(r));}
 }
});
