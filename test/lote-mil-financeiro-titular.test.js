'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {BancadaModulosLoopSQLite}=require('../src/producao/bancada-modulos-loop-sqlite');
const {IdentidadeClienteLoopReal,COOKIE}=require('../src/producao/identidade-cliente-loop-sqlite');
const {SessaoAdminComercialSQLite,COOKIE_ADMIN}=require('../src/producao/sessao-admin-comercial-sqlite');
const {MotorLoopIntegradoSQLite}=require('../src/producao/motor-loop-integrado-sqlite');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');
const {CatalogoMultiDistribuidoresSQLite}=require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=require('../src/producao/controle-economico-loja-sqlite');
const {AuditoriaOperacionalSQLite}=require('../src/producao/auditoria-operacional-sqlite');
const {ManutencaoComercialSQLite}=require('../src/producao/manutencao-comercial-sqlite');
const ORIGEM='https://lote.example.invalid';
async function montar(t){
 const banco=new DatabaseSync(':memory:'),loteDb=new DatabaseSync(':memory:');
 let agora=Date.parse('2026-11-28T09:00:00-03:00');
 const doc='Documento de uso exclusivo dos testes locais para verificação da identidade, privacidade, aceites e associação de acompanhamento de participantes sem movimentação externa.';
 const contas=new IdentidadeClienteLoopReal({banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TESTE-TERMOS-1',texto:doc},privacidade:{versao:'LOOP-TESTE-PRIVACIDADE-1',texto:doc},enviarEmail:async()=>true});
 const docs=contas.documentos();
 for(const nick of ['thaiza','outro'])await contas.cadastrar({nome:'Titular '+nick,nick,email:nick+'@example.invalid',senha:'SenhaMuitoLonga2026!',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,versaoPrivacidade:docs.privacidade.versao,hashPrivacidade:docs.privacidade.hash});
 const ids=Object.fromEntries(banco.prepare('SELECT nick,id FROM loop_real_contas').all().map(x=>[x.nick,x.id]));
 const motor=new MotorLoopIntegradoSQLite({banco});
 const lote=new BancadaModulosLoopSQLite({banco:loteDb,agora:()=>agora,
  consultarAgenda:()=>({modo:'MANUAL',janelaInicio:'09:00',janelaFim:'18:00',metaCentrosDia:0})});
 lote.comandar({acao:'CATRACA_PREPARAR_1000',idOperacao:'preparar-lote-titulares'});
 const senhaAdmin='CredencialOperadorSomenteTeste2026!';
 const sessoes=new SessaoAdminComercialSQLite({banco,chaveAdmin:randomBytes(32),credencialAdmin:senhaAdmin});
 const admin=sessoes.autenticar(senhaAdmin);
 const auditoria=new AuditoriaOperacionalSQLite({banco,chaveAuditoria:randomBytes(32)});
 const manutencao=new ManutencaoComercialSQLite({banco,auditoria});
 const catalogo=new CatalogoMultiDistribuidoresSQLite({banco,distribuidorHomologado:()=>false,auditoria,manutencao});
 const controle=new ControleEconomicoLojaSQLite({banco,auditoria,manutencao});
 const app=criarAppIdentidadeLoop({contas,motorLoop:motor,origemHttps:ORIGEM,
  adminComercial:{sessoes,controle,catalogo,auditoria,manutencao,bancadaOperacional:lote}});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(ok=>server.close(ok));banco.close();loteDb.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const req=(path,{body,cookie,csrf,origin=ORIGEM}={})=>fetch(base+path,{method:body?'POST':'GET',headers:{
  ...(body?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-Loop-Admin-Csrf':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const cookies={};
 for(const nick of ['thaiza','outro']){
  const r=await req('/api/contas/entrar',{body:{nick,senha:'SenhaMuitoLonga2026!'}});
  assert.equal(r.status,200);cookies[nick]=r.headers.get('set-cookie').split(';')[0];assert.ok(cookies[nick].startsWith(COOKIE+'='));
 }
 const cookieAdmin=COOKIE_ADMIN+'='+admin.token;
 let op=0;
 const vincular=(nick,posicaoId,ativo=true,extra={})=>req('/api/admin/contas/acompanhamento-lote',{
  body:{nick,posicaoId,ativo,idOperacao:'vinculo-titular-'+(++op)},cookie:cookieAdmin,csrf:admin.csrf,...extra});
 return {banco,loteDb,lote,ids,req,cookies,base,cookieAdmin,vincular,pulso:()=>{agora+=1000;return lote.processarRelogio();}};
}
async function conferirNavegador(c){
 if(process.env.LOOP_CONFERIR_LOTE_NAVEGADOR!=='1')return;
 const {chromium}=require('playwright');
 const browser=await chromium.launch({headless:true});
 try{
  for(const visual of [{nome:'PC',viewport:{width:1440,height:1000},isMobile:false},{nome:'CELULAR',viewport:{width:390,height:844},isMobile:true}]){
   const context=await browser.newContext({viewport:visual.viewport,isMobile:visual.isMobile,
    extraHTTPHeaders:{Cookie:c.cookies.thaiza}});
   const page=await context.newPage();const erros=[];page.on('pageerror',e=>erros.push(e.message));
   await page.goto(c.base+'/escritorio');
   await page.locator('#painelConta').waitFor({state:'visible'});
   await page.locator('#loop03Giros24Integrado').filter({hasText:/^1$/}).waitFor();
   assert.equal(await page.locator('#loop03LuzesHoraIntegrado').innerText(),'6');
   if(visual.isMobile)await page.locator('#loop03MenuIntegrado').click();
   await page.locator('#abaFinanceiro').click();
   await page.locator('#finSaldoPosicoes').filter({hasText:/750,00/}).waitFor();
   assert.match(await page.locator('#estadoFinanceiro').innerText(),/Posições do lote: #1/);
   assert.match(await page.locator('#finSaldoSelecionado').innerText(),/—/);
   assert.match(await page.locator('#finBonusSaque').innerText(),/—/);
   await page.locator('#finAbrirHistorico').click();
   await page.locator('#finHistoricoItens').filter({hasText:/lote:/}).waitFor();
   assert.equal(await page.locator('#finHistoricoItens li').filter({hasText:'Participação de lucro'}).count(),3);
   assert.ok((await page.locator('#finHistoricoItens').innerText()).includes('#1'));
   assert.deepEqual(erros,[]);await context.close();
   console.log('LOTE_TITULAR_NAVEGADOR_'+visual.nome+'=FINANCEIRO_E_HISTORICO_CONFERIDOS');
  }
 }finally{await browser.close();}
}
test('luz roxa e bônus chegam ao Financeiro e ao Histórico do mesmo titular; outra conta fica isolada',async t=>{
 const c=await montar(t);
 assert.equal((await c.vincular('thaiza',1)).status,200);
 assert.equal((await c.vincular('outro',3)).status,200);
 let a=await (await c.req('/api/financeiro/me',{cookie:c.cookies.thaiza})).json();
 assert.equal(a.distribuicaoAcompanhada.saldoTotalPosicoesCentavos,0);
 assert.equal(a.distribuicaoAcompanhada.saldoBonusCentavos,0);
 assert.ok(a.distribuicaoAcompanhada.bonusDevidoCentavos>0);
 const realAntes=c.banco.prepare('SELECT * FROM loop_real_fin_lancamentos').all();
 c.lote.comandar({acao:'CATRACA_INICIAR',idOperacao:'start-apenas-teste-titular'});
 assert.equal(c.lote.consultar().catraca.tabuleiro.centroPosicao.numero,1);
 for(let i=0;i<6;i++)assert.equal(c.pulso().processado,true);
 a=await (await c.req('/api/financeiro/me',{cookie:c.cookies.thaiza})).json();
 const f=a.distribuicaoAcompanhada;
 const estado=await (await c.req('/api/loop/estado',{cookie:c.cookies.thaiza})).json();
 assert.equal(estado.distribuicaoAcompanhada.giros,1);
 assert.equal(estado.distribuicaoAcompanhada.agenda.fluxoControlado.contadores.eventosHoje,6);
 assert.ok(!JSON.stringify(estado.distribuicaoAcompanhada).includes(c.ids.outro));
 assert.equal(f.saldoTotalPosicoesCentavos,75000);
 assert.ok(f.saldoBonusCentavos>0);
 assert.equal(f.saldoBonusCentavos+f.bonusPendenteCentavos,f.bonusDevidoCentavos);
 assert.equal(f.saqueRealHabilitado,false);
 const adminFinanceiro=await (await c.req('/api/admin/loop/distribuicao-financeira?nick=thaiza',{cookie:c.cookieAdmin})).json();
 assert.deepEqual(adminFinanceiro.distribuicaoAcompanhada,f,'Minha Equipe e Financeiro do cliente leem os mesmos lançamentos');
 assert.equal(a.saldosLiberados,false,'projeção nunca libera saldo comercial');
 const h=await (await c.req('/api/financeiro/historico',{cookie:c.cookies.thaiza})).json();
 assert.equal(h.distribuicaoAcompanhada.registros.filter(x=>x.descricao==='Participação de lucro').length,3);
 assert.equal(h.distribuicaoAcompanhada.registros.reduce((n,x)=>n+x.valorCentavos,0),f.saldoTotalPosicoesCentavos+f.saldoBonusCentavos);
 assert.ok(h.distribuicaoAcompanhada.registros.every(x=>x.posicaoId===1&&x.referencia.startsWith('lote:')));
 const outro=await (await c.req('/api/financeiro/me',{cookie:c.cookies.outro})).json();
 assert.equal(outro.distribuicaoAcompanhada.saldoTotalPosicoesCentavos,0);
 assert.deepEqual(outro.distribuicaoAcompanhada.posicoes.map(x=>x.numero),[3]);
 assert.equal((await c.req('/api/financeiro/me?titularId='+c.ids.thaiza,{cookie:c.cookies.outro})).status,400);
 assert.deepEqual(c.banco.prepare('SELECT * FROM loop_real_fin_lancamentos').all(),realAntes);
 assert.equal(c.banco.prepare('SELECT COUNT(*) n FROM loop_real_contas').get().n,2);
 const leituraAntes=c.loteDb.prepare('SELECT total_changes() n').get().n;
 c.lote.consultarTitular({titularId:c.ids.thaiza});
 assert.equal(c.loteDb.prepare('SELECT total_changes() n').get().n,leituraAntes);
 const recuperado=new BancadaModulosLoopSQLite({banco:c.loteDb,agora:()=>Date.parse('2026-11-28T09:01:00-03:00'),consultarAgenda:()=>({modo:'MANUAL',janelaInicio:'09:00',janelaFim:'18:00',metaCentrosDia:0})});
 assert.deepEqual(recuperado.consultarTitular({titularId:c.ids.thaiza}),f,'reinício recupera associação, saldo e histórico');
 await conferirNavegador(c);
 c.lote.comandar({acao:'CATRACA_PAUSAR',idOperacao:'pausa-apenas-teste-titular'});
 assert.equal((await c.vincular('thaiza',1,false)).status,200);
 assert.equal((await (await c.req('/api/financeiro/me',{cookie:c.cookies.thaiza})).json()).distribuicaoAcompanhada,null);
 assert.equal(c.loteDb.prepare("SELECT COUNT(*) n FROM loop_teste_fluxo_lancamentos WHERE destino='LOOP_CENTRO' AND posicao=1").get().n,3,'encerrar só a observação preserva lançamentos');
 assert.equal(c.loteDb.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('associação exige operador, CSRF, cadastro existente, posição confirmada e titular imutável',async t=>{
 const c=await montar(t);
 assert.equal((await c.vincular('thaiza',1,true,{cookie:c.cookies.thaiza})).status,401);
 assert.equal((await c.vincular('thaiza',1,true,{csrf:'errado'})).status,403);
 assert.equal((await c.vincular('inexistente',1)).status,404);
 assert.equal((await c.vincular('thaiza',4)).status,409,'empresa não é titular cliente');
 assert.equal((await c.vincular('thaiza',2)).status,409,'azul não confirmada');
 assert.equal((await c.vincular('thaiza',1)).status,200);
 assert.equal((await c.vincular('outro',1)).status,409);
 assert.equal((await c.req('/api/financeiro/historico')).status,401);
 c.lote.comandar({acao:'CATRACA_INICIAR',idOperacao:'start-apenas-teste-travas'});
 assert.equal((await c.vincular('thaiza',3)).status,409,'não trocar associação durante execução');
});
test('acompanhamento limita dez posições por titular e encerra sem excluir lançamentos ou vínculo histórico',async t=>{
 const c=await montar(t);
 const confirmadas=c.loteDb.prepare("SELECT numero FROM loop_teste_fluxo_recebimentos WHERE tipo='CONFIRMADA' ORDER BY numero LIMIT 11").all();
 for(const p of confirmadas.slice(0,10))assert.equal((await c.vincular('thaiza',p.numero)).status,200);
 assert.equal((await c.vincular('thaiza',confirmadas[10].numero)).status,409);
 assert.equal((await c.vincular('thaiza',confirmadas[0].numero,false)).status,200);
 assert.equal((await c.vincular('thaiza',confirmadas[10].numero)).status,200);
 assert.equal((await c.vincular('outro',confirmadas[0].numero)).status,409,'encerrar não transfere titularidade');
 assert.equal(c.lote.consultarTitular({titularId:c.ids.thaiza}).posicoes.length,10);
});
