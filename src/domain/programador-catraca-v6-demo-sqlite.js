'use strict';

// Agenda somente giros da ponte de contas FICTICIAS.
// Programa horarios de processamento; nao ordena pagamentos nem simula saldo bancario.
// Deve ser acionada pelo relogio do servidor LOCAL em execucao, nao por navegadores.
const MINUTO=60*1000;
const VALID_ID=/^agenda-[a-z0-9-]{6,70}$/;
const NOMES=['DISTRIBUIDO','PONTUAL','A_CADA_30_MIN','A_CADA_60_MIN'];
const ALVOS=['GIROS','PESSOAS'];
const TRANSITORIOS=new Set(['CATRACA_PAUSADA','LIMITE_DIARIO_ATINGIDO',
  'COMPRAS_CONFIRMADAS_INSUFICIENTES','TABULEIRO_SEM_REPOSICAO',
  'CICLO_PARCIAL_NAO_GERENCIADO','CONFLITO_REVISAO',
  'AGUARDANDO_START','SALDO_CENTRAL_SIMULADO_INSUFICIENTE',
  'PARTICIPANTES_ELEGIVEIS_INSUFICIENTES']);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function ms(valor){
  if(typeof valor!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(valor))
    throw falha('HORARIO_INVALIDO');
  const data=Date.parse(valor);
  if(!Number.isFinite(data))throw falha('HORARIO_INVALIDO');
  return data;
}
function diaSP(momento){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',
    year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(momento));
}
function horarioBrasil(d){
  return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',
    year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(d));
}
function gerarSlots(inicio,fim,qtd,modo){
  // Todos os slots de um unico dia, sem execucao fora da janela.
  return Array.from({length:qtd},(_,i)=>{
    const tempo=modo==='PONTUAL'?inicio:
      modo==='A_CADA_30_MIN'?inicio+i*30*MINUTO:
      modo==='A_CADA_60_MIN'?inicio+i*60*MINUTO:
      inicio+Math.floor((fim-inicio)*i/qtd/MINUTO)*MINUTO;
    return new Date(tempo).toISOString();
  });
}
class ProgramadorCatracaV6DemoSQLite{
  constructor({banco,ponteControle,controle,agora=()=>new Date().toISOString()}={}){
    if(!banco||!ponteControle||!controle||ponteControle.banco!==banco||
       controle.banco!==banco)throw new TypeError('Programador requer banco compartilhado do laboratorio');
    this.banco=banco;this.ponte=ponteControle;this.controle=controle;this.agora=agora;
    banco.exec([
      'CREATE TABLE IF NOT EXISTS loop_v6_agendas_demo(',
      'agenda_id TEXT PRIMARY KEY, modo TEXT NOT NULL,',
      'quantidade INTEGER NOT NULL CHECK(quantidade BETWEEN 1 AND 300),',
      'inicio_em TEXT NOT NULL, fim_em TEXT NOT NULL, dia_sp TEXT NOT NULL,',
      "estado TEXT NOT NULL CHECK(estado IN ('ATIVA','CANCELADA')),",
      'criada_em TEXT NOT NULL, cancelada_em TEXT,',
      "alvo TEXT NOT NULL DEFAULT 'GIROS');",
      'CREATE TABLE IF NOT EXISTS loop_v6_agenda_slots_demo(',
      'agenda_id TEXT NOT NULL REFERENCES loop_v6_agendas_demo(agenda_id),',
      'ordem INTEGER NOT NULL, horario_em TEXT NOT NULL,',
      "estado TEXT NOT NULL CHECK(estado IN ('PENDENTE','CONCLUIDO')),",
      'comando_id TEXT NOT NULL UNIQUE, resultado_json TEXT,',
      'concluido_em TEXT, PRIMARY KEY(agenda_id,ordem));',
      'CREATE TABLE IF NOT EXISTS loop_v6_agenda_execucoes_demo(',
      'seq INTEGER PRIMARY KEY AUTOINCREMENT,',
      'agenda_id TEXT NOT NULL,slot_ordem INTEGER NOT NULL,',
      'comando_id TEXT NOT NULL UNIQUE,registrado_em TEXT NOT NULL,',
      'resumo_json TEXT NOT NULL);',
      'CREATE TRIGGER IF NOT EXISTS loop_v6_agenda_execucoes_imutavel_upd',
      "BEFORE UPDATE ON loop_v6_agenda_execucoes_demo BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;",
      'CREATE TRIGGER IF NOT EXISTS loop_v6_agenda_execucoes_imutavel_del',
      "BEFORE DELETE ON loop_v6_agenda_execucoes_demo BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;"
    ].join('\n'));
    const colunas=banco.prepare('PRAGMA table_info(loop_v6_agendas_demo)').all();
    if(!colunas.some(c=>c.name==='alvo'))
      banco.exec("ALTER TABLE loop_v6_agendas_demo ADD COLUMN alvo TEXT NOT NULL DEFAULT 'GIROS'");
  }
  criar({agendaId,quantidade,modo,inicioEm,fimEm,alvo='GIROS'}={}){
    if(!VALID_ID.test(agendaId||''))throw falha('AGENDA_ID_INVALIDA');
    if(!NOMES.includes(modo)||!ALVOS.includes(alvo)||
       !Number.isSafeInteger(quantidade)||quantidade<1||quantidade>300)
      throw falha('AGENDA_INVALIDA');
    const inicio=ms(inicioEm),fim=ms(fimEm),agora=ms(this.agora());
    if(inicio<agora-2*MINUTO||fim<inicio||fim-inicio>24*60*MINUTO||
       diaSP(inicio)!==diaSP(fim))
      throw falha('JANELA_INVALIDA');
    if(fim-inicio<Math.max(1,quantidade-1)*MINUTO)
      throw falha('JANELA_CURTA');
    const slots=gerarSlots(inicio,fim,quantidade,modo);
    if(slots.some(s=>ms(s)>fim))throw falha('JANELA_CURTA');
    const b=this.banco;
    b.exec('BEGIN IMMEDIATE');
    try{
      if(b.prepare('SELECT 1 FROM loop_v6_agendas_demo WHERE agenda_id=?').get(agendaId))
        throw falha('AGENDA_ID_REUTILIZADA');
      const limite=this.controle.linha().limite_diario;
      const total=b.prepare([
        'SELECT COALESCE(SUM(quantidade),0) AS n',
        "FROM loop_v6_agendas_demo WHERE estado='ATIVA'",
        'AND dia_sp=?'
      ].join(' ')).get(diaSP(inicio)).n;
      if(total+quantidade>limite)throw falha('LIMITE_AGENDAMENTO_DIARIO');
      b.prepare([
        'INSERT INTO loop_v6_agendas_demo',
        '(agenda_id,modo,quantidade,inicio_em,fim_em,dia_sp,estado,criada_em,alvo)',
        "VALUES(?,?,?,?,?,?,'ATIVA',?,?)"
      ].join(' ')).run(agendaId,modo,quantidade,new Date(inicio).toISOString(),
        new Date(fim).toISOString(),diaSP(inicio),this.agora(),alvo);
      const save=b.prepare([
        'INSERT INTO loop_v6_agenda_slots_demo',
        "(agenda_id,ordem,horario_em,estado,comando_id)",
        "VALUES(?,?,?,'PENDENTE',?)"
      ].join(' '));
      slots.forEach((h,i)=>save.run(agendaId,i+1,h,
        'cb-ag-'+agendaId.slice(7)+'-'+String(i+1).padStart(3,'0')));
      b.exec('COMMIT');
      return this.detalhe(agendaId);
    }catch(e){b.exec('ROLLBACK');throw e;}
  }
  cancelar(agendaId){
    if(!VALID_ID.test(agendaId||''))throw falha('AGENDA_ID_INVALIDA');
    const b=this.banco;
    const x=b.prepare('UPDATE loop_v6_agendas_demo SET estado=?,cancelada_em=? WHERE agenda_id=? AND estado=?')
      .run('CANCELADA',this.agora(),agendaId,'ATIVA');
    if(!x.changes)throw falha('AGENDA_INEXISTENTE_OU_FINALIZADA');
    return this.detalhe(agendaId);
  }
  detalhe(id){
    const a=this.banco.prepare('SELECT * FROM loop_v6_agendas_demo WHERE agenda_id=?').get(id);
    if(!a)return null;
    const slots=this.banco.prepare(
      'SELECT ordem,horario_em AS horario,estado FROM loop_v6_agenda_slots_demo WHERE agenda_id=? ORDER BY ordem'
    ).all(id);
    const concluidos=slots.filter(x=>x.estado==='CONCLUIDO').length;
    return {agendaId:a.agenda_id,modo:a.modo,alvo:a.alvo||'GIROS',quantidade:a.quantidade,
      status:a.estado,inicioEm:a.inicio_em,fimEm:a.fim_em,
      girosExecutados:concluidos,girosNaoExecutados:a.quantidade-concluidos,
      horarios:slots.map(x=>({ordem:x.ordem,horarioBrasilia:horarioBrasil(x.horario),
        executado:x.estado==='CONCLUIDO'})),
      operacao:'APENAS_CATRACA_FICTICIA_SEM_TRANSFERENCIAS'};
  }
  listar(){
    const data=this.agora();
    const ids=this.banco.prepare('SELECT agenda_id FROM loop_v6_agendas_demo ORDER BY criada_em DESC LIMIT 25').all();
    return {modo:'AGENDADOR_DE_GIROS_FICTICIOS',
      catraca:this.controle.resumo().status,agora:data,
      agendas:ids.map(i=>this.detalhe(i.agenda_id)),
      saldoSacavelCentavos:0,transferenciasBancariasExecutadas:0};
  }
  processarVencimento(){
    const agora=this.agora(),hoje=ms(agora);
    if(this.controle.resumo().status!=='ABERTA')
      return {executado:false,motivo:'CATRACA_PAUSADA'};
    const b=this.banco;
    // Um unico giro no maximo por chamada, independentemente de slots atrasados.
    const slot=b.prepare([
      'SELECT s.agenda_id AS agendaId,s.ordem,s.comando_id AS comandoId,',
      'a.fim_em AS fimEm,a.alvo AS alvo FROM loop_v6_agenda_slots_demo s',
      'JOIN loop_v6_agendas_demo a ON a.agenda_id=s.agenda_id',
      "WHERE a.estado='ATIVA' AND s.estado='PENDENTE'",
      'AND s.horario_em<=? AND a.inicio_em<=? AND a.fim_em>=?',
      'ORDER BY s.horario_em,s.agenda_id,s.ordem LIMIT 1'
    ].join(' ')).get(agora,agora,agora);
    if(!slot)return {executado:false,motivo:'SEM_SLOT_VENCIDO_NA_JANELA'};
    // Não acelerar por repeticao de um endpoint manual na mesma janela.
    const ultimo=b.prepare('SELECT registrado_em FROM loop_v6_agenda_execucoes_demo ORDER BY seq DESC LIMIT 1').get();
    if(ultimo&&hoje-ms(ultimo.registrado_em)<MINUTO)
      return {executado:false,motivo:'INTERVALO_MINIMO_UM_MINUTO'};
    let retorno;
    try{
      retorno=this.ponte.liberar({
        ...(slot.alvo==='PESSOAS'?{participantes:1}:{quantidade:1}),
        comandoId:slot.comandoId,
        revisaoEsperada:this.controle.resumo().revisao
      });
    }catch(e){
      if(TRANSITORIOS.has(e.codigo))
        return {executado:false,motivo:e.codigo,agendaId:slot.agendaId,
          ordem:slot.ordem};
      throw e;
    }
    // Se o processo cair entre giro e registro, o comandoId idempotente
    // assegura que a retomada nao gire outra vez.
    b.exec('BEGIN IMMEDIATE');
    try{
      const mudanca=b.prepare([
        "UPDATE loop_v6_agenda_slots_demo SET estado='CONCLUIDO',",
        'resultado_json=?,concluido_em=? WHERE agenda_id=? AND ordem=?',
        "AND estado='PENDENTE'"
      ].join(' ')).run(JSON.stringify(retorno),agora,slot.agendaId,slot.ordem);
      if(mudanca.changes!==1)throw falha('SLOT_JA_CONCLUIDO');
      b.prepare([
        'INSERT INTO loop_v6_agenda_execucoes_demo',
        '(agenda_id,slot_ordem,comando_id,registrado_em,resumo_json)',
        'VALUES(?,?,?,?,?)'
      ].join(' ')).run(slot.agendaId,slot.ordem,slot.comandoId,agora,
        JSON.stringify({giro:retorno.girosLiberados[0]?.giro,
          centroEmpresa:retorno.girosLiberados[0]?.centroEmpresa,
          participantesContemplados:retorno.participantesContemplados||0,
          semPagamentoReal:true}));
      b.exec('COMMIT');
    }catch(e){b.exec('ROLLBACK');throw e;}
    return {executado:true,agendaId:slot.agendaId,ordem:slot.ordem,
      giro:retorno.girosLiberados[0]?.giro??null,
      nenhumPagamentoReal:true};
  }
}
module.exports={ProgramadorCatracaV6DemoSQLite};
