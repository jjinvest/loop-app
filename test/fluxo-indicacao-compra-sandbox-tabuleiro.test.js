'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {MotorContaUnicaEnsaioSQLite}=require('../src/domain/motor-conta-unica-ensaio-sqlite');
const {EquipeCandidataSQLite}=require('../src/domain/equipe-candidata-sqlite');
const tid=n=>'titular-'+String(n).padStart(8,'0')+'-0000-0000-0000-000000000000';
const pid=n=>'hom-'+String(n).padStart(8,'0')+'-0000-0000-0000-000000000000';
function preparar(){
 const db=new DatabaseSync(':memory:');
 db.exec([
 'PRAGMA foreign_keys=ON;',
 'CREATE TABLE akitemm_conta_unica_candidata(id TEXT PRIMARY KEY,nick TEXT UNIQUE COLLATE NOCASE);',
 'CREATE TABLE akitemm_checkout_prepedidos_staging(prepedido_id TEXT PRIMARY KEY,titular_id TEXT,total_centavos INTEGER,criado_em TEXT);',
 'CREATE TABLE akitemm_prepedido_asaas_sandbox_staging(prepedido_id TEXT PRIMARY KEY,titular_id TEXT,estado TEXT,pagamento_id TEXT);',
 'CREATE TABLE akitemm_prepedido_asaas_consultas_staging(id INTEGER PRIMARY KEY AUTOINCREMENT,prepedido_id TEXT,pagamento_id TEXT,status_asaas TEXT,consultado_em TEXT);',
 'CREATE TABLE akitemm_prepedido_webhook_inbox_staging(evento_id TEXT PRIMARY KEY,prepedido_id TEXT,pagamento_id TEXT,tipo TEXT);',
 'CREATE TABLE akitemm_prepedido_webhook_reconsulta_staging(evento_id TEXT PRIMARY KEY,estado TEXT,codigo TEXT);',
 'CREATE TABLE akitemm_prepedido_posicoes_pendentes_sandbox_staging(prepedido_id TEXT,titular_id TEXT);'
 ].join(' '));
 const fotos=new Map(),estadosPSP=new Map();
 const sinalizacao={db,consultarFotografiaPrepedido:({prepedidoId,titularId})=>{
  const x=fotos.get(prepedidoId);return x?.titularId===titularId?x:null;
 }};
 const ponte={banco:db,consultar:({prepedidoId})=>{
  const x=estadosPSP.get(prepedidoId);
  return x?{estado:x.estado,valorCentavos:25000,pagamentoSandboxId:'pay_'+prepedidoId.slice(4,12),
   ultimaConsultaSandbox:{statusAsaas:x.status},revisaoManualObrigatoria:false}:null;
 }};
 const equipe=new EquipeCandidataSQLite({banco:db});
 const motor=new MotorContaUnicaEnsaioSQLite({banco:db,sinalizacao,ponte});
 const conta=(n,nick)=>db.prepare('INSERT INTO akitemm_conta_unica_candidata(id,nick) VALUES(?,?)').run(tid(n),nick);
 const comprar=(n,t,recebido)=>{
  const id=pid(n),titular=tid(t),asaas='pay_'+id.slice(4,12);
  db.prepare('INSERT INTO akitemm_checkout_prepedidos_staging VALUES(?,?,?,?)')
   .run(id,titular,25000,new Date().toISOString());
  fotos.set(id,{titularId:titular,totalCentavos:25000,referenciaVerdeAtingida:true,
   valorVerdeConsideradoCentavos:25000,podeSimularFilaBAzul:true,eventoPendente:false});
  const estado=recebido?'RECEBIMENTO_INFORMADO_SANDBOX':'PENDENTE_SANDBOX';
  db.prepare('INSERT INTO akitemm_prepedido_asaas_sandbox_staging VALUES(?,?,?,?)')
   .run(id,titular,estado,asaas);
  db.prepare('INSERT INTO akitemm_prepedido_asaas_consultas_staging(prepedido_id,pagamento_id,status_asaas,consultado_em) VALUES(?,?,?,?)')
   .run(id,asaas,recebido?'RECEIVED':'PENDING',new Date().toISOString());
  if(recebido){
   db.prepare('INSERT INTO akitemm_prepedido_posicoes_pendentes_sandbox_staging VALUES(?,?)')
    .run(id,titular);
   db.prepare('INSERT INTO akitemm_prepedido_webhook_inbox_staging VALUES(?,?,?,?)')
    .run('evt_'+n,id,asaas,'PAYMENT_RECEIVED');
   db.prepare('INSERT INTO akitemm_prepedido_webhook_reconsulta_staging VALUES(?,?,?)')
    .run('evt_'+n,'CONCLUIDO','PSP_RECONSULTADO');
  }
  estadosPSP.set(id,{estado,status:recebido?'RECEIVED':'PENDING'});
  return motor.vincularPedido({prepedidoId:id,aceiteEnsaio:true});
 };
 // Fixture isolada do aceite; a verificacao real CPF/termos e PSP possui
 // teste proprio. Nao e rota que libera KYC/recebimento comercial.
 const aceitar=id=>{
  const l=db.prepare('SELECT titular_id,prepedido_id FROM akitemm_motor_ensaio_lotes_pedido WHERE numero_posicao=?').get(id);
  db.prepare('INSERT INTO akitemm_motor_ensaio_aceites_posicao VALUES(?,?,?,?,?,?,?)')
   .run(id,l.prepedido_id,l.titular_id,'hmac-lab','LAB-TERMOS','hash-lab',new Date().toISOString());
  motor._transacao(sim=>{
   const p=[...sim.filas.filaA,...sim.filas.filaB,sim.tabuleiro.centro,...sim.tabuleiro.vagas]
    .find(p=>p?.id===id);
   p.statusAdesao='ACEITE_ENSAIO';
  });
 };
 return {db,motor,equipe,conta,comprar,aceitar};
}
test('compra de A -> convite -> compra PSP de B -> fila A -> centro do tabuleiro',()=>{
 const x=preparar();
 try{
  x.conta(1,'Alpha');x.conta(2,'Bravo');
  const a=x.comprar(1,1,true);x.aceitar(a.posicaoId);
  assert.equal(x.motor.consultar().filaB.length,1);
  x.equipe.registrarCadastro({indicadoId:tid(2),indicadorNick:'Alpha'});
  assert.throws(()=>x.motor.qualificarIndicacaoEnsaio({
   indicadorId:tid(1),indicadoId:tid(2),posicaoAlvoId:a.posicaoId
  }),/INDICACAO_AGUARDANDO_COMPRA_PSP_CONCILIADA/);
  x.comprar(2,2,true);
  const aprovado=x.motor.qualificarIndicacaoEnsaio({
   indicadorId:tid(1),indicadoId:tid(2),posicaoAlvoId:a.posicaoId
  });
  assert.equal(aprovado.qualificada,true);
  assert.equal(aprovado.promovidaParaFilaA,true);
  assert.equal(aprovado.comissaoRealCentavos,0);
  const estado=x.motor.consultar({titularId:tid(1)});
  assert.equal(estado.filaA[0].numero,a.posicaoId);
  assert.equal(estado.filaA[0].indicacoesVinculadas,1);
  assert.equal(estado.minhasPosicoes[0].indicacoesVinculadas,1);
  const equipe=x.equipe.listar({titularId:tid(1)});
  assert.equal(equipe.indicacoesQualificadas,1);
  assert.equal(equipe.cadastros[0].qualificadaEnsaio,true);
  assert.equal(equipe.cadastros[0].posicaoAlvoId,a.posicaoId);
  const repetido=x.motor.qualificarIndicacaoEnsaio({
   indicadorId:tid(1),indicadoId:tid(2),posicaoAlvoId:a.posicaoId
  });
  assert.equal(repetido.repetido,true);
  const board=x.motor.prepararTabuleiro();
  assert.equal(board.preparado,true);
  assert.equal(x.motor.consultar().tabuleiro.centro.numero,a.posicaoId);
  assert.equal(x.motor.consultar().catraca.giros,0);
  assert.equal(x.motor.consultar().saldoRealCentavos,null);
  assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_indicacoes_qualificadas_lab').get().n,1);
  assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{x.db.close();}
});
test('sem convite, aceite ou compra confirmada nao altera fila; outra conta nao realoca',()=>{
 const x=preparar();
 try{
  x.conta(1,'Alpha');x.conta(2,'Bravo');x.conta(3,'Delta');
  const a=x.comprar(1,1,true),b=x.comprar(2,2,true);
  assert.throws(()=>x.motor.qualificarIndicacaoEnsaio({
   indicadorId:tid(1),indicadoId:tid(2),posicaoAlvoId:a.posicaoId
  }),/INDICACAO_SEM_CONVITE_VALIDO/);
  x.equipe.registrarCadastro({indicadoId:tid(2),indicadorNick:'Alpha'});
  assert.throws(()=>x.motor.qualificarIndicacaoEnsaio({
   indicadorId:tid(1),indicadoId:tid(2),posicaoAlvoId:a.posicaoId
  }),/POSICAO_ALVO_NAO_CONFIRMADA/);
  x.aceitar(a.posicaoId);
  assert.throws(()=>x.motor.qualificarIndicacaoEnsaio({
   indicadorId:tid(1),indicadoId:tid(2),posicaoAlvoId:b.posicaoId
  }),/POSICAO_ALVO_NAO_CONFIRMADA/);
  assert.throws(()=>x.motor.qualificarIndicacaoEnsaio({
   indicadorId:tid(3),indicadoId:tid(2),posicaoAlvoId:a.posicaoId
  }),/INDICACAO_SEM_CONVITE_VALIDO/);
  const r=x.motor.qualificarIndicacaoEnsaio({
   indicadorId:tid(1),indicadoId:tid(2),posicaoAlvoId:a.posicaoId
  });
  assert.equal(r.qualificada,true);
  assert.throws(()=>x.motor.qualificarIndicacaoEnsaio({
   indicadorId:tid(1),indicadoId:tid(2),posicaoAlvoId:b.posicaoId
  }),/INDICACAO_JA_ATRIBUIDA_OUTRA_POSICAO/);
  assert.equal(x.motor.consultar().filaA.length,1);
 }finally{x.db.close();}
});
test('pedido de B pendente no PSP nao vira indicacao apesar de lote no motor',()=>{
 const x=preparar();
 try{
  x.conta(1,'Alpha');x.conta(2,'Bravo');
  const a=x.comprar(1,1,true);x.aceitar(a.posicaoId);
  x.equipe.registrarCadastro({indicadoId:tid(2),indicadorNick:'Alpha'});
  x.comprar(2,2,false);
  assert.throws(()=>x.motor.qualificarIndicacaoEnsaio({
   indicadorId:tid(1),indicadoId:tid(2),posicaoAlvoId:a.posicaoId
  }),/INDICACAO_AGUARDANDO_COMPRA_PSP_CONCILIADA/);
  assert.equal(x.motor.consultar().filaA.length,0);
 }finally{x.db.close();}
});
test('seis compras PSP independentes alimentam um giro e exigem status atual de cada pagamento',()=>{
 const x=preparar();
 try{
  for(let i=1;i<=4;i++)x.conta(i,['Alpha','Bravo','Charlie','Delta'][i-1]);
  for(let i=1;i<=8;i++)x.comprar(i,((i-1)%4)+1,true);
  const board=x.motor.prepararTabuleiro();
  assert.equal(board.preparado,true);
  assert.equal(board.ocupadas,7);
  const before=x.motor.consultar();
  const numeroCentro=before.tabuleiro.centro.numero;
  assert.equal(before.tabuleiro.vagas.length,6);
  assert.equal(x.motor.controlarCatraca('GIRAR').girou,false);
  for(let i=1;i<=5;i++){
   const r=x.motor.registrarEvento({prepedidoId:pid(i)});
   assert.equal(r.repetido,false);
   assert.equal(r.eventosNoCiclo,i);
   assert.equal(r.prontoParaGiro,false);
  }
  assert.equal(x.motor.registrarEvento({prepedidoId:pid(1)}).repetido,true);
  x.motor.controlarCatraca('ABRIR');
  assert.equal(x.motor.controlarCatraca('GIRAR').girou,false);
  const sexto=x.motor.registrarEvento({prepedidoId:pid(6)});
  assert.equal(sexto.eventosNoCiclo,6);
  assert.equal(sexto.prontoParaGiro,true);
  x.motor.controlarCatraca('PAUSAR');
  assert.equal(x.motor.controlarCatraca('GIRAR').motivo,'CATRACA_PAUSADA');
  x.motor.controlarCatraca('ABRIR');
  // Uma nova reconsulta persistida que nao diz RECEIVED bloqueia
  // o giro sem consumir eventos nem mover uma unica posicao.
  x.db.prepare(
   'INSERT INTO akitemm_prepedido_asaas_consultas_staging(prepedido_id,pagamento_id,status_asaas,consultado_em) VALUES(?,?,?,?)'
  ).run(pid(1),'pay_'+pid(1).slice(4,12),'PENDING',new Date().toISOString());
  assert.throws(()=>x.motor.controlarCatraca('GIRAR'),
   /EVENTO_REQUER_COMPRA_PSP_CONCILIADA/);
  assert.equal(x.motor.consultar().tabuleiro.centro.numero,numeroCentro);
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,6);
  x.db.prepare(
   'INSERT INTO akitemm_prepedido_asaas_consultas_staging(prepedido_id,pagamento_id,status_asaas,consultado_em) VALUES(?,?,?,?)'
  ).run(pid(1),'pay_'+pid(1).slice(4,12),'RECEIVED',new Date().toISOString());
  assert.equal(x.motor.controlarCatraca('GIRAR').girou,true);
  const after=x.motor.consultar();
  assert.equal(after.catraca.giros,1);
  assert.equal(after.tabuleiro.centro.numero,before.tabuleiro.vagas[0].numero);
  assert.equal(after.tabuleiro.eventosNoCiclo,0);
  assert.equal(after.saldoRealCentavos,null);
  assert.equal(after.dinheiroReal,false);
  assert.equal(x.db.prepare(
   "SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes WHERE tipo='GIRO'"
  ).get().n,1);
  assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{x.db.close();}
});
test('webhook sem PSP recebido nao abastece catraca apesar de existir lote',()=>{
 const x=preparar();
 try{
  x.conta(1,'Alpha');
  x.comprar(1,1,false);
  x.motor.prepararTabuleiro();
  assert.throws(()=>x.motor.registrarEvento({prepedidoId:pid(1)}),
   /EVENTO_REQUER_COMPRA_PSP_CONCILIADA/);
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,0);
 }finally{x.db.close();}
});

test('agenda contabiliza uma compra PSP a cada dez minutos, com luzes 3 roxas e 3 pretas e giro separado',()=>{
 const x=preparar();
 const dia='2026-11-06';
 const time=(hhmm)=>Date.parse(dia+'T'+hhmm+':00-03:00');
 try{
  for(let i=1;i<=4;i++)x.conta(i,['Alpha','Bravo','Charlie','Delta'][i-1]);
  for(let i=1;i<=8;i++)x.comprar(i,((i-1)%4)+1,true);
  x.motor.prepararTabuleiro();
  const inicial=x.motor.consultar();
  const centroAnterior=inicial.tabuleiro.centro.numero;
  const p=x.motor.configurarAgenda({
   ativo:true,abertura:'09:00',fechamento:'18:00',
   intervaloMinutos:10,agoraMs:time('09:00')
  });
  assert.equal(p.agenda.ativo,true);
  assert.equal(x.motor.consultarAgenda({agoraMs:time('09:00')})
   .aguardandoContabilizacao,8);
  assert.equal(x.motor.processarPulsoAgenda({agoraMs:time('08:59')}).acao,
   'FORA_HORARIO');
  assert.equal(x.motor.processarPulsoAgenda({agoraMs:time('09:00')}).acao,
   'ABERTA_AGUARDANDO_INTERVALO');
  assert.equal(x.motor.processarPulsoAgenda({agoraMs:time('09:09')}).acao,
   'AGUARDANDO_INTERVALO');
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,0);
  for(let i=1;i<=6;i++){
   const horario=''+(9+Math.floor(i/6));
   const minuto=(i*10)%60;
   const quando=horario.padStart(2,'0')+':'+String(minuto).padStart(2,'0');
   const r=x.motor.processarPulsoAgenda({agoraMs:time(quando)});
   assert.equal(r.acao,'LUZ_DO_CICLO');
   assert.equal(r.luzesAcesas,i);
   assert.equal(x.motor.processarPulsoAgenda({
    agoraMs:time(quando)+15000
   }).acao,'AGUARDANDO_INTERVALO');
  }
  const estado=x.motor.consultarAgenda({agoraMs:time('10:00')});
  assert.equal(estado.luzesRoxasAcesas,3);
  assert.equal(estado.luzesPretasAcesas,3);
  assert.equal(estado.aguardandoContabilizacao,2);
  assert.equal(x.motor.consultar().tabuleiro.centro.numero,centroAnterior);
  assert.equal(x.motor.consultar().catraca.giros,0);
  const girou=x.motor.processarPulsoAgenda({agoraMs:time('10:10')});
  assert.equal(girou.acao,'GIRO_AGENDADO');
  assert.equal(girou.girou,true);
  assert.equal(x.motor.consultar().catraca.giros,1);
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,0);
  assert.equal(x.motor.consultar().saldoRealCentavos,null);
  x.motor.processarPulsoAgenda({agoraMs:time('18:00')});
  assert.equal(x.motor.consultar().catraca.estado,'PAUSADA');
 }finally{x.db.close();}
});
test('fora do horario e em pausa manual as compras continuam na fila, mas nenhuma luz e criada',()=>{
 const x=preparar();
 const t=s=>Date.parse('2026-11-06T'+s+':00-03:00');
 try{
  x.conta(1,'Alpha');x.conta(2,'Bravo');x.conta(3,'Charlie');
  x.comprar(1,1,true);
  x.motor.prepararTabuleiro();
  x.motor.configurarAgenda({
   ativo:true,abertura:'09:00',fechamento:'18:00',
   intervaloMinutos:5,agoraMs:t('09:00')
  });
  x.motor.processarPulsoAgenda({agoraMs:t('09:05')});
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,1);
  x.motor.controlarCatraca('PAUSAR');
  x.comprar(2,2,true);x.comprar(3,3,true);
  const a=x.motor.consultarAgenda({agoraMs:t('09:15')});
  assert.equal(a.aguardandoContabilizacao,2);
  assert.equal(a.luzesAcesas,1);
  assert.equal(x.motor.processarPulsoAgenda({agoraMs:t('09:15')}).acao,
   'PAUSA_MANUAL');
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,1);
  assert.equal(x.motor.consultar().filaB.length>=2,true);
  x.motor.configurarAgenda({
   ativo:true,abertura:'09:00',fechamento:'18:00',
   intervaloMinutos:5,agoraMs:t('09:17')
  });
  x.motor.processarPulsoAgenda({agoraMs:t('09:20')});
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,2);
  assert.equal(x.motor.consultarAgenda({agoraMs:t('20:00')}).dentroDoHorario,false);
  x.motor.processarPulsoAgenda({agoraMs:t('20:00')});
  assert.equal(x.motor.consultar().catraca.estado,'PAUSADA');
  assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{x.db.close();}
});

test('agenda monta tabuleiro com sete clientes distintos sem criar segundas filas',()=>{
 const x=preparar();
 const t=h=>Date.parse('2026-11-06T'+h+':00-03:00');
 try{
  for(let i=1;i<=7;i++){
   x.conta(i,'Cliente'+String(i).replace(/\d/g,'').concat(
    String.fromCharCode(96+i)));
   x.comprar(i,i,true);
  }
  assert.equal(x.motor.consultar().tabuleiro.centro,null);
  x.motor.configurarAgenda({
   ativo:true,abertura:'09:00',fechamento:'18:00',
   intervaloMinutos:10,agoraMs:t('09:00')
  });
  const pulso=x.motor.processarPulsoAgenda({agoraMs:t('09:10')});
  assert.equal(pulso.acao,'LUZ_DO_CICLO');
  const estado=x.motor.consultar();
  assert.ok(estado.tabuleiro.centro);
  assert.equal(estado.tabuleiro.vagas.filter(Boolean).length,6);
  assert.equal(estado.tabuleiro.eventosNoCiclo,1);
  assert.equal(estado.filaA.length+estado.filaB.length,0);
  assert.equal(estado.ordemAlimentacao,'3A:1B');
  assert.equal(x.motor.consultarAgenda({agoraMs:t('09:10')})
   .aguardandoContabilizacao,6);
  assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{x.db.close();}
});
