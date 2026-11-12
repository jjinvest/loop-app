'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
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

test('modo natural usa compra recebida sem horario, pausa somente catraca e acumula fila',()=>{
 const x=preparar();
 const h=s=>Date.parse('2026-11-06T'+s+':00-03:00');
 try{
  for(let i=1;i<=7;i++)x.conta(i,'Teste'+String.fromCharCode(96+i));
  for(let i=1;i<=7;i++)x.comprar(i,i,true);
  const configurada=x.motor.configurarAgenda({
   ativo:false,modoExecucao:'NATURAL',abertura:'09:00',fechamento:'18:00',
   intervaloMinutos:120,agoraMs:h('20:00')
  });
  assert.equal(configurada.modoExecucao,'NATURAL');
  const passo=x.motor.processarPulsoAgenda({agoraMs:h('20:01')});
  assert.equal(passo.acao,'GIRO_NATURAL');
  assert.equal(passo.giros,1);
  assert.equal(passo.eventosContabilizados,7);
  const depois=x.motor.consultar();
  assert.equal(depois.catraca.giros,1);
  assert.equal(depois.tabuleiro.eventosNoCiclo,1);
  // PAUSA impede novos eventos, mas a compra posterior ainda entra na fila.
  x.motor.controlarCatraca('PAUSAR');
  x.comprar(8,7,true);
  const vendaPausada=x.motor.consultar();
  assert.equal(vendaPausada.tabuleiro.eventosNoCiclo,1);
  assert.equal(vendaPausada.filaB.length>0,true);
  assert.equal(x.motor.processarPulsoAgenda({agoraMs:h('20:03')}).acao,
   'PAUSA_MANUAL');
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,1);
  x.motor.controlarCatraca('ABRIR');
  const retomada=x.motor.processarPulsoAgenda({agoraMs:h('20:04')});
  assert.equal(retomada.acao,'LUZ_NATURAL');
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,2);
  assert.equal(x.motor.consultar().saldoRealCentavos,null);
 }finally{x.db.close();}
});
test('STOP bloqueia movimentos mesmo com compras conciliadas; natural somente após destravar',()=>{
 const x=preparar();
 try{
  x.conta(1,'Alpha');
  x.comprar(1,1,true);
  x.motor.configurarAgenda({
   ativo:false,modoExecucao:'STOP',
   abertura:'09:00',fechamento:'18:00',intervaloMinutos:10
  });
  assert.equal(x.motor.processarPulsoAgenda().acao,'STOP_CATRACA');
  assert.equal(x.motor.controlarCatraca('ABRIR').motivo,
   'STOP_ADMINISTRATIVO');
  assert.equal(x.motor.consultar().filaB.length,1);
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,0);
  assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{x.db.close();}
});

test('lote de cinco pessoas libera somente ciclos sustentados por seis vendas cada',()=>{
 const x=preparar();
 try{
  for(let i=1;i<=8;i++){
   x.conta(i,'Conta'+String.fromCharCode(96+i));
   x.comprar(i,i,true);
  }
  const lote=x.motor.liberarLoteEnsaio({quantidade:5});
  assert.equal(lote.solicitados,5);
  assert.equal(lote.liberados,1);
  assert.equal(lote.restantes,4);
  assert.equal(lote.eventosUsados,8);
  assert.equal(lote.motivo,'AGUARDANDO_SEIS_COMPRAS_CONCILIADAS');
  assert.equal(x.motor.consultar().catraca.giros,1);
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,2);
  assert.equal(x.motor.consultar().saldoRealCentavos,null);
  // Segundo lote nao reutiliza as mesmas 8 compras.
  const repetido=x.motor.liberarLoteEnsaio({quantidade:5});
  assert.equal(repetido.liberados,0);
  assert.equal(repetido.eventosUsados,0);
  assert.equal(x.motor.consultar().catraca.giros,1);
 }finally{x.db.close();}
});
test('STOP bloqueia inclusive lote manual, mas novas vendas continuam',()=>{
 const x=preparar();
 try{
  x.conta(1,'Alpha');
  x.comprar(1,1,true);
  x.motor.configurarAgenda({
   ativo:false,modoExecucao:'STOP',abertura:'09:00',
   fechamento:'18:00',intervaloMinutos:120
  });
  const r=x.motor.liberarLoteEnsaio({quantidade:10});
  assert.equal(r.liberados,0);
  assert.equal(r.motivo,'STOP_ADMINISTRATIVO');
  assert.equal(x.motor.consultar().filaB.length,1);
 }finally{x.db.close();}
});

test('dez ciclos: primeira luz 09:09 e giro na sexta compra comprovada',()=>{
 const x=preparar(),t=s=>Date.parse('2026-11-06T'+s+':00-03:00');
 try{
  for(let i=1;i<=8;i++)x.conta(i,'Meta'+String.fromCharCode(96+i));
  for(let i=1;i<=15;i++)x.comprar(i,((i-1)%8)+1,true);
  const r=x.motor.configurarAgenda({
   ativo:true,modoExecucao:'AGENDADA',abertura:'09:00',
   fechamento:'18:00',intervaloMinutos:10,
   metaQuantidade:10,metaDataAlvo:'2026-11-06',agoraMs:t('09:00')
  });
  assert.equal(r.agenda.metaLotes.intervaloLuzSegundos,540);
  assert.equal(r.agenda.metaLotes.proximaLuzPrevistaEmMs,t('09:09'));
  assert.equal(x.motor.processarPulsoAgenda({agoraMs:t('09:08')}).acao,
   'META_AGUARDANDO_PROXIMA_LIBERACAO');
  const horarios=['09:09','09:18','09:27','09:36','09:45','09:54',
   '10:03','10:12','10:21','10:30','10:39','10:48'];
  for(let i=0;i<horarios.length;i++){
   const pulso=x.motor.processarPulsoAgenda({agoraMs:t(horarios[i])});
   assert.equal(pulso.acao,(i+1)%6===0?
    'GIRO_META_AGENDADA':'LUZ_DO_CICLO',horarios[i]);
   assert.equal(x.motor.consultar().catraca.giros,Math.floor((i+1)/6));
   assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,(i+1)%6);
   assert.equal(x.motor.processarPulsoAgenda({
    agoraMs:t(horarios[i])
   }).acao,'META_AGUARDANDO_PROXIMA_LIBERACAO');
  }
  assert.equal(x.motor.consultarAgenda({agoraMs:t('10:48')})
   .metaLotes.realizadosNoDia,2);
  assert.equal(x.motor.consultarAgenda({agoraMs:t('10:48')})
   .metaLotes.restantes,8);
  assert.equal(x.motor.consultar().saldoRealCentavos,null);
  assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{x.db.close();}
});
test('meta sem vendas suficientes nunca inventa o proximo ciclo',()=>{
 const x=preparar(),t=s=>Date.parse('2026-11-06T'+s+':00-03:00');
 try{
  for(let i=1;i<=8;i++)x.conta(i,'Pessoal'+String.fromCharCode(96+i));
  for(let i=1;i<=8;i++)x.comprar(i,i,true);
  x.motor.configurarAgenda({
   ativo:true,modoExecucao:'AGENDADA',abertura:'09:00',
   fechamento:'10:00',intervaloMinutos:10,
   metaQuantidade:5,metaDataAlvo:null,agoraMs:t('09:00')
  });
  for(let i=1;i<=6;i++){
   const pulso=x.motor.processarPulsoAgenda({
    agoraMs:t('09:'+String(i*2).padStart(2,'0'))
   });
   assert.equal(pulso.acao,i===6?'GIRO_META_AGENDADA':'LUZ_DO_CICLO');
  }
  assert.equal(x.motor.consultar().catraca.giros,1);
  for(const h of ['09:14','09:16'])
   assert.equal(x.motor.processarPulsoAgenda({agoraMs:t(h)}).acao,
    'LUZ_DO_CICLO');
  const p=x.motor.processarPulsoAgenda({agoraMs:t('09:24')});
  assert.equal(p.acao,'META_AGUARDANDO_PSP');
  assert.equal(p.luzesAcesas,2);
  assert.equal(x.motor.consultar().catraca.giros,1);
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,2);
  assert.equal(x.motor.consultar().saldoRealCentavos,null);
 }finally{x.db.close();}
});
test('meta elevada preserva quantidade mas nao acende luzes em rajada',()=>{
 const x=preparar(),t=s=>Date.parse('2026-11-06T'+s+':00-03:00');
 try{
  for(let i=1;i<=8;i++)x.conta(i,'Milhao'+String.fromCharCode(96+i));
  for(let i=1;i<=12;i++)x.comprar(i,((i-1)%8)+1,true);
  x.motor.configurarAgenda({
   ativo:true,modoExecucao:'AGENDADA',abertura:'09:00',
   fechamento:'18:00',intervaloMinutos:10,
   metaQuantidade:1000000,metaDataAlvo:'2026-11-06',
   agoraMs:t('09:00')
  });
  for(let i=1;i<=12;i++){
   const h='09:'+String(i).padStart(2,'0');
   const pulso=x.motor.processarPulsoAgenda({agoraMs:t(h)});
   assert.equal(pulso.acao,i%6===0?'GIRO_META_AGENDADA':'LUZ_DO_CICLO');
   if(i===1)assert.equal(x.motor.processarPulsoAgenda({agoraMs:t(h)}).acao,
    'META_AGUARDANDO_INTERVALO');
  }
  assert.equal(x.motor.consultar().catraca.giros,2);
  assert.equal(x.motor.consultarAgenda({agoraMs:t('09:12')})
   .metaLotes.quantidade,1000000);
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,0);
  assert.equal(x.motor.consultar().saldoRealCentavos,null);
  assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{x.db.close();}
});

test('apos cinco mil eventos historicos a catraca ainda encontra compras novas sem reusar as antigas',()=>{
 const x=preparar();
 try{
  for(let i=1;i<=8;i++)x.conta(i,'Fila'+String.fromCharCode(96+i));
  // Dados ficticios de historico, processados de forma persistente.
  // Exercita paginacao por cursor sem depender de chamadas PSP externas.
  const vinculo=x.db.prepare([
   'INSERT INTO akitemm_motor_conta_ensaio_operacoes',
   '(tipo,prepedido_id,titular_id,criado_em) VALUES(?,?,?,?)'
  ].join(' '));
  const anteriores=x.db.prepare([
   'INSERT INTO akitemm_motor_conta_ensaio_operacoes',
   '(tipo,prepedido_id,titular_id,criado_em) VALUES(?,?,?,?)'
  ].join(' '));
  const passado=Date.now()-86400000;
  for(let i=0;i<5101;i++){
   const id='hom-'+(0x10000000+i).toString(16)+
    '-0000-0000-0000-000000000000';
   vinculo.run('VINCULAR_PEDIDO',id,tid(1),passado+i);
   anteriores.run('EVENTO_CICLO',id,tid(1),passado+i);
  }
  for(let i=1;i<=8;i++)x.comprar(i,i,true);
  const pendentes=x.motor._pedidosAguardando(x.motor._simulador(),8);
  assert.equal(pendentes.length,8);
  assert.equal(pendentes[0].prepedidoId,pid(1));
  assert.equal(pendentes[7].prepedidoId,pid(8));
  const lote=x.motor.liberarLoteEnsaio({quantidade:2});
  assert.equal(lote.liberados,1);
  assert.equal(lote.eventosUsados,8);
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,2);
  assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{x.db.close();}
});

test('apos cinco luzes, restaurar SQLite isolado preserva evento, titular, fila e giro sem replay',()=>{
 const x=preparar();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'motor-restaurar-'));
 const arquivo=path.join(dir,'motor.sqlite');
 let db2=null;
 try{
  for(let i=1;i<=8;i++){
   x.conta(i,'Titular'+String.fromCharCode(64+i));
   x.comprar(i,i,true);
  }
  x.motor.prepararTabuleiro();
  const centroAnterior=x.motor.consultar().tabuleiro.centro.numero;
  for(let i=1;i<=5;i++){
   assert.equal(x.motor.registrarEvento({prepedidoId:pid(i)}).repetido,false);
  }
  assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,5);
  x.db.exec("VACUUM INTO '"+arquivo.replaceAll("'","''")+"'");
  db2=new DatabaseSync(arquivo);
  db2.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');
  // Os estados PSP externos permanecem em mock; o motor reabre sua fonte
  // SQLite em arquivo novo sem recorrer a um snapshot em memoria.
  const sinalizacao={...x.motor.sinalizacao,db:db2};
  const ponte={...x.motor.ponte,banco:db2};
  let restaurado=new MotorContaUnicaEnsaioSQLite({
   banco:db2,sinalizacao,ponte
  });
  assert.equal(restaurado.consultar().tabuleiro.eventosNoCiclo,5);
  assert.equal(restaurado.consultar().tabuleiro.centro.numero,centroAnterior);
  assert.equal(restaurado.registrarEvento({prepedidoId:pid(1)}).repetido,true);
  const sexto=restaurado.registrarEvento({prepedidoId:pid(6)});
  assert.equal(sexto.eventosNoCiclo,6);
  restaurado.controlarCatraca('ABRIR');
  assert.equal(restaurado.controlarCatraca('GIRAR').girou,true);
  restaurado=new MotorContaUnicaEnsaioSQLite({banco:db2,sinalizacao,ponte});
  assert.equal(restaurado.consultar().catraca.giros,1);
  assert.equal(restaurado.consultar().tabuleiro.eventosNoCiclo,0);
  assert.equal(restaurado.registrarEvento({prepedidoId:pid(6)}).repetido,true);
  assert.equal(restaurado.consultar().catraca.giros,1);
  assert.equal(restaurado.consultar().dinheiroReal,false);
  assert.equal(db2.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db2.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{
  if(db2)db2.close();
  x.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
