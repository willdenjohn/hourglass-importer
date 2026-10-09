'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { lerFormulario } = require('./lib/formulario');
const { gerarModelo } = require('./lib/modelo');
const { nomeCompleto } = require('./lib/correspondencia');
const { criarCliente } = require('./lib/api');
const { escreverConferencia, lerConferencia } = require('./lib/conferencia');
const { carregarSessao } = require('./lib/sessao');
const { levantarFaltantes, imprimirFaltantes, salvarFaltantes } = require('./lib/faltantes');
const { caminhos, resumir, prepararConferencia, validarEnvio, enviarRelatorios, descreverRelatorio } = require('./lib/servico');

const ARQUIVOS = caminhos(__dirname);

const USO = `
Uso:
  node importar.js preparar <formulario.xlsx> <mes> <ano>
      Lê o Excel do Forms, cruza com o Hourglass e gera conferencias/conferencia-AAAA-MM.xlsx.
      Não envia nada.

  node importar.js enviar <conferencia-AAAA-MM.xlsx>
      Valida a conferência e mostra o que seria enviado (simulação).

  node importar.js enviar <conferencia-AAAA-MM.xlsx> --executar
      Envia ao Hourglass as linhas com Situação = ENVIAR.
      --limite=N envia só os N primeiros (útil para testar com 1).

  node importar.js faltantes
      Relatório de quem ainda não entregou no mês em aberto (gera conferencias/faltantes-AAAA-MM.xlsx).
      Também roda automaticamente ao final do envio.

  node importar.js modelo
      Gera modelo-relatorios.xlsx com as colunas esperadas e uma aba de instruções.

Sessão: sessao.json nesta pasta com {"hglogin": "...", "xsrf": "..."}.
Interface visual: node servidor.js (ou iniciar.bat).
`;

function perguntar(texto) {
  const leitor = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => leitor.question(texto, resposta => { leitor.close(); resolve(resposta.trim()); }));
}

function clienteDaSessao() {
  const sessao = carregarSessao(__dirname);
  if (!sessao) throw new Error('Preencha os cookies no sessao.json.');
  return criarCliente(sessao);
}

async function preparar(arquivo, mes, ano) {
  const respostas = lerFormulario(arquivo, ARQUIVOS.mapeamentos);
  console.log(`\nFormulário: ${respostas.length} respostas — ${String(mes).padStart(2, '0')}/${ano}`);
  const { itens, semResposta, publicadores, totalLancados } = await prepararConferencia(clienteDaSessao(), respostas, mes, ano, ARQUIVOS.apelidos);
  console.log(`Hourglass: ${publicadores.length} publicadores ativos, ${totalLancados} relatórios já lançados no mês.`);

  fs.mkdirSync(ARQUIVOS.conferencias, { recursive: true });
  const destino = ARQUIVOS.conferencia(mes, ano);
  escreverConferencia(destino, itens);

  console.log('\nResultado:', resumir(itens));
  console.log(`\nSem resposta no formulário e sem relatório no Hourglass (${semResposta.length}):`);
  semResposta.forEach(p => console.log(`  - ${nomeCompleto(p)}`));
  console.log(`\nConferência gerada: ${destino}`);
  console.log('Revise as linhas REVISAR / NÃO ENCONTRADO, ajuste os valores e mude a Situação para ENVIAR.\n');
}

function periodoDoArquivo(arquivo) {
  const achado = path.basename(arquivo).match(/(\d{4})-(\d{2})/);
  if (!achado) throw new Error('Nome da conferência deve conter AAAA-MM (ex.: conferencia-2026-09.xlsx).');
  return { ano: Number(achado[1]), mes: Number(achado[2]) };
}

async function enviar(arquivo, executar, limite) {
  const { ano, mes } = periodoDoArquivo(arquivo);
  const cliente = clienteDaSessao();
  const { comErro, pendentes, jaExistentes } = await validarEnvio(cliente, lerConferencia(arquivo), mes, ano, limite);

  comErro.forEach(p => console.log(`  [ERRO] linha ${p.item.linha} ${p.item.nomeFormulario}: ${p.erros.join('; ')}`));
  if (comErro.length) {
    console.log('\nCorrija os erros na conferência antes de enviar.\n');
    return;
  }
  jaExistentes.forEach(p => console.log(`  [JÁ EXISTE] ${p.item.nomeHourglass}`));
  pendentes.forEach(p => console.log(`  ${executar ? '[ENVIAR]' : '[SIMULAÇÃO]'} ${p.item.nomeHourglass} — ${descreverRelatorio(p)}`));

  if (!executar) {
    console.log(`\nSimulação: ${pendentes.length} relatórios seriam enviados. Para enviar, repita com --executar.\n`);
    return;
  }
  if (await perguntar(`\nEnviar ${pendentes.length} relatórios ao Hourglass? Digite ENVIAR para confirmar: `) !== 'ENVIAR') {
    console.log('Cancelado.\n');
    return;
  }

  const resultados = await enviarRelatorios(cliente, pendentes, r => console.log(r.ok ? `  [OK] ${r.nome}` : `  [FALHA] ${r.nome}: ${r.erro}`));
  console.log(`\nEnviados: ${resultados.filter(r => r.ok).length}/${pendentes.length}`);
  await relatorioFaltantes(cliente);
}

async function relatorioFaltantes(cliente) {
  const levantamento = await levantarFaltantes(cliente);
  imprimirFaltantes(levantamento);
  fs.mkdirSync(ARQUIVOS.conferencias, { recursive: true });
  const destino = ARQUIVOS.faltantes(levantamento.mes);
  salvarFaltantes(destino, levantamento);
  console.log(`\nPlanilha: ${destino}\n`);
}

async function main() {
  const [comando, ...resto] = process.argv.slice(2);
  const argumentos = resto.filter(a => !a.startsWith('--'));

  if (comando === 'preparar' && argumentos.length === 3) {
    const [arquivo, mes, ano] = argumentos;
    return preparar(arquivo, Number(mes), Number(ano));
  }
  if (comando === 'enviar' && argumentos.length === 1) {
    const limite = Number(resto.find(a => a.startsWith('--limite='))?.split('=')[1]) || undefined;
    return enviar(argumentos[0], resto.includes('--executar'), limite);
  }
  if (comando === 'faltantes') return relatorioFaltantes(clienteDaSessao());
  if (comando === 'modelo') {
    fs.writeFileSync('modelo-relatorios.xlsx', gerarModelo());
    return console.log('Modelo gerado: modelo-relatorios.xlsx');
  }
  console.log(USO);
  process.exitCode = 1;
}

main().catch(erro => {
  console.error(`\nErro: ${erro.message}\n`);
  process.exitCode = 1;
});
