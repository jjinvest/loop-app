'use strict';
// Prova de RECUPERACAO ISOLADA do banco UNICO de homologacao:
// cliente, loja, pedido, PSP, motor, CPF/termos e financeiro.
// Somente leitura do original; nao e backup offsite nem teste de producao.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const NECESSARIAS=[
 'akitemm_conta_unica_candidata',
 'akitemm_checkout_prepedidos_staging',
 'akitemm_prepedido_asaas_sandbox_staging',
 'akitemm_motor_conta_ensaio_estado',
 'akitemm_motor_ensaio_lotes_pedido',
 'akitemm_motor_ensaio_aceites_posicao'
];
const METRICAS={
 titulares:'akitemm_conta_unica_candidata',
 pedidos:'akitemm_checkout_prepedidos_staging',
 cobrancasSandbox:'akitemm_prepedido_asaas_sandbox_staging',
 lotes:'akitemm_motor_ensaio_lotes_pedido',
 aceitesIndividuais:'akitemm_motor_ensaio_aceites_posicao'
};
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validarOrigem(arquivo,volume){
 if(typeof arquivo!=='string'||!path.isAbsolute(arquivo)||
    !arquivo.endsWith('.sqlite')||typeof volume!=='string'||
    !path.isAbsolute(volume))falha('CAMINHO_RECUPERACAO_INVALIDO');
 const base=fs.realpathSync(volume),origem=fs.realpathSync(arquivo);
 const st=fs.lstatSync(arquivo);
 if(!st.isFile()||st.isSymbolicLink())falha('ORIGEM_RECUPERACAO_INSEGURA');
 const rel=path.relative(base,origem);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||
    path.isAbsolute(rel))falha('ORIGEM_FORA_VOLUME');
 return origem;
}
function auditoriaBanco(db){
 const integral=db.prepare('PRAGMA integrity_check').all();
 if(integral.length!==1||integral[0].integrity_check!=='ok')
  falha('SQLITE_INTEGRIDADE_REPROVADA');
 if(db.prepare('PRAGMA foreign_key_check').all().length)
  falha('SQLITE_CHAVES_REPROVADAS');
 const tabelas=new Set(db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table'"
 ).all().map(x=>x.name));
 if(NECESSARIAS.some(t=>!tabelas.has(t)))
  falha('SQLITE_ESQUEMA_UNIFICADO_INCOMPLETO');
 let inconsistencias=0;
 inconsistencias+=db.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido l',
  'LEFT JOIN akitemm_checkout_prepedidos_staging p',
  'ON p.prepedido_id=l.prepedido_id AND p.titular_id=l.titular_id',
  'WHERE p.prepedido_id IS NULL'
 ].join(' ')).get().n;
 inconsistencias+=db.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_aceites_posicao a',
  'LEFT JOIN akitemm_motor_ensaio_lotes_pedido l',
  'ON l.numero_posicao=a.numero_posicao AND',
  'l.prepedido_id=a.prepedido_id AND l.titular_id=a.titular_id',
  'WHERE l.numero_posicao IS NULL'
 ].join(' ')).get().n;
 inconsistencias+=db.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_asaas_sandbox_staging a',
  'LEFT JOIN akitemm_checkout_prepedidos_staging p',
  'ON p.prepedido_id=a.prepedido_id AND p.titular_id=a.titular_id',
  'WHERE p.prepedido_id IS NULL OR p.total_centavos<>a.valor_centavos',
  "OR a.external_ref<>'LOOPLAB-' || a.prepedido_id"
 ].join(' ')).get().n;
 if(inconsistencias!==0)falha('SQLITE_VINCULOS_SEMANTICOS_DIVERGENTES');
 const totais={};
 for(const [name,table] of Object.entries(METRICAS))
  totais[name]=db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
 return {totais,tabelas:tabelas.size};
}
async function provarRestauracaoSqliteUnificadoLab({
 arquivo,volume,autorizado=false,dirTemporario=os.tmpdir()
}={}){
 if(autorizado!==true||process.env.NODE_ENV==='production')
  falha('ENSAIO_RECUPERACAO_NAO_AUTORIZADO');
 const origem=validarOrigem(arquivo,volume);
 const temporario=fs.mkdtempSync(path.join(dirTemporario,'akitemm-restauracao-'));
 fs.chmodSync(temporario,0o700);
 const isolado=path.join(temporario,'copia.sqlite');
 let fonte=null,copia=null;
 try{
  fonte=new DatabaseSync(origem,{readOnly:true});
  // VACUUM INTO captura instantaneo coerente sob WAL ativo; NAO copiar
  // diretamente o arquivo .sqlite enquanto as escritas continuam.
  fonte.prepare('VACUUM INTO ?').run(isolado);
  fonte.close();fonte=null;
  fs.chmodSync(isolado,0o600);
  copia=new DatabaseSync(isolado,{readOnly:true});
  const audit=auditoriaBanco(copia);
  copia.close();copia=null;
  const tamanho=fs.statSync(isolado).size;
  if(tamanho<4096)falha('SQLITE_RESTAURACAO_VAZIA');
  const digest=createHash('sha256');
  for await(const chunk of fs.createReadStream(isolado))digest.update(chunk);
  const hash=digest.digest('hex');
  return {estado:'RECUPERACAO_ISOLADA_SQLITE_INTEGRA',
   cobertura:'CONTA_LOJA_PEDIDO_ASAAS_SANDBOX_MOTOR_ACEITES',
   tabelasVerificadas:audit.tabelas,
   totaisSemDadosPessoais:audit.totais,
   tamanhoBytes:tamanho,sha256Snapshot:hash,
   integridadeSQLite:'ok',violacoesForeignKeys:0,
   vinculosSemanticosInconsistentes:0,
   originalNaoAlterado:true,restauracaoIsoladaConfirmada:true,
   criptografiaDaCopiaExternaConfirmada:false,
   copiaOffsiteConfirmada:false,
   agendamentoAutomaticoConfirmado:false,
   RPO_RTO_Confirmados:false,marcoZeroAprovado:false,
   pagamentosReais:0,saquesReais:0};
 }finally{
  if(copia)try{copia.close();}catch{}
  if(fonte)try{fonte.close();}catch{}
  fs.rmSync(temporario,{recursive:true,force:true});
 }
}
if(require.main===module){
 provarRestauracaoSqliteUnificadoLab({
  arquivo:process.env.LOOP_PREVIEW_SQLITE,
  volume:process.env.RAILWAY_VOLUME_MOUNT_PATH,
  autorizado:process.env.LOOP_RECUPERACAO_ISOLADA_AUTORIZADA==='SIM'
 }).then(r=>process.stdout.write('LOOP_RECUPERACAO_SQLITE='+JSON.stringify(r)+'\n'),
 e=>{process.stderr.write('LOOP_RECUPERACAO_BLOQUEADA='+
   (e.codigo||'INCONCLUSIVA')+'\n');process.exitCode=1;});
}
module.exports={provarRestauracaoSqliteUnificadoLab};
