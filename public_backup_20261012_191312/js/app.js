async function atualizarFilas(){
  try{
    const r=await fetch('/filas');
    const dados=await r.json();
    document.getElementById('totalA').textContent =
      dados.amarelo?.length ?? dados.filaA?.length ?? 0;
    document.getElementById('totalB').textContent =
      dados.branco?.length ?? dados.filaB?.length ?? 0;
  }catch(e){}
}
atualizarFilas();
