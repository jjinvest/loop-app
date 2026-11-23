'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=require('../src/producao/motor-loop-integrado-sqlite');
const {VisaoEscritorioUnificadaSQLite}=require('../src/producao/visao-escritorio-unificada-sqlite');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');
const TEXTO=('Contrato de cadastro e uso da plataforma LOOP. O CPF e os termos do próprio '+
 'titular são confirmados explicitamente, sem ativar posições, pagamentos, saques ou '+
 'qualificação financeira e sem usar cadastros de terceiros.').repeat(2);
const ORIGEM='https://contas.example.invalid';
function gerarCpf(i){
 const nove=String(i).padStart(9,'0');
 let cpf=nove;
 for(let n=9;n<=10;n++){
  const soma=[...cpf].reduce((acc,d,j)=>acc+Number(d)*(n+1-j),0);
  cpf+=String((soma*10)%11%10);
 }
 return cpf;
}
function preparar(t){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMOS-CONTADORES-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIVACIDADE-CONTADORES-2026',texto:TEXTO},
  enviarEmail:async()=>true
 });
 const motor=new MotorLoopIntegradoSQLite({banco});
 const visao=new VisaoEscritorioUnificadaSQLite({banco,motor});
 const docs=contas.documentos();
 const novo=async(nick,indicadorNick=null,i=1)=>contas.cadastrar({
  nome:'Titular de Exemplo',nick,
  email:nick.toLowerCase()+'@example.invalid',
  senha:'SenhaValida123456!',cpf:gerarCpf(i),
  telefone:'11999999999',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash,
  ...(indicadorNick?{indicadorNick}:{})
 });
 const confirmar=(titularId,i)=>contas.confirmarCadastro({
  titularId,cpf:gerarCpf(i),aceiteExplicito:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash
 });
 return {banco,contas,motor,visao,docs,novo,confirmar};
}

test('cadastro do link não confirma CPF; confirmação é explícita, privada e idempotente',async t=>{
 const x=preparar(t);
 const dono=await x.novo('Vilela',null,1);
 const thais=await x.novo('Thais','Vilela',2);
 const bruna=await x.novo('Bruna','Vilela',3);
 const caio=await x.novo('Caio','Vilela',4);
 let rede=x.visao.listarRede({titularId:dono.titularId});
 assert.equal(rede.total,3,'três cadastros no link, mesmo sem CPF confirmado');
 assert.deepEqual([rede.resumo.cadastrosConfirmados,rede.resumo.indicacoesVinculadas,
  rede.resumo.aDistribuir],[0,0,0]);
 assert.ok(rede.indicados.every(p=>p.cadastroConfirmado===false));
 assert.equal(x.contas.dadosTitular(thais.titularId).cadastroConfirmado,false);
 assert.throws(()=>x.confirmar(thais.titularId,3),
  {codigo:'CPF_CADASTRO_NAO_CONFERE'});
 assert.equal(x.confirmar(bruna.titularId,3).cadastroConfirmado,true);
 assert.equal(x.confirmar(caio.titularId,4).repetido,false);
 assert.equal(x.confirmar(caio.titularId,4).repetido,true);
 rede=x.visao.listarRede({titularId:dono.titularId});
 assert.deepEqual([rede.total,rede.resumo.cadastrosConfirmados,
  rede.resumo.indicacoesVinculadas,rede.resumo.aDistribuir],[3,2,0,0]);
 assert.equal(rede.indicados.find(p=>p.nick==='thais').cadastroConfirmado,false);
 assert.equal(rede.indicados.find(p=>p.nick==='bruna').cadastroConfirmado,true);
 assert.equal(x.contas.dadosTitular(bruna.titularId).cadastroConfirmado,true);
 assert.throws(()=>x.contas.reservarDestinoIndicacao({
  indicadorId:dono.titularId,numeroCadastro:1,posicao:7
 }),{codigo:'INDICACAO_AGUARDA_CONFIRMACAO'});
 assert.throws(()=>x.contas.reservarDestinoIndicacao({
  indicadorId:dono.titularId,numeroCadastro:2,posicao:7
 }),{codigo:'INDICACAO_AGUARDA_QUALIFICACAO'});
 // O teste insere fotografia de prova externa apenas na memória,
 // sem habilitar PIX, saldo ou PSP no serviço de produção.
 for(const [id,indice] of [[bruna.titularId,2],[caio.titularId,3]]){
  x.banco.prepare([
   'INSERT INTO loop_real_indicacoes_validas_financeiro',
   '(indicado_id,indicador_id,pedido_id,pagamento_id,comprovante_bancario_id,',
   'valor_qualificado_centavos,tipo,confirmado_em)',
   "VALUES(?,?,?,?,?,25000,'COMPRA_250',?)"
  ].join(' ')).run(id,dono.titularId,'pedido_'+indice,'pag_'+indice,
   'comprovante_bancario_'+indice,1700000000000+indice);
 }
 rede=x.visao.listarRede({titularId:dono.titularId});
 assert.deepEqual([rede.total,rede.resumo.cadastrosConfirmados,
  rede.resumo.indicacoesVinculadas,rede.resumo.aDistribuir],[3,2,0,2]);
 assert.equal(rede.indicados.find(p=>p.nick==='bruna').indicacaoValida,true);
 assert.equal(rede.indicados.find(p=>p.nick==='thais').indicacaoValida,false);
 x.contas.reservarDestinoIndicacao({
  indicadorId:dono.titularId,numeroCadastro:2,posicao:7
 });
 rede=x.visao.listarRede({titularId:dono.titularId});
 assert.deepEqual([rede.total,rede.resumo.cadastrosConfirmados,
  rede.resumo.indicacoesVinculadas,rede.resumo.aDistribuir],[3,2,1,1]);
 assert.equal(rede.indicados.find(p=>p.nick==='bruna').posicaoDestinoReservada,7);
 const estado=x.motor.consultar({titularId:dono.titularId});
 assert.equal(estado.minhasPosicoes.length,0);
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) n FROM loop_real_motor_qualificacoes').get().n,0);
 assert.equal(x.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});


test('destino antigo sem qualificacao nao ocupa quadradinho ou indicador funcional',async t=>{
 const x=preparar(t),dono=await x.novo('Vilela',null,1);
 const thais=await x.novo('Thais','Vilela',2);
 x.banco.prepare([
  'INSERT INTO loop_real_destinos_indicacao',
  '(indicado_id,indicador_id,numero_posicao,registrado_em)',
  'VALUES(?,?,?,?)'
 ].join(' ')).run(thais.titularId,dono.titularId,1,Date.now()-600000);
 let rede=x.visao.listarRede({titularId:dono.titularId});
 assert.equal(rede.total,1);
 assert.equal(rede.indicados[0].posicaoDestinoReservada,null);
 assert.equal(rede.resumo.indicacoesVinculadas,0);
 assert.equal(rede.resumo.aDistribuir,0);
 assert.equal(x.contas.listarIndicados(dono.titularId).indicados[0].posicaoDestinoReservada,null);
 x.confirmar(thais.titularId,2);
 rede=x.visao.listarRede({titularId:dono.titularId});
 assert.equal(rede.indicados[0].posicaoDestinoReservada,null);
 assert.equal(rede.resumo.indicacoesVinculadas,0);
 assert.equal(x.motor.consultar({titularId:dono.titularId}).minhasPosicoes.length,0);
 assert.equal(x.banco.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('conta só confirma seu próprio CPF pelo endpoint autenticado e protegido',async t=>{
 const x=preparar(t);
 await x.novo('Vilela',null,1);
 const thais=await x.novo('Thais','Vilela',2);
 const app=criarAppIdentidadeLoop({
  contas:x.contas,motorLoop:x.motor,origemHttps:ORIGEM,permitirCadastro:true
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const sessao=await x.contas.entrar({nick:'Thais',senha:'SenhaValida123456!'});
 const body={
  cpf:gerarCpf(2),aceiteExplicito:true,
  versaoTermos:x.docs.termos.versao,hashTermos:x.docs.termos.hash
 };
 const call=(cookie,csrf)=>fetch(base+'/api/contas/confirmar-cadastro',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json',
   ...(cookie?{Cookie:'loop_real_s='+cookie}:{}),
   ...(csrf?{'X-Loop-Csrf':csrf}:{})},
  body:JSON.stringify(body)
 });
 assert.equal((await call(null,null)).status,401);
 assert.equal((await call(sessao.token,null)).status,403);
 const ok=await call(sessao.token,sessao.csrf);
 assert.equal(ok.status,200);
 assert.deepEqual(await ok.json(),{
  cadastroConfirmado:true,repetido:false,financeiroReal:false
 });
 assert.equal(x.contas.dadosTitular(thais.titularId).cadastroConfirmado,true);
});

test('mil cadastros, cem confirmações, cinquenta vinculados e cinquenta a distribuir em todas as páginas',async t=>{
 const x=preparar(t);
 const dono=await x.novo('Vilela',null,1);
 const base=x.banco.prepare('SELECT * FROM loop_real_contas WHERE id=?').get(dono.titularId);
 const inserir=x.banco.prepare([
  'INSERT INTO loop_real_contas(id,nick,email_hmac,nome_iv,nome_ct,nome_tag,',
  'email_iv,email_ct,email_tag,senha_salt,senha_hash,',
  'termos_versao,termos_hash,priv_versao,priv_hash,criado_em,email_confirmado_em)',
  'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
 ].join(' '));
 const inserirContato=x.banco.prepare([
  'INSERT INTO loop_real_contatos_cadastro',
  '(titular_id,cpf_hmac,cpf_iv,cpf_ct,cpf_tag,',
  'telefone_iv,telefone_ct,telefone_tag,registrado_em)',
  'VALUES(?,?,?,?,?,?,?,?,?)'
 ].join(' '));
 const convite=x.banco.prepare(
  'INSERT INTO loop_real_vinculos_indicacao(indicado_id,indicador_id,registrado_em) VALUES(?,?,?)');
 const confirmacao=x.banco.prepare([
  'INSERT INTO loop_real_confirmacoes_cadastro',
  '(titular_id,cpf_hmac,termos_versao,termos_hash,confirmado_em)',
  'VALUES(?,?,?,?,?)'
 ].join(' '));
 const destino=x.banco.prepare([
  'INSERT INTO loop_real_destinos_indicacao',
  '(indicado_id,indicador_id,numero_posicao,registrado_em)',
  'VALUES(?,?,?,?)'
 ].join(' '));
 const prova=x.banco.prepare([
  'INSERT INTO loop_real_indicacoes_validas_financeiro',
  '(indicado_id,indicador_id,pedido_id,pagamento_id,comprovante_bancario_id,',
  'valor_qualificado_centavos,tipo,confirmado_em)',
  "VALUES(?,?,?,?,?,25000,'COMPRA_250',?)"
 ].join(' '));
 x.banco.exec('BEGIN IMMEDIATE');
 try{
  for(let i=1;i<=1000;i++){
   const id='titular-'+randomUUID();
   const hmac=randomBytes(32).toString('hex');
   inserir.run(id,'conta'+i,randomBytes(32).toString('hex'),
    base.nome_iv,base.nome_ct,base.nome_tag,base.email_iv,base.email_ct,
    base.email_tag,base.senha_salt,base.senha_hash,base.termos_versao,
    base.termos_hash,base.priv_versao,base.priv_hash,1700000000000+i,null);
   convite.run(id,dono.titularId,1700000000000+i);
   inserirContato.run(id,hmac,'a','b','c','d','e','f',1700000000000+i);
   if(i<=100){
    confirmacao.run(id,hmac,base.termos_versao,base.termos_hash,1700000000000+i);
    prova.run(id,dono.titularId,'pedido_'+i,'pagamento_'+i,
     'comprovante_bancario_'+i,1700000000000+i);
    if(i<=50)destino.run(id,dono.titularId,(i-1)%10+1,1700000000000+i);
   }
  }
  x.banco.exec('COMMIT');
 }catch(e){x.banco.exec('ROLLBACK');throw e;}
 const primeira=x.visao.listarRede({titularId:dono.titularId,limite:10});
 const ultima=x.visao.listarRede({titularId:dono.titularId,offset:990,limite:10});
 for(const rede of [primeira,ultima]){
  assert.equal(rede.indicados.length,10);
  assert.equal(rede.total,1000);
  assert.deepEqual([
   rede.resumo.cadastrosConfirmados,rede.resumo.indicacoesVinculadas,
   rede.resumo.aDistribuir],[100,50,50]);
 }
 assert.equal(x.banco.prepare('PRAGMA foreign_key_check').all().length,0);
 const js=fs.readFileSync(path.join(__dirname,
  '../src/producao/interface-aprovada-contas.js'),'utf8');
 assert.match(js,/CADASTROS CONFIRMADOS/);
 assert.match(js,/dados\.resumo\?\.indicacoesVinculadas/);
 assert.match(js,/dados\.resumo\?\.aDistribuir/);
 assert.match(js,/cadastroConfirmado===true/);
});
