'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const {executar}=require('../scripts/simular-10000-clientes-http-asaas-sqlite');
const {consultarIntegridadeProvisoesLab}=require('../src/domain/integridade-provisoes-marco-zero-lab');
const {consultarMarcoZeroLab}=require('../src/domain/marco-zero-gate-sqlite-lab');
const AUTH={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};
function consultar(banco){return consultarIntegridadeProvisoesLab({banco});}
// Livros reais do laboratorio, com referencias variaveis de compras. Nao ha dinheiro.
function semear(b){
 const cabecalho=b.prepare(`INSERT INTO loop_v6_provisoes_ciclos
  VALUES(?,?,?,?,?,?,?,?,?)`);
 const evento=b.prepare('INSERT INTO loop_v6_provisoes_eventos VALUES(?,?,?,?,?,?)');
 const parcela=b.prepare('INSERT INTO loop_v6_provisoes_parcelas VALUES(?,?,?,?,?,?)');
 for(const giro of [1,2]){
  const empresa=giro===2,conta=empresa?null:'titular-privado-fixture';
  const valores=[19000,26000,37000,28000,21000,39000];
  cabecalho.run(giro,100+giro,conta,empresa?'LOOP_DOURADAS':'LOOP_CENTRO',
   empresa?0:25000,empresa?0:75000,valores.reduce((s,v)=>s+v,0),'{}','2026-11-01');
  const destinos=[empresa?'LOOP_DOURADAS':'LOOP_CENTRO','LOOP_ESQUERDA',
   empresa?'LOOP_DOURADAS':'LOOP_CENTRO','LOOP_DIREITA',
   empresa?'LOOP_DOURADAS':'LOOP_CENTRO','LOOP_ESQUERDA'];
  for(let i=0;i<6;i++)evento.run(giro,i+1,'venda-'+giro+'-'+i,
   'pedido-privado-'+giro+'-'+i,destinos[i],valores[i]);
  if(!empresa)for(const ordem of [1,3,5])
   parcela.run(giro,ordem,conta,101,25000,'PREVISTO_NAO_LIQUIDADO');
 }
}
function permitirCorrupcaoFixture(b){
 // Somente a fixture: as protecoes de imutabilidade continuam no produto.
 for(const nome of ['ciclos','eventos','parcelas'])for(const acao of ['update','delete'])
  b.exec('DROP TRIGGER loop_v6_provisoes_'+nome+'_imutavel_'+acao);
}
test('Marco Zero distingue livro ausente de livro vazio, sem gravar fontes',async t=>{
 const b=new DatabaseSync(':memory:');t.after(()=>b.close());
 assert.equal(consultar(b).estado,'FONTE_AUSENTE');
 assert.equal(consultar(b).alertasPorCriterio,null);
 assert.equal(b.prepare('SELECT total_changes() n').get().n,0);
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 assert.equal(consultar(m.banco).estado,'SEM_OPERACOES');
 assert.equal(consultar(m.banco).alertasPorCriterio,0);
 assert.equal(consultarMarcoZeroLab({banco:m.banco}).marcoZeroLiberado,false);
});
test('Previsoes variaveis e centro da empresa nao viram divergencia ou saldo bancario',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());semear(m.banco);
 m.banco.exec('PRAGMA query_only=ON');
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const d=consultar(m.banco);
 assert.equal(d.estado,'SEM_ALERTAS_LOCAIS');assert.equal(d.contagens.ciclos,2);
 assert.equal(d.alertasPorCriterio,0);assert.equal(d.conciliacaoBancaria,false);
 const gate=consultarMarcoZeroLab({banco:m.banco});
 assert.equal(gate.resumo.alertasProvisoes,0);assert.equal(gate.marcoZeroLiberado,false);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
});
test('SQLite integro com parcela de outro titular bloqueia criterio financeiro e GET nao corrige dados',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());semear(m.banco);
 permitirCorrupcaoFixture(m.banco);
 m.banco.exec("UPDATE loop_v6_provisoes_parcelas SET conta_id='outro-titular-privado' WHERE ordem=3");
 assert.equal(Object.values(m.banco.prepare('PRAGMA quick_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const resposta=await fetch(m.base+'/api/admin/escritorio-demo/marco-zero',{headers:AUTH});
 assert.equal(resposta.status,200);assert.equal(resposta.headers.get('cache-control'),'no-store');
 const d=await resposta.json();
 assert.equal(d.tecnicos.find(x=>x.id==='INTEGRIDADE_SQLITE').estado,'OK_LABORATORIO');
 assert.equal(d.tecnicos.find(x=>x.id==='PROVISOES_FINANCEIRAS').estado,'ALERTA');
 assert.equal(d.resumo.alertasProvisoes,1);assert.equal(d.resumo.alertasLocaisPorCriterio,1);
 assert.equal(d.resumo.provisoes.ciclosInconsistentes,1);
 assert.equal(d.marcoZeroLiberado,false);assert.equal(d.aptoParaPagamentosReais,false);
 assert.ok(d.externos.every(x=>x.estado==='NAO_COMPROVADO_NESTA_FONTE'));
 assert.doesNotMatch(JSON.stringify(d),/titular-privado|pedido-privado/);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
});
test('Compensar totais entre giros nao esconde falta de evento, parcela ou destino incorreto',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());semear(m.banco);
 permitirCorrupcaoFixture(m.banco);
 m.banco.exec(`UPDATE loop_v6_provisoes_ciclos SET referencia_eventos=referencia_eventos+100 WHERE giro=1;
  UPDATE loop_v6_provisoes_ciclos SET referencia_eventos=referencia_eventos-100 WHERE giro=2;`);
 assert.equal(consultar(m.banco).contagens.ciclosEventosInconsistentes,2);
 m.banco.exec(`UPDATE loop_v6_provisoes_ciclos SET referencia_eventos=referencia_eventos-100 WHERE giro=1;
  UPDATE loop_v6_provisoes_ciclos SET referencia_eventos=referencia_eventos+100 WHERE giro=2;
  DELETE FROM loop_v6_provisoes_eventos WHERE giro=1 AND ordem=6;
  DELETE FROM loop_v6_provisoes_parcelas WHERE giro=1 AND ordem=5;
  UPDATE loop_v6_provisoes_eventos SET destino_cofre='LOOP_CENTRO' WHERE giro=2 AND ordem=1;`);
 const d=consultar(m.banco);
 assert.equal(d.contagens.ciclosEventosInconsistentes,2);
 assert.equal(d.contagens.ciclosParcelasInconsistentes,1);
 assert.equal(d.contagens.ciclosInconsistentes,2);assert.equal(d.alertasPorCriterio,3);
});
test('Importacao com registros orfaos e cabecalho divergente nunca passa como sem operacoes',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());semear(m.banco);
 permitirCorrupcaoFixture(m.banco);m.banco.exec('PRAGMA foreign_keys=OFF');
 m.banco.exec(`UPDATE loop_v6_provisoes_ciclos SET previsto_centro=75001 WHERE giro=1;
  DELETE FROM loop_v6_provisoes_ciclos WHERE giro=2;`);
 let d=consultar(m.banco);
 assert.equal(d.contagens.ciclosCabecalhoInconsistente,1);
 assert.equal(d.contagens.eventosOrfaos,6);
 m.banco.exec('DELETE FROM loop_v6_provisoes_ciclos');d=consultar(m.banco);
 assert.equal(d.contagens.ciclos,0);assert.equal(d.estado,'ALERTA');
 assert.equal(d.contagens.eventosOrfaos,12);assert.equal(d.contagens.parcelasOrfas,3);
});
test('Leitor WAL nao observa livros parcialmente gravados por outra conexao',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-marco-wal-'));
 const arquivo=path.join(pasta,'laboratorio.sqlite');
 const m=await abrirLaboratorio(arquivo);
 const leitor=new DatabaseSync(arquivo,{readOnly:true});
 t.after(async()=>{leitor.close();await m.fechar();fs.rmSync(pasta,{recursive:true,force:true});});
 assert.equal(m.banco.prepare('PRAGMA journal_mode').get().journal_mode,'wal');
 m.banco.exec('BEGIN IMMEDIATE');semear(m.banco);
 assert.equal(consultar(leitor).estado,'SEM_OPERACOES');
 m.banco.exec('COMMIT');
 const d=consultar(leitor);
 assert.equal(d.estado,'SEM_ALERTAS_LOCAIS');assert.equal(d.contagens.ciclos,2);
 permitirCorrupcaoFixture(m.banco);
 m.banco.exec('BEGIN IMMEDIATE; DELETE FROM loop_v6_provisoes_parcelas;');
 assert.equal(consultar(leitor).alertasPorCriterio,0);
 m.banco.exec('ROLLBACK');assert.equal(consultar(leitor).alertasPorCriterio,0);
});
test('Compra HTTP, confirmacao ficticia e ativacao persistem dois ciclos coerentes apos reinicio',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-marco-provisoes-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const r=await executar({total:12,pasta});assert.equal(r.giros,2);
 const b=new DatabaseSync(path.join(pasta,'laboratorio.sqlite'),{readOnly:true});t.after(()=>b.close());
 const antes=b.prepare('SELECT total_changes() n').get().n;
 const d=consultarMarcoZeroLab({banco:b});
 assert.equal(d.resumo.provisoes.ciclos,2);assert.equal(d.resumo.alertasProvisoes,0);
 assert.equal(d.tecnicos.find(x=>x.id==='PROVISOES_FINANCEIRAS').estado,'SEM_ALERTAS_LOCAIS');
 assert.equal(d.marcoZeroLiberado,false);assert.equal(d.aptoParaReceberClientesReais,false);
 assert.equal(d.conciliacaoBancariaComprovada,false);
 assert.equal(b.prepare('SELECT total_changes() n').get().n,antes);
});
