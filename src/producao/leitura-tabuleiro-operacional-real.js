'use strict';
// Fonte unica: SQLite do motor real. Nunca importar motor de homologacao.
// Somente leitura. A ausência de schema ou prova gera indisponibilidade,
// NUNCA uma fotografia artificial do tabuleiro.
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {timingSafeEqual}=require('node:crypto');
const {SimuladorLoop}=require('../domain/simulador-loop');
const FONTE='MOTOR_REAL_SQLITE_DA_IDENTIDADE';
const ERRO='MOTOR_REAL_NAO_ATIVO';
function falha(codigo){
 const e=new Error(codigo);e.codigo=codigo;throw e;
}
function autorizarInterno(cabecalho,segredo){
 if(typeof segredo!=='string'||!/^[a-f0-9]{64}$/.test(segredo)||
    typeof cabecalho!=='string'||!/^[a-f0-9]{64}$/.test(cabecalho))
  return false;
 return timingSafeEqual(Buffer.from(cabecalho,'hex'),Buffer.from(segredo,'hex'));
}
function projetarTabuleiroOperacional({banco}={}){
 if(typeof banco?.prepare!=='function')falha(ERRO);
 // O motor real deve ter sido iniciado pelo SERVIÇO REAL, que cria este
 // esquema após inicializar a identidade definitiva no mesmo banco.
 for(const nome of ['loop_real_contas','loop_real_motor_estado',
                    'loop_real_motor_compras','loop_real_motor_eventos']){
  if(!banco.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
   ).get(nome))falha(ERRO);
 }
 const snapshot=banco.prepare(
  'SELECT snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get()?.snapshot;
 let sim;
 try{sim=snapshot?SimuladorLoop.restaurarSnapshot(
  JSON.parse(snapshot)):new SimuladorLoop();}
 catch{falha('SNAPSHOT_REAL_INCONSISTENTE');}
 const estado=sim.estado();
 const idsComPedido=new Set(banco.prepare(
  'SELECT posicao_id FROM loop_real_motor_compras'
 ).all().map(r=>r.posicao_id));
 const todos=[...estado.filas.A.pessoas,...estado.filas.B.pessoas,
  estado.tabuleiro.centro,...estado.tabuleiro.vagas].filter(Boolean);
 for(const posicao of todos){
  if(!Number.isSafeInteger(posicao.id)||posicao.id<1)
   falha('POSICAO_REAL_SEM_IDENTIDADE');
  if(posicao.empresa===true){
   // Nenhuma dourada é assumida por cor/estilo/fixture. O livro real de
   // criação de douradas precisa existir e atestar a origem.
   if(!banco.prepare(
     "SELECT 1 FROM sqlite_master WHERE type='table' AND name='loop_real_douradas_criadas'"
    ).get()||!banco.prepare(
     'SELECT 1 FROM loop_real_douradas_criadas WHERE posicao_id=?'
    ).get(posicao.id))falha('DOURADA_REAL_SEM_ORIGEM');
  }else if(!idsComPedido.has(posicao.id)){
   falha('POSICAO_REAL_SEM_PEDIDO');
  }
 }
 const visual=p=>p?{
  numero:p.id,dourada:p.empresa===true,
  pendente:p.statusAdesao==='PENDENTE'
 }:null;
 return {
  origem:FONTE,operacional:true,financeiroReal:false,
  fonteValidada:'ESTADO_E_LIVRO_NO_MESMO_SQLITE_REAL',
  filaA:estado.filas.A.pessoas.map(visual),
  filaB:estado.filas.B.pessoas.map(visual),
  tabuleiro:{
   centro:visual(estado.tabuleiro.centro),
   vagas:estado.tabuleiro.vagas.map(visual),
   eventosNoCiclo:estado.tabuleiro.vendasNoCiclo,
   ciclosConcluidos:estado.tabuleiro.ciclosConcluidos
  },
  catraca:{giros:estado.catraca.giros,estado:estado.catraca.status},
  agenda:null
 };
}
function consultarArquivoReal({arquivo}={}){
 if(typeof arquivo!=='string'||!arquivo.startsWith('/dados-reais/')||
    !fs.existsSync(arquivo))falha(ERRO);
 let banco;
 try{
  banco=new DatabaseSync(arquivo,{readOnly:true});
  return projetarTabuleiroOperacional({banco});
 }catch(e){if(e.codigo)throw e;falha('LEITURA_MOTOR_REAL_FALHOU');}
 finally{try{banco?.close();}catch{}}
}
module.exports={FONTE,ERRO,autorizarInterno,
 projetarTabuleiroOperacional,consultarArquivoReal};
