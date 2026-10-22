'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
test('AKITEMM: só comprador de produto entregue ficticiamente avalia; moderação protege privacidade',async t=>{
 const repositorio=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repositorio.fechar());
 repositorio.salvar({produto:{
  id:'kit-fisico-teste',nome:'Kit físico fictício',tipo:'FISICO',estado:'PUBLICADO',
  descricao:'Produto fictício para ensaio de avaliações',precoCentavos:8000,
  entrega:'FORNECEDOR_INTEGRADO',fotos:[],detalhes:['Peso 150g'],
  videoApresentacaoUrl:null
 },revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repositorio.banco});
 const senha='senha-avaliacao-testes-2026';
 const a=contas.cadastrar({nome:'Comprador Avaliação Demo',email:'avaliacao-um@exemplo.invalid',senha});
 const b=contas.cadastrar({nome:'Outro Comprador Demo',email:'avaliacao-dois@exemplo.invalid',senha});
 const segredo='segredo-admin-avaliacoes-123456789012345678';
 const app=criarAppAdminLaboratorio({repositorio,segredo});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const headersCliente={'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 const headersAdmin={'Content-Type':'application/json',Authorization:'Bearer '+segredo};
 const call=async(path,{method='GET',cookie=null,body=null,admin=false}={})=>{
  const resp=await fetch(base+path,{
   method,headers:{...(admin?headersAdmin:headersCliente),...(cookie?{Cookie:cookie}:{})},
   ...(body===null?{}:{body:JSON.stringify(body)})
  });
  return {status:resp.status,data:await resp.json(),cookie:resp.headers.get('set-cookie')};
 };
 const login=async nome=>{
  const r=await call('/api/laboratorio/participante/entrar',{method:'POST',body:{nome,senha}});
  assert.equal(r.status,200);return r.cookie.split(';')[0];
 };
 const cookieA=await login(a.nome),cookieB=await login(b.nome);
 const prefix='/api/laboratorio/participante/loja';
 const adm='/api/admin';
 const pedidoItens={itens:[{produtoId:'kit-fisico-teste',quantidade:1}],participarLoop:false};
 assert.equal((await call(prefix+'/pedidos',{method:'POST',cookie:cookieA,body:pedidoItens})).status,409);
 const endereco={destinatario:'Pessoa destinatária fictícia',cep:'27260000',logradouro:'Rua Exemplo',
  numero:'12',complemento:'',bairro:'Centro',cidade:'Volta Redonda',uf:'RJ',
  telefone:'21999999999',referencia:''};
 assert.equal((await call(prefix+'/entrega',{method:'POST',cookie:cookieA,body:endereco})).status,200);
 const criado=await call(prefix+'/pedidos',{method:'POST',cookie:cookieA,body:pedidoItens});
 assert.equal(criado.status,201);const pedidoId=criado.data.pedido.pedidoId;
 const aval={pedidoId,produtoId:'kit-fisico-teste',nota:5,
  comentario:'Minha experiência fictícia foi bem organizada.'};
 assert.equal((await call(prefix+'/avaliacoes',{method:'POST',cookie:cookieA,body:aval})).status,409);
 assert.equal((await call(adm+'/akitemm-avaliacoes-demo/entregas',{
  method:'POST',admin:true,body:{pedidoId}
 })).status,409,'Sem pagamento confirmado não há entrega autorizada');
 const confirmou=await call(adm+'/carrinho-loop-demo/'+pedidoId+'/eventos',{
  method:'POST',admin:true,body:{eventoId:'pagamento-para-avaliacao-teste',tipo:'CONFIRMAR_FICTICIO'}
 });
 assert.equal(confirmou.status,200);
 const entregue=await call(adm+'/akitemm-avaliacoes-demo/entregas',{
  method:'POST',admin:true,body:{pedidoId}
 });
 assert.equal(entregue.status,200);assert.equal(entregue.data.semEntregaReal,true);
 const novamente=await call(adm+'/akitemm-avaliacoes-demo/entregas',{
  method:'POST',admin:true,body:{pedidoId}
 });
 assert.equal(novamente.status,200);assert.equal(novamente.data.repetido,true);
 const aptos=await call(prefix+'/avaliacoes/pendentes',{cookie:cookieA});
 assert.equal(aptos.data.itens.length,1);
 assert.equal(aptos.data.itens[0].statusAvaliacao,null);
 assert.equal((await call(prefix+'/avaliacoes/pendentes',{cookie:cookieB})).data.itens.length,0);
 assert.equal((await call(prefix+'/avaliacoes',{method:'POST',cookie:cookieB,body:aval})).status,409);
 const publicado=await call(prefix+'/avaliacoes/kit-fisico-teste',{cookie:cookieB});
 assert.deepEqual(publicado.data.avaliacoes,[]);
 assert.equal((await call(prefix+'/avaliacoes',{method:'POST',cookie:cookieA,body:aval})).status,201);

 // Upload real dos anexos da avaliação — os arquivos são privados até moderar.
 function jpeg(){
  const exif=Buffer.from('Exif GPS_SEGREDO_DA_FOTO');
  const app=Buffer.alloc(4);app[0]=255;app[1]=225;app.writeUInt16BE(exif.length+2,2);
  return Buffer.concat([Buffer.from([255,216]),app,exif,
   Buffer.from([255,192,0,11,8,0,2,0,2,1,1,17,0]),
   Buffer.from([255,218,0,8,1,1,0,0,63,0]),Buffer.alloc(200,0x71),
   Buffer.from([255,217])]);
 }
 function box(t,b){const h=Buffer.alloc(8);h.writeUInt32BE(b.length+8,0);h.write(t,4);return Buffer.concat([h,b]);}
 function mp4(seg){
  const h=Buffer.alloc(12);h.write('vide',8);
  const m=Buffer.alloc(20);m.writeUInt32BE(1000,12);m.writeUInt32BE(seg*1000,16);
  return Buffer.concat([box('ftyp',Buffer.from('isom0000iso2')),
   box('moov',Buffer.concat([box('mvhd',m),box('trak',box('mdia',box('hdlr',h)))])),
   box('mdat',Buffer.alloc(2048,0x6b))]);
 }
 const upload=async(cookie,tipo,mime,bytes)=>{
  const resp=await fetch(base+prefix+'/avaliacoes/'+pedidoId+'/kit-fisico-teste/midias',{
   method:'POST',headers:{Cookie:cookie,'Content-Type':mime,'X-LOOP-LAB':'participante',
    'X-AKITEMM-MIDIA-TIPO':tipo},body:bytes
  });
  return {status:resp.status,data:await resp.json()};
 };
 const arquivo=jpeg();
 assert.equal((await upload(cookieB,'FOTO','image/jpeg',arquivo)).status,409,
  'Outra conta nunca pode anexar à avaliação do titular');
 const fotos=[];
 for(let i=0;i<3;i++){
  const r=await upload(cookieA,'FOTO','image/jpeg',arquivo);
  assert.equal(r.status,201);fotos.push(r.data.id);
 }
 assert.equal((await upload(cookieA,'FOTO','image/jpeg',arquivo)).status,409,
  'Uma quarta fotografia deve ser bloqueada no servidor');
 const videoLongo=await upload(cookieA,'VIDEO','video/mp4',mp4(31));
 assert.equal(videoLongo.status,400);assert.equal(videoLongo.data.erro,'VIDEO_DURACAO_INVALIDA');
 const videoOk=await upload(cookieA,'VIDEO','video/mp4',mp4(30));
 assert.equal(videoOk.status,201);
 assert.equal((await upload(cookieA,'VIDEO','video/mp4',mp4(30))).status,409);
 const urlMidia=prefix+'/avaliacoes/midias/'+fotos[0];
 const getMidia=async cookie=>fetch(base+urlMidia,{headers:{Cookie:cookie}});
 assert.equal((await getMidia(cookieB)).status,404,'Foto privada não é pública antes da moderação');
 const fotoPrivada=await getMidia(cookieA);
 assert.equal(fotoPrivada.status,200);
 assert.equal(Buffer.from(await fotoPrivada.arrayBuffer()).includes(Buffer.from('GPS_SEGREDO')),false,
  'EXIF removido antes de gravar no SQLite');
 assert.equal((await fetch(base+urlMidia)).status,401);
 const listaAdmin=await call(adm+'/akitemm-avaliacoes-demo',{admin:true});
 assert.equal(listaAdmin.data.pendentes.length,1);
 assert.equal(listaAdmin.data.pendentes[0].midias.length,4);
 const v=await fetch(base+adm+'/akitemm-avaliacoes-demo/midias/'+videoOk.data.id,{
  headers:{Authorization:'Bearer '+segredo}
 });
 assert.equal(v.status,200);

 assert.equal((await call(prefix+'/avaliacoes',{method:'POST',cookie:cookieA,body:aval})).status,409);
 assert.deepEqual((await call(prefix+'/avaliacoes/kit-fisico-teste',{cookie:cookieB})).data.avaliacoes,[]);
 const moderacao=await call(adm+'/akitemm-avaliacoes-demo',{admin:true});
 assert.equal(moderacao.data.pendentes.length,1);
 const id=moderacao.data.pendentes[0].id;
 assert.equal((await call(adm+'/akitemm-avaliacoes-demo/moderar',{
  method:'POST',admin:true,
  body:{id,status:'APROVADA',imagemCaminho:'/imagens/catalogo/depoimento.webp'}
 })).status,200);
 assert.equal((await call(adm+'/akitemm-avaliacoes-demo/moderar',{
  method:'POST',admin:true,
  body:{id,status:'APROVADA',imagemCaminho:null}
 })).status,409);
 const publicas=await call(prefix+'/avaliacoes/kit-fisico-teste',{cookie:cookieB});
 assert.equal(publicas.data.avaliacoes.length,1);
 assert.equal(publicas.data.avaliacoes[0].nota,5);
 assert.equal(publicas.data.avaliacoes[0].imagemCaminho,'/imagens/catalogo/depoimento.webp');
 assert.equal(publicas.data.avaliacoes[0].midias.length,4);
 assert.equal(publicas.data.avaliacoes[0].midias.filter(m=>m.tipo==='FOTO').length,3);
 assert.equal(publicas.data.avaliacoes[0].midias.filter(m=>m.tipo==='VIDEO').length,1);
 assert.equal(publicas.data.avaliacoes[0].midias.find(m=>m.tipo==='VIDEO').duracaoSegundos,30);
 assert.equal((await getMidia(cookieB)).status,200,'Mídia aprovada fica disponível aos compradores autenticados');
 assert.equal(JSON.stringify(publicas.data).includes(cookieA),false);
 assert.equal(JSON.stringify(publicas.data).includes(a.contaId),false);
 assert.equal(JSON.stringify(publicas.data).includes(pedidoId),false);
 const pend=await call(prefix+'/avaliacoes/pendentes',{cookie:cookieA});
 assert.equal(pend.data.itens[0].statusAvaliacao,'APROVADA');
});
