'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('central de comando possui caminhos existentes e relatorios rotulados',()=>{
 const root=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'src/laboratorio/admin-loop03.html'),'utf8');
 const server=fs.readFileSync(path.join(root,'src/laboratorio/servidor-catalogo.js'),'utf8');
 const routes=['/admin','/admin/cadastro-participantes-demo','/admin/circuit-break-v6','/admin/financeiro-demo','/admin/escritorio-demo'];
 for(const route of routes){
  assert.ok(html.includes('href="'+route+'"'),route);
  assert.ok(server.includes("app.get('"+route+"'")||server.includes('app.get("'+route+'"'),route);
 }
 for(const id of ['atalhosDirecaoAdmin','regraTrava','relatorioFinanceiroAdmin','auditoriaOperacionalAdmin','painelIndicacoesAdmin','controleRelogioAdminLoop03'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/Bolas douradas e contemplações: relatório detalhado ainda em desenvolvimento/);
 assert.match(html,/Nenhum giro, pagamento real, saque ou publicação é autorizado/);
});
