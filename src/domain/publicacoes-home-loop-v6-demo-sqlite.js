'use strict';

// Painel de publicacoes EXCLUSIVO do administrativo local do LOOP.
// Somente o operador decide se publica/arquiva, sem anuncios externos automaticos.
// Conteudo fica no SQLite local: nao e adicionado a repositorio Git.
const TIPOS=['EVENTO','AKITEMM','COMUNICADO'];
const LINK_PERMITIDO=/^\/(?:loja|escritorio|admin\/escritorio-demo)$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class PublicacoesHomeLoopV6DemoSQLite{
 constructor({banco,agora=()=>new Date().toISOString()}={}){
  if(!banco)throw new TypeError('SQLite obrigatorio');
  this.banco=banco;this.agora=agora;
  banco.exec([
    'CREATE TABLE IF NOT EXISTS loop_home_publicacoes_demo (',
    'id INTEGER PRIMARY KEY AUTOINCREMENT,',
    'tipo TEXT NOT NULL,titulo TEXT NOT NULL,descricao TEXT NOT NULL,',
    'link_destino TEXT,imagem_caminho TEXT,',
    "situacao TEXT NOT NULL CHECK(situacao IN ('PUBLICADA','ARQUIVADA')),",
    'publicada_em TEXT NOT NULL,arquivada_em TEXT)',
    ';'
  ].join(' '));
 }
 listar({incluirArquivadas=false}={}){
  const publicacoes=this.banco.prepare([
   'SELECT id,tipo,titulo,descricao,link_destino AS linkDestino,',
   'imagem_caminho AS imagemCaminho,situacao,publicada_em AS publicadaEm',
   'FROM loop_home_publicacoes_demo',
   incluirArquivadas?'':'WHERE situacao=\'PUBLICADA\'',
   'ORDER BY id DESC LIMIT 25'
  ].filter(Boolean).join(' ')).all();
  const existe=this.banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='loop_eventos_comerciais_especiais_demo'").get();
  if(!existe||incluirArquivadas)return publicacoes;
  const hoje=this.agora().slice(0,10);
  const procurar=this.banco.prepare("SELECT estado,data_inicio AS dataInicio,data_fim AS dataFim FROM loop_eventos_comerciais_especiais_demo WHERE publicacao_id=?");
  return publicacoes.filter(pub=>{
   const evento=procurar.get(pub.id);
   return !evento||(evento.estado==='ATIVO'&&(!evento.dataInicio||evento.dataInicio<=hoje)&&(!evento.dataFim||evento.dataFim>=hoje));
  });
 }
 publicar({tipo,titulo,descricao,linkDestino=null,imagemCaminho=null}={}){
  if(!TIPOS.includes(tipo)||
     typeof titulo!=='string'||titulo.trim().length<5||titulo.length>90||
     typeof descricao!=='string'||descricao.trim().length<8||descricao.length>450||
     (linkDestino!==null&&(!LINK_PERMITIDO.test(linkDestino)))||
     (tipo==='AKITEMM'&&linkDestino!=='/loja')||
     (imagemCaminho!==null&&
       (typeof imagemCaminho!=='string'||
        !/^\/imagens\/catalogo\/[a-zA-Z0-9_-]+\.(?:webp|png|jpg|jpeg)$/.test(imagemCaminho)))||
     /[\u0000-\u001f\u007f]/.test(titulo+descricao)){
    throw falha('PUBLICACAO_INVALIDA');
  }
  const registro=this.banco.prepare([
   'INSERT INTO loop_home_publicacoes_demo',
   '(tipo,titulo,descricao,link_destino,imagem_caminho,situacao,publicada_em)',
   "VALUES(?,?,?,?,?,'PUBLICADA',?)"
  ].join(' ')).run(tipo,titulo.trim(),descricao.trim(),linkDestino,imagemCaminho,this.agora());
  return {id:Number(registro.lastInsertRowid),situacao:'PUBLICADA'};
 }
 arquivar(id){
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<1)throw falha('PUBLICACAO_ID_INVALIDA');
  const r=this.banco.prepare([
   "UPDATE loop_home_publicacoes_demo SET situacao='ARQUIVADA',arquivada_em=?",
   "WHERE id=? AND situacao='PUBLICADA'"
  ].join(' ')).run(this.agora(),n);
  if(!r.changes)throw falha('PUBLICACAO_NAO_ENCONTRADA');
  return {id:n,situacao:'ARQUIVADA'};
 }
}
module.exports={PublicacoesHomeLoopV6DemoSQLite};
