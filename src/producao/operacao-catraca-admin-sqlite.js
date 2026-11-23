'use strict';
// Comandos duraveis do operador para a catraca do MESMO motor SQLite.
// Sem liberar creditos ou pagamentos; o motor de ensaio e vedado em producao.
const {calcularIntervaloMeta,proximaJanelaMetaRelogio}=
 require('../domain/meta-lotes-catraca-loop');
const {ControleCaixaCatracaLoopSQLite}=require('./controle-caixa-catraca-loop-sqlite');
const TABELAS_CATRACA_ADMIN=Object.freeze([
 'loop_real_catraca_admin_meta',
 'loop_real_catraca_admin_politica',
 'loop_real_catraca_admin_giros',
 'loop_real_catraca_admin_historico'
]);
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
const FUSO='America/Sao_Paulo';
function horaOk(h){return typeof h==='string'&&/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(h);}
function dataOk(d){
 if(d===null)return true;
 if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;
 const time=Date.parse(d+'T12:00:00Z');
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===d;
}
function horarioLocal(agora){
 const data=agora();
 if(!(data instanceof Date)||Number.isNaN(data.valueOf()))falha('CATRACA_RELOGIO_INVALIDO');
 const partes=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:FUSO,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(data).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return {dia:partes.year+'-'+partes.month+'-'+partes.day,
  hora:partes.hour+':'+partes.minute,ts:data.getTime()};
}
function dentroJanela(hora,inicio,fim){
 if(inicio===fim)return true; // mesma hora = dia inteiro, sem janela artificial
 return inicio<fim?hora>=inicio&&hora<=fim:hora>=inicio||hora<=fim;
}
// Relatorio do RELOGIO VISUAL nas ultimas 24h, nunca livro financeiro.
// Reconstrucao por revisoes persistidas da politica: pausar ou mudar a
// programacao nao reconta retroativamente as luzes anteriores.
const formatoLocalSegundos=new Intl.DateTimeFormat('en-US',{
 timeZone:FUSO,year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
});
function instanteLocalPseudoutc(ts){
 const p=Object.fromEntries(formatoLocalSegundos.formatToParts(
  new Date(ts)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),
  Number(p.hour),Number(p.minute),Number(p.second),ts%1000);
}
function contarRelogioNaJanela(politica,deMs,ateMs){
 if(!politica||politica.modo!=='AUTOMATICA'||
    !horaOk(politica.janelaInicio)||!horaOk(politica.janelaFim)||
    !Number.isSafeInteger(politica.metaCentrosDia)||
    politica.metaCentrosDia<1||politica.metaCentrosDia>1000000||
    ateMs<=deMs)return {luzes:0,ciclos:0};
 const comeco=instanteLocalPseudoutc(deMs);
 const fim=instanteLocalPseudoutc(ateMs);
 if(fim<=comeco)return {luzes:0,ciclos:0};
 const abertura=Number(politica.janelaInicio.slice(0,2))*60+
  Number(politica.janelaInicio.slice(3));
 const fechamento=Number(politica.janelaFim.slice(0,2))*60+
  Number(politica.janelaFim.slice(3));
 const duracaoMin=((fechamento-abertura+1440)%1440)||1440;
 const duracaoMs=duracaoMin*60000,total=politica.metaCentrosDia*6;
 const diaBase=Math.floor(comeco/86400000)*86400000;
 const ateIndice=(tempo,inicio)=>Math.max(0,Math.min(total,
  Math.floor(Math.max(0,Math.min(duracaoMs,tempo-inicio))*total/duracaoMs)));
 let luzes=0,ciclos=0;
 // Um turno pode cruzar meia-noite; a janela de 24h abrange no maximo
 // tres datas locais de inicio de turno.
 // Abrange também períodos longos sem reprogramação: totais históricos
 // não podem perder dias inteiros por uma janela limitada a 72 horas.
 const primeiroDia=Math.floor(comeco/86400000)-1;
 const ultimoDia=Math.floor(fim/86400000)+1;
 for(let diaIndice=primeiroDia;diaIndice<=ultimoDia;diaIndice++){
  const deslocamento=diaIndice-Math.floor(comeco/86400000);
  const diaMs=diaBase+deslocamento*86400000;
  const dia=new Date(diaMs).toISOString().slice(0,10);
  if(politica.metaDataAlvo!==null&&politica.metaDataAlvo!==undefined&&
     politica.metaDataAlvo!==dia)continue;
  const inicio=diaMs+abertura*60000;
  const de=ateIndice(comeco,inicio),ate=ateIndice(fim,inicio);
  if(ate<de)falha('CATRACA_RELOGIO_HISTORICO_INCONSISTENTE');
  luzes+=ate-de;
  ciclos+=Math.floor(ate/6)-Math.floor(de/6);
 }
 return {luzes,ciclos};
}
class OperacaoCatracaAdminSQLite{
 constructor({banco,motor,agora=()=>new Date(),controleCaixa=null}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     motor?.banco!==banco||typeof motor._transacao!=='function'||
     typeof agora!=='function')falha('CATRACA_ADMIN_MOTOR_NAO_COMPARTILHADO');
  if(controleCaixa!==null&&(
     controleCaixa.banco!==banco||
     typeof controleCaixa.consultar!=='function'))
   falha('CATRACA_CAIXA_NAO_COMPARTILHA_BANCO');
  this.db=banco;this.motor=motor;this.agora=agora;
  // O livro de reservas fica no MESMO SQLite. Sem prova externa
  // ele só permite LEITURA e permanece vazio e bloqueado.
  this.controleCaixa=controleCaixa||new ControleCaixaCatracaLoopSQLite({
   banco,provas:null,agora:()=>this.agora().getTime()
  });
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_catraca_admin_politica(',
   'id INTEGER PRIMARY KEY CHECK(id=1),',
   'revisao INTEGER NOT NULL CHECK(revisao>0),',
   "modo TEXT NOT NULL CHECK(modo IN ('PAUSADA','MANUAL','AUTOMATICA')),",
   'inicio TEXT NOT NULL,fim TEXT NOT NULL,limite_diario INTEGER,',
   'atualizado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_real_catraca_admin_meta(',
   'id INTEGER PRIMARY KEY CHECK(id=1),',
   'centros_dia INTEGER NOT NULL CHECK(centros_dia BETWEEN 0 AND 1000000),',
   'data_alvo TEXT,atualizado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_real_catraca_admin_giros(',
   'giro INTEGER PRIMARY KEY CHECK(giro>0),',
   'chave_evento TEXT NOT NULL UNIQUE REFERENCES loop_real_motor_eventos(chave),',
   'dia TEXT NOT NULL,origem TEXT NOT NULL,',
   'revisao_politica INTEGER NOT NULL,executado_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS loop_real_catraca_admin_giros_dia',
   'ON loop_real_catraca_admin_giros(dia);',
   'CREATE TABLE IF NOT EXISTS loop_real_catraca_admin_historico(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'acao TEXT NOT NULL,detalhes TEXT NOT NULL,executado_em INTEGER NOT NULL);'
  ].join(' '));
  banco.prepare([
   'INSERT OR IGNORE INTO loop_real_catraca_admin_meta',
   '(id,centros_dia,data_alvo,atualizado_em)',
   'VALUES(1,0,NULL,1)'
  ].join(' ')).run();
  banco.prepare([
   'INSERT OR IGNORE INTO loop_real_catraca_admin_politica',
   "(id,revisao,modo,inicio,fim,limite_diario,atualizado_em)",
   "VALUES(1,1,'PAUSADA','09:00','18:00',NULL,1)"
  ].join(' ')).run();
  // Autorização pontual: zera SOMENTE placares de ensaio, preservando
  // perfis, as cinco posições da fila B, motor, giros e livros financeiros.
  // Marco persistente e idempotente, aplicado uma única vez em produção.
  if(process.env.NODE_ENV==='production'&&
     process.env.LOOP_ZERAR_PLACARES_TESTE_20261123==='SIM')
   this.zerarPlacaresDeTesteUmaVez();
 }
 zerarPlacaresDeTesteUmaVez(){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const feito=this.db.prepare([
    'SELECT id FROM loop_real_catraca_admin_historico',
    "WHERE acao='ZERAR_PLACARES_TESTE_20261123' LIMIT 1"
   ].join(' ')).get();
   if(feito){this.db.exec('COMMIT');return false;}
   this._log('ZERAR_PLACARES_TESTE_20261123',{
    escopo:'CONTADORES_VISUAIS_RELOGIO',
    preserva:'CADASTROS_POSICOES_FILAS_MOTOR_FINANCEIRO'
   },horarioLocal(this.agora).ts);
   this.db.exec('COMMIT');return true;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 _marcoZeramentoPlacar(agoraMs){
  const registro=this.db.prepare([
   'SELECT executado_em AS em FROM loop_real_catraca_admin_historico',
   "WHERE acao='ZERAR_PLACARES_TESTE_20261123' AND executado_em<=?",
   'ORDER BY executado_em DESC,id DESC LIMIT 1'
  ].join(' ')).get(agoraMs);
  return registro?registro.em:null;
 }
 _ensaio(){
  if(process.env.NODE_ENV==='production')falha('CATRACA_MOTOR_PRODUTIVO_NAO_HOMOLOGADO');
 }
 _politica(){
  const p=this.db.prepare(
   'SELECT revisao,modo,inicio,fim,limite_diario FROM loop_real_catraca_admin_politica WHERE id=1'
  ).get();
  if(!p||!horaOk(p.inicio)||!horaOk(p.fim)||
     !['PAUSADA','MANUAL','AUTOMATICA'].includes(p.modo)||
     !Number.isSafeInteger(p.revisao)||p.revisao<1||
     !(p.limite_diario===null||
      (Number.isSafeInteger(p.limite_diario)&&p.limite_diario>=1)))
   falha('CATRACA_ADMIN_POLITICA_CORROMPIDA');
  return p;
 }
 _meta(){
  const m=this.db.prepare(
   'SELECT centros_dia AS centrosDia,data_alvo AS dataAlvo FROM loop_real_catraca_admin_meta WHERE id=1'
  ).get();
  if(!m||!Number.isSafeInteger(m.centrosDia)||m.centrosDia<0||
     m.centrosDia>1000000||!dataOk(m.dataAlvo))
   falha('CATRACA_ADMIN_META_CORROMPIDA');
  return m;
 }
 _girosDia(dia){return this.db.prepare(
  'SELECT COUNT(*) AS n FROM loop_real_catraca_admin_giros WHERE dia=?'
 ).get(dia).n;}
 _girosHora(agoraMs,horaLocal){
  if(!Number.isSafeInteger(agoraMs)||agoraMs<86400000||
     !horaOk(horaLocal))falha('CATRACA_RELOGIO_INVALIDO');
  // A hora civil é a de São Paulo do mesmo relógio autenticado.
  const dentroHora=Number(horaLocal.slice(3))*60000+
   new Date(agoraMs).getUTCSeconds()*1000+(agoraMs%1000);
  return this.db.prepare([
   'SELECT COUNT(*) AS n FROM loop_real_catraca_admin_giros',
   'WHERE executado_em>=? AND executado_em<=?'
  ].join(' ')).get(agoraMs-dentroHora,agoraMs).n;
 }
 _giros24h(agoraMs){
  if(!Number.isSafeInteger(agoraMs)||agoraMs<86400000)
   falha('CATRACA_RELOGIO_INVALIDO');
  // 24 horas móveis são diferentes de "hoje" no fuso do turno.
  return this.db.prepare([
   'SELECT COUNT(*) AS n FROM loop_real_catraca_admin_giros',
   'WHERE executado_em>? AND executado_em<=?'
  ].join(' ')).get(agoraMs-86400000,agoraMs).n;
 }
 _relatorioRelogio24h(agoraMs){
  const desde=Math.max(agoraMs-86400000,
   this._marcoZeramentoPlacar(agoraMs)??0);
  const antigo=this.db.prepare([
   'SELECT detalhes FROM loop_real_catraca_admin_historico',
   "WHERE acao='CONFIGURAR' AND executado_em<=?",
   'ORDER BY executado_em DESC,id DESC LIMIT 1'
  ].join(' ')).get(desde);
  const mudancas=this.db.prepare([
   'SELECT detalhes,executado_em AS em FROM loop_real_catraca_admin_historico',
   "WHERE acao='CONFIGURAR' AND executado_em>? AND executado_em<=?",
   'ORDER BY executado_em,id'
  ].join(' ')).all(desde,agoraMs);
  let atual=antigo?JSON.parse(antigo.detalhes):null;
  let inicio=desde,luzes=0,ciclos=0;
  for(const mudanca of [...mudancas,{em:agoraMs,detalhes:null}]){
   const parcial=contarRelogioNaJanela(atual,inicio,mudanca.em);
   luzes+=parcial.luzes;ciclos+=parcial.ciclos;
   inicio=mudanca.em;
   if(mudanca.detalhes!==null)atual=JSON.parse(mudanca.detalhes);
  }
  // Um ciclo visual necessita de seis luzes efetivamente contabilizadas
  // nessa janela, inclusive com pausas e mudanças de programação.
  return {luzesRelogio24h:luzes,ciclosRelogio24h:Math.floor(luzes/6)};
 }
 // Totais VISUAIS persistidos na história de configurações. Sem movimentar
 // livros financeiros, sem presumir pagamento, mesmo em dias sem acessos.
 _relatorioRelogioAcumulado(agoraMs,hoje){
  const configuracoes=this.db.prepare([
   'SELECT detalhes,executado_em AS em FROM loop_real_catraca_admin_historico',
   "WHERE acao='CONFIGURAR' AND executado_em<=?",
   'ORDER BY executado_em,id'
  ].join(' ')).all(agoraMs);
  const diaLocal=Date.parse(hoje+'T00:00:00Z');
  const deslocamento=instanteLocalPseudoutc(agoraMs)-agoraMs;
  const inicioDia=diaLocal-deslocamento;
  const corte=this._marcoZeramentoPlacar(agoraMs)??0;
  let politica=null,inicio=null,luzes=0,luzesHoje=0;
  for(const evento of [...configuracoes,{em:agoraMs,detalhes:null}]){
   const inicioValido=inicio===null?null:Math.max(inicio,corte);
   if(inicioValido!==null&&evento.em>inicioValido){
    luzes+=contarRelogioNaJanela(politica,inicioValido,evento.em).luzes;
    if(evento.em>inicioDia)
     luzesHoje+=contarRelogioNaJanela(politica,
      Math.max(inicioValido,inicioDia),evento.em).luzes;
   }
   inicio=evento.em;
   if(evento.detalhes!==null)politica=JSON.parse(evento.detalhes);
  }
  if(!Number.isSafeInteger(luzes)||!Number.isSafeInteger(luzesHoje))
   falha('CATRACA_RELOGIO_CONTAGEM_EXCEDIDA');
  return {luzesRelogioHoje:luzesHoje,
   ciclosRelogioHoje:Math.floor(luzesHoje/6),
   luzesRelogioAcumuladas:luzes,
   ciclosRelogioAcumulados:Math.floor(luzes/6)};
 }
 _log(acao,detalhes,ts){
  this.db.prepare([
   'INSERT INTO loop_real_catraca_admin_historico(acao,detalhes,executado_em)',
   'VALUES(?,?,?)'
  ].join(' ')).run(acao,JSON.stringify(detalhes),ts);
 }
 consultar(){
  const p=this._politica(),tempo=horarioLocal(this.agora);
  const meta=this._meta();
  const metaAplicavel=meta.dataAlvo===null||meta.dataAlvo===tempo.dia;
  const calculo=calcularIntervaloMeta({
   abertura:p.inicio,fechamento:p.fim,
   quantidade:metaAplicavel?meta.centrosDia:0
  });
  const girosDia=this._girosDia(tempo.dia);
  const caixa=this.controleCaixa.consultar({dia:tempo.dia});
  const caixaMetaCompatível=caixa.programada===true&&
   caixa.estado==='AUTORIZADA'&&metaAplicavel&&meta.centrosDia>0&&
   caixa.metaCentros===meta.centrosDia&&caixa.abertura===p.inicio&&
   caixa.fechamento===p.fim;
  const motor=this.motor.consultar();
  const dentro=dentroJanela(tempo.hora,p.inicio,p.fim);
  const dentroDaMeta=metaAplicavel&&meta.centrosDia>0&&
   girosDia<meta.centrosDia;
  const permitido=(p.limite_diario===null||girosDia<p.limite_diario)&&
   (p.modo!=='AUTOMATICA'||dentroDaMeta);
  // O relogio e apenas uma previsao autenticada, independente de novas
  // vendas, sem autorizar um unico giro ate a prova bancaria real.
  const proximaLuzPrevistaEmMs=p.modo==='AUTOMATICA'&&
   dentro&&permitido&&dentroDaMeta?
    proximaJanelaMetaRelogio({abertura:p.inicio,fechamento:p.fim,
     quantidade:meta.centrosDia,agoraMs:tempo.ts,horarioLocal:tempo.hora}):null;
  return {modo:p.modo,janelaInicio:p.inicio,janelaFim:p.fim,
   agoraServidorMs:tempo.ts,proximaLuzPrevistaEmMs,
   metaCentrosDia:meta.centrosDia,metaDataAlvo:meta.dataAlvo,
   metaAplicavelHoje:metaAplicavel,
   luzesPlanejadas:Number(calculo.luzesPlanejadas),
   intervaloLuzSegundos:calculo.intervaloLuzSegundos,
   duracaoTurnoMinutos:calculo.duracaoMinutos,
   intervaloLuzMinutos:calculo.intervaloLuzSegundos===null?null:
    calculo.intervaloLuzSegundos/60,
   programacaoIndependenteDeVendasNovas:true,
   // O horario controla o ritmo; liberacao financeira continua
   // bloqueada ate prova PSP/banco real, sem usar saldos de ensaio.
   caixaConciliadoParaMeta:caixaMetaCompatível,
   caixaReservadoCentavos:caixaMetaCompatível?caixa.reservaTotalCentavos:null,
   luzesAutorizadasPorCaixa:caixaMetaCompatível?caixa.luzesAutorizadas:0,
   caixaEProgramacaoConferidos:caixaMetaCompatível,
   autorizacaoFinanceiraDosGiros:false,
   bloqueioFinanceiro:caixaMetaCompatível?
    'MOTOR_REAL_AINDA_NAO_CONSOME_RESERVA_PROVISIONADA':
    'CAIXA_REAL_NAO_PROVISIONADO_E_HOMOLOGADO',
   limiteDiario:p.limite_diario,revisao:p.revisao,
   girosHoje:girosDia,girosHora:this._girosHora(tempo.ts,tempo.hora),
   giros24h:this._giros24h(tempo.ts),
   ...this._relatorioRelogio24h(tempo.ts),
   ...this._relatorioRelogioAcumulado(tempo.ts,tempo.dia),
   marcoZeramentoVisualMs:this._marcoZeramentoPlacar(tempo.ts),
   hoje:tempo.dia,horaLocal:tempo.hora,
   fuso:FUSO,horarioPermitido:dentro,
   limiteNaoAtingido:permitido,
   metaNaoAtingida:metaAplicavel&&meta.centrosDia>girosDia,
   eventosNoCiclo:motor.tabuleiro.eventosNoCiclo,
   ciclosConcluidos:motor.tabuleiro.ciclosConcluidos,
   girosTotais:motor.catraca.giros,
   filaA:motor.filaA,filaB:motor.filaB,
   pausada:p.modo==='PAUSADA',
   podeGirar:process.env.NODE_ENV!=='production'&&
    p.modo!=='PAUSADA'&&dentro&&permitido&&
    motor.tabuleiro.eventosNoCiclo===6,
   politicaOperacionalConfiguravel:true,
   habilitadoSomenteEnsaio:process.env.NODE_ENV!=='production',
   financeiroReal:false};
 }
 configurar({modo,janelaInicio,janelaFim,limiteDiario,revisaoEsperada,
  metaCentrosDia=undefined,metaDataAlvo=undefined,
  motivo='AJUSTE_OPERACIONAL'}={}){
  if(!['PAUSADA','MANUAL','AUTOMATICA'].includes(modo)||
     !horaOk(janelaInicio)||!horaOk(janelaFim)||
     !(limiteDiario===null||
      (Number.isSafeInteger(limiteDiario)&&limiteDiario>=1&&limiteDiario<=1000000))||
     !Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<1||
     typeof motivo!=='string'||motivo.trim().length<3||
     motivo.length>200||
     (metaCentrosDia!==undefined&&(!Number.isSafeInteger(metaCentrosDia)||
       metaCentrosDia<0||metaCentrosDia>1000000))||
     (metaDataAlvo!==undefined&&!dataOk(metaDataAlvo)))
    falha('CATRACA_ADMIN_CONFIGURACAO_INVALIDA');
  const executar=sim=>{
   const p=this._politica(),anterior=this._meta();
   if(p.revisao!==revisaoEsperada)falha('CATRACA_ADMIN_REVISAO_DESATUALIZADA');
   const t=horarioLocal(this.agora);
   const novaMeta=metaCentrosDia===undefined?anterior.centrosDia:metaCentrosDia;
   const novaData=metaDataAlvo===undefined?anterior.dataAlvo:metaDataAlvo;
   this.db.prepare([
    'UPDATE loop_real_catraca_admin_politica SET revisao=revisao+1,',
    'modo=?,inicio=?,fim=?,limite_diario=?,atualizado_em=? WHERE id=1'
   ].join(' ')).run(modo,janelaInicio,janelaFim,limiteDiario,t.ts);
   this.db.prepare([
    'UPDATE loop_real_catraca_admin_meta',
    'SET centros_dia=?,data_alvo=?,atualizado_em=? WHERE id=1'
   ].join(' ')).run(novaMeta,novaData,t.ts);
   if(sim){
    if(modo==='PAUSADA')sim.pausarCatraca();
    else sim.abrirCatraca();
   }
   this._log('CONFIGURAR',{modo,janelaInicio,janelaFim,
    limiteDiario,metaCentrosDia:novaMeta,metaDataAlvo:novaData,
    luzesPlanejadas:novaMeta*6,
    revisaoAnterior:p.revisao,motivo:motivo.trim(),
    giroProdutivoHabilitado:false},t.ts);
   return {alterado:true};
  };
  let result;
  if(process.env.NODE_ENV==='production'){
   // Horarios e quotas sao configuraveis no servidor real, mesmo quando
   // o giro financeiro permanece fechado por falta de homologacao.
   this.db.exec('BEGIN IMMEDIATE');
   try{result=executar(null);this.db.exec('COMMIT');}
   catch(e){this.db.exec('ROLLBACK');throw e;}
  }else result=this.motor._transacao(executar);
  return {...result,...this.consultar()};
 }
 executarGiro({origem='OPERADOR'}={}){
  this._ensaio();
  if(!['OPERADOR','AGENDA'].includes(origem))
   falha('CATRACA_ADMIN_ORIGEM_INVALIDA');
  return this.motor._transacao(sim=>{
   const p=this._politica(),t=horarioLocal(this.agora);
   if(origem==='AGENDA'&&p.modo!=='AUTOMATICA')
    return {girou:false,motivo:'AGENDA_NAO_HABILITADA'};
   if(p.modo==='PAUSADA')return {girou:false,motivo:'PAUSADA_PELO_ADMINISTRADOR'};
   if(!dentroJanela(t.hora,p.inicio,p.fim))
    return {girou:false,motivo:'FORA_DO_HORARIO_ADMINISTRATIVO'};
   if(p.limite_diario!==null&&this._girosDia(t.dia)>=p.limite_diario)
    return {girou:false,motivo:'LIMITE_DIARIO_DEFINIDO_PELO_ADMINISTRADOR'};
   const meta=this._meta();
   if(origem==='AGENDA'&&
      (meta.centrosDia===0||
       (meta.dataAlvo!==null&&meta.dataAlvo!==t.dia)||
       this._girosDia(t.dia)>=meta.centrosDia))
    return {girou:false,motivo:'META_DIARIA_NAO_AUTORIZADA'};
   const vendas=sim.tabuleiro.vendasDoCiclo;
   if(vendas.length!==6)return {girou:false,motivo:'AGUARDANDO_SEIS_VENDAS'};
   for(const venda of vendas){
    const encontrada=this.db.prepare([
     "SELECT 1 FROM loop_real_motor_eventos WHERE chave=? AND tipo='EVENTO'"
    ].join(' ')).get(venda.vendaId);
    if(!encontrada)falha('CATRACA_GIRO_SEM_EVENTOS_COMPROVADOS');
   }
   // Apenas o operador/configuracao pode habilitar o giro: nunca o cliente.
   if(!sim.catracaAberta)falha('CATRACA_SNAPSHOT_CONTROLE_DIVERGENTE');
   const r=sim.tentarGiro();
   if(!r.girou)falha('CATRACA_GIRO_INESPERADAMENTE_NEGADO');
   const chave='g:'+sim.giros;
   this.db.prepare([
    "INSERT INTO loop_real_motor_eventos(chave,tipo) VALUES(?,'GIRO')"
   ].join(' ')).run(chave);
   this.db.prepare([
    'INSERT INTO loop_real_catraca_admin_giros',
    '(giro,chave_evento,dia,origem,revisao_politica,executado_em)',
    'VALUES(?,?,?,?,?,?)'
   ].join(' ')).run(sim.giros,chave,t.dia,origem,p.revisao,t.ts);
   this._log('GIRO',{giro:sim.giros,origem,dia:t.dia,revisao:p.revisao},t.ts);
   return {girou:true,giro:sim.giros,girosHoje:this._girosDia(t.dia)};
  });
 }
 processarAgenda(){
  // Quem define se a agenda esta ativa e o operador, nao a compra.
  if(process.env.NODE_ENV==='production')return {girou:false,motivo:'NAO_HOMOLOGADO'};
  if(this._politica().modo!=='AUTOMATICA')
   return {girou:false,motivo:'AGENDA_NAO_HABILITADA'};
  const meta=this._meta();
  const dia=horarioLocal(this.agora).dia;
  if(meta.centrosDia===0||(meta.dataAlvo!==null&&meta.dataAlvo!==dia))
   return {girou:false,motivo:'META_DIARIA_NAO_CONFIGURADA'};
  return this.executarGiro({origem:'AGENDA'});
 }
 verificar(){
  const p=this._politica();
  const linhas=this.db.prepare([
   'SELECT g.giro,g.chave_evento,e.tipo FROM loop_real_catraca_admin_giros g',
   'LEFT JOIN loop_real_motor_eventos e ON e.chave=g.chave_evento'
  ].join(' ')).all();
  const giros=this.motor.consultar().catraca.giros;
  if(linhas.some(x=>x.tipo!=='GIRO'||x.chave_evento!=='g:'+x.giro||
     x.giro>giros))
   falha('CATRACA_ADMIN_LIVRO_DE_GIROS_DIVERGENTE');
  return {integridade:'OK',girosAuditados:linhas.length,revisao:p.revisao};
 }
}
module.exports={OperacaoCatracaAdminSQLite,TABELAS_CATRACA_ADMIN};
