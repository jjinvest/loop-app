'use strict';

// Circuit Break isolado: vendas, caixas e giros exclusivamente FICTICIOS.
// Nunca conecta banco, PSP, rota publica ou saldo sacavel.
const {SimuladorLoop}=require('./simulador-loop');

const INDICADORES=new Map([[6,1],[7,1],[8,1],[9,2],[10,2],[11,3],[12,4],[13,5]]);
const LOTES=Object.freeze([1,3,4,5,10]);
const LIMITE_TOTAL=1800;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function validarInteiro(n,min,max,codigo){
  if(!Number.isSafeInteger(n)||n<min||n>max)throw falha(codigo);
}
function diaBrasil(iso){
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))throw falha('RELOGIO_INVALIDO');
  return new Intl.DateTimeFormat('sv-SE',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(d);
}
function idCompra(n){
  validarInteiro(n,1,LIMITE_TOTAL,'COMPRA_INVALIDA');
  return 'compra-'+Math.floor((n-1)/30)+'-'+(((n-1)%30)+1);
}
function criarSimuladorInicial(){
  const sim=new SimuladorLoop();
  sim.registrarPosicaoSimulada({participanteId:'fundador',nome:'Fundador no centro'});
  sim.prepararTabuleiro();
  return sim;
}
function adicionarOnda(sim,onda){
  validarInteiro(onda,0,59,'ONDA_INVALIDA');
  for(let pessoa=1;pessoa<=30;pessoa++){
    const id='onda-'+onda+'-pessoa-'+pessoa;
    const vendaId='compra-'+onda+'-'+pessoa;
    const r=sim.registrarPosicaoSimulada({participanteId:id,
      nome:'Comprador ficticio '+id,vendaId});
    if(r.repetida)throw falha('COMPRA_DUPLICADA');
    const indicador=INDICADORES.get(pessoa);
    if(indicador!==undefined){
      const convite=sim.registrarIndicacaoSimulada({
        indicadorId:'onda-'+onda+'-pessoa-'+indicador,
        eventoId:'convite-'+onda+'-'+pessoa
      });
      if(convite.repetida)throw falha('CONVITE_DUPLICADO');
    }
  }
  if(onda===0)sim.prepararTabuleiro();
}
function executarGiro(sim,primeiroId){
  const vendas=[];
  for(let i=0;i<6;i++){
    const venda=sim.registrarVendaNoCicloSimulada({vendaId:idCompra(primeiroId+i)});
    if(venda.repetida)throw falha('VENDA_DUPLICADA');
    vendas.push(venda.venda);
  }
  if(new Set(vendas.map(v=>v.vendaId)).size!==6)throw falha('VENDA_DUPLICADA');
  sim.abrirCatraca();
  const resultado=sim.tentarGiro();
  sim.pausarCatraca();
  if(!resultado.girou)throw falha('GIRO_NAO_AUTORIZADO');
  return {giro:sim.giros,titularCentro:resultado.centroConcluido.participanteId,
    centroPosicaoId:resultado.centroConcluido.id,
    eventos:vendas.map(v=>({vendaId:v.vendaId,ordem:v.ordem,destinoCofre:v.destinoCofre}))};
}
class CircuitBreakV6DemoSQLite {
  constructor({banco,agora=()=>new Date().toISOString()}={}){
    if(!banco||typeof banco.prepare!=='function')throw falha('BANCO_OBRIGATORIO');
    if(typeof agora!=='function')throw falha('RELOGIO_INVALIDO');
    this.banco=banco;this.agora=agora;
    banco.exec([
      'CREATE TABLE IF NOT EXISTS loop_cb_v6_estado (',
      'id INTEGER PRIMARY KEY CHECK(id=1), revisao INTEGER NOT NULL,',
      "status TEXT NOT NULL CHECK(status IN ('PAUSADA','ABERTA')),",
      'limite_diario INTEGER NOT NULL CHECK(limite_diario BETWEEN 1 AND 300),',
      'dia_local TEXT NOT NULL, giros_dia INTEGER NOT NULL,',
      'compras_geradas INTEGER NOT NULL, proxima_compra INTEGER NOT NULL,',
      'snapshot_json TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS loop_cb_v6_auditoria (',
      'seq INTEGER PRIMARY KEY AUTOINCREMENT, comando_id TEXT NOT NULL UNIQUE,',
      'tipo TEXT NOT NULL, entrada_json TEXT NOT NULL,',
      'saida_json TEXT NOT NULL, registrado_em TEXT NOT NULL);',
      'CREATE TRIGGER IF NOT EXISTS loop_cb_v6_historico_bloquear_update',
      'BEFORE UPDATE ON loop_cb_v6_auditoria',
      "BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;",
      'CREATE TRIGGER IF NOT EXISTS loop_cb_v6_historico_bloquear_delete',
      'BEFORE DELETE ON loop_cb_v6_auditoria',
      "BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;"
    ].join('\n'));
    banco.exec('BEGIN IMMEDIATE;');
    try{
      if(!banco.prepare('SELECT id FROM loop_cb_v6_estado WHERE id=1').get()){
        banco.prepare('INSERT INTO loop_cb_v6_estado VALUES (1,0,?,?,?,?,?,?,?)')
          .run('PAUSADA',10,diaBrasil(agora()),0,0,1,
            JSON.stringify(criarSimuladorInicial().exportarSnapshot()));
      }
      banco.exec('COMMIT;');
    }catch(e){banco.exec('ROLLBACK;');throw e;}
  }
  linha(){return this.banco.prepare('SELECT * FROM loop_cb_v6_estado WHERE id=1').get();}
  statusDa(l,agora=this.agora()){
    const sim=SimuladorLoop.restaurarSnapshot(JSON.parse(l.snapshot_json));
    const dia=diaBrasil(agora);
    const usados=l.dia_local===dia?l.giros_dia:0;
    const vendasNoCiclo=sim.tabuleiro.vendasDoCiclo.length;
    const disponiveis=Math.floor((l.compras_geradas-l.proxima_compra+1)/6);
    return {
      modo:'SOMENTE_LABORATORIO_SEM_PAGAMENTOS',
      revisao:l.revisao,status:l.status,limiteDiario:l.limite_diario,
      girosHoje:usados,restantesHoje:Math.max(0,l.limite_diario-usados),
      diaLocal:dia,girosConcluidos:sim.giros,
      comprasFicticiasGeradas:l.compras_geradas,
      comprasFicticiasProcessadas:l.proxima_compra-1,
      comprasPendentes:l.compras_geradas-l.proxima_compra+1,
      girosProntos:disponiveis,girosRestantesAte300:300-sim.giros,
      participantesNaFila:sim.filas.filaA.length+sim.filas.filaB.length,
      filaA:sim.filas.filaA.length,filaB:sim.filas.filaB.length,
      centro:sim.tabuleiro.centro?.participanteId??null,
      vagas:sim.tabuleiro.vagas.map(p=>p?.participanteId??null),
      vendasNoCiclo,opcoesLote:LOTES,
      financeiroFicticio:{
        vendasBrutasCentavos:(l.proxima_compra-1)*25000,
        centrosCentavos:sim.giros*75000,
        investimentoCentavos:sim.giros*50000,
        reservaCentavos:sim.giros*25000,
        pagamentosReais:0,saquesReais:0
      }
    };
  }
  resumo(){return this.statusDa(this.linha());}
  historico({limite=25}={}){
    validarInteiro(limite,1,100,'LIMITE_INVALIDO');
    return this.banco.prepare(
      'SELECT seq,comando_id,tipo,entrada_json,saida_json,registrado_em FROM loop_cb_v6_auditoria ORDER BY seq DESC LIMIT ?'
    ).all(limite).map(x=>({
      sequencia:x.seq,comandoId:x.comando_id,tipo:x.tipo,
      entrada:JSON.parse(x.entrada_json),saida:JSON.parse(x.saida_json),
      registradoEm:x.registrado_em
    }));
  }
  executar({tipo,comandoId,revisaoEsperada,valor}={}){
    if(!['ABRIR','PAUSAR','LIMITE_DIARIO','GERAR_30_COMPRAS','LIBERAR_LOTE'].includes(tipo))
      throw falha('COMANDO_INVALIDO');
    if(typeof comandoId!=='string'||!/^cb-[a-z0-9-]{5,70}$/.test(comandoId))
      throw falha('COMANDO_ID_INVALIDO');
    validarInteiro(revisaoEsperada,0,1000000,'REVISAO_INVALIDA');
    if(tipo==='LIMITE_DIARIO')validarInteiro(valor,1,300,'LIMITE_INVALIDO');
    if(tipo==='LIBERAR_LOTE'&&!LOTES.includes(valor))throw falha('LOTE_INVALIDO');
    if(!['LIBERAR_LOTE','LIMITE_DIARIO'].includes(tipo)&&valor!==undefined)
      throw falha('VALOR_NAO_PERMITIDO');
    const entrada={tipo,valor:valor??null};
    const b=this.banco;
    b.exec('BEGIN IMMEDIATE;');
    try{
      const anterior=b.prepare('SELECT entrada_json,saida_json FROM loop_cb_v6_auditoria WHERE comando_id=?')
        .get(comandoId);
      if(anterior){
        if(JSON.stringify(entrada)!==anterior.entrada_json)throw falha('CONFLITO_COMANDO_ID');
        b.exec('COMMIT;');
        return {...JSON.parse(anterior.saida_json),repetido:true};
      }
      const l=this.linha();
      if(l.revisao!==revisaoEsperada)throw falha('CONFLITO_REVISAO');
      const agora=this.agora();
      const dia=diaBrasil(agora);
      const sim=SimuladorLoop.restaurarSnapshot(JSON.parse(l.snapshot_json));
      const usados=l.dia_local===dia?l.giros_dia:0;
      let status=l.status,limite=l.limite_diario;
      let comprasGeradas=l.compras_geradas,proxima=l.proxima_compra;
      let novosGirosDia=usados;
      let girosLiberados=[];
      if(tipo==='ABRIR')status='ABERTA';
      if(tipo==='PAUSAR')status='PAUSADA';
      if(tipo==='LIMITE_DIARIO')limite=valor;
      if(tipo==='GERAR_30_COMPRAS'){
        if(comprasGeradas>=LIMITE_TOTAL)throw falha('CENARIO_COMPLETO');
        adicionarOnda(sim,comprasGeradas/30);
        comprasGeradas+=30;
      }
      if(tipo==='LIBERAR_LOTE'){
        if(status!=='ABERTA')throw falha('CATRACA_PAUSADA');
        if(valor>limite-usados)throw falha('LIMITE_DIARIO_ATINGIDO');
        if(comprasGeradas-proxima+1<valor*6)throw falha('COMPRAS_FICTICIAS_INSUFICIENTES');
        for(let i=0;i<valor;i++){
          girosLiberados.push(executarGiro(sim,proxima));
          proxima+=6;
        }
        novosGirosDia=usados+valor;
      }
      const novaRevisao=l.revisao+1;
      const alterado=b.prepare([
        'UPDATE loop_cb_v6_estado SET revisao=?,status=?,limite_diario=?,',
        'dia_local=?,giros_dia=?,compras_geradas=?,proxima_compra=?,snapshot_json=?',
        'WHERE id=1 AND revisao=?'
      ].join(' ')).run(novaRevisao,status,limite,dia,novosGirosDia,
        comprasGeradas,proxima,JSON.stringify(sim.exportarSnapshot()),l.revisao);
      if(alterado.changes!==1)throw falha('CONFLITO_REVISAO');
      const resposta={
        comando:tipo,girosLiberados,
        resumo:this.statusDa(this.linha(),agora),repetido:false
      };
      b.prepare('INSERT INTO loop_cb_v6_auditoria (comando_id,tipo,entrada_json,saida_json,registrado_em) VALUES (?,?,?,?,?)')
        .run(comandoId,tipo,JSON.stringify(entrada),JSON.stringify(resposta),agora);
      b.exec('COMMIT;');
      return resposta;
    }catch(e){b.exec('ROLLBACK;');throw e;}
  }
}
module.exports={CircuitBreakV6DemoSQLite,LOTES};
