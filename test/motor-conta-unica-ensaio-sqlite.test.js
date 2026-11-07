'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {MotorContaUnicaEnsaioSQLite}=
 require('../src/domain/motor-conta-unica-ensaio-sqlite');
const {planejarPosicoesCompraAkitemm}=require('../src/domain/plano-posicoes-compra-akitemm');
const titular=n=>'titular-'+String(n).padStart(8,'0')+'-0000-0000-0000-000000000000';
const pedido=n=>'hom-'+String(n).padStart(8,'0')+'-0000-0000-0000-000000000000';
function preparar(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;'+
  'CREATE TABLE akitemm_conta_unica_candidata(id TEXT PRIMARY KEY);'+
  'CREATE TABLE akitemm_checkout_prepedidos_staging('+
  'prepedido_id TEXT PRIMARY KEY,titular_id TEXT,total_centavos INTEGER NOT NULL);');
 const fotos=new Map();
 const sinalizacao={db,consultarFotografiaPrepedido:({prepedidoId,titularId})=>{
  const f=fotos.get(prepedidoId);
  return f?.titularId===titularId?f:null;
 }};
 const gravar=(n,t=1,{verde=true,total=25000}={})=>{
  db.prepare('INSERT INTO akitemm_checkout_prepedidos_staging VALUES(?,?,?)')
   .run(pedido(n),titular(t),total);
  fotos.set(pedido(n),{titularId:titular(t),totalCentavos:total,
   referenciaVerdeAtingida:verde,
   valorVerdeConsideradoCentavos:verde?total:0,
   podeSimularFilaBAzul:verde,eventoPendente:false});
 };
 const conta=n=>db.prepare('INSERT INTO akitemm_conta_unica_candidata VALUES(?)')
  .run(titular(n));
 return {db,sinalizacao,gravar,conta,fotos,
  motor:new MotorContaUnicaEnsaioSQLite({banco:db,sinalizacao})};
}
test('motor inicia vazio na MESMA conexao SQLite, sem criar posicoes ou eventos',()=>{
 const {db,motor}=preparar();
 try{
  assert.deepEqual(motor.consultar().filaA,[]);
  assert.deepEqual(motor.consultar().filaB,[]);
  assert.equal(motor.consultar().catraca.giros,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_estado').get().n,0);
  assert.equal(motor.consultar().dinheiroReal,false);
  assert.throws(()=>motor.consultar({titularId:titular(1)}),
   /TITULAR_MOTOR_INEXISTENTE/);
 }finally{db.close();}
});
test('sem fotografia verde qualificada ou ciencia explicita, nenhum pedido entra no motor',()=>{
 const {db,motor,conta,gravar}=preparar();
 try{
  conta(1);gravar(1,1,{verde:false});gravar(2);
  assert.throws(()=>motor.vincularPedido({prepedidoId:pedido(1),aceiteEnsaio:true}),
   /PEDIDO_NAO_QUALIFICA_ENSAIO_MOTOR/);
  assert.throws(()=>motor.vincularPedido({prepedidoId:pedido(2)}),
   /CIENCIA_DE_ENSAIO_OBRIGATORIA/);
  assert.deepEqual(motor.consultar({titularId:titular(1)}).minhasPosicoes,[]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes').get().n,0);
 }finally{db.close();}
});
test('pedido idempotente, isolamento entre titulares, limite 10 e reinicializacao SQLite',()=>{
 const {db,motor,conta,gravar,sinalizacao}=preparar();
 try{
  conta(1);conta(2);
  for(let n=1;n<=11;n++)gravar(n);
  gravar(30,2);
  const a=motor.vincularPedido({prepedidoId:pedido(1),aceiteEnsaio:true});
  assert.equal(a.repetido,false);
  assert.equal(motor.vincularPedido({prepedidoId:pedido(1),aceiteEnsaio:true}).repetido,true);
  for(let n=2;n<=10;n++)motor.vincularPedido({prepedidoId:pedido(n),aceiteEnsaio:true});
  assert.throws(()=>motor.vincularPedido({prepedidoId:pedido(11),aceiteEnsaio:true}),
   /LIMITE_DEZ_POSICOES_MOTOR_ENSAIO/);
  motor.vincularPedido({prepedidoId:pedido(30),aceiteEnsaio:true});
  const um=motor.consultar({titularId:titular(1)}),
   dois=motor.consultar({titularId:titular(2)});
  assert.equal(um.posicoesAtivasDoTitular,10);
  assert.equal(dois.posicoesAtivasDoTitular,1);
  assert.ok(um.filaB.some(x=>x.minha));
  assert.equal(um.minhasPosicoes.length,10);
  assert.equal(dois.minhasPosicoes.length,1);
  assert.ok(dois.minhasPosicoes.every(x=>!um.minhasPosicoes.some(y=>x.numero===y.numero)));
  assert.doesNotMatch(JSON.stringify(um),new RegExp(titular(2)));
  const reaberto=new MotorContaUnicaEnsaioSQLite({banco:db,sinalizacao});
  assert.equal(reaberto.consultar({titularId:titular(1)}).posicoesAtivasDoTitular,10);
  assert.equal(reaberto.vincularPedido({prepedidoId:pedido(1),aceiteEnsaio:true}).repetido,true);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});
test('catraca exige 6 eventos distintos, pausa respeitada e limite de 2 no tabuleiro',()=>{
 const {db,motor,conta,gravar,sinalizacao}=preparar();
 try{
  for(let i=1;i<=4;i++)conta(i);
  for(let n=1;n<=8;n++){
   const dono=(n%4)+1;gravar(n,dono);
   motor.vincularPedido({prepedidoId:pedido(n),aceiteEnsaio:true});
  }
  const p=motor.prepararTabuleiro();
  assert.equal(p.preparado,true);
  assert.equal(p.ocupadas,7);
  const estado=motor.consultar();
  assert.equal(estado.tabuleiro.vagas.length,6);
  const paridade=new Map();
  for(const p of [estado.tabuleiro.centro,...estado.tabuleiro.vagas]){
   if(!p||p.dourada)continue;
   assert.ok(p.status==='ENSAIO');
  }
  assert.equal(motor.controlarCatraca('GIRAR').girou,false);
  for(let n=1;n<=6;n++){
   const r=motor.registrarEvento({prepedidoId:pedido(n)});
   assert.equal(r.eventosNoCiclo,n);
   // A catraca FINANCEIRA contabiliza ja na luz, ANTES do giro fisico.
   const livro=motor.consultarFluxoFinanceiro();
   assert.equal(livro.luzesFinanceirasRegistradas,n);
   assert.equal(livro.girosFisicosConcluidos,0);
   assert.equal(livro.luzesNoCiclo,n);
   assert.equal(livro.valorDisponivelParaSaqueCentavos,0);
   const luzes=motor.consultarAgenda();
   assert.equal(luzes.luzesRoxasAcesas,Math.ceil(n/2));
   assert.equal(luzes.luzesPretasAcesas,Math.floor(n/2));
  }
  assert.equal(motor.registrarEvento({prepedidoId:pedido(1)}).repetido,true);
  assert.throws(()=>motor.registrarEvento({prepedidoId:pedido(7)}),
   /Ciclo ja tem seis vendas/);
  assert.equal(motor.controlarCatraca('GIRAR').motivo,'CATRACA_PAUSADA');
  motor.controlarCatraca('ABRIR');
  assert.equal(motor.controlarCatraca('GIRAR').girou,true);
  const apos=new MotorContaUnicaEnsaioSQLite({banco:db,sinalizacao}).consultar();
  assert.equal(apos.catraca.giros,1);
  assert.equal(apos.catraca.giros24h,1);
  const depoisGiro=motor.consultarFluxoFinanceiro();
  assert.equal(depoisGiro.luzesFinanceirasRegistradas,6);
  assert.equal(depoisGiro.girosFisicosConcluidos,1);
  assert.equal(depoisGiro.luzesNoCiclo,0);
  // Posicao central sem CPF pode ser assumida pela empresa; nesse caso
  // as SEIS parcelas pertencem ao cofre DOURADAS, sem alterar 3/2/1 cliente.
  assert.deepEqual(depoisGiro.cofres.map(x=>x.eventos),
   estado.tabuleiro.centro.dourada?[0,0,0,6]:[3,2,1,0]);
  assert.equal(depoisGiro.valorDisponivelParaSaqueCentavos,0);
  assert.equal(db.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_luzes_financeiras_eventos_lab'
  ).get().n,6);
  assert.equal(apos.tabuleiro.eventosNoCiclo,0);
  assert.equal(apos.posicoesReais,0);
  assert.equal(apos.saldoRealCentavos,null);
 }finally{db.close();}
});
test('motor de ensaio jamais pode ser iniciado em producao',()=>{
 const old=process.env.NODE_ENV;
 process.env.NODE_ENV='production';
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');
 try{
  assert.throws(()=>new MotorContaUnicaEnsaioSQLite({
   banco:db,sinalizacao:{db,consultarFotografiaPrepedido:()=>null}
  }),/MOTOR_ENSAIO_PROIBIDO_PRODUCAO/);
 }finally{db.close();if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
});

test('compra mista abre lote indivisivel de oito posicoes, sem credito real',()=>{
 const {db,motor,conta,gravar,fotos,sinalizacao}=preparar();
 try{
  conta(1);gravar(1,1,{total:200000});
  const itens=[
   {produtoId:'verde-100',classificacao:'VERDE',quantidade:3,
    precoUnitarioCentavos:10000,subtotalCentavos:30000,minimo:1},
   {produtoId:'ouro-350',classificacao:'DOURADO',quantidade:2,
    precoUnitarioCentavos:35000,subtotalCentavos:70000,minimo:1},
   {produtoId:'evento-1000',classificacao:'ROXO',quantidade:1,
    precoUnitarioCentavos:100000,subtotalCentavos:100000,minimo:1,
    posicoesPorUnidadeRoxo:5}
  ];
  const planejamentoPosicoes=planejarPosicoesCompraAkitemm(itens);
  fotos.set(pedido(1),{titularId:titular(1),totalCentavos:200000,
   planejamentoPosicoes,itens});
  const primeira=motor.vincularPedido({prepedidoId:pedido(1),aceiteEnsaio:true});
  assert.equal(primeira.quantidadePosicoes,8);
  assert.equal(new Set(primeira.posicoesIds).size,8);
  assert.equal(primeira.posicoesReais,0);
  assert.equal(primeira.financeiroReal,false);
  const repetida=motor.vincularPedido({prepedidoId:pedido(1),aceiteEnsaio:true});
  assert.equal(repetida.repetido,true);
  assert.deepEqual(repetida.posicoesIds,primeira.posicoesIds);
  assert.equal(motor.consultar({titularId:titular(1)}).posicoesAtivasDoTitular,8);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido').get().n,8);
  assert.equal(new MotorContaUnicaEnsaioSQLite({banco:db,sinalizacao})
   .consultar({titularId:titular(1)}).posicoesAtivasDoTitular,8);
  gravar(2,1,{total:150000});
  const tres=[{produtoId:'ouro-500',classificacao:'DOURADO',
   quantidade:3,precoUnitarioCentavos:50000,subtotalCentavos:150000}];
  fotos.set(pedido(2),{titularId:titular(1),totalCentavos:150000,
   itens:tres,planejamentoPosicoes:planejarPosicoesCompraAkitemm(tres)});
  assert.throws(()=>motor.vincularPedido({prepedidoId:pedido(2),aceiteEnsaio:true}),
   /LIMITE_DEZ_POSICOES_MOTOR_ENSAIO/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido').get().n,8);
  assert.equal(motor.consultar({titularId:titular(1)}).posicoesAtivasDoTitular,8);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});
test('verde abaixo do piso e roxo nao configurado nao criam entradas no motor',()=>{
 const {db,motor,conta,gravar,fotos}=preparar();
 try{
  conta(1);gravar(1,1,{total:100000});
  const itens=[{produtoId:'verde-100',classificacao:'VERDE',quantidade:1,
   precoUnitarioCentavos:10000,subtotalCentavos:10000},
   {produtoId:'cinza-900',classificacao:'CINZA',quantidade:1,
    precoUnitarioCentavos:90000,subtotalCentavos:90000}];
  fotos.set(pedido(1),{titularId:titular(1),totalCentavos:100000,itens,
   planejamentoPosicoes:planejarPosicoesCompraAkitemm(itens)});
  assert.throws(()=>motor.vincularPedido({prepedidoId:pedido(1),aceiteEnsaio:true}),
   /PLANEJAMENTO_PEDIDO_NAO_QUALIFICA_ENSAIO/);
  gravar(2,1,{total:1000000});
  const roxo=[{produtoId:'carro-10k',classificacao:'ROXO',quantidade:1,
   precoUnitarioCentavos:1000000,subtotalCentavos:1000000}];
  fotos.set(pedido(2),{titularId:titular(1),totalCentavos:1000000,itens:roxo,
   planejamentoPosicoes:planejarPosicoesCompraAkitemm(roxo)});
  assert.throws(()=>motor.vincularPedido({prepedidoId:pedido(2),aceiteEnsaio:true}),
   /PLANEJAMENTO_PEDIDO_NAO_QUALIFICA_ENSAIO/);
  assert.equal(motor.consultar({titularId:titular(1)}).posicoesAtivasDoTitular,0);
 }finally{db.close();}
});

// Rótulos dourados: campos estritamente visuais, persistentes, sem alterar IDs.
test('douradas são limpas por padrão, rotulos editáveis sem mudar snapshot e auditáveis',()=>{
 const {db,motor,sinalizacao}=preparar();
 try{
  const sim=motor._simulador();
  const criada=sim.registrarPosicaoSimulada({
   nome:'Operacional',participanteId:'LOOP_EMPRESA'
  }).posicao;
  const p=sim.filas.filaB.find(x=>x.id===criada.id);
  p.empresa=true;p.titularOperacional='LOOP_EMPRESA';p.statusAdesao='POSICAO_LOOP';
  motor._gravar(sim);
  const antes=db.prepare('SELECT snapshot FROM akitemm_motor_conta_ensaio_estado WHERE id=1').get().snapshot;
  const defaultVisivel=motor.consultar().filaB.find(x=>x.numero===criada.id);
  assert.equal(defaultVisivel.dourada,true);
  assert.equal(defaultVisivel.nomeVisual,'');assert.equal(defaultVisivel.numeroVisual,'');
  const primeira=motor.definirVisualDourada({posicaoId:criada.id,
   nomeVisual:' Reserva VIP ',numeroVisual:'007'});
  assert.equal(primeira.posicaoId,criada.id);
  assert.equal(primeira.nomeVisual,'Reserva VIP');
  assert.equal(primeira.numeroVisual,'007');
  assert.equal(motor.definirVisualDourada({posicaoId:criada.id,
   nomeVisual:'Reserva VIP',numeroVisual:'007'}).semAlteracao,true);
  const reaberto=new MotorContaUnicaEnsaioSQLite({banco:db,sinalizacao});
  const rotulo=reaberto.consultar().filaB.find(x=>x.numero===criada.id);
  assert.equal(rotulo.nomeVisual,'Reserva VIP');
  assert.equal(rotulo.numeroVisual,'007');
  assert.equal(db.prepare('SELECT snapshot FROM akitemm_motor_conta_ensaio_estado WHERE id=1').get().snapshot,antes);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_douradas_rotulos_auditoria_lab').get().n,1);
  const reset=reaberto.definirVisualDourada({posicaoId:criada.id});
  assert.equal(reset.revisao,2);
  const apos=reaberto.consultar().filaB.find(x=>x.numero===criada.id);
  assert.equal(apos.nomeVisual,'');assert.equal(apos.numeroVisual,'');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_douradas_rotulos_auditoria_lab').get().n,2);
  assert.throws(()=>db.exec('DELETE FROM akitemm_motor_douradas_rotulos_auditoria_lab'),
   /auditoria de rotulo imutavel/);
 }finally{db.close();}
});
test('visual não pode virar ID, editar participante, injetar HTML ou renumerar fila',()=>{
 const {db,motor,gravar,conta}=preparar();
 try{
  conta(1);gravar(1);
  const normal=motor.vincularPedido({prepedidoId:pedido(1),aceiteEnsaio:true});
  const id=normal.posicaoId;
  const dados={posicaoId:id,nomeVisual:'Cliente',numeroVisual:'100'};
  assert.throws(()=>motor.definirVisualDourada(dados),
   {codigo:'DOURADA_VISUAL_POSICAO_NAO_ELEGIVEL'});
  const sim=motor._simulador();
  const criada=sim.registrarPosicaoSimulada({
   nome:'Operacional',participanteId:'LOOP_EMPRESA'
  }).posicao;
  const dourada=sim.filas.filaB.find(x=>x.id===criada.id);
  dourada.empresa=true;dourada.titularOperacional='LOOP_EMPRESA';
  motor._gravar(sim);
  for(const r of [
   {posicaoId:criada.id,nomeVisual:'<script>alert(1)</script>'},
   {posicaoId:criada.id,nomeVisual:'X\nY'},
   {posicaoId:criada.id,numeroVisual:'12A'},
   {posicaoId:criada.id,numeroVisual:'123456789'},
   {posicaoId:String(criada.id),nomeVisual:'VIP'}
  ])assert.throws(()=>motor.definirVisualDourada(r),
   {codigo:'DOURADA_VISUAL_DADOS_INVALIDOS'});
  motor.definirVisualDourada({posicaoId:criada.id,nomeVisual:'VIP',numeroVisual:'0001'});
  assert.equal(motor.consultar({titularId:titular(1)}).filaB.find(x=>x.numero===id).nomeVisual,undefined);
  assert.equal(motor.consultar().filaB.find(x=>x.numero===criada.id).numeroVisual,'0001');
  assert.equal(motor.consultar().limitePosicoesAtivas,10);
 }finally{db.close();}
});

test('dourada manual entra no motor UNICO da conta, sem compra, reserva ou giro e com idempotencia apos reinicio',()=>{
 const {db,motor,sinalizacao}=preparar();
 try{
  const eventoId='dourada-ensaio-integrado-0001';
  assert.throws(()=>motor.criarDouradaManualEnsaio({eventoId,aceiteEnsaio:false}),
   {codigo:'DOURADA_MANUAL_DADOS_INVALIDOS'});
  assert.throws(()=>motor.criarDouradaManualEnsaio({eventoId:'invalido',aceiteEnsaio:true}),
   {codigo:'DOURADA_MANUAL_DADOS_INVALIDOS'});
  const antes=motor.consultar();
  assert.equal(antes.filaB.length,0);
  assert.equal(antes.douradasManuaisCriadas,0);
  const primeira=motor.criarDouradaManualEnsaio({eventoId,aceiteEnsaio:true});
  assert.equal(primeira.repetido,false);
  assert.equal(primeira.posicaoId,1);
  assert.equal(primeira.fila,'B');
  assert.equal(primeira.cor,'DOURADO');
  assert.equal(primeira.cofreDestino,'LOOP_DOURADAS');
  assert.equal(primeira.reservaConsumidaCentavos,0);
  assert.equal(primeira.receitaNovaCentavos,0);
  const repetida=motor.criarDouradaManualEnsaio({eventoId,aceiteEnsaio:true});
  assert.equal(repetida.repetido,true);
  assert.equal(repetida.posicaoId,primeira.posicaoId);
  const segunda=motor.criarDouradaManualEnsaio({
   eventoId:'dourada-ensaio-integrado-0002',aceiteEnsaio:true
  });
  assert.equal(segunda.posicaoId,2);
  assert.equal(motor.consultar().douradasManuaisCriadas,2);
  assert.equal(motor.consultar().filaB.length,2);
  assert.equal(motor.consultar().filaB.every(x=>x.dourada),true);
  assert.equal(motor.consultar().catraca.giros,0);
  assert.equal(motor.consultar().tabuleiro.eventosNoCiclo,0);
  assert.equal(db.prepare(
   "SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes WHERE tipo='VINCULAR_PEDIDO'"
  ).get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_douradas_manuais_lab').get().n,2);
  const snap=JSON.parse(db.prepare('SELECT snapshot FROM akitemm_motor_conta_ensaio_estado').get().snapshot);
  assert.equal(snap.filas.filaB[0].participanteId,'LOOP_EMPRESA');
  assert.equal(snap.filas.filaB[0].empresa,true);
  assert.equal(snap.filas.filaB[0].origemOperacional,'ADMIN_MANUAL_SEM_COMPRA');
  assert.equal(snap.filas.filaB[0].aporteInternoCentavos,0);
  assert.deepEqual(snap.filas.vendasRegistradas,[]);
  const reaberto=new MotorContaUnicaEnsaioSQLite({banco:db,sinalizacao});
  assert.equal(reaberto.consultar().filaB.length,2);
  assert.equal(reaberto.criarDouradaManualEnsaio({eventoId,aceiteEnsaio:true}).posicaoId,1);
  assert.equal(reaberto.criarDouradaManualEnsaio({
   eventoId:'dourada-ensaio-integrado-0003',aceiteEnsaio:true
  }).posicaoId,3);
  assert.equal(reaberto.consultar().douradasManuaisCriadas,3);
  // Auditoria global da conta/loja/motor reconhece as douradas sem pedido.
  const {auditarIntegridadeMotorCandidato}=require('../src/domain/auditoria-integridade-motor-candidato-sqlite');
  assert.equal(auditarIntegridadeMotorCandidato({banco:db,exigirMotor:true}).douradasManuaisAuditadas,3);
  assert.throws(()=>db.exec('DELETE FROM akitemm_motor_douradas_manuais_lab'),
   /dourada manual imutavel/);
  assert.throws(()=>db.exec(
   "UPDATE akitemm_motor_douradas_manuais_lab SET evento_id='dourada-alterada' WHERE numero_posicao=1"
  ),/dourada manual imutavel/);
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});

test('3 luzes roxas e 3 pretas permanecem no quadro mesmo com centro dourado, sem dinheiro real',()=>{
 const {db,motor,sinalizacao,conta,gravar}=preparar();
 try{
  for(let i=1;i<=7;i++)motor.criarDouradaManualEnsaio({
   eventoId:'dourada-luzes-integrado-'+String(i).padStart(4,'0'),
   aceiteEnsaio:true
  });
  const inicial=motor.prepararTabuleiro();
  assert.equal(inicial.ocupadas,7);
  assert.equal(motor.consultar().tabuleiro.centro.dourada,true);
  // Mesmo centro dourado, seis compras reais DO ENSAIO e distintas:
  // nenhuma luz nasce do botão sem pedido vinculado ao motor.
  for(let i=1;i<=6;i++){
   conta(i);gravar(i,i);
   motor.vincularPedido({prepedidoId:pedido(i),aceiteEnsaio:true});
   motor.registrarEvento({prepedidoId:pedido(i)});
   assert.equal(motor.consultarFluxoFinanceiro().girosFisicosConcluidos,0);
  }
  const agenda=motor.consultarAgenda();
  assert.equal(agenda.luzesAcesas,6);
  assert.equal(agenda.luzesRoxasAcesas,3);
  assert.equal(agenda.luzesPretasAcesas,3);
  const sim=motor._simulador();
  assert.deepEqual(sim.tabuleiro.vendasDoCiclo.map(v=>v.destinoCofre),
   Array(6).fill('LOOP_DOURADAS'));
  const livro=motor.consultarFluxoFinanceiro();
  assert.equal(livro.luzesFinanceirasRegistradas,6);
  assert.equal(livro.cofres.find(x=>x.cofre==='LOOP_DOURADAS').eventos,6);
  assert.equal(livro.cofres.find(x=>x.cofre==='LOOP_CENTRO').eventos,0);
  assert.equal(livro.transferenciasBancariasEfetuadas,0);
  assert.equal(motor.consultar().dinheiroReal,false);
  assert.equal(motor.consultar().saldoRealCentavos,null);
  assert.equal(motor.consultar().catraca.giros,0);
  const reiniciado=new MotorContaUnicaEnsaioSQLite({banco:db,sinalizacao});
  assert.equal(reiniciado.consultarAgenda().luzesRoxasAcesas,3);
  assert.equal(reiniciado.consultarAgenda().luzesPretasAcesas,3);
 }finally{db.close();}
});
