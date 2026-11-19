'use strict';
// Contrato permanente: todo erro de autenticacao e de foto deve
// mostrar um motivo acionavel, sem revelar detalhes internos.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const raiz=path.resolve(__dirname,'..');
const ler=p=>fs.readFileSync(path.join(raiz,p),'utf8');

test('REAL mostra erro de acesso ao lado do formulario, sem apagar as telas',()=>{
 const html=ler('src/candidato/checkout-candidato-ui.html');
 const js=ler('src/producao/interface-aprovada-contas.js');
 for(const id of ['erroLogin','erroCadastro','statusFotoPerfil','formFotoPerfil',
  'arquivoFotoPerfil','loop03AlterarFotoTopo','loop03ImagemFotoTopo'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/id==='formLogin'\?'erroLogin'/);
 assert.match(js,/id==='formCadastro'\?'erroCadastro'/);
 assert.match(js,/\$\(avisoId\)\.hidden=false/);
 assert.match(js,/CREDENCIAIS_INVALIDAS:'Nick ou senha incorretos/);
 assert.match(js,/CSRF_INVALIDO:'Sua sessão expirou/);
 assert.match(js,/e\?\.status===503/);
 assert.match(js,/e\?\.name==='TypeError'/);
});
test('motivos da foto sao legiveis, em cada tipo de falha',()=>{
 const js=ler('src/producao/interface-aprovada-contas.js');
 const ini=js.indexOf('function explicarFalhaFotoReal(e){');
 const fim=js.indexOf('function avisarFalhaFotoReal(mensagem){',ini);
 assert.ok(ini>0&&fim>ini);
 const explicar=vm.runInNewContext('('+js.slice(ini,fim).trim()+')');
 for(const [entrada,termo] of [
  [{message:'FOTO_INVALIDA'},'inválida'],
  [{message:'FOTO_GRANDE_DEMAIS'},'3 MB'],
  [{message:'CSRF_INVALIDO'},'sessão expirou'],
  [{message:'FOTO_REAL_INDISPONIVEL',status:503},'armazenamento'],
  [{message:'OUTRO',status:413},'3 MB'],
  [{message:'OUTRO',status:415},'JPEG'],
  [{message:'OUTRO',status:401},'Sessão não autorizada'],
  [{message:'OUTRO',name:'TypeError'},'conexão']
 ]) assert.ok(explicar(entrada).includes(termo),JSON.stringify(entrada));
 assert.ok(!explicar({message:'STACK_TRACE_SECRETO',status:500}).includes('STACK_TRACE_SECRETO'));
 assert.match(js,/function avisarFalhaFotoReal\(mensagem\)/);
 assert.match(js,/alert\(mensagem\)/);
 assert.match(js,/dizer\(mensagem\)/);
});
test('foto continua em custodia REAL autenticada sem conceder acesso a terceiros',()=>{
 const server=ler('src/producao/servidor-identidade-loop.js');
 const ui=ler('src/producao/interface-aprovada-contas.js');
 assert.match(server,/app\.post\('\/api\/contas\/foto-perfil',protegido/);
 assert.match(server,/app\.get\('\/api\/contas\/foto-perfil',protegido/);
 assert.match(server,/CSRF_INVALIDO/);
 assert.match(ui,/headers:\{'Content-Type':preparada\.mime,'X-Loop-Csrf':csrf\}/);
 assert.match(ui,/const url='\/api\/contas\/foto-perfil\?revisao='/);
 assert.ok(!ui.includes('const url=URL.createObjectURL(blob)'),
  'a CSP REAL nao permite src blob:');
});
