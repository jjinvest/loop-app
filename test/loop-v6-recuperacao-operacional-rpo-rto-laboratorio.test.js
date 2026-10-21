'use strict';
// Simulacao controlada de DESASTRE no arquivo de laboratorio, fora de producao:
// checksum de backup, banco de origem destruido depois de fechar, restauracao
// em arquivo separado, RPO observado e tempo local de reabertura (nao SLA).
const {test}=require('node:test');const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,copyFileSync,readFileSync,writeFileSync,statSync}=require('node:fs');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const os=require('node:os');const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {auditarIntegridadeOperacionalDemo}=require('../src/domain/auditoria-integridade-operacional-demo');
const NOW='2036-09-20T12:00:00.000Z';
function abrir(arquivo){
 const repo=new RepositorioCatalogoSQLite({caminho:arquivo});
 const banco=repo.banco;
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas,relogio:()=>NOW});
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco,contas,pedidosIdentificados:pedidos,atribuicaoManualPorPosicao:true,
  relogio:()=>NOW,
  consultarPagamentoConfiavel:async id=>{
   const p=pedidos.buscar(id);
   return p&&{...p,status:STATUS_CONFIRMADO,confirmadoEm:NOW};
  }});
 return {repo,banco,contas,pedidos,ponte};
}
const quantidade=m=>m.banco.prepare(
 'SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n;
const hash=arquivo=>createHash('sha256').update(readFileSync(arquivo)).digest('hex');
function verificar(arquivo,manifesto){
 if(statSync(arquivo).size!==manifesto.bytes||hash(arquivo)!==manifesto.sha256)
  throw new Error('MANIFESTO_BACKUP_DIVERGENTE');
 const b=new DatabaseSync(arquivo,{readOnly:true});
 try{
  if(Object.values(b.prepare('PRAGMA integrity_check').get())[0]!=='ok'||
   b.prepare('PRAGMA foreign_key_check').all().length)
   throw new Error('BACKUP_SQLITE_NAO_INTEGRO');
 }finally{b.close();}
}
async function comprar(m,i){
 const id='desastre-compra-'+String(i).padStart(3,'0');
 const c=m.contas.cadastrar({nome:'Cliente RTO '+i,
  email:'desastre-cliente-'+i+'@exemplo.invalid',
  senha:'senha-ficticia-laboratorio-2026'});
 m.pedidos.preparar({pedidoId:id,contaId:c.contaId,
  produtoId:'pdf-250',valorCentavos:25000});
 return m.ponte.processar({pedidoId:id});
}
test('restauracao com checksum: RPO observado tres pedidos; mede RTO local sem prometer SLA',
 {timeout:120000},async t=>{
 const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-rpo-rto-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const origem=path.join(pasta,'origem.sqlite'),
  imagem=path.join(pasta,'imagem-verificada.sqlite'),
  restaurado=path.join(pasta,'restaurado.sqlite');
 let m=abrir(origem);t.after(()=>{try{m.repo.fechar()}catch{}});
 for(let i=0;i<12;i++)assert.equal((await comprar(m,i)).posicaoCriada,true);
 const estadoNoBackup=m.ponte._restaurar().exportarSnapshot();
 m.banco.prepare('VACUUM INTO ?').run(imagem);
 const manifesto={bytes:statSync(imagem).size,sha256:hash(imagem)};
 verificar(imagem,manifesto);
 for(let i=12;i<15;i++)assert.equal((await comprar(m,i)).posicaoCriada,true);
 const aposBackup=quantidade(m);
 assert.equal(aposBackup,15);
 m.repo.fechar();
 // Corrupcao intencional SOMENTE do arquivo descartavel de origem JA FECHADO.
 writeFileSync(origem,Buffer.from('LOOP_BANCO_INDISPONIVEL'));
 const b=new DatabaseSync(origem,{readOnly:true});
 assert.throws(()=>b.prepare('PRAGMA integrity_check').get());
 b.close();
 const inicio=performance.now();
 verificar(imagem,manifesto);
 copyFileSync(imagem,restaurado);
 verificar(restaurado,manifesto);
 m=abrir(restaurado);
 const recuperadas=quantidade(m);
 assert.equal(recuperadas,12);
 assert.equal(aposBackup-recuperadas,3);
 assert.deepEqual(m.ponte._restaurar().exportarSnapshot(),estadoNoBackup);
 assert.equal(auditarIntegridadeOperacionalDemo(m.ponte).totalAlertas,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 const repetido=await m.ponte.processar({pedidoId:'desastre-compra-000'});
 assert.equal(repetido.repetido,true);
 assert.equal(quantidade(m),12);
 const rtoLocalMs=Math.round((performance.now()-inicio)*100)/100;
 console.log('LOOP_RECUPERACAO_RPO_RTO='+JSON.stringify({
  backupPosicoes:12,origemAntesDaCorrupcao:15,
  perdidasAposPontoBackup:3,posicoesRestauradas:12,
  integridade:'ok',replayDuplicadoIgnorado:true,
  checksum:'SHA-256',tempoRestauracaoLocalMs:rtoLocalMs,
  RPO_ObservadoPedidos:3,RTO_ContratualConhecido:false,
  recuperacaoOffsite:false,perdaFisicaSimulada:false
 }));
});
