'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const TOKEN='ponte-compras-convites-demo-token-1234567890';
function arquivo(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-ponte-convites-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 return path.join(pasta,'catalogo.sqlite');
}
function preparar(caminho){
 const repo=new RepositorioCatalogoSQLite({caminho});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,
  consultarPagamentoConfiavel:async id=>comprovantes.get(id),
  relogio:()=> '2026-10-15T14:00:00.000Z'
 });
 return {repo,contas,comprovantes,ponte};
}
function pessoa(contas,nome,email,codigoIndicador=null){
 return contas.cadastrar({
  nome,email,senha:'senha-estritamente-ficticia',
  codigoIndicador
 });
}
function recibo(m,pedidoId,contaId,{
 valorCentavos=25000,produtoId='curso-simulado',status=STATUS_CONFIRMADO,
 confirmadoEm='2026-10-15T12:00:00.000Z'
}={}){
 const evento={pedidoId,contaId,valorCentavos,produtoId,status,confirmadoEm};
 m.comprovantes.set(pedidoId,evento);
 return evento;
}
test('cadastro e convite sem compra nao geram posicao nem mudam fila',t=>{
 const m=preparar(arquivo(t));t.after(()=>m.repo.fechar());
 const raiz=pessoa(m.contas,'Conta Raiz','raiz@exemplo.invalid');
 pessoa(m.contas,'Conta Convidada','b@exemplo.invalid',raiz.codigoConvite);
 const antes=m.ponte.consultar();
 assert.equal(antes.compras.length,0);
 assert.equal(antes.convites.length,0);
 assert.equal(antes.filas.A.quantidade,0);
 assert.equal(antes.filas.B.quantidade,0);
 assert.equal(antes.tabuleiro.centro,null);
});

test('compra confirmada do convidado cria 1 posicao B e promove indicador que ja comprou',async t=>{
 const m=preparar(arquivo(t));t.after(()=>m.repo.fechar());
 const raiz=pessoa(m.contas,'Conta Raiz','raiz@exemplo.invalid');
 const b=pessoa(m.contas,'Conta Convidada','b@exemplo.invalid',raiz.codigoConvite);
 recibo(m,'compra-01',raiz.contaId);
 const inicio=await m.ponte.processar({pedidoId:'compra-01'});
 assert.equal(inicio.filaAtual,'B');
 assert.equal(inicio.indicacaoNova,false);
 const pendente=m.ponte.consultar();
 assert.equal(pendente.filas.B.quantidade,1);
 assert.equal(pendente.filas.A.quantidade,0);
 recibo(m,'compra-02',b.contaId);
 const validado=await m.ponte.processar({pedidoId:'compra-02'});
 assert.equal(validado.criado,true);
 assert.equal(validado.indicacaoNova,true);
 assert.equal(validado.filaAtual,'B');
 const apos=m.ponte.consultar();
 assert.equal(apos.compras.length,2);
 assert.equal(apos.convites.length,1);
 assert.equal(apos.convites[0].aplicadoNoMotor,true);
 assert.equal(apos.filas.A.quantidade,1);
 assert.equal(apos.filas.B.quantidade,1);
 assert.equal(apos.filas.A.pessoas[0].participanteId,raiz.contaId);
 assert.equal(apos.filas.B.pessoas[0].participanteId,b.contaId);
 assert.equal(apos.filas.A.pessoas[0].fila,'A');
 assert.equal(apos.filas.B.pessoas[0].fila,'B');
 assert.equal(apos.filas.regra,'3A/1B');
 assert.equal(apos.catracaMovimentada,false);
});

test('segundo pedido do mesmo convidado gera outra posicao mas NAO outra indicacao',async t=>{
 const m=preparar(arquivo(t));t.after(()=>m.repo.fechar());
 const raiz=pessoa(m.contas,'Indicador Teste','ind@exemplo.invalid');
 const b=pessoa(m.contas,'Indicado Teste','indicado@exemplo.invalid',raiz.codigoConvite);
 recibo(m,'p-1',raiz.contaId);
 recibo(m,'p-2',b.contaId,{valorCentavos:25000});
 recibo(m,'p-3',b.contaId,{valorCentavos:150000});
 await m.ponte.processar({pedidoId:'p-1'});
 const primeiro=await m.ponte.processar({pedidoId:'p-2'});
 const segundo=await m.ponte.processar({pedidoId:'p-3'});
 assert.equal(primeiro.indicacaoNova,true);
 assert.equal(segundo.indicacaoNova,false);
 assert.notEqual(primeiro.posicaoId,segundo.posicaoId);
 const resultado=m.ponte.consultar();
 assert.equal(resultado.compras.length,3);
 assert.equal(resultado.convites.length,1);
 assert.equal(resultado.filas.A.quantidade,1);
 assert.equal(resultado.filas.B.quantidade,2);
});

test('convite confirmado antes de indicador comprar fica guardado ate a primeira posicao',async t=>{
 const m=preparar(arquivo(t));t.after(()=>m.repo.fechar());
 const raiz=pessoa(m.contas,'Conta Raiz','raiz@exemplo.invalid');
 const b=pessoa(m.contas,'Convidado Um','um@exemplo.invalid',raiz.codigoConvite);
 const c=pessoa(m.contas,'Convidado Dois','dois@exemplo.invalid',raiz.codigoConvite);
 recibo(m,'b-1',b.contaId,{confirmadoEm:'2026-10-15T11:00:00Z'});
 recibo(m,'c-1',c.contaId,{confirmadoEm:'2026-10-15T11:30:00Z'});
 await m.ponte.processar({pedidoId:'b-1'});
 await m.ponte.processar({pedidoId:'c-1'});
 const antes=m.ponte.consultar();
 assert.equal(antes.convites.length,2);
 assert.equal(antes.convites.filter(i=>i.aplicadoNoMotor).length,0);
 assert.equal(antes.filas.A.quantidade,0);
 recibo(m,'raiz-1',raiz.contaId);
 const resposta=await m.ponte.processar({pedidoId:'raiz-1'});
 assert.equal(resposta.filaAtual,'A');
 const depois=m.ponte.consultar();
 assert.equal(depois.convites.filter(i=>i.aplicadoNoMotor).length,2);
 assert.equal(depois.filas.A.quantidade,1);
 assert.equal(depois.filas.B.quantidade,2);
 const numero=m.ponte._restaurar().filas.informacoesParticipante(raiz.contaId);
 assert.equal(numero.quantidade,2);
 assert.equal(numero.ultimoConviteEm,'2026-10-15T11:30:00.000Z');
});

test('reprocessar comprovante e idempotente; remapear titular ou preco nao altera registro',async t=>{
 const m=preparar(arquivo(t));t.after(()=>m.repo.fechar());
 const a=pessoa(m.contas,'Primeira Conta','a@exemplo.invalid');
 const b=pessoa(m.contas,'Segunda Conta','b@exemplo.invalid');
 const original=recibo(m,'p001',a.contaId,{valorCentavos:25000});
 const criado=await m.ponte.processar({pedidoId:'p001'});
 const repetido=await m.ponte.processar({pedidoId:'p001'});
 assert.equal(repetido.repetido,true);
 assert.equal(repetido.posicaoId,criado.posicaoId);
 assert.equal(m.ponte.consultar().compras.length,1);
 m.comprovantes.set('p001',{...original,contaId:b.contaId});
 await assert.rejects(m.ponte.processar({pedidoId:'p001'}),e=>e.codigo==='PEDIDO_DIVERGENTE');
 m.comprovantes.set('p001',{...original,valorCentavos:2000});
 await assert.rejects(m.ponte.processar({pedidoId:'p001'}),e=>e.codigo==='PEDIDO_DIVERGENTE');
 assert.equal(m.ponte.consultar().compras.length,1);
});

test('pedido pendente, sem comprovante, com horario invalido ou titular inexistente falha fechado',async t=>{
 const m=preparar(arquivo(t));t.after(()=>m.repo.fechar());
 const a=pessoa(m.contas,'Conta Teste','a@exemplo.invalid');
 const invalido=recibo(m,'pendente',a.contaId,{status:'PENDENTE'});
 await assert.rejects(m.ponte.processar({pedidoId:'pendente'}),e=>e.codigo==='PAGAMENTO_NAO_CONFIRMADO');
 await assert.rejects(m.ponte.processar({pedidoId:'ausente'}),e=>e.codigo==='PAGAMENTO_NAO_CONFIRMADO');
 m.comprovantes.set('pendente',{...invalido,status:STATUS_CONFIRMADO,confirmadoEm:'ontem'});
 await assert.rejects(m.ponte.processar({pedidoId:'pendente'}),e=>e.codigo==='DADOS_INVALIDOS');
 recibo(m,'desconhecido','11111111-1111-1111-1111-111111111111');
 await assert.rejects(m.ponte.processar({pedidoId:'desconhecido'}),e=>e.codigo==='CONTA_DESCONHECIDA');
 recibo(m,'preco',a.contaId,{valorCentavos:0});
 await assert.rejects(m.ponte.processar({pedidoId:'preco'}),e=>e.codigo==='DADOS_INVALIDOS');
 assert.equal(m.ponte.consultar().compras.length,0);
 assert.equal(m.ponte.consultar().filas.B.quantidade,0);
});

test('limite de seis posicoes ativas por conta no laboratorio bloqueia setima confirmacao',async t=>{
 const m=preparar(arquivo(t));t.after(()=>m.repo.fechar());
 const a=pessoa(m.contas,'Conta Maximo','a@exemplo.invalid');
 for(let i=1;i<=6;i++){
  recibo(m,'limite-'+i,a.contaId);
  assert.equal((await m.ponte.processar({pedidoId:'limite-'+i})).criado,true);
 }
 recibo(m,'limite-7',a.contaId);
 await assert.rejects(m.ponte.processar({pedidoId:'limite-7'}),e=>e.codigo==='LIMITE_ATIVO');
 const s=m.ponte.consultar();
 assert.equal(s.compras.length,6);
 assert.equal(s.filas.B.quantidade,6);
 assert.equal(s.filas.A.quantidade,0);
});

test('falha intermediaria reverte toda transacao, sem compra, convite ou posicao parcial',async t=>{
 const m=preparar(arquivo(t));t.after(()=>m.repo.fechar());
 const a=pessoa(m.contas,'Conta A','a@exemplo.invalid');
 recibo(m,'rollback',a.contaId);
 const original=m.ponte._aplicarConvites.bind(m.ponte);
 m.ponte._aplicarConvites=()=>{throw new Error('falha simulada na aplicacao');};
 await assert.rejects(m.ponte.processar({pedidoId:'rollback'}),/falha simulada/);
 assert.equal(m.ponte.consultar().compras.length,0);
 assert.equal(m.ponte.consultar().filas.B.quantidade,0);
 m.ponte._aplicarConvites=original;
 assert.equal((await m.ponte.processar({pedidoId:'rollback'})).criado,true);
});

test('reinicio do SQLite nao perde indicacao aplicada, venda ou idempotencia',async t=>{
 const file=arquivo(t),m=preparar(file);
 const a=pessoa(m.contas,'Conta A','a@exemplo.invalid');
 const b=pessoa(m.contas,'Conta B','b@exemplo.invalid',a.codigoConvite);
 const ra=recibo(m,'primeira',a.contaId);
 const rb=recibo(m,'segunda',b.contaId);
 await m.ponte.processar({pedidoId:'primeira'});
 await m.ponte.processar({pedidoId:'segunda'});
 m.repo.fechar();
 const outro=preparar(file);
 try{
  outro.comprovantes.set('primeira',ra);
  outro.comprovantes.set('segunda',rb);
  assert.equal((await outro.ponte.processar({pedidoId:'segunda'})).repetido,true);
  assert.equal(outro.ponte.consultar().compras.length,2);
  assert.equal(outro.ponte.consultar().convites[0].aplicadoNoMotor,true);
  assert.equal(outro.ponte.consultar().filas.A.quantidade,1);
 }finally{outro.repo.fechar();}
});

test('API e somente leitura sob token local; nao aceita pagamento por POST nem existe no publico',async t=>{
 const m=preparar(arquivo(t));t.after(()=>m.repo.fechar());
 const a=pessoa(m.contas,'Conta A','a@exemplo.invalid');
 recibo(m,'teste',a.contaId);
 await m.ponte.processar({pedidoId:'teste'});
 const app=criarAppAdminLaboratorio({repositorio:m.repo,segredo:TOKEN});
 const srv=app.listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const url=base+'/api/admin/ponte-compras-convites-demo';
 assert.equal((await fetch(url)).status,401);
 assert.equal((await fetch(url,{headers:{
  Authorization:'Bearer '+TOKEN,Origin:'https://externo.invalid'
 }})).status,403);
 const response=await fetch(url,{headers:{Authorization:'Bearer '+TOKEN}});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 const dados=await response.json();
 assert.equal(dados.compras.length,1);
 assert.equal(dados.semPagamentoReal,true);
 assert.equal((await fetch(url,{method:'POST',headers:{
  Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'
 },body:JSON.stringify({pedidoId:'fraude',status:'CONFIRMADO_SIMULADO'})})).status,404);
 const appPublico=require('../src/server');
 const publico=appPublico.listen(0,'127.0.0.1');
 await once(publico,'listening');
 t.after(()=>new Promise(resolve=>publico.close(resolve)));
 const pub='http://127.0.0.1:'+publico.address().port;
 assert.equal((await fetch(pub+'/api/admin/ponte-compras-convites-demo')).status,404);
});

test('a compra registrada e os convites sao imutaveis no SQLite',async t=>{
 const m=preparar(arquivo(t));t.after(()=>m.repo.fechar());
 const a=pessoa(m.contas,'Conta A','a@exemplo.invalid');
 const b=pessoa(m.contas,'Conta B','b@exemplo.invalid',a.codigoConvite);
 recibo(m,'a',a.contaId);
 recibo(m,'b',b.contaId);
 await m.ponte.processar({pedidoId:'a'});
 await m.ponte.processar({pedidoId:'b'});
 assert.throws(()=>m.repo.banco.exec(
  'DELETE FROM admin_ponte_compras_demo'),/imutaveis/);
 assert.throws(()=>m.repo.banco.exec(
  'UPDATE admin_ponte_convites_validados_demo SET pedido_id=\'outro\''),/imutaveis/);
 assert.equal(m.ponte.consultar().compras.length,2);
 assert.equal(m.ponte.consultar().convites.length,1);
});
