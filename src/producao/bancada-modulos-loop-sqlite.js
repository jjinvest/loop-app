'use strict';
// Bancada operacional persistente e ISOLADA: usa exatamente o motor de
// filas/tabuleiro do LOOP, mas apenas tabelas loop_teste_*.
// A porteira da fila e o andamento da catraca sao comandos separados.
// Nunca importar contas, pedidos, saldos ou posicoes de clientes.
const {SimuladorLoop}=require('../domain/simulador-loop');
const {agoraLocal,minutos}=require('../domain/agenda-catraca-loop');
const {createHash}=require('node:crypto');
const MODULOS=Object.freeze(['FILA','CATRACA']);
const OPERACAO=/^[a-zA-Z0-9:_-]{8,120}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function diaAnterior(d){return new Date(Date.parse(d+'T12:00:00Z')-86400000)
 .toISOString().slice(0,10);}
class BancadaModulosLoopSQLite{
 constructor({banco,consultarAgenda,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof consultarAgenda!=='function'||typeof agora!=='function')
   falha('BANCADA_CONFIGURACAO_INVALIDA');
  this.db=banco;this.consultarAgenda=consultarAgenda;this.agora=agora;
  this.db.exec([
   'CREATE TABLE IF NOT EXISTS loop_teste_modulos_estado(',
   "modulo TEXT PRIMARY KEY CHECK(modulo IN ('FILA','CATRACA')),",
   'snapshot TEXT NOT NULL,porteira_aberta INTEGER NOT NULL DEFAULT 0',
   'CHECK(porteira_aberta IN (0,1)),',
   'catraca_ativa INTEGER NOT NULL DEFAULT 0 CHECK(catraca_ativa IN (0,1)),',
   'geracao INTEGER NOT NULL DEFAULT 0 CHECK(geracao>=0),',
   'cursor_dia TEXT,cursor_luz INTEGER NOT NULL DEFAULT 0 CHECK(cursor_luz>=0),',
   'atualizado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_teste_modulos_operacoes(',
   'id TEXT PRIMARY KEY,modulo TEXT NOT NULL,',
   'payload_hash TEXT NOT NULL,resultado TEXT NOT NULL,',
   'registrado_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS loop_teste_modulos_operacoes_ordem',
   'ON loop_teste_modulos_operacoes(modulo,registrado_em);'
  ].join(' '));
  // Livro exclusivo do SQLite de testes. Nenhuma tabela de identidade/PSP.
  this.db.exec([
   'CREATE TABLE IF NOT EXISTS loop_teste_fluxo_lotes(geracao INTEGER PRIMARY KEY,preparado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_teste_fluxo_recebimentos(geracao INTEGER NOT NULL,numero INTEGER NOT NULL,',
   'pedido TEXT NOT NULL UNIQUE,valor INTEGER NOT NULL CHECK(valor=25000),recebido_em INTEGER NOT NULL,',
   "tipo TEXT NOT NULL CHECK(tipo IN ('DOURADA','AZUL','CONFIRMADA')),PRIMARY KEY(geracao,numero));",
   'CREATE TABLE IF NOT EXISTS loop_teste_fluxo_lancamentos(geracao INTEGER NOT NULL,referencia TEXT NOT NULL,',
   'destino TEXT NOT NULL,valor INTEGER NOT NULL CHECK(valor>0),posicao INTEGER NOT NULL,',
   'registrado_em INTEGER NOT NULL,PRIMARY KEY(geracao,referencia));',
   'CREATE TRIGGER IF NOT EXISTS loop_teste_fluxo_lanc_sem_update BEFORE UPDATE ON loop_teste_fluxo_lancamentos BEGIN SELECT RAISE(ABORT,\'lancamento imutavel\'); END;',
   'CREATE TRIGGER IF NOT EXISTS loop_teste_fluxo_lanc_sem_delete BEFORE DELETE ON loop_teste_fluxo_lancamentos BEGIN SELECT RAISE(ABORT,\'lancamento imutavel\'); END;'
  ].join(' '));
  for(const modulo of MODULOS)this.db.prepare([
   'INSERT OR IGNORE INTO loop_teste_modulos_estado',
   '(modulo,snapshot,atualizado_em) VALUES(?,?,?)'
  ].join(' ')).run(modulo,JSON.stringify(this._novo().exportarSnapshot()),this.agora());
 }
 _novo(){const sim=new SimuladorLoop({relogio:()=>new Date(this.agora()).toISOString()});
  sim.filas.travaPromocaoAtiva=true;return sim;}
 _linha(modulo){
  if(!MODULOS.includes(modulo))falha('BANCADA_MODULO_INVALIDO');
  const row=this.db.prepare(
   'SELECT * FROM loop_teste_modulos_estado WHERE modulo=?'
  ).get(modulo);
  if(!row)falha('BANCADA_ESTADO_INDISPONIVEL');
  return row;
 }
 _restaurar(row){
  const sim=SimuladorLoop.restaurarSnapshot(JSON.parse(row.snapshot),
   {relogio:()=>new Date(this.agora()).toISOString()});
  sim.filas.travaPromocaoAtiva=true;
  // A fronteira permanece FECHADA por padrao: nem mesmo o giro da
  // catraca pode retirar automaticamente uma posicao da fila.
  sim.tabuleiro.proximoDaFila=opcoes=>
   row.porteira_aberta===1?sim.filas.proximoDaFila(opcoes):null;
  return sim;
 }
 _transacao(modulo,idOperacao,payload,executar){
  if(!OPERACAO.test(idOperacao||''))
   falha('BANCADA_OPERACAO_INVALIDA');
  const hash=createHash('sha256').update(JSON.stringify({modulo,...payload}))
   .digest('hex');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.db.prepare(
    'SELECT modulo,payload_hash,resultado FROM loop_teste_modulos_operacoes WHERE id=?'
   ).get(idOperacao);
   if(anterior){
    if(anterior.modulo!==modulo||anterior.payload_hash!==hash)
     falha('BANCADA_REPLAY_DIVERGENTE');
    this.db.exec('COMMIT');
    return {...JSON.parse(anterior.resultado),repetida:true};
   }
   const row=this._linha(modulo),sim=this._restaurar(row);
   const resultado=executar({row,sim})||{};
   const ts=this.agora();
   if(!Number.isSafeInteger(ts)||ts<1)
    falha('BANCADA_HORARIO_INVALIDO');
   this.db.prepare([
    'UPDATE loop_teste_modulos_estado SET snapshot=?,porteira_aberta=?,',
    'catraca_ativa=?,geracao=?,cursor_dia=?,cursor_luz=?,atualizado_em=?',
    'WHERE modulo=?'
   ].join(' ')).run(JSON.stringify(sim.exportarSnapshot()),
    row.porteira_aberta,row.catraca_ativa,row.geracao,row.cursor_dia,
    row.cursor_luz,ts,modulo);
   this.db.prepare([
    'INSERT INTO loop_teste_modulos_operacoes',
    '(id,modulo,payload_hash,resultado,registrado_em) VALUES(?,?,?,?,?)'
   ].join(' ')).run(idOperacao,modulo,hash,JSON.stringify(resultado),ts);
   this.db.exec('COMMIT');
   return {...resultado,repetida:false};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 _fluxo(geracao){
  if(!this.db.prepare('SELECT 1 FROM loop_teste_fluxo_lotes WHERE geracao=?').get(geracao))return null;
  const receb=this.db.prepare('SELECT COUNT(*) AS quantidade,COALESCE(SUM(valor),0) AS total FROM loop_teste_fluxo_recebimentos WHERE geracao=?').get(geracao);
  const destinos={LOOP_CENTRO:0,LOOP_ESQUERDA:0,LOOP_DIREITA:0,LOOP_DOURADAS:0,BONUS:0};
  const linhas=this.db.prepare('SELECT destino,SUM(valor) AS total FROM loop_teste_fluxo_lancamentos WHERE geracao=? GROUP BY destino').all(geracao);
  for(const x of linhas){
   if(!Object.hasOwn(destinos,x.destino))falha('FLUXO_DESTINO_INVALIDO');
   destinos[x.destino]=x.total;
  }
  const distribuido=Object.values(destinos).reduce((n,v)=>n+v,0),saldo=receb.total-distribuido;
  if(!Number.isSafeInteger(saldo)||saldo<0)falha('FLUXO_CAIXA_DIVERGENTE');
  const eventos=this.db.prepare("SELECT COUNT(*) AS n FROM loop_teste_fluxo_lancamentos WHERE geracao=? AND destino!='BONUS'").get(geracao).n;
  const ultimos=this.db.prepare('SELECT referencia,destino,valor,posicao,registrado_em FROM loop_teste_fluxo_lancamentos WHERE geracao=? ORDER BY rowid DESC LIMIT 12').all(geracao);
  return {financeiroReal:false,origem:'RECEBIMENTOS_FICTICIOS_SQLITE',
   produtos:receb.quantidade,recebidoCentavos:receb.total,distribuidoCentavos:distribuido,
   saldoCentavos:saldo,destinos,eventos,ultimos,intervaloSegundos:10,
   comissoes:75,indicadores:10,valorEventoCentavos:25000};
 }
 _lancamento(geracao,referencia,destino,valor,posicao){
  this.db.prepare('INSERT INTO loop_teste_fluxo_lancamentos VALUES(?,?,?,?,?,?)')
   .run(geracao,referencia,destino,valor,posicao,this.agora());
 }
 _prepararFluxo(row,sim){
  if(row.catraca_ativa===1)falha('BANCADA_CATRACA_ATIVA');
  if(this._fluxo(row.geracao))return {preparado:true,jaPreparado:true};
  Object.assign(sim,this._novo());
  row.geracao++;row.porteira_aberta=0;row.catraca_ativa=0;
  row.cursor_dia=null;row.cursor_luz=0;
  sim.tabuleiro.proximoDaFila=()=>null;
  this.db.prepare('INSERT INTO loop_teste_fluxo_lotes VALUES(?,?)').run(row.geracao,this.agora());
  const azuis=new Set([2,8,12,18,22]),douradas=new Set([4,14,24,34,44,54,64,74,84,94]);
  const confirmadas=[];
  for(let i=1;i<=100;i++){
   const tipo=douradas.has(i)?'DOURADA':azuis.has(i)?'AZUL':'CONFIRMADA';
   const id='pdf-teste-'+row.geracao+'-'+i;
   const recebidoEm=this.agora()-30*86400000+Math.floor((i-1)*30*86400000/100);
   const p=sim.registrarPosicaoSimulada({nome:tipo==='DOURADA'?'LOOP':'P'+String(i).padStart(3,'0'),
    participanteId:tipo==='DOURADA'?'LOOP_EMPRESA':'participante-teste-'+i,
    vendaId:id,adesaoPendente:tipo==='AZUL'});
   const pos=sim.filas.filaB.find(x=>x.id===p.posicao.id);
   pos.entrouEm=new Date(recebidoEm).toISOString();
   if(tipo==='DOURADA')Object.assign(pos,{empresa:true,titularOperacional:'LOOP_EMPRESA',statusAdesao:'POSICAO_LOOP'});
   if(tipo==='CONFIRMADA')confirmadas.push(pos);
   this.db.prepare('INSERT INTO loop_teste_fluxo_recebimentos VALUES(?,?,?,?,?,?)')
    .run(row.geracao,pos.id,id,25000,recebidoEm,tipo);
  }
  // Dez indicadores dividem os outros 75 confirmados, cada convite unico.
  // A comissão é segregada do caixa bruto antes da distribuição.
  for(let i=10;i<confirmadas.length;i++){
   const indicador=confirmadas[(i-10)%10],indicado=confirmadas[i];
   const ref='indicacao-'+row.geracao+'-'+indicado.id;
   sim.registrarIndicacaoSimulada({indicadorId:indicador.participanteId,
    posicaoAlvoId:indicador.id,eventoId:ref,convidouEm:indicado.entrouEm});
   this._lancamento(row.geracao,ref,'BONUS',2500,indicador.id);
  }
  return {preparado:true,posicoes:100,douradas:10,azuis:5,confirmadas:85,
   filaA:sim.filas.filaA.length,filaB:sim.filas.filaB.length,financeiro:this._fluxo(row.geracao)};
 }
 _pulsoFluxo(row,sim){
  const f=this._fluxo(row.geracao);
  if(!f||f.saldoCentavos<25000||!sim.tabuleiro.centro){
   row.catraca_ativa=0;
   return {processado:false,motivo:'CAIXA_INSUFICIENTE_OU_SEM_CENTRO'};
  }
  const id='evento-fin-'+row.geracao+'-'+(f.eventos+1);
  const luz=sim.registrarVendaNoCicloSimulada({vendaId:id});
  this._lancamento(row.geracao,id,luz.venda.destinoCofre,25000,luz.venda.posicaoCentroId);
  let giro=null;
  if(luz.estado.vendasNoCiclo===6){
   sim.abrirCatraca();giro=sim.tentarGiro();sim.pausarCatraca();
   if(!giro.girou)falha('BANCADA_CATRACA_MOVIMENTO_NEGADO');
  }
  const depois=this._fluxo(row.geracao);
  if(depois.saldoCentavos<25000||!sim.tabuleiro.centro)row.catraca_ativa=0;
  return {processado:true,ordem:luz.venda.ordem,girou:giro?.girou===true,
   destino:luz.venda.destinoCofre,financeiro:depois};
 }
 _pulso(sim,id,porteiraAberta=false){
  if(!sim.tabuleiro.centro)falha('BANCADA_CATRACA_SEM_CENTRO');
  const luz=sim.registrarVendaNoCicloSimulada({vendaId:id});
  let giro=null;
  if(luz.estado.vendasNoCiclo===6){
   sim.abrirCatraca();
   giro=sim.tentarGiro();
   sim.pausarCatraca();
   if(giro.girou!==true)falha('BANCADA_CATRACA_MOVIMENTO_NEGADO');
  }
  return {luzExecutada:true,ordem:luz.venda.ordem,
   girou:giro?.girou===true,
   centroConcluido:giro?.centroConcluido?.nome||null,
   novaPosicao6:giro?.novaPosicao6?.nome||null,
   centrosConcluidos:sim.tabuleiro.ciclosConcluidos.length,
   semCentroAposGiro:giro?.girou===true&&!sim.tabuleiro.centro,
   eventosNoCiclo:sim.tabuleiro.vendasDoCiclo.length,
   porta:porteiraAberta?'ABERTA':'FECHADA'};
 }
 _progresso(agenda,ms){
  if(agenda?.modo!=='AUTOMATICA'||agenda.metaCentrosDia<1||
     !Number.isSafeInteger(agenda.metaCentrosDia)||
     agenda.metaCentrosDia>1000000)return null;
  const agora=agoraLocal(ms),inicio=minutos(agenda.janelaInicio),
   fim=minutos(agenda.janelaFim);
  const duracao=((fim-inicio+1440)%1440)||1440;
  let decorrido=agora.minuto-inicio;
  let dia=agora.dia;
  if(decorrido<0&&fim<=inicio){decorrido+=1440;dia=diaAnterior(dia);}
  if(decorrido<0||decorrido>duracao||
     (agenda.metaDataAlvo&&agenda.metaDataAlvo!==dia))return null;
  const total=agenda.metaCentrosDia*6;
  const luz=Math.min(total,Math.floor(
   (decorrido*60000+ms%60000)*total/(duracao*60000)));
  return {dia,luz,total};
 }
 consultar(){
  const result={fonte:'MOTOR_LOOP_ISOLADO_COM_SNAPSHOTS_SQLITE',
   testandoModulosSeparados:true};
  for(const modulo of MODULOS){
   const row=this._linha(modulo),sim=this._restaurar(row);
   const visualFila=(p,i)=>({
    id:p.id,numero:p.id,ordem:i+1,nome:p.nome,titular:p.participanteId,
    nickVisual:p.nome,empresa:p.empresa===true,dourada:p.empresa===true,
    pendente:p.statusAdesao==='PENDENTE',indicacoesVinculadas:p.indicacoesVinculadas||0
   });
   result[modulo.toLowerCase()]={
    ...(modulo==='CATRACA'?{financeiro:this._fluxo(row.geracao)}:{}),
    porteiraAberta:row.porteira_aberta===1,
    catracaAtiva:row.catraca_ativa===1,
    filaA:sim.filas.filaA.map(visualFila),
    filaB:sim.filas.filaB.map(visualFila),
    tabuleiro:{centro:sim.tabuleiro.centro?.nome||null,
     centroPosicao:sim.tabuleiro.centro?{
      numero:sim.tabuleiro.centro.id,
      nickVisual:/^[A-Za-z]{1,12}$/.test(sim.tabuleiro.centro.nome)?
       sim.tabuleiro.centro.nome:null,
      nome:sim.tabuleiro.centro.nome,dourada:sim.tabuleiro.centro.empresa===true}:null,
     vagas:sim.tabuleiro.vagas.map(p=>p?.nome||null),
     vagasPosicoes:sim.tabuleiro.vagas.map(p=>p?{
      numero:p.id,nickVisual:/^[A-Za-z]{1,12}$/.test(p.nome)?p.nome:null,
      nome:p.nome,dourada:p.empresa===true}:null),
     eventosNoCiclo:sim.tabuleiro.vendasDoCiclo.length,
     centrosConcluidos:sim.tabuleiro.ciclosConcluidos.length,
     giros:sim.giros},
    cursorDia:row.cursor_dia,cursorLuz:row.cursor_luz,
    historico:this.db.prepare([
     'SELECT id,resultado,registrado_em FROM loop_teste_modulos_operacoes',
     'WHERE modulo=? ORDER BY registrado_em DESC,rowid DESC LIMIT 12'
    ].join(' ')).all(modulo).map(x=>({
     id:x.id,...JSON.parse(x.resultado),em:x.registrado_em
    }))
   };
  }
  const agenda=this.consultarAgenda();
  result.catraca.relogio={
   modo:agenda.modo,janelaInicio:agenda.janelaInicio,
   janelaFim:agenda.janelaFim,metaCentrosDia:agenda.metaCentrosDia
  };
  return result;
 }
 comandar({idOperacao,acao,nome,posicaoId}={}){
  const fila=acao?.startsWith('FILA_'),catraca=acao?.startsWith('CATRACA_');
  if(!fila&&!catraca)falha('BANCADA_ACAO_INVALIDA');
  const modulo=fila?'FILA':'CATRACA';
  const agenda=catraca?this.consultarAgenda():null;
  return this._transacao(modulo,idOperacao,{acao,nome,posicaoId},({row,sim})=>{
   if(acao==='CATRACA_PREPARAR_100')return this._prepararFluxo(row,sim);
   const fluxo=modulo==='CATRACA'?this._fluxo(row.geracao):null;
   if(fluxo){
    if(acao==='CATRACA_INICIAR'){
     if(fluxo.saldoCentavos<25000)falha('FLUXO_CAIXA_INSUFICIENTE');
     row.porteira_aberta=1;
     sim.tabuleiro.proximoDaFila=opcoes=>sim.filas.proximoDaFila(opcoes);
     if(!sim.tabuleiro.centro)sim.prepararTabuleiro();
     if(!sim.tabuleiro.centro)falha('BANCADA_CATRACA_SEM_CENTRO');
     row.catraca_ativa=1;row.cursor_luz=0;
     row.cursor_dia=String(this.agora());
     return {acao,catracaAtiva:true,porteiraAberta:true,financeiro:fluxo};
    }
    if(acao==='CATRACA_PAUSAR'){row.catraca_ativa=0;return {acao,catracaAtiva:false};}
    if(acao!=='CATRACA_REINICIAR'||row.catraca_ativa===1)falha('FLUXO_COMANDO_NAO_PERMITIDO');
   }
   if(acao==='FILA_DEMONSTRAR_TAISA'){
    // Somente na bancada isolada, sem sobrescrever ou reciclar posições.
    if(sim.filas.sequencia!==0||sim.tabuleiro.centro||sim.tabuleiro.vagas.some(Boolean))
     falha('BANCADA_FILA_JA_UTILIZADA');
    const r=sim.registrarPosicaoSimulada({nome:'Taísa',participanteId:'ensaio-taisa',
     vendaId:'bancada-'+idOperacao});
    return {acao,posicaoId:r.posicao.id,nome:r.posicao.nome,
     entrouNaFila:'B',porteiraAberta:row.porteira_aberta===1};
   }
   if(acao==='FILA_ENTRAR'||acao==='CATRACA_ENTRAR'){
    if(typeof nome!=='string'||nome.trim().length<2||nome.length>70)
     falha('BANCADA_NOME_INVALIDO');
    const chave=nome.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
     .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if(!chave||chave.length>70)falha('BANCADA_NOME_INVALIDO');
    const titular='ensaio-'+chave;
    const ativas=[...sim.filas.filaA,...sim.filas.filaB,
     sim.tabuleiro.centro,...sim.tabuleiro.vagas]
     .filter(p=>p?.participanteId===titular).length;
    if(ativas>=10)falha('LOOP_MAXIMO_DEZ_POSICOES');
    const r=sim.registrarPosicaoSimulada({nome:nome.trim(),
     participanteId:titular,vendaId:'bancada-'+idOperacao});
    return {acao,posicaoId:r.posicao.id,nome:r.posicao.nome,
     entrouNaFila:'B',porteiraAberta:row.porteira_aberta===1};
   }
   if(acao==='FILA_PROMOVER'||acao==='CATRACA_PROMOVER'){
    if(!Number.isSafeInteger(posicaoId)||posicaoId<1)
     falha('BANCADA_POSICAO_INVALIDA');
    const alvo=[...sim.filas.filaA,...sim.filas.filaB]
     .find(p=>p.id===posicaoId);
    if(!alvo)falha('BANCADA_POSICAO_NAO_ESTA_NA_FILA');
    const r=sim.registrarIndicacaoSimulada({
     indicadorId:alvo.participanteId,
     posicaoAlvoId:posicaoId,eventoId:'indicacao-'+idOperacao});
    return {acao,posicaoId,promovidas:r.promovidas.map(p=>p.id)};
   }
   if(acao==='FILA_ABRIR_PORTEIRA'||acao==='CATRACA_ABRIR_PORTEIRA'){
    row.porteira_aberta=1;
    return {acao,porteiraAberta:true};
   }
   if(acao==='FILA_FECHAR_PORTEIRA'||acao==='CATRACA_FECHAR_PORTEIRA'){
    row.porteira_aberta=0;
    return {acao,porteiraAberta:false};
   }
   if(acao==='FILA_PREENCHER_TABULEIRO'){
    if(row.porteira_aberta!==1)
     falha('BANCADA_PORTEIRA_FECHADA');
    const estado=sim.prepararTabuleiro();
    return {acao,centro:estado.centro?.nome||null,
     vagas:estado.vagas.map(p=>p?.nome||null),giros:0};
   }
   if(acao==='FILA_REINICIAR'||acao==='CATRACA_REINICIAR'){
    const novo=this._novo();
    Object.assign(sim,novo);
    // O fechamento e incondicional, inclusive em replays.
    row.porteira_aberta=0;row.catraca_ativa=0;
    row.cursor_dia=null;row.cursor_luz=0;row.geracao++;
    sim.tabuleiro.proximoDaFila=()=>null;
    return {acao,reiniciada:true,semAlterarOutrosModulos:true};
   }
   if(acao==='CATRACA_CARREGAR'){
    if(sim.tabuleiro.centro||sim.filas.sequencia>0)
     falha('BANCADA_CATRACA_JA_CARREGADA');
    // Sete posicoes de ensaio atravessam a entrada apenas na montagem
    // expressamente solicitada; depois a porteira fica FECHADA.
    sim.tabuleiro.proximoDaFila=()=>sim.filas.proximoDaFila();
    for(let i=1;i<=7;i++)sim.registrarPosicaoSimulada({
     nome:'Posição de teste '+String(i).padStart(2,'0'),
     participanteId:'titular-teste-'+i,
     vendaId:'posicao-inicial-'+i
    });
    const t=sim.prepararTabuleiro();
    row.porteira_aberta=0;sim.tabuleiro.proximoDaFila=()=>null;
    return {acao,tabuleiroCarregado:true,centro:t.centro.nome,
     vagas:t.vagas.map(p=>p.nome),porteiraAberta:false};
   }
   if(acao==='CATRACA_INICIAR'){
    if(!sim.tabuleiro.centro)falha('BANCADA_CATRACA_SEM_CENTRO');
    if(agenda?.modo==='PAUSADA')falha('BANCADA_RELOGIO_PAUSADO');
    row.catraca_ativa=1;row.porteira_aberta=0;
    const prog=this._progresso(agenda,this.agora());
    row.cursor_dia=prog?.dia||null;
    row.cursor_luz=prog?.luz||0;
    return {acao,catracaAtiva:true,porteiraAberta:false,
     janelaInicial:row.cursor_luz};
   }
   if(acao==='CATRACA_PAUSAR'){
    row.catraca_ativa=0;
    return {acao,catracaAtiva:false};
   }
   if(acao==='CATRACA_PULSO'){
    if(!row.catraca_ativa||agenda?.modo!=='MANUAL')
     falha('BANCADA_CATRACA_MANUAL_NAO_AUTORIZADA');
    const pulso=this._pulso(sim,'pulso-'+idOperacao,row.porteira_aberta===1);
    if(pulso.semCentroAposGiro)row.catraca_ativa=0;
    return {acao,...pulso};
   }
   falha('BANCADA_ACAO_INVALIDA');
  });
 }
 processarRelogio(){
  const row=this._linha('CATRACA');
  if(row.catraca_ativa!==1)return {processado:false,motivo:'CATRACA_PARADA'};
  const agenda=this.consultarAgenda(),agora=this.agora();
  const fluxo=this._fluxo(row.geracao);
  if(fluxo){
   if(agora-Number(row.cursor_dia)<10000)return {processado:false,motivo:'AGUARDANDO_INTERVALO'};
   return this._transacao('CATRACA','fluxo:'+row.geracao+':'+(fluxo.eventos+1),
    {acao:'CATRACA_EVENTO_FINANCEIRO',evento:fluxo.eventos+1},({row:atual,sim})=>{
     if(atual.catraca_ativa!==1||agora-Number(atual.cursor_dia)<10000)
      falha('FLUXO_MARCO_NAO_AUTORIZADO');
     atual.cursor_dia=String(agora);
     return this._pulsoFluxo(atual,sim);
    });
  }
  const p=this._progresso(agenda,agora);
  if(!p)return {processado:false,motivo:'RELOGIO_SEM_JANELA'};
  if(row.cursor_dia===p.dia&&p.luz<=row.cursor_luz)
   return {processado:false,motivo:'AGUARDANDO_INTERVALO'};
  if(p.luz<1)return {processado:false,motivo:'AGUARDANDO_PRIMEIRA_LUZ'};
  return this._transacao('CATRACA','turno:'+row.geracao+':'+p.dia+':'+p.luz,
   {acao:'CATRACA_EVENTO_RELOGIO',dia:p.dia,luz:p.luz},({row:atual,sim})=>{
    if(atual.catraca_ativa!==1)
     return {processado:false,motivo:'CATRACA_PARADA'};
    if(atual.cursor_dia===p.dia&&p.luz<=atual.cursor_luz)
     return {processado:false,motivo:'AGUARDANDO_INTERVALO'};
    // Sem rajada de compensacao: um pulso de motor por vencimento
    // observado, inclusive depois de reiniciar o servidor.
    atual.cursor_dia=p.dia;atual.cursor_luz=p.luz;
    const movimento=this._pulso(sim,'turno-'+p.dia+'-'+p.luz,atual.porteira_aberta===1);
    if(movimento.semCentroAposGiro)atual.catraca_ativa=0;
    return {processado:true,acao:'CATRACA_EVENTO_RELOGIO',
     marco:p.luz,...movimento};
   });
 }
}
module.exports={BancadaModulosLoopSQLite};
