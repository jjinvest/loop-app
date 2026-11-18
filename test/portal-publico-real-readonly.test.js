'use strict';
// Este teste so cria respostas falsas para testar o verificador.
// NENHUMA resposta e contada como prova do dominio real: para isso existe
// o workflow de rede separado, que chama o portal publicado.
const test=require('node:test');
const assert=require('node:assert/strict');
const {provarPortalPublicoReal}=require(
 '../scripts/provar-portal-publico-real-readonly');
function respostas({fechado=true}={}){
 const json=x=>JSON.stringify(x);
 const mapa={
  '/':{status:302,location:'/minha-conta'},
  '/healthz':{status:200,body:json({
   estado:'SERVICO_IDENTIDADE_SEPARADO',financeiroReal:false
  })},
  '/readyz':fechado?{status:503,body:json({
   estado:'CADASTRO_REAL_INATIVO',financeiroReal:false
  })}:{status:200,body:json({
   estado:'CADASTRO_REAL_PRONTO_SEM_FINANCEIRO',
   cadastroAtivo:true,financeiroReal:false
  })},
  '/minha-conta':{status:200,body:'id="formLogin" id="formCadastro"'},
  '/escritorio':{status:200,
   body:'/identidade/assets/tabuleiro-visual.js'},
  '/identidade/assets/operador-fotos.js':{status:200,
   body:'X-Foto-Versao-Esperada'},
  '/identidade/assets/vitrine-horizontal.css':{status:200,
   body:'ak-faixa-horizontal'},
  '/api/contas/me':{status:401},
  '/loja':{status:401},
  '/api/loja/catalogo':{status:401},
  '/api/operador/estado':{status:200,body:json({operador:false})},
  '/staging/contas/me':{status:410},
  '/laboratorio/loja':{status:410},
  '/api/loop/tesouraria-ensaio':{status:410},
  '/loja/VILELA':{status:303,
   location:'/escritorio?ref=vilela&origem=loja'}
 };
 return mapa;
}
function buscar(mapa){
 return async path=>{
  assert.ok(Object.hasOwn(mapa,path),'somente caminhos conhecidos: '+path);
  return {body:'',location:'',...mapa[path]};
 };
}
test('verificador local reconhece portal real fechado sem financiar nada',async()=>{
 const r=await provarPortalPublicoReal({buscar:buscar(respostas())});
 assert.equal(r.gateway,'REAL_SEM_LABORATORIO');
 assert.equal(r.cadastroPublico,'FECHADO');
 assert.equal(r.dinheiroRealHabilitado,false);
 assert.equal(r.indicacaoVilelaAtiva,true);
 assert.equal(r.contasAlteradas,0);
 assert.equal(r.produtosAlterados,0);
 assert.equal(r.pedidosAlterados,0);
});
test('verificador local tambem reconhece cadastro autorizado sem PSP real',async()=>{
 const r=await provarPortalPublicoReal({
  buscar:buscar(respostas({fechado:false}))
 });
 assert.equal(r.cadastroPublico,'LIBERADO');
 assert.equal(r.dinheiroRealHabilitado,false);
});
test('portal com laboratorio ativo falha; nao aceita falsa publicacao',async()=>{
 const mapa=respostas();
 mapa['/staging/contas/me'].status=200;
 await assert.rejects(
  provarPortalPublicoReal({buscar:buscar(mapa)}),
  /PROVA_PUBLICA_LABORATORIO_AINDA_ATIVO/
 );
});
test('portal com cliente anonimo autenticado ou operador aberto falha',async()=>{
 const m=respostas();
 m['/api/contas/me'].status=200;
 await assert.rejects(
  provarPortalPublicoReal({buscar:buscar(m)}),
  /PROVA_PUBLICA_SESSAO_CLIENTE_EXPOSTA/
 );
 const n=respostas();
 n['/api/operador/estado'].body='{"operador":true}';
 await assert.rejects(
  provarPortalPublicoReal({buscar:buscar(n)}),
  /PROVA_PUBLICA_OPERADOR_ANONIMO_PRIVILEGIADO/
 );
});
test('link de indicacao deve passar para escritorio da mesma pessoa',async()=>{
 const mapa=respostas();
 mapa['/loja/VILELA'].location='/staging/cliente?ref=VILELA';
 await assert.rejects(
  provarPortalPublicoReal({buscar:buscar(mapa)}),
  /PROVA_PUBLICA_LINK_INDICACAO_NAO_CONECTADO/
 );
});
test('html antigo, erro de gateway e financeiramente liberado sao recusados',async()=>{
 const m=respostas();
 m['/escritorio'].body+='/staging/assets/cliente.js';
 await assert.rejects(provarPortalPublicoReal({buscar:buscar(m)}),
  /PROVA_PUBLICA_ESCRITORIO_DEFINITIVO_AUSENTE/);
 const n=respostas();
 n['/healthz'].body='{"estado":"SERVICO_IDENTIDADE_SEPARADO","financeiroReal":true}';
 await assert.rejects(provarPortalPublicoReal({buscar:buscar(n)}),
  /PROVA_PUBLICA_NAO_E_IDENTIDADE_DEFINITIVA/);
 const o=respostas();
 o['/'].status=502;
 await assert.rejects(provarPortalPublicoReal({buscar:buscar(o)}),
  /PROVA_PUBLICA_ENTRADA_PRINCIPAL_INCORRETA/);
});
