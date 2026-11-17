'use strict';
// ÚNICO receptor da migração de contas reais, utilizado pela preparação e
// pela aplicação definitiva. Nunca importa pagamentos, posições ou saldo.
// Autenticação por pacote cifrado e prova de backup externo obrigatórias.
const {DatabaseSync}=require('node:sqlite');
const {desempacotar,importarNoReal}=require('./migracao-cadastros-preview-real');
const {enviarBackupOffsiteIdentidade}=require('./backup-identidade-offsite');
async function atenderMigracaoIdentidadeReal(req,res,{ambiente=process.env,banco=null}={}){
 if(req.url!=='/internal/loop/migracao-identidade')return false;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
   if(req.method!=='POST'){res.writeHead(405);res.end();return;}
   if(ambiente.LOOP_REAL_MIGRAR_IDENTIDADE!=='SIM'||
      ambiente.LOOP_REAL_CADASTRO_GO!=='NAO'||
      ambiente.LOOP_REAL_APROVACAO_DOCUMENTOS!=='NAO'){
    res.writeHead(503);res.end(JSON.stringify({erro:'MIGRACAO_REAL_BLOQUEADA'}));return;
   }
   const blocos=[];let bytes=0;
   try{
    for await(const parte of req){
     bytes+=parte.length;
     if(bytes>4200000)throw Error('MIGRACAO_CORPO_EXCEDIDO');
     blocos.push(parte);
    }
    const pacote=JSON.parse(Buffer.concat(blocos).toString('utf8'));
    const dados=desempacotar(pacote,ambiente.LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN);
    const db=banco||new DatabaseSync(ambiente.LOOP_REAL_SQLITE);
    let resultado;
    try{
     db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=10000;');
     const key=n=>{
      const v=ambiente[n];if(typeof v!=='string'||!/^[0-9a-f]{64}$/.test(v))
       throw Error('MIGRACAO_CUSTODIA_AUSENTE');
      return Buffer.from(v,'hex');
     };
     resultado=importarNoReal({
      banco:db,payload:dados,chaveEmail:key('LOOP_REAL_CHAVE_EMAIL'),
      chaveCifra:key('LOOP_REAL_CHAVE_CIFRA')
     });
    }finally{if(!banco)db.close();}
    const key=n=>Buffer.from(ambiente[n],'hex');
    const copia=await enviarBackupOffsiteIdentidade({
     fonteSqlite:ambiente.LOOP_REAL_SQLITE,
     chaveBackup:key('LOOP_REAL_CHAVE_BACKUP'),
     config:{
      endpoint:ambiente.LOOP_REAL_S3_ENDPOINT,bucket:ambiente.LOOP_REAL_S3_BUCKET,
      accessKeyId:ambiente.LOOP_REAL_S3_ACCESS_KEY_ID,
      secretAccessKey:ambiente.LOOP_REAL_S3_SECRET_ACCESS_KEY,
      region:ambiente.LOOP_REAL_S3_REGION||'auto'
     },
     exigirProvaChaves:true,chavesRecuperacao:{
      chaveEmail:key('LOOP_REAL_CHAVE_EMAIL'),
      chaveCifra:key('LOOP_REAL_CHAVE_CIFRA'),
      chaveCodigo:key('LOOP_REAL_CHAVE_CODIGO'),
      chaveAuditoria:key('LOOP_REAL_CHAVE_AUDITORIA'),
      chavePedidos:key('LOOP_REAL_CHAVE_PEDIDOS'),
      chaveCotacoes:key('LOOP_REAL_CHAVE_COTACOES'),
      chaveOutbox:key('LOOP_REAL_CHAVE_OUTBOX')
     }
    });
    if(copia.restauracaoIsoladaConfirmada!==true||
       copia.copiaExternaConfirmada!==true||
       copia.integridadeSQLite!=='ok')
     throw Error('MIGRACAO_BACKUP_POS_IMPORTACAO_FALHOU');
    process.stdout.write('LOOP_MIGRACAO_REAL=CONFIRMADA;CONTAS='+
     resultado.contasImportadas+';VINCULOS='+resultado.vinculosImportados+
     ';PRIMEIRA_INDICACAO_VILELA='+String(resultado.primeiraIndicacaoVilelaConferida)+
     ';BACKUP_OFFSITE_RESTAURADO=SIM\n');
    res.writeHead(200);res.end(JSON.stringify({
     estado:'MIGRACAO_REAL_BACKUP_COMPROVADO',...resultado
    }));
   }catch(e){
    const erro=typeof e?.codigo==='string'?e.codigo:
     typeof e?.message==='string'&&/^[A-Z_]{5,100}$/.test(e.message)?
     e.message:'MIGRACAO_NAO_COMPROVADA';
    process.stderr.write('LOOP_MIGRACAO_REAL=NAO_COMPROVADA;CODIGO='+erro+'\n');
    res.writeHead(503);res.end(JSON.stringify({erro}));
   }
   return;

 return true;
}
module.exports={atenderMigracaoIdentidadeReal};
