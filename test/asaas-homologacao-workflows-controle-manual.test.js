'use strict';
// Contratos CI: credenciais do Asaas Sandbox nunca executam em eventos automaticos.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const fluxos=['homologar-http-asaas-sandbox.yml','homologar-asaas-branch-loop.yml'];
for(const nome of fluxos){
 test('fluxo com segredo Asaas exige operador e SHA auditado: '+nome,()=>{
  const arquivo=readFileSync(join(__dirname,'../.github/workflows',nome),'utf8');
  assert.match(arquivo,/^on:\n  workflow_dispatch:/m);
  assert.match(arquivo,/    inputs:\n      autorizar:/);
  assert.match(arquivo,/inputs\.autorizar == 'SIM'/);
  assert.doesNotMatch(arquivo,/^  (push|pull_request|schedule|workflow_run):/m);
  assert.match(arquivo,/permissions:\n  contents: read/);
  assert.match(arquivo,/persist-credentials: false/);
  assert.match(arquivo,/ref: [a-f0-9]{40}/);
  assert.match(arquivo,/secrets\.ASAAS_SANDBOX_API_KEY/);
  assert.doesNotMatch(arquivo,/\bref:\s*(?:HEAD|main|fix\/)/);
 });
}
