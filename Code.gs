/**
 * Portal SAF - v1.0
 * Backend - Google Apps Script (arquivo único: dev-server.js foi removido do
 * projeto Apps Script em 2026-07-25, não faz parte deste runtime)
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('EHS Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Retorna os dados iniciais necessários para montar a tela:
 * nome do usuário logado, extraído do e-mail corporativo.
 */
function obterDadosIniciais() {
  var nome = 'Guardião';

  try {
    var email = Session.getActiveUser().getEmail();

    if (email && email.indexOf('@') > -1) {
      var parteLocal = email.split('@')[0];
      var primeiroNome = parteLocal.split('_')[0];

      if (primeiroNome) {
        primeiroNome = primeiroNome.toLowerCase();
        nome = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1);
      }
    }
  } catch (e) {
    nome = 'Guardião';
  }

  return {
    nome: nome
  };
}

/**
 * ===================================================
 * CRUZ DE SEGURANÇA
 * Fonte: planilha "Cruz Verde_RC 2026", aba "Compilado {ano}"
 * Colunas usadas: E = Tipo de evento, F = Data, I = Departamento (eixo único
 * de agrupamento — filtro de Área da Cruz, grid, tabela de totais, feed,
 * Pareto E o filtro próprio da Pirâmide usam todos a mesma coluna I, com
 * grafias variantes unificadas — ver obterRotuloCanonicoArea_)
 * ===================================================
 */
var BASE_HHT_SPREADSHEET_ID = '13izWV3jc2LG89AlYj50_5lMqiUHOhp9b5p4sUfp3a5Y';

var CRUZ_SEGURANCA_SEVERIDADE = [
  'Acidente com afastamento',
  'Acidente sem afastamento',
  'Primeiros Socorros',
  'Quase acidente',
  'Princípio de Incêndio',
  'Sem ocorrência'
];

var CRUZ_SEGURANCA_CORES = {
  'Acidente com afastamento': 'vermelho',
  'Acidente sem afastamento': 'laranja',
  'Primeiros Socorros': 'amarelo',
  'Quase acidente': 'azul',
  'Princípio de Incêndio': 'cinza',
  'Sem ocorrência': 'verde'
};

/**
 * A coluna "Tipo de evento" usa termos Gensuite (em inglês) em vez dos nomes
 * das categorias acima — ex: "Near Miss", "First Aid", "Recordable NLTA".
 * Por isso a classificação abaixo compara por TRECHO normalizado (sem acento/
 * maiúsculas) em vez de igualdade exata, pra resistir a pequenas variações de
 * grafia. Ordem importa: a primeira chave que bater é usada.
 */
var CRUZ_SEGURANCA_REGRAS_TEXTO = [
  { chave: 'recordable lta', tipo: 'Acidente com afastamento' },
  { chave: 'recordable nlta', tipo: 'Acidente sem afastamento' },
  { chave: 'first aid', tipo: 'Primeiros Socorros' },
  { chave: 'near miss', tipo: 'Quase acidente' },
  { chave: 'incendio', tipo: 'Princípio de Incêndio' },
  { chave: 'fire', tipo: 'Princípio de Incêndio' },
  { chave: 'sem ocorrencia', tipo: 'Sem ocorrência' }
];

var DOJO_SPREADSHEET_ID_ = '1K7tNDA6Ml75CetWADXOdrn6Qp2qfPqxPTHsLSB3rmIo';
var DOJO_ABA_ = 'Trat';
var DOJO_TOTAL_COLABORADORES_ = 3634;
var DOJO_CACHE_CHAVE_ = 'dojoResumo_v1';

function normalizarTexto_(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function classificarTipoEvento_(valorBruto) {
  var normalizado = normalizarTexto_(valorBruto);

  for (var i = 0; i < CRUZ_SEGURANCA_REGRAS_TEXTO.length; i++) {
    if (normalizado.indexOf(CRUZ_SEGURANCA_REGRAS_TEXTO[i].chave) !== -1) {
      return CRUZ_SEGURANCA_REGRAS_TEXTO[i].tipo;
    }
  }

  return null; // valor não reconhecido — a linha é ignorada
}

/**
 * A "Descrição das ocorrências" fica na coluna M (índice 12) da aba
 * "Compilado {ano}".
 */
function extrairDescricao_(linha) {
  var valor = String(linha[12] || '').trim();
  if (valor && valor !== '-' && valor !== '----') {
    return valor;
  }
  return '';
}

/**
 * Normaliza um texto (Departamento ou Área) pra uma CHAVE estável: sem
 * acento, minúsculo, e qualquer pontuação/espaçamento (hífen, barra, ponto,
 * espaços múltiplos) colapsado num único espaço — pra bater com as chaves
 * do mapeamento independente de formatação exata na planilha.
 */
function normalizarChaveTexto_(bruto) {
  return normalizarTexto_(bruto)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * ===================================================
 * CACHE
 * O CacheService tem teto de ~100KB POR CHAVE, e o pacote completo de um ano
 * da Cruz (com as descrições das ocorrências, texto livre) passa disso. Em vez
 * de desistir do cache, o JSON é quebrado em pedaços gravados em N chaves mais
 * uma chave de índice com a contagem.
 *
 * Se QUALQUER pedaço tiver sido despejado (o CacheService pode expulsar antes
 * do TTL), a leitura devolve null e o dado é recalculado — nunca se monta um
 * JSON pela metade.
 * ===================================================
 */
/**
 * METAS DA ROTINA DO PILAR — decididas na reunião com a Beatriz (ata
 * "Página 1 - One page", registrada em 2026-08-12).
 *
 * São META, nunca realizado. A fonte do realizado de Expansão S3 / Extensão S4
 * continua não configurada, e a tela diz isso na cara — número acordado em
 * reunião e número medido em planta são coisas diferentes, e exibir os dois com
 * a mesma cara é o jeito mais rápido de a página mentir sem ninguém notar.
 *
 * Quando a fonte do realizado aparecer, preencher `realizado` no bloco `rotina`
 * de montarResumoHome_ — o card já sabe desenhar os dois lado a lado.
 */
var META_EXPANSAO_S3_ = 62.84;
var META_EXTENSAO_S4_ = 55.88;
var META_ROTINA_ORIGEM_ = 'Meta definida em reunião (ata One page)';

/**
 * Certificação de STEP acordada na mesma reunião: STEP 3 até MARÇO e STEP 4 até
 * DEZEMBRO, para as áreas de pontuação > 20. Vira marco na linha do tempo das
 * auditorias (mês = 1-based).
 */
var SAF_CERTIFICACAO_ALVO_ = [
  { step: 3, mesLimite: 3, rotulo: 'STEP 3 até março' },
  { step: 4, mesLimite: 12, rotulo: 'STEP 4 até dezembro' }
];

// Alterado de 6h para 1h30 (5400 segundos)
var CACHE_SEGUNDOS_6H_ = 5400;

// TTL curto, reservado ao que ainda recebe lançamento HOJE (ver
// cruzSegundosCache_). 6h num dado vivo significa ocorrência já digitada na
// planilha que só aparece na tela horas depois.
var CACHE_SEGUNDOS_30MIN_ = 1800;

// 45 mil caracteres por pedaço: o limite de 100KB é em BYTES, e texto com
// acento gasta 2 bytes por caractere em UTF-8 — 45k dá folga no pior caso.
var CACHE_PEDACO_CHARS_ = 45000;
var CACHE_MAX_PEDACOS_ = 40;

function cacheGravarGrande_(chave, objeto, segundos) {
  var json = JSON.stringify(objeto);
  var mapa = {};
  var total = 0;

  for (var i = 0; i < json.length; i += CACHE_PEDACO_CHARS_) {
    if (total >= CACHE_MAX_PEDACOS_) return false; // grande demais: segue sem cache
    mapa[chave + '_p' + total] = json.substring(i, i + CACHE_PEDACO_CHARS_);
    total++;
  }

  if (!total) return false;

  // O índice é gravado por ÚLTIMO: enquanto ele não existe, cacheLerGrande_
  // trata como "sem cache", então nunca se lê um conjunto pela metade.
  CacheService.getScriptCache().putAll(mapa, segundos);
  CacheService.getScriptCache().put(chave + '_idx', String(total), segundos);
  return true;
}

function cacheLerGrande_(chave) {
  var cache = CacheService.getScriptCache();
  var total = Number(cache.get(chave + '_idx'));
  if (!total) return null;

  var nomes = [];
  for (var i = 0; i < total; i++) nomes.push(chave + '_p' + i);

  var partes = cache.getAll(nomes);
  var json = '';
  for (var j = 0; j < total; j++) {
    var pedaco = partes[chave + '_p' + j];
    if (pedaco === undefined || pedaco === null) return null; // pedaço despejado
    json += pedaco;
  }

  try {
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function cacheRemoverGrande_(chave) {
  var cache = CacheService.getScriptCache();
  var total = Number(cache.get(chave + '_idx')) || CACHE_MAX_PEDACOS_;
  var nomes = [chave + '_idx'];
  for (var i = 0; i < total; i++) nomes.push(chave + '_p' + i);
  cache.removeAll(nomes);
}

var TAG_SAF_SPREADSHEET_ID = '1a8cWEh_opmrR_7JzT2brkTIkI7HHwxLDxdPpU627hjQ';
// v2 em 2026-07-28: passou de chave única (teto silencioso de ~95KB) pra cache
// FATIADO via cacheGravarGrande_/cacheLerGrande_ — a chave antiga guardava o
// JSON inteiro num put simples e ficaria ilegível pro leitor fatiado.
var TAG_SAF_CACHE_CHAVE_ = 'tagSafTotaisPorAno_v2';
var TAG_SAF_CACHE_SEGUNDOS_ = 5400; // 1.5h — base de ~65 mil linhas

/* ===================================================
 * TAG SAFETY (formulário TAG DIGITAL) — matriz de risco
 *
 * OUTRA planilha, não confundir com a TAG_SAF_SPREADSHEET_ID acima. Aquela é a
 * base consolidada (~65 mil linhas, coluna RELATO) que alimenta os 2 níveis de
 * baixo da Pirâmide. Esta é a planilha de RESPOSTAS do formulário TAG DIGITAL
 * (~9,6 mil respostas, nov/2025 em diante), onde cada resposta traz uma
 * avaliação de risco feita por quem apontou: probabilidade x severidade.
 * =================================================== */
// Este MESMO workbook tem uma segunda aba de respostas, "Respostas ao formulário 5",
// que cobre todas as vertentes do programa e alimenta o KPI da home — ver
// PROGRAMA_TAG_SPREADSHEET_ID_ mais abaixo. As duas recebem dados em paralelo.
var TAG_SAFETY_SPREADSHEET_ID_ = '10jrNXHGOZwAdSLSCP3gVtJaUAV1FF97xyDvvHjFD1bE';
var TAG_SAFETY_ABA_ = 'TAG SAFETY';
// v2: saiu a matriz de risco, entrou porAreaMes. Mudou o formato, sobe a versão.
var TAG_SAFETY_CACHE_CHAVE_ = 'tagSafetyMatriz_v2';

// Coluna D (índice 3) = "Área que identificou o problema". Só é usada se a busca
// pelo cabeçalho falhar — ver obterTagSafety_.
var TAG_SAFETY_COLUNA_AREA_PADRAO_ = 3;

function localizarColuna_(cabecalhos, chaveNormalizada) {
  for (var i = 0; i < cabecalhos.length; i++) {
    if (normalizarChaveTexto_(cabecalhos[i]) === chaveNormalizada) return i;
  }
  throw new Error('Coluna "' + chaveNormalizada + '" não encontrada na aba "BASE TAG - SAF".');
}

function incrementarTagSaf_(estrutura, ano, chave, mes, dia, tipo, descricao) {
  if (!estrutura[ano]) estrutura[ano] = {};
  if (!estrutura[ano][chave]) estrutura[ano][chave] = {};
  if (!estrutura[ano][chave][mes]) estrutura[ano][chave][mes] = { 
      condicaoInsegura: 0, comportamentoInseguro: 0,
      registros: { condicaoInsegura: [], comportamentoInseguro: [] } 
  };

  estrutura[ano][chave][mes][tipo]++;

  if (descricao && estrutura[ano][chave][mes].registros[tipo].length < 60) {
    estrutura[ano][chave][mes].registros[tipo].push({
      dia: dia,
      tipoEvento: tipo === 'condicaoInsegura' ? 'Condição Insegura' : 'Comportamento Inseguro',
      departamento: chave,
      descricao: descricao.slice(0, 250)
    });
  }
}

/**
 * CONDIÇÃO INSEGURA / COMPORTAMENTO INSEGURO — base separada (planilha própria
 * "BASE TAG - SAF", aba de mesmo nome, ~65 mil linhas). Fecha os 2 níveis da
 * Pirâmide de Segurança que nunca existiram na Compilado (confirmado antes via
 * debugAreasCompiladoAno).
 *
 * A coluna "RELATO" já traz o texto direto: "CONDIÇÃO INSEGURA", "ATO INSEGURO
 * - SEGURANÇA..." (= comportamento inseguro) ou "ATO SEGURO" (observação
 * positiva, ignorada aqui).
 *
 * Agrupado pela coluna "departamento gensuite" BRUTA (mesma taxonomia da
 * coluna I da Compilado, mas grafia pode variar) — quem reconcilia com o
 * rótulo canônico de Área (pós-deduplicação) é getCruzAnoCompleto, via
 * reconciliarTagSafComAreas_.
 *
 * Colunas são localizadas pelo NOME do cabeçalho (não por letra fixa) pra não
 * depender da ordem exata das ~37 colunas da aba. Só lê as 3 colunas
 * necessárias — não a linha inteira, que tem colunas de texto livre longas
 * (relato detalhado, ação tomada) que não interessam aqui.
 *
 * Resultado (só contagens, não as linhas brutas) é cacheado via CacheService —
 * a planilha é grande e não muda a cada troca de filtro/usuário.
 * Formato: { [ano]: { [departamentoBruto|'Todas']: { [mes]: { condicaoInsegura, comportamentoInseguro } } } }
 */
function obterTotaisTagSaf_(forcar) {
  if (!forcar) {
    var cacheado = cacheLerGrande_(TAG_SAF_CACHE_CHAVE_);
    if (cacheado) return cacheado;
  }

  var planilha = SpreadsheetApp.openById(TAG_SAF_SPREADSHEET_ID);
  var aba = planilha.getSheetByName('BASE TAG - SAF');
  if (!aba) throw new Error('Aba "BASE TAG - SAF" não encontrada.');

  var ultimaLinha = aba.getLastRow();
  var resultado = {};

  if (ultimaLinha >= 2) {
    var cabecalhos = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
    var colData = localizarColuna_(cabecalhos, 'data');
    var colRelato = localizarColuna_(cabecalhos, 'relato');
    var colDepartamento = localizarColuna_(cabecalhos, 'departamento gensuite');
    
    // NOVO: Busca a coluna de descrição (comentários)
    var colDescricao = localizarColunaPorTermo_(cabecalhos, 'descreva');
    if (colDescricao === -1) colDescricao = 9; // Fallback para a posição J

    var numLinhas = ultimaLinha - 1;
    var valoresData = aba.getRange(2, colData + 1, numLinhas, 1).getValues();
    var valoresRelato = aba.getRange(2, colRelato + 1, numLinhas, 1).getValues();
    var valoresDepartamento = aba.getRange(2, colDepartamento + 1, numLinhas, 1).getValues();
    var valoresDescricao = aba.getRange(2, colDescricao + 1, numLinhas, 1).getValues();
    var fuso = aba.getParent().getSpreadsheetTimeZone();

    for (var i = 0; i < numLinhas; i++) {
      var data = valoresData[i][0];
      if (!(data instanceof Date)) continue;

      var relatoNorm = normalizarTexto_(valoresRelato[i][0]);
      var tipo = null;
      if (relatoNorm.indexOf('condicao insegura') !== -1) tipo = 'condicaoInsegura';
      else if (relatoNorm.indexOf('ato inseguro') !== -1) tipo = 'comportamentoInseguro';
      if (!tipo) continue;

      var ano = Number(Utilities.formatDate(data, fuso, 'yyyy'));
      var mes = Number(Utilities.formatDate(data, fuso, 'M'));
      var dia = Number(Utilities.formatDate(data, fuso, 'd'));
      var departamento = String(valoresDepartamento[i][0] || '').trim();
      var descricao = String(valoresDescricao[i][0] || '').trim();

      incrementarTagSaf_(resultado, ano, 'Todas', mes, dia, tipo, descricao);
      if (departamento) incrementarTagSaf_(resultado, ano, departamento, mes, dia, tipo, descricao);
    }
  }

  cacheGravarGrande_(TAG_SAF_CACHE_CHAVE_, resultado, TAG_SAF_CACHE_SEGUNDOS_);
  return resultado;
}

/**
 * Lê a planilha de respostas do TAG DIGITAL e devolve, por ano, o volume mensal
 * de apontamentos e a quebra Área × Mês.
 *
 * A classificação de risco (probabilidade x severidade) que existia aqui foi
 * REMOVIDA a pedido do usuário em 2026-07-27. Se voltar a ser pedida: as escalas
 * eram ['muito improvavel','improvavel','provavel','muito provavel'] e
 * ['dano leve','dano moderado','dano extremo'], e só as linhas da vertente
 * Safety as preenchiam.
 *
 * COMO AS COLUNAS SÃO LOCALIZADAS. Os cabeçalhos aqui são perguntas inteiras de
 * formulário, longas e fáceis de mudar quando alguém edita o formulário; pior, o
 * layout que eu tinha em mãos veio de um PDF exportado, onde o cabeçalho aparece
 * TRUNCADO pela largura da coluna. Por isso a data é achada por cabeçalho
 * ("carimbo de data/hora") com queda para "primeira coluna que contém Date", e a
 * área por termo parcial ("identificou") com queda para a posição fixa D.
 *
 * Formato: { [ano]: { porMes: number[12], porAreaMes: { area: number[12] },
 *                     total } , _meta: {...} }
 */
function obterTagSafety_(forcar) {
  var cache = CacheService.getScriptCache();
  if (!forcar) {
    var cacheado = cache.get(TAG_SAFETY_CACHE_CHAVE_);
    if (cacheado) return JSON.parse(cacheado);
  }

  var planilha = SpreadsheetApp.openById(TAG_SAFETY_SPREADSHEET_ID_);
  // Mesma tolerância a acento/espaço usada na aba irmã "Respostas ao formulário 5".
  var aba = localizarAbaTolerante_(planilha, TAG_SAFETY_ABA_);
  if (!aba) {
    throw new Error('Aba "' + TAG_SAFETY_ABA_ + '" não encontrada. Abas disponíveis: ' +
      planilha.getSheets().map(function (s) { return s.getName(); }).join(', '));
  }

  var resultado = { _meta: {} };
  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return resultado;

  var ultimaColuna = aba.getLastColumn();
  var dados = aba.getRange(1, 1, ultimaLinha, ultimaColuna).getValues();
  var cabecalhos = dados[0];
  var fuso = aba.getParent().getSpreadsheetTimeZone();

  var colData = localizarColuna_(cabecalhos, 'carimbo de data hora');
  if (colData === -1) colData = localizarColunaPorData_(dados);

  // Área = coluna D, "Área que identificou o problema". A aba tem DUAS colunas de
  // área — esta e a H ("onde foi cometida a condição insegura") — então a busca
  // exige o termo "identificou", senão pegaria a errada. Se o cabeçalho mudar,
  // cai na posição fixa D (índice 3), que foi a indicada pelo usuário.
  var colAreaPorNome = localizarColunaPorTermo_(cabecalhos, 'identificou');
  var colArea = colAreaPorNome === -1 ? TAG_SAFETY_COLUNA_AREA_PADRAO_ : colAreaPorNome;

  resultado._meta = {
    linhas: ultimaLinha - 1,
    colunaData: colData,
    colunaArea: colArea,
    origemColunaArea: colAreaPorNome === -1 ? 'posicao_fixa_D' : 'cabecalho'
  };

  // Sem a data não dá pra separar por ano/mês — devolve o esqueleto com o _meta
  // pra que o debugTagSafety diga o que faltou, em vez de estourar.
  if (colData === -1) return resultado;

  for (var i = 1; i < dados.length; i++) {
    var data = dados[i][colData];
    if (!(data instanceof Date)) continue;

    var ano = Number(Utilities.formatDate(data, fuso, 'yyyy'));
    var mes = Number(Utilities.formatDate(data, fuso, 'M'));
    if (!resultado[ano]) resultado[ano] = criarBlocoTagSafety_();
    var bloco = resultado[ano];

    bloco.total++;
    bloco.porMes[mes - 1]++;

    // Área × mês. Guardada pela grafia BRUTA aqui; a deduplicação de variantes
    // ("LOGISTICA INTERNA" / "Logistica" / "Lógistica interna") é feita depois,
    // em consolidarAreasTagSafety_, com o mesmo critério usado na Cruz.
    // (colArea sempre existe: a busca por cabeçalho tem queda pra posição fixa D.)
    var area = String(dados[i][colArea] || '').trim();
    if (area) {
      if (!bloco.porAreaMes[area]) {
        bloco.porAreaMes[area] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      }
      bloco.porAreaMes[area][mes - 1]++;
    }
  }

  Object.keys(resultado).forEach(function (ano) {
    if (ano === '_meta') return;
    resultado[ano].porAreaMes = consolidarAreasTagSafety_(resultado[ano].porAreaMes);
  });

  var json = JSON.stringify(resultado);
  if (json.length < 95000) cache.put(TAG_SAFETY_CACHE_CHAVE_, json, TAG_SAF_CACHE_SEGUNDOS_);
  return resultado;
}

function criarBlocoTagSafety_() {
  return {
    porMes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    porAreaMes: {},
    total: 0
  };
}

/**
 * Junta grafias diferentes da mesma área num rótulo só, escolhendo a MAIS
 * FREQUENTE como nome exibido — mesmo critério já usado na Cruz
 * (obterRotuloCanonicoArea_). Sem isso a tabela mostraria a mesma área em duas
 * ou três linhas por causa de acento/caixa/espaço.
 */
function consolidarAreasTagSafety_(porAreaMes) {
  var grupos = {};

  Object.keys(porAreaMes).forEach(function (bruta) {
    var chave = normalizarChaveTexto_(bruta);
    if (!grupos[chave]) grupos[chave] = { grafias: {}, meses: [0,0,0,0,0,0,0,0,0,0,0,0] };

    var total = porAreaMes[bruta].reduce(function (a, b) { return a + b; }, 0);
    grupos[chave].grafias[bruta] = (grupos[chave].grafias[bruta] || 0) + total;
    porAreaMes[bruta].forEach(function (v, i) { grupos[chave].meses[i] += v; });
  });

  var consolidado = {};
  Object.keys(grupos).forEach(function (chave) {
    var grafias = grupos[chave].grafias;
    var rotulo = Object.keys(grafias).sort(function (a, b) { return grafias[b] - grafias[a]; })[0];
    consolidado[rotulo] = grupos[chave].meses;
  });
  return consolidado;
}

/** Índice da 1ª coluna cujo cabeçalho normalizado contém o termo. */
function localizarColunaPorTermo_(cabecalhos, termo) {
  for (var i = 0; i < cabecalhos.length; i++) {
    if (normalizarChaveTexto_(cabecalhos[i]).indexOf(termo) !== -1) return i;
  }
  return -1;
}

function localizarColunaPorData_(dados) {
  var limite = Math.min(dados.length, 51);
  for (var c = 0; c < dados[0].length; c++) {
    for (var l = 1; l < limite; l++) {
      if (dados[l][c] instanceof Date) return c;
    }
  }
  return -1;
}

/**
 * DIAGNÓSTICO — só leitura. Roda no editor do Apps Script pra conferir quais
 * colunas o obterTagSafety_ elegeu e se os totais batem com a planilha.
 */
function debugTagSafety() {
  var r = obterTagSafety_(true);
  Logger.log('meta: ' + JSON.stringify(r._meta));
  Object.keys(r).forEach(function (ano) {
    if (ano === '_meta') return;
    var b = r[ano];
    Logger.log(ano + ' — total ' + b.total);
    Logger.log('  por mês: ' + b.porMes.join(' | '));
    Object.keys(b.porAreaMes)
      .sort(function (x, y) {
        var sx = b.porAreaMes[x].reduce(function (a, c) { return a + c; }, 0);
        var sy = b.porAreaMes[y].reduce(function (a, c) { return a + c; }, 0);
        return sy - sx;
      })
      .forEach(function (area) {
        var linha = b.porAreaMes[area];
        var soma = linha.reduce(function (a, c) { return a + c; }, 0);
        Logger.log('  ' + area + ' (' + soma + '): ' + linha.join(' | '));
      });
  });
  return r;
}

function obterAbaCompilado_(ano) {
  var planilha = SpreadsheetApp.openById(BASE_HHT_SPREADSHEET_ID);
  var aba = planilha.getSheetByName('Compilado ' + ano);

  if (!aba) {
    throw new Error('Aba "Compilado ' + ano + '" não encontrada na base HHT.');
  }

  return aba;
}

/**
 * Lista os anos disponíveis, com base nas abas "Compilado {ano}" existentes.
 */
function getAnosDisponiveis() {
  var planilha = SpreadsheetApp.openById(BASE_HHT_SPREADSHEET_ID);
  var anos = [];

  planilha.getSheets().forEach(function (aba) {
    var m = aba.getName().match(/^Compilado (\d{4})$/);
    if (m) anos.push(Number(m[1]));
  });

  anos.sort(function (a, b) { return b - a; });
  return anos;
}

/**
 * Apelidos manuais pra grafias de Área que NÃO são resolvidas só por
 * normalização de texto (maiúsculas/acento/espaçamento) — ex.: forma
 * abreviada usada às vezes na planilha ("Logistica" sozinho) que precisa
 * cair no mesmo grupo de "Logística Interna". Chave = normalizarChaveTexto_
 * da grafia como aparece na planilha; valor = qualquer grafia do grupo
 * canônico desejado (não precisa ser a "oficial" — o rótulo final exibido
 * ainda é decidido pela grafia mais frequente, ver obterRotuloCanonicoArea_).
 * Adicionar aqui quando o usuário apontar outro caso de duplicata que a
 * normalização sozinha não resolver.
 */
var AREA_APELIDOS_ = {
  'logistica': 'Logística Interna'
};

/**
 * Área (coluna I) tem grafias diferentes pra mesma área física — maiúsculas,
 * acentos, digitação manual (ex: "LOGISTICA INTERNA" vs "Logística Interna"
 * vs "Logistica" abreviado) — que antes apareciam como entradas separadas,
 * poluindo o filtro/Pareto. Aqui elas são agrupadas por texto normalizado
 * (mais os apelidos manuais de AREA_APELIDOS_ pros casos que não são só
 * formatação) e cada grupo usa a grafia MAIS FREQUENTE (mais linhas) como
 * rótulo exibido. Devolve um mapa grafiaBruta -> rótulo canônico.
 * @param {Object} contagemPorAreaBruta grafia bruta -> nº de linhas
 */
function obterRotuloCanonicoArea_(contagemPorAreaBruta) {
  var grupos = {};

  Object.keys(contagemPorAreaBruta).forEach(function (bruto) {
    var apelido = AREA_APELIDOS_[normalizarChaveTexto_(bruto)];
    var chave = normalizarChaveTexto_(apelido || bruto);
    if (!grupos[chave]) grupos[chave] = {};
    grupos[chave][bruto] = contagemPorAreaBruta[bruto];
  });

  var mapa = {};
  Object.keys(grupos).forEach(function (chave) {
    var grafias = grupos[chave];
    var melhorGrafia = null;
    var melhorContagem = -1;
    Object.keys(grafias).forEach(function (grafia) {
      if (grafias[grafia] > melhorContagem) {
        melhorGrafia = grafia;
        melhorContagem = grafias[grafia];
      }
    });
    Object.keys(grafias).forEach(function (grafia) {
      mapa[grafia] = melhorGrafia;
    });
  });

  return mapa;
}

/**
 * A base TAG SAF grava o Departamento dela mesma (texto bruto, pode variar de
 * grafia da Compilado). Aqui cada chave bruta da TAG SAF é batida (via
 * normalizarChaveTexto_) contra os rótulos de Área JÁ CANÔNICOS (pós-dedup)
 * vistos na Compilado deste ano; se bater, soma sob esse rótulo. Se não bater
 * com nenhum, mantém o texto bruto da TAG SAF como rótulo próprio, em vez de
 * descartar a linha silenciosamente.
 */
function reconciliarTagSafComAreas_(totaisTagSafTodos, ano, areasCanonicas) {
  var tagSafDoAno = totaisTagSafTodos[ano] || {};
  var mapaNormalizado = {};
  areasCanonicas.forEach(function (nome) {
    mapaNormalizado[normalizarChaveTexto_(nome)] = nome;
  });

  var resultado = {};
  Object.keys(tagSafDoAno).forEach(function (chaveBruta) {
    var rotulo = chaveBruta === 'Todas' ? 'Todas' : (mapaNormalizado[normalizarChaveTexto_(chaveBruta)] || chaveBruta);
    if (!resultado[rotulo]) resultado[rotulo] = {};

    Object.keys(tagSafDoAno[chaveBruta]).forEach(function (mes) {
      var atual = resultado[rotulo][mes] || { 
          condicaoInsegura: 0, comportamentoInseguro: 0, 
          registros: { condicaoInsegura: [], comportamentoInseguro: [] } 
      };
      var novo = tagSafDoAno[chaveBruta][mes];

      var regCond = atual.registros.condicaoInsegura.concat(novo.registros ? novo.registros.condicaoInsegura : []);
      var regComp = atual.registros.comportamentoInseguro.concat(novo.registros ? novo.registros.comportamentoInseguro : []);
      
      regCond.sort(function(a, b) { return b.dia - a.dia; });
      regComp.sort(function(a, b) { return b.dia - a.dia; });

      resultado[rotulo][mes] = {
        condicaoInsegura: atual.condicaoInsegura + novo.condicaoInsegura,
        comportamentoInseguro: atual.comportamentoInseguro + novo.comportamentoInseguro,
        registros: {
          condicaoInsegura: regCond.slice(0, 60),
          comportamentoInseguro: regComp.slice(0, 60)
        }
      };
    });
  });

  return resultado;
}

/**
 * Lê a aba "Compilado {ano}" UMA ÚNICA VEZ e devolve tudo já pré-agregado por
 * Área -> Mês -> Dia -> cor (mais a lista de áreas). Isso evita reler a
 * planilha a cada troca de filtro: o front-end troca mês/área localmente
 * (guarda o pacote inteiro em memória), sem nova chamada ao servidor.
 *
 * Agrupamento por Área (coluna I, bruta, com grafias variantes unificadas —
 * ver obterRotuloCanonicoArea_). Filtro de Área da Cruz, grid, tabela de
 * totais, feed de ocorrências, Pareto E o filtro próprio da Pirâmide usam
 * essa MESMA lista de áreas canônicas.
 *
 * Duas passadas sobre as linhas já lidas em memória (não é uma 2ª leitura da
 * planilha): a 1ª só conta ocorrências por grafia bruta de Área pra decidir
 * o rótulo canônico de cada grupo; a 2ª agrega de fato usando esse rótulo.
 *
 * OBS: esta função é o CÁLCULO cru, sem cache — quem tem cache é a fachada
 * getCruzAnoCompleto acima. O pacote completo (com as descrições das
 * ocorrências) passa do limite de ~100KB por chave do CacheService, por isso é
 * gravado fatiado em várias chaves (cacheGravarGrande_).
 * @param {number} ano
 * @param {boolean} [forcar] repassa pro obterTotaisTagSaf_ ignorar o cache dele
 */
// SEMPRE que o FORMATO do pacote mudar (campo novo, campo renomeado), suba a
// versão da chave. O cache guarda o objeto pronto por 6h: sem subir a versão, o
// servidor continua devolvendo o pacote ANTIGO, sem o campo novo, e a tela mostra
// "fonte não configurada" mesmo com o código novo publicado. Foi o que aconteceu
// em 2026-07-27 quando o campo `tagSafety` entrou (v1 -> v2). v3: o tagSafety
// trocou `matriz` por `porAreaMes`.
var CRUZ_CACHE_CHAVE_ = 'cruzAnoCompleto_v4_';
var CRUZ_MEMO_ = {}; // deduplicação DENTRO de uma execução (getBootstrapDados usa 2x)

/**
 * TTL do pacote da Cruz, diferenciado por ano.
 *
 * O ano corrente ainda recebe lançamento HOJE: a célula do dia de hoje muda de
 * cor assim que a linha entra na Compilado, mas com 6h de cache essa mudança
 * só chega na tela horas depois. Pior, o cache é o getScriptCache(), que é
 * COMPARTILHADO entre todos os usuários — o primeiro acesso depois do
 * vencimento congela aquele retrato para o time inteiro pelo TTL cheio. Por
 * isso o ano vivo fica em 30 min.
 *
 * Ano passado não muda mais: continua em 6h para não pagar releitura da
 * Compilado à toa (é a leitura cara desta função; a TAG SAF vem do cache dela
 * própria).
 *
 * Virada de ano: a partir de 1º de janeiro o ano anterior cai no ramo de 6h
 * mesmo podendo receber lançamento atrasado de dezembro. Aceito de propósito —
 * a Cruz de um ano fechado não é lida em tempo real, e amarrar isso no fuso da
 * planilha exigiria abrir a planilha ANTES de consultar o cache, que é
 * justamente o custo que este cache existe para evitar.
 *
 * @param {number} ano
 * @return {number} segundos de TTL
 */
function cruzSegundosCache_(ano) {
  return Number(ano) >= new Date().getFullYear()
    ? CACHE_SEGUNDOS_30MIN_
    : CACHE_SEGUNDOS_6H_;
}

/**
 * Fachada com cache. A leitura da Compilado + a reconciliação da TAG SAF eram
 * refeitas a cada chamada, por usuário — e getResumoHome e
 * getContextoCruzSeguranca pedem o MESMO ano. Agora o pacote pronto é cacheado
 * (fatiado, ver cacheGravarGrande_) e memoizado dentro da execução. O TTL sai
 * de cruzSegundosCache_: 30 min no ano corrente, 6h nos anos fechados.
 * @param {number} ano
 * @param {boolean} [forcar] ignora o cache e regrava (usado pelo aquecimento)
 */
function getCruzAnoCompleto(ano, forcar) {
  var chave = CRUZ_CACHE_CHAVE_ + ano;

  if (!forcar) {
    if (CRUZ_MEMO_[ano]) return CRUZ_MEMO_[ano];
    var cacheado = cacheLerGrande_(chave);
    if (cacheado) {
      CRUZ_MEMO_[ano] = cacheado;
      return cacheado;
    }
  }

  var pacote = calcularCruzAnoCompleto_(ano, forcar);
  CRUZ_MEMO_[ano] = pacote;
  cacheGravarGrande_(chave, pacote, cruzSegundosCache_(ano));
  return pacote;
}

function calcularCruzAnoCompleto_(ano, forcar) {
  var aba = obterAbaCompilado_(ano);
  var ultimaLinha = aba.getLastRow();
  var porDepartamentoMes = { 'Todas': {} };
  var totaisPorDepartamentoMes = { 'Todas': {} };
  var ocorrenciasPorDepartamentoMes = { 'Todas': {} };
  var departamentosVistos = {};
  var contagemPorAreaBruta = {};
  var linhasValidas = [];

  // Usar o fuso horário DA PLANILHA (não o do projeto Apps Script) pra extrair
  // dia/mês. Se os dois fusos divergirem (ex: projeto em America/New_York e
  // planilha em America/Sao_Paulo), data.getDate()/getMonth() "puxam" a data
  // pro fuso do projeto e podem devolver o dia anterior.
  var fusoPlanilha = aba.getParent().getSpreadsheetTimeZone();

  if (ultimaLinha >= 2) {
    var dados = aba.getRange(2, 1, ultimaLinha - 1, aba.getLastColumn()).getValues();

    dados.forEach(function (linha) {
      var tipoEventoBruto = String(linha[4] || '').trim(); // E
      var classificacaoNM = String(linha[3] || '').trim().toUpperCase(); // D (A, B, C)
      var data = linha[5]; // F
      var departamentoBruto = String(linha[8] || '').trim(); // I

      if (!(data instanceof Date)) return;

      var tipoEvento = classificarTipoEvento_(tipoEventoBruto);
      if (!tipoEvento) return;

      var rankNovo = CRUZ_SEGURANCA_SEVERIDADE.indexOf(tipoEvento);
      if (rankNovo === -1) return;

      if (departamentoBruto) {
        contagemPorAreaBruta[departamentoBruto] = (contagemPorAreaBruta[departamentoBruto] || 0) + 1;
      }

      linhasValidas.push({
        tipoEvento: tipoEvento,
        classificacaoNM: classificacaoNM,
        rankNovo: rankNovo,
        mes: Number(Utilities.formatDate(data, fusoPlanilha, 'M')),
        dia: Number(Utilities.formatDate(data, fusoPlanilha, 'd')),
        descricao: extrairDescricao_(linha),
        departamentoBruto: departamentoBruto
      });
    });
  }

  var mapaAreaCanonica = obterRotuloCanonicoArea_(contagemPorAreaBruta);

  linhasValidas.forEach(function (l) {
    var area = l.departamentoBruto ? (mapaAreaCanonica[l.departamentoBruto] || l.departamentoBruto) : '';

    atualizarDiaMaisGrave_(porDepartamentoMes, 'Todas', l.mes, l.dia, l.tipoEvento, l.rankNovo);
    atualizarTotais_(totaisPorDepartamentoMes, 'Todas', l.mes, l.tipoEvento, l.classificacaoNM);
    // ENVIANDO A CLASSIFICAÇÃO:
    adicionarOcorrencia_(ocorrenciasPorDepartamentoMes, 'Todas', l.mes, l.dia, l.tipoEvento, area, l.descricao, l.classificacaoNM);

    if (area) {
      departamentosVistos[area] = true;
      atualizarDiaMaisGrave_(porDepartamentoMes, area, l.mes, l.dia, l.tipoEvento, l.rankNovo);
      atualizarTotais_(totaisPorDepartamentoMes, area, l.mes, l.tipoEvento, l.classificacaoNM);
      // ENVIANDO A CLASSIFICAÇÃO:
      adicionarOcorrencia_(ocorrenciasPorDepartamentoMes, area, l.mes, l.dia, l.tipoEvento, area, l.descricao, l.classificacaoNM);
    }
  });

  ordenarOcorrencias_(ocorrenciasPorDepartamentoMes);

  var areasCanonicas = Object.keys(departamentosVistos).sort();
  var totaisTagSaf = reconciliarTagSafComAreas_(obterTotaisTagSaf_(forcar), ano, areasCanonicas);

  return {
    departamentos: areasCanonicas,
    porDepartamentoMes: converterTiposEmCores_(porDepartamentoMes),
    totaisPorDepartamentoMes: totaisPorDepartamentoMes,
    ocorrenciasPorDepartamentoMes: ocorrenciasPorDepartamentoMes,
    totaisTagSaf: totaisTagSaf,
    tagSafety: obterTagSafetyDoAno_(ano, forcar)
  };
}

/**
 * Recorta o ano pedido do resultado do obterTagSafety_ e embrulha num objeto
 * pronto pra tela (inclui os rótulos dos eixos, pra o frontend não manter uma
 * segunda cópia da ordem das escalas — que é justamente o que dá sentido à matriz).
 *
 * NUNCA lança: é planilha externa e recém-ligada. Se ela sumir, mudar o nome da
 * aba ou o formulário for reestruturado, o card mostra "fonte indisponível" e o
 * resto do painel (Cruz, Pirâmide, Visão Geral) continua de pé.
 */
function obterTagSafetyDoAno_(ano, forcar) {
  try {
    var todos = obterTagSafety_(forcar);
    var bloco = todos[ano] || criarBlocoTagSafety_();
    return {
      porMes: bloco.porMes,
      porAreaMes: bloco.porAreaMes || {},
      total: bloco.total,
      erro: null
    };
  } catch (e) {
    return { erro: String(e && e.message ? e.message : e) };
  }
}

function atualizarDiaMaisGrave_(estrutura, departamento, mes, dia, tipoEvento, rankNovo) {
  if (!estrutura[departamento]) estrutura[departamento] = {};
  if (!estrutura[departamento][mes]) estrutura[departamento][mes] = {};

  var atual = estrutura[departamento][mes][dia];
  var rankAtual = atual
    ? CRUZ_SEGURANCA_SEVERIDADE.indexOf(atual)
    : CRUZ_SEGURANCA_SEVERIDADE.length;

  if (rankNovo < rankAtual) {
    estrutura[departamento][mes][dia] = tipoEvento;
  }
}

/**
 * Conta ocorrências (não "dias" — várias podem cair no mesmo dia) por
 * classificação, pra tabela de totais ao lado da Cruz Verde. "Quase acidente"
 * também é sub-classificado em A/B/C via coluna D. O total geral exclui
 * "Sem ocorrência" (não é um incidente).
 */
function criarTotaisVazios_() {
  return { vermelho: 0, laranja: 0, amarelo: 0, azul: 0, azulA: 0, azulB: 0, azulC: 0, cinza: 0, verde: 0, total: 0 };
}

function atualizarTotais_(estrutura, departamento, mes, tipoEvento, classificacaoNM) {
  if (!estrutura[departamento]) estrutura[departamento] = {};
  if (!estrutura[departamento][mes]) estrutura[departamento][mes] = criarTotaisVazios_();

  var totais = estrutura[departamento][mes];
  var cor = CRUZ_SEGURANCA_CORES[tipoEvento];

  totais[cor] = (totais[cor] || 0) + 1;

  if (cor === 'azul') {
    if (classificacaoNM === 'A') totais.azulA++;
    else if (classificacaoNM === 'B') totais.azulB++;
    else if (classificacaoNM === 'C') totais.azulC++;
  }

  if (tipoEvento !== 'Sem ocorrência') {
    totais.total++;
  }
}

/**
 * Monta o feed de ocorrências (usado no painel lateral da Cruz Verde).
 * Só entram linhas com evento real (ignora "Sem ocorrência") e que tenham
 * descrição preenchida — sem isso não há o que mostrar no feed.
 */
function adicionarOcorrencia_(estrutura, departamento, mes, dia, tipoEvento, departamentoOriginal, descricao) {
  if (tipoEvento === 'Sem ocorrência' || !descricao) return;

  if (!estrutura[departamento]) estrutura[departamento] = {};
  if (!estrutura[departamento][mes]) estrutura[departamento][mes] = [];

  estrutura[departamento][mes].push({
    dia: dia,
    tipoEvento: tipoEvento,
    cor: CRUZ_SEGURANCA_CORES[tipoEvento],
    departamento: departamentoOriginal,
    descricao: descricao
  });
}

function ordenarOcorrencias_(estrutura) {
  Object.keys(estrutura).forEach(function (departamento) {
    Object.keys(estrutura[departamento]).forEach(function (mes) {
      estrutura[departamento][mes].sort(function (a, b) { return b.dia - a.dia; });
    });
  });
}

function converterTiposEmCores_(porDepartamentoMesTipos) {
  var resultado = {};

  Object.keys(porDepartamentoMesTipos).forEach(function (departamento) {
    resultado[departamento] = {};
    Object.keys(porDepartamentoMesTipos[departamento]).forEach(function (mes) {
      resultado[departamento][mes] = {};
      Object.keys(porDepartamentoMesTipos[departamento][mes]).forEach(function (dia) {
        resultado[departamento][mes][dia] = CRUZ_SEGURANCA_CORES[porDepartamentoMesTipos[departamento][mes][dia]];
      });
    });
  });

  return resultado;
}

/**
 * Bootstrap único: devolve tudo que o painel precisa para montar a tela inicial
 * (evita múltiplas chamadas separadas no primeiro carregamento).
 */
function getContextoCruzSeguranca() {
  var anos = getAnosDisponiveis();
  var anoAtual = anos.length ? anos[0] : new Date().getFullYear();
  var mesAtual = new Date().getMonth() + 1;
  var pacoteAno = getCruzAnoCompleto(anoAtual);

  return {
    anos: anos,
    anoAtual: anoAtual,
    mesAtual: mesAtual,
    departamentos: pacoteAno.departamentos,
    porDepartamentoMes: pacoteAno.porDepartamentoMes,
    totaisPorDepartamentoMes: pacoteAno.totaisPorDepartamentoMes,
    ocorrenciasPorDepartamentoMes: pacoteAno.ocorrenciasPorDepartamentoMes,
    totaisTagSaf: pacoteAno.totaisTagSaf,
    tagSafety: pacoteAno.tagSafety
  };
}

/**
 * DIAGNÓSTICO — só leitura, não é chamada por nenhuma tela. Lista todo par
 * (Departamento | Área) que aparece de fato na Compilado {ano}, com a
 * contagem de linhas de cada um. Rodar direto no editor do Apps Script
 * (selecionar a função, Executar, depois ver em Execução > Registros) pra
 * comparar com os nomes de área do mapa da planta de Rio Claro e montar o
 * de-para local físico -> zona do mapa.
 */
function debugAreasCompiladoAno(ano) {
  var aba = obterAbaCompilado_(ano || getAnosDisponiveis()[0]);
  var ultimaLinha = aba.getLastRow();
  var contagem = {};

  if (ultimaLinha >= 2) {
    var dados = aba.getRange(2, 1, ultimaLinha - 1, aba.getLastColumn()).getValues();
    dados.forEach(function (linha) {
      var departamento = String(linha[8] || '').trim(); // I
      var area = String(linha[9] || '').trim(); // J
      if (!departamento && !area) return;
      var chave = departamento + ' | ' + area;
      contagem[chave] = (contagem[chave] || 0) + 1;
    });
  }

  var linhas = Object.keys(contagem).sort().map(function (chave) {
    return chave + '  ->  ' + contagem[chave];
  });

  Logger.log(linhas.join('\n'));
  return linhas;
}

/**
 * ===================================================
 * RISK — RISCOS ALTOS EHS
 * Fonte: planilha "Riscos Altos EHS", aba "Riscos Altos".
 * Colunas (localizadas pelo NOME do cabeçalho, não por letra): Ranking Risco,
 * Data Inserção, Área, Macro Tema, Risco, Plano de Ação, Quantidade,
 * Orçamento, Validado EHS, Status, Data Fechamento do Risco, Obs. / Link,
 * Data Inicio, Contabilização Semana, Meta Acumulado, Realizado Acumulado.
 *
 * O cabeçalho dessa aba ocupa VÁRIAS linhas (células mescladas: "Data
 * Inserção" e "Ranking Risco" ficam quebradas em 2-3 linhas), por isso
 * localizarLinhaCabecalho_ procura, nas primeiras linhas, aquela que contém os
 * rótulos-âncora ("status" e "macro tema") em vez de assumir a linha 1.
 * ===================================================
 */
var RISCOS_SPREADSHEET_ID = '12h0pZZ9ocWgE-VzvCjtsHbxJloVVyiWF3dkXb-jUo48';
var RISCOS_ABA_ = 'Riscos Altos';

/**
 * Converte texto de orçamento em número. A célula pode ter mais de um valor
 * ("R$177.957,73" + "R$229.042,70" na mesma célula) — nesse caso soma todos —
 * ou texto livre sem valor ("N/A", "Projeto shift"), que vira 0.
 * Formato brasileiro: "." separa milhar e "," separa decimal.
 */
function parseMoedaBr_(bruto) {
  var texto = String(bruto == null ? '' : bruto);
  if (typeof bruto === 'number') return bruto;

  var achados = texto.match(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?/g);
  if (!achados) return 0;

  return achados.reduce(function (soma, valor) {
    var normalizado = valor.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(normalizado);
    return soma + (isNaN(n) ? 0 : n);
  }, 0);
}

/**
 * Acha a linha de cabeçalho procurando os rótulos-âncora nas primeiras linhas.
 * Devolve { indice, cabecalhos } (indice base 1, como getRange espera).
 */
function localizarLinhaCabecalho_(aba, maxLinhas) {
  var ultimaColuna = aba.getLastColumn();
  var limite = Math.min(maxLinhas || 8, aba.getLastRow());
  var valores = aba.getRange(1, 1, limite, ultimaColuna).getValues();

  for (var i = 0; i < valores.length; i++) {
    var normalizados = valores[i].map(function (c) { return normalizarChaveTexto_(c); });
    if (normalizados.indexOf('status') !== -1 && normalizados.indexOf('macro tema') !== -1) {
      return { indice: i + 1, cabecalhos: normalizados };
    }
  }
  throw new Error('Cabeçalho da aba "' + RISCOS_ABA_ + '" não encontrado (esperava colunas "Status" e "Macro Tema").');
}

function indiceColuna_(cabecalhos, chave) {
  return cabecalhos.indexOf(chave);
}

function valorCelula_(linha, indice) {
  if (indice < 0 || indice >= linha.length) return '';
  var v = linha[indice];
  if (v instanceof Date) return v;
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

/**
 * Acumula um VALOR (não +1) numa chave do mapa. Usado pelas agregações do painel
 * RISK desde 2026-07-29: o que interessa lá é a soma da coluna Quantidade, não a
 * contagem de linhas — uma linha "33 painéis elétricos" pesa 33, não 1.
 */
function somarEm_(mapa, chave, valor) {
  if (!chave) return;
  mapa[chave] = (mapa[chave] || 0) + (Number(valor) || 0);
}

function contarEm_(mapa, chave) {
  if (!chave) return;
  mapa[chave] = (mapa[chave] || 0) + 1;
}

/**
 * Lê a aba "Riscos Altos" e devolve a lista de riscos + agregações prontas
 * para o painel RISK. Uma única leitura da planilha; tudo já agregado aqui.
 */
function getRiscosAltos() {
  var planilha = SpreadsheetApp.openById(RISCOS_SPREADSHEET_ID);
  var aba = planilha.getSheetByName(RISCOS_ABA_);
  if (!aba) throw new Error('Aba "' + RISCOS_ABA_ + '" não encontrada na planilha Riscos Altos EHS.');

  var cab = localizarLinhaCabecalho_(aba, 8);
  var ultimaLinha = aba.getLastRow();
  var ultimaColuna = aba.getLastColumn();

  var col = {
    ranking: indiceColuna_(cab.cabecalhos, 'ranking risco'),
    area: indiceColuna_(cab.cabecalhos, 'area'),
    macroTema: indiceColuna_(cab.cabecalhos, 'macro tema'),
    risco: indiceColuna_(cab.cabecalhos, 'risco'),
    planoAcao: indiceColuna_(cab.cabecalhos, 'plano de acao'),
    quantidade: indiceColuna_(cab.cabecalhos, 'quantidade'),
    orcamento: indiceColuna_(cab.cabecalhos, 'orcamento'),
    validado: indiceColuna_(cab.cabecalhos, 'validado ehs'),
    status: indiceColuna_(cab.cabecalhos, 'status'),
    dataInicio: indiceColuna_(cab.cabecalhos, 'data inicio'),
    dataFechamento: indiceColuna_(cab.cabecalhos, 'data fechamento do risco'),
    semana: indiceColuna_(cab.cabecalhos, 'contabilizacao semana'),
    meta: indiceColuna_(cab.cabecalhos, 'meta acumulado'),
    realizado: indiceColuna_(cab.cabecalhos, 'realizado acumulado')
  };

  var riscos = [];
  var porStatus = {};        // pesado por Quantidade
  var porStatusLinhas = {};  // contagem de linhas, só pra sub-linha/diagnóstico
  var porArea = {};          // pesado por Quantidade
  var porMacroTema = {};     // pesado por Quantidade
  var porValidado = {};      // pesado por Quantidade
  var serieSemanal = [];
  var orcamentoTotal = 0;
  var quantidadeTotal = 0;
  // Linha com Quantidade vazia ou zero soma 0 e portanto SOME dos gráficos.
  // Não é corrigido pra 1 de propósito — isso mudaria o total, que precisa
  // continuar batendo com a planilha. Fica exposto como nota de rodapé.
  var linhasSemQuantidade = 0;

  if (ultimaLinha > cab.indice) {
    var dados = aba.getRange(cab.indice + 1, 1, ultimaLinha - cab.indice, ultimaColuna).getValues();
    var fuso = aba.getParent().getSpreadsheetTimeZone();

    dados.forEach(function (linha) {
      // A série Meta/Realizado por semana vive em colunas próprias e NÃO tem
      // relação 1:1 com as linhas de risco — é lida em separado.
      var semana = valorCelula_(linha, col.semana);
      if (semana) {
        serieSemanal.push({
          semana: semana,
          meta: Number(valorCelula_(linha, col.meta)) || 0,
          realizado: Number(valorCelula_(linha, col.realizado)) || 0
        });
      }

      var status = valorCelula_(linha, col.status);
      var area = valorCelula_(linha, col.area);
      var macroTema = valorCelula_(linha, col.macroTema);
      var descricaoRisco = valorCelula_(linha, col.risco);

      // Linha só conta como risco se tiver ao menos Status ou descrição do risco.
      if (!status && !descricaoRisco) return;

      var orcamento = parseMoedaBr_(linha[col.orcamento]);
      var quantidade = Number(valorCelula_(linha, col.quantidade)) || 0;
      var validado = valorCelula_(linha, col.validado).toUpperCase();

      orcamentoTotal += orcamento;
      quantidadeTotal += quantidade;
      if (quantidade <= 0) linhasSemQuantidade++;

      // TODAS as agregações do painel são pesadas pela QUANTIDADE (2026-07-29,
      // pedido do usuário): o risco é o item físico, não a linha. Uma linha
      // concluída com 30 na coluna G tira 30 do que falta, não 1.
      somarEm_(porStatus, status, quantidade);
      somarEm_(porArea, area, quantidade);
      somarEm_(porMacroTema, macroTema, quantidade);
      somarEm_(porValidado, validado, quantidade);
      // Contagem de LINHAS por status fica junto: é o denominador de "quantas
      // linhas da planilha", exibido como sub-linha, e some da soma acima.
      contarEm_(porStatusLinhas, status);

      riscos.push({
        ranking: valorCelula_(linha, col.ranking),
        area: area,
        macroTema: macroTema,
        risco: descricaoRisco,
        planoAcao: valorCelula_(linha, col.planoAcao),
        quantidade: quantidade,
        orcamento: orcamento,
        validado: validado,
        status: status,
        dataInicio: formatarDataBr_(linha[col.dataInicio], fuso),
        dataFechamento: formatarDataBr_(linha[col.dataFechamento], fuso)
      });
    });
  }

  return {
    riscos: riscos,
    // ATENÇÃO: porStatus/porArea/porMacroTema/porValidado somam QUANTIDADE
    // (itens), não linhas. Quem precisa de linha usa porStatusLinhas/totalLinhas.
    porStatus: porStatus,
    porStatusLinhas: porStatusLinhas,
    porArea: porArea,
    porMacroTema: porMacroTema,
    porValidado: porValidado,
    serieSemanal: serieSemanal,
    orcamentoTotal: orcamentoTotal,
    quantidadeTotal: quantidadeTotal,
    linhasSemQuantidade: linhasSemQuantidade,
    totalLinhas: riscos.length,
    // Mantido pelo nome antigo pra não quebrar nada que ainda leia daqui, mas
    // agora vale LINHAS explicitamente — o total exibido é quantidadeTotal.
    totalRiscos: riscos.length
  };
}

function formatarDataBr_(valor, fuso) {
  if (valor instanceof Date) return Utilities.formatDate(valor, fuso, 'dd/MM/yyyy');
  return String(valor == null ? '' : valor).trim();
}

/**
 * ===================================================
 * HOME — DASHBOARD EXECUTIVO
 * Junta três fontes:
 *  1. Ocorrências já agregadas por getCruzAnoCompleto (Compilado {ano});
 *  2. HHT (horas-homem trabalhadas) — denominador das taxas de frequência;
 *  3. Scorecard Manufatura LAR — de onde vêm as METAS oficiais do pilar
 *     (e a série "Real" publicada para a liderança, usada como referência).
 * ===================================================
 */
/**
 * Multiplicador padrão OSHA das taxas de frequência:
 *   taxa = (nº de ocorrências * 200.000) / HHT
 * 200.000 = 100 trabalhadores * 40h * 50 semanas.
 */
var TAXA_BASE_HORAS_ = 200000;

/**
 * Procura uma coluna pelo nome do cabeçalho (normalizado). Diferente de
 * localizarColuna_, NÃO lança erro quando não acha — devolve -1 — porque aqui
 * várias colunas são opcionais e a tela precisa degradar em vez de quebrar.
 * Aceita uma lista de nomes aceitáveis (primeiro que bater vence).
 */
function acharColunaPorNome_(cabecalhos, nomesAceitos) {
  for (var n = 0; n < nomesAceitos.length; n++) {
    for (var i = 0; i < cabecalhos.length; i++) {
      if (normalizarChaveTexto_(cabecalhos[i]) === nomesAceitos[n]) return i;
    }
  }
  return -1;
}

var MESES_NOMES_ = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function numeroDoMes_(texto) {
  var chave = normalizarChaveTexto_(texto);
  var i = MESES_NOMES_.indexOf(chave);
  return i === -1 ? 0 : i + 1;
}

/**
 * HHT — Horas-Homem Trabalhadas.
 * Fonte: planilha "Base HHT 2026_Oficial_1", aba "HHT Total1".
 * Layout (conferido no export .ods da própria base): A=Macro, B=CC,
 * C=Sub area, D=Data (1º dia do mês), E=WHP, F=Horas. Uma linha por
 * CC/mês — ~150 linhas por mês.
 *
 * As colunas são localizadas pelo NOME do cabeçalho, com fallback posicional:
 * o cabeçalho da coluna de horas veio corrompido no export (substituído por um
 * texto de comentário atribuído), então não dá pra confiar 100% no nome. O
 * campo `origemColunaHoras` no retorno diz qual estratégia foi usada, pra
 * diagnóstico sem precisar abrir a planilha.
 *
 * Resultado cacheado por 6h (mesmo padrão de obterTotaisTagSaf_).
 * Formato: { porAnoMes: { [ano]: { [mes]: horas } }, porMacro: { [macro]: horas } }
 */
var HHT_SPREADSHEET_ID_ = '1rVrNuKWZRQvtYqKI4TiIseHHI7Epu0TLhgkMxUlD33s';
var HHT_ABA_ = 'HHT Total1';
var HHT_CACHE_CHAVE_ = 'hhtPorAnoMes_v1';

function obterDadosHHT_(forcar) {
  var cache = CacheService.getScriptCache();
  if (!forcar) {
    var cacheado = cache.get(HHT_CACHE_CHAVE_);
    if (cacheado) return JSON.parse(cacheado);
  }

  var aba = SpreadsheetApp.openById(HHT_SPREADSHEET_ID_).getSheetByName(HHT_ABA_);
  if (!aba) throw new Error('Aba "' + HHT_ABA_ + '" não encontrada na Base HHT.');

  var ultimaLinha = aba.getLastRow();
  var ultimaColuna = aba.getLastColumn();
  var resultado = { porAnoMes: {}, porMacro: {}, origemColunaHoras: 'nenhuma', linhasLidas: 0 };

  if (ultimaLinha >= 2) {
    var cabecalhos = aba.getRange(1, 1, 1, ultimaColuna).getValues()[0];
    var colMacro = acharColunaPorNome_(cabecalhos, ['macro', 'macro areas', 'macro area']);
    var colData = acharColunaPorNome_(cabecalhos, ['data']);
    var colHoras = acharColunaPorNome_(cabecalhos, ['horas', 'hht', 'total horas', 'horas trabalhadas']);

    resultado.origemColunaHoras = colHoras === -1 ? 'posicao F (fallback)' : 'cabecalho';
    if (colMacro === -1) colMacro = 0; // A
    if (colData === -1) colData = 3;   // D
    if (colHoras === -1) colHoras = 5; // F

    var dados = aba.getRange(2, 1, ultimaLinha - 1, ultimaColuna).getValues();
    var fuso = aba.getParent().getSpreadsheetTimeZone();

    dados.forEach(function (linha) {
      var data = linha[colData];
      if (!(data instanceof Date)) return;

      var horas = Number(linha[colHoras]);
      if (!horas || isNaN(horas)) return;

      var ano = Number(Utilities.formatDate(data, fuso, 'yyyy'));
      var mes = Number(Utilities.formatDate(data, fuso, 'M'));

      if (!resultado.porAnoMes[ano]) resultado.porAnoMes[ano] = {};
      resultado.porAnoMes[ano][mes] = (resultado.porAnoMes[ano][mes] || 0) + horas;

      var macro = String(linha[colMacro] || '').trim();
      if (macro) resultado.porMacro[macro] = (resultado.porMacro[macro] || 0) + horas;

      resultado.linhasLidas++;
    });
  }

  var json = JSON.stringify(resultado);
  if (json.length < 95000) cache.put(HHT_CACHE_CHAVE_, json, CACHE_SEGUNDOS_6H_);
  return resultado;
}

/**
 * ACUMULADO DA PLANTA (YTD) — aba "{ano} Acumulado" da MESMA Base HHT.
 *
 * É a fonte oficial do YTD de Rio Claro, informada pelo usuário em 2026-07-29.
 * Substitui a coluna YTD do Scorecard nos tiles da home (que nunca chegou a ser
 * confirmada como preenchida).
 *
 * Layout conferido em captura de tela da planilha viva:
 *   A = área (última linha é o total "RIO CLARO")
 *   B = Soma Quase Acidentes Anual
 *   C = Soma Primeiros Socorros Anual
 *   D = Soma Acidentes sem afastamento Anual
 *   E = Soma Acidentes com afastamento Anual
 *   F = TRIR YTD Acidentes (com e sem Afast)  <- é CONTAGEM, não taxa
 *   G = Somatória Horas YTD
 *   I = Primeiros socorros atual              <- FAI YTD JÁ PUBLICADO
 *   J = FAI - threshold {ano}                 <- meta por área
 *
 * DUAS COISAS IMPORTANTES:
 * 1. A coluna I é a taxa FAI já calculada por ELES, e confere exatamente com
 *    (C * 200.000) / G nas 12 linhas — conferido em 29/07. Então o FAI YTD sai
 *    PUBLICADO daqui, não é conta nossa.
 * 2. NÃO existe coluna com a taxa REC/TRIR pronta: a F guarda a CONTAGEM de
 *    registráveis. O REC YTD é derivado com (F * 200.000) / G — ou seja, com os
 *    números DELES e com a mesma fórmula que eles próprios usam na coluna I,
 *    mas ainda assim é uma derivação. O frontend rotula essa diferença.
 *
 * Colunas localizadas por TOKENS do cabeçalho (não por igualdade exata): os
 * títulos são frases longas ("TRIR YTD Acidentes (com e sem Afast)") e foram
 * lidos de imagem. Se algum token falhar, cai na posição fixa e registra a
 * origem em `origemColunas`, pra diagnóstico sem abrir a planilha.
 *
 * Cacheado por 6h, chave por ano.
 */
var HHT_ACUMULADO_CACHE_CHAVE_ = 'hhtAcumuladoPlanta_v1_';
var ACUMULADO_LINHA_TOTAL_ = 'rio claro';

/**
 * Acha a coluna cujo cabeçalho normalizado CONTÉM todos os tokens. Diferente de
 * acharColunaPorNome_, que exige igualdade — aqui os cabeçalhos são frases.
 */
function acharColunaContendo_(cabecalhos, tokens) {
  for (var i = 0; i < cabecalhos.length; i++) {
    var h = normalizarChaveTexto_(cabecalhos[i]);
    if (!h) continue;
    var todos = true;
    for (var t = 0; t < tokens.length; t++) {
      if (h.indexOf(tokens[t]) === -1) { todos = false; break; }
    }
    if (todos) return i;
  }
  return -1;
}

function localizarAbaAcumulado_(planilha, ano) {
  var exata = localizarAbaTolerante_(planilha, ano + ' Acumulado');
  if (exata) return exata;

  var abas = planilha.getSheets();
  for (var i = 0; i < abas.length; i++) {
    var n = normalizarChaveTexto_(abas[i].getName());
    if (n.indexOf('acumulado') !== -1 && n.indexOf(String(ano)) !== -1) return abas[i];
  }
  return null;
}

function obterAcumuladoPlanta_(ano, forcar) {
  var chave = HHT_ACUMULADO_CACHE_CHAVE_ + ano;
  var cache = CacheService.getScriptCache();
  if (!forcar) {
    var cacheado = cache.get(chave);
    if (cacheado) return JSON.parse(cacheado);
  }

  var planilha = SpreadsheetApp.openById(HHT_SPREADSHEET_ID_);
  var aba = localizarAbaAcumulado_(planilha, ano);
  if (!aba) {
    throw new Error('Aba "' + ano + ' Acumulado" não encontrada na Base HHT. Abas disponíveis: ' +
      planilha.getSheets().map(function (a) { return a.getName(); }).join(' | '));
  }

  var valores = aba.getRange(1, 1, aba.getLastRow(), aba.getLastColumn()).getValues();

  // Cabeçalho = primeira das 8 linhas iniciais que traga "horas" E "primeiros socorros".
  var linhaCab = -1;
  for (var i = 0; i < Math.min(8, valores.length); i++) {
    if (acharColunaContendo_(valores[i], ['horas']) !== -1 &&
        acharColunaContendo_(valores[i], ['primeiros socorros']) !== -1) { linhaCab = i; break; }
  }
  if (linhaCab === -1) throw new Error('Cabeçalho não localizado na aba "' + aba.getName() + '".');

  var cab = valores[linhaCab];
  var origem = {};
  // 'soma' distingue a C ("Soma Primeiros Socorros Anual") da I ("Primeiros
  // socorros atual"); 'afastamento' por extenso distingue D/E da F, que abrevia
  // pra "Afast" e portanto não casa com nenhum dos dois.
  var mapa = [
    ['quase', ['quase'], 1],
    ['ps', ['soma', 'primeiros socorros'], 2],
    ['semAf', ['sem afastamento'], 3],
    ['comAf', ['com afastamento'], 4],
    ['recordaveis', ['trir'], 5],
    ['horas', ['horas'], 6],
    ['fai', ['primeiros socorros', 'atual'], 8],
    ['threshold', ['threshold'], 9]
  ];
  var col = {};
  mapa.forEach(function (m) {
    var achado = acharColunaContendo_(cab, m[1]);
    col[m[0]] = achado === -1 ? m[2] : achado;
    origem[m[0]] = achado === -1 ? 'posicao' : 'cabecalho';
  });

  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  function linhaPara(linha) {
    var horas = num(linha[col.horas]) || 0;
    var ps = num(linha[col.ps]) || 0;
    var rec = num(linha[col.recordaveis]) || 0;
    return {
      area: String(linha[0] || '').trim(),
      quase: num(linha[col.quase]) || 0,
      primeirosSocorros: ps,
      semAfastamento: num(linha[col.semAf]) || 0,
      comAfastamento: num(linha[col.comAf]) || 0,
      recordaveis: rec,
      horas: horas,
      // Publicado por eles (coluna I).
      fai: num(linha[col.fai]),
      threshold: num(linha[col.threshold]),
      // Derivado: não existe coluna de taxa REC pronta na aba.
      rec: horas > 0 ? (rec * TAXA_BASE_HORAS_) / horas : null,
      // Conferência: a coluna I deveria ser exatamente isto.
      faiRecalculado: horas > 0 ? (ps * TAXA_BASE_HORAS_) / horas : null
    };
  }

  var areas = [];
  var total = null;
  for (var r = linhaCab + 1; r < valores.length; r++) {
    var nome = String(valores[r][0] || '').trim();
    if (!nome) continue;
    var registro = linhaPara(valores[r]);
    if (normalizarChaveTexto_(nome) === ACUMULADO_LINHA_TOTAL_) { total = registro; break; }
    areas.push(registro);
  }

  if (!total) {
    throw new Error('Linha "RIO CLARO" não encontrada na aba "' + aba.getName() + '".');
  }

  var resultado = {
    ano: ano,
    aba: aba.getName(),
    total: total,
    areas: areas,
    origemColunas: origem,
    // Guarda a folga entre a coluna publicada e o recálculo: se algum dia
    // divergir, o número aparece aqui em vez de passar batido.
    divergenciaFai: (total.fai !== null && total.faiRecalculado !== null)
      ? Math.abs(total.fai - total.faiRecalculado) : null
  };

  cache.put(chave, JSON.stringify(resultado), CACHE_SEGUNDOS_6H_);
  return resultado;
}

/**
 * Diagnóstico: despeja o cabeçalho e as linhas da aba "{ano} Acumulado" como a
 * planilha viva devolve. Rodar no editor do Apps Script se algum número da home
 * parecer errado — mostra qual coluna foi achada por nome e qual caiu na posição.
 */
function debugAcumuladoRioClaro(ano) {
  ano = ano || new Date().getFullYear();
  var dados = obterAcumuladoPlanta_(ano, true);
  Logger.log('Aba: %s', dados.aba);
  Logger.log('Origem das colunas: %s', JSON.stringify(dados.origemColunas));
  Logger.log('TOTAL RIO CLARO: %s', JSON.stringify(dados.total));
  Logger.log('Divergência FAI publicado x recalculado: %s', dados.divergenciaFai);
  Logger.log('Áreas (%s): %s', dados.areas.length, JSON.stringify(dados.areas));
  return dados;
}

/**
 * SCORECARD MANUFATURA LAR — bloco SEGURANÇA da aba "Semanal/Mensal RC {ano}".
 *
 * Layout (conferido no export HTML da própria planilha):
 *  - linha de cabeçalho tem "INDICADOR" (col C) e os 12 meses por extenso
 *    ("JANEIRO"... "DEZEMBRO") em colunas NÃO equidistantes — entre elas ficam
 *    as colunas semanais, e o nº de semanas varia por mês. Por isso os meses
 *    são mapeados pelo NOME no cabeçalho, nunca por offset fixo;
 *  - o nome do indicador fica numa célula mesclada verticalmente: só a 1ª linha
 *    do bloco traz o texto, as seguintes vêm vazias (getValues devolve '' nas
 *    continuações) — daí o "indicador corrente" ser carregado adiante;
 *  - a coluna "Plano / Real" diz se a linha é Meta, Real ou Stretch.
 *
 * Só o bloco de SEGURANÇA interessa aqui: a leitura para em "SCORE SEGURANÇA",
 * que é a última linha do bloco (depois começa QUALIDADE).
 *
 * Cacheado por 6h.
 * Formato: { indicadores: { [chaveNormalizada]: { rotulo, unidade, meta: [12], real: [12] } }, aba }
 */
var SCORECARD_SPREADSHEET_ID_ = '1tMRVkCFLexk5LO5-n3xge1xTqEmppUlg1FkVYtIL3u4';
// v2 em 2026-07-27: a estrutura ganhou metaYtd/realYtd. Mesma regra da chave da
// Cruz — mudou o formato, sobe a versão, senão o cache velho mascara o campo novo.
var SCORECARD_CACHE_CHAVE_ = 'scorecardSeguranca_v2_';

function localizarAbaScorecard_(planilha, ano) {
  var abas = planilha.getSheets();
  var alvo = null;

  abas.forEach(function (aba) {
    var chave = normalizarChaveTexto_(aba.getName());
    // "Semanal/Mensal RC 2026" — a barra some na normalização.
    if (chave.indexOf('semanal') !== -1 && chave.indexOf('rc') !== -1 && chave.indexOf(String(ano)) !== -1) {
      alvo = aba;
    }
  });

  if (!alvo) throw new Error('Aba "Semanal/Mensal RC ' + ano + '" não encontrada no Scorecard Manufatura LAR.');
  return alvo;
}

function obterDadosScorecard_(ano, forcar) {
  var cache = CacheService.getScriptCache();
  var chaveCache = SCORECARD_CACHE_CHAVE_ + ano;
  if (!forcar) {
    var cacheado = cache.get(chaveCache);
    if (cacheado) return JSON.parse(cacheado);
  }

  var planilha = SpreadsheetApp.openById(SCORECARD_SPREADSHEET_ID_);
  var aba = localizarAbaScorecard_(planilha, ano);

  var ultimaColuna = aba.getLastColumn();
  var topo = aba.getRange(1, 1, Math.min(6, aba.getLastRow()), ultimaColuna).getValues();

  var linhaCabecalho = -1;
  for (var i = 0; i < topo.length; i++) {
    var normalizados = topo[i].map(function (c) { return normalizarChaveTexto_(c); });
    if (normalizados.indexOf('indicador') !== -1 && normalizados.indexOf('janeiro') !== -1) {
      linhaCabecalho = i;
      break;
    }
  }
  if (linhaCabecalho === -1) {
    throw new Error('Cabeçalho da aba "' + aba.getName() + '" não encontrado (esperava "INDICADOR" e "JANEIRO" na mesma linha).');
  }

  var cabecalhos = topo[linhaCabecalho];
  var colIndicador = acharColunaPorNome_(cabecalhos, ['indicador']);
  var colUnidade = acharColunaPorNome_(cabecalhos, ['unidade']);
  var colPlanoReal = acharColunaPorNome_(cabecalhos, ['plano real', 'plano  real']);

  // mês -> índice de coluna, lido do próprio cabeçalho (colunas não equidistantes)
  var colunaDoMes = {};
  cabecalhos.forEach(function (celula, indice) {
    var mes = numeroDoMes_(celula);
    if (mes && colunaDoMes[mes] === undefined) colunaDoMes[mes] = indice;
  });

  // YTD (coluna BT na aba de 2026) — é o acumulado que a liderança lê. NÃO dá
  // pra derivar dos 12 meses aqui: taxa acumulada é (ocorrências totais x 200.000
  // / HHT total), não a média das taxas mensais, e não temos o HHT dentro deste
  // escopo. Ler a coluna publicada é o único jeito de bater com o Scorecard.
  var colYtd = acharColunaPorNome_(cabecalhos, ['ytd']);

  var indicadores = {};
  var ultimaLinha = aba.getLastRow();
  var dados = aba.getRange(linhaCabecalho + 2, 1, ultimaLinha - linhaCabecalho - 1, ultimaColuna).getValues();

  var indicadorCorrente = null;

  for (var l = 0; l < dados.length; l++) {
    var linha = dados[l];
    var rotulo = String(linha[colIndicador] == null ? '' : linha[colIndicador]).replace(/\s+/g, ' ').trim();

    if (rotulo) {
      var chave = normalizarChaveTexto_(rotulo).replace(/\s*\*$/, '');
      indicadorCorrente = chave;
      if (!indicadores[chave]) {
        indicadores[chave] = {
          rotulo: rotulo,
          unidade: colUnidade === -1 ? '' : String(linha[colUnidade] || '').trim(),
          meta: [],
          real: [],
          metaYtd: null,
          realYtd: null
        };
      }
    }
    if (!indicadorCorrente) continue;

    var valoresMes = [];
    for (var m = 1; m <= 12; m++) {
      var coluna = colunaDoMes[m];
      valoresMes.push(coluna === undefined ? null : numeroDaCelula_(linha[coluna]));
    }

    var temValor = valoresMes.some(function (v) { return v !== null; });
    if (temValor) {
      var tipo = colPlanoReal === -1 ? '' : normalizarChaveTexto_(linha[colPlanoReal]);
      var ytd = colYtd === -1 ? null : numeroDaCelula_(linha[colYtd]);
      // "SCORE SEGURANÇA" traz os valores na própria linha do indicador, sem
      // sub-linha Meta/Real — nesse caso o valor conta como Real.
      if (tipo === 'meta') {
        indicadores[indicadorCorrente].meta = valoresMes;
        indicadores[indicadorCorrente].metaYtd = ytd;
      } else {
        indicadores[indicadorCorrente].real = valoresMes;
        indicadores[indicadorCorrente].realYtd = ytd;
      }
    }

    if (indicadorCorrente === 'score seguranca') break; // fim do bloco SEGURANÇA
  }

  var resultado = { aba: aba.getName(), indicadores: indicadores };
  var json = JSON.stringify(resultado);
  if (json.length < 95000) cache.put(chaveCache, json, CACHE_SEGUNDOS_6H_);
  return resultado;
}

function somaSegura_(a, b) {
  return (Number(a) || 0) + (Number(b) || 0);
}

/**
 * Célula do Scorecard -> número, ou null. Número já vem pronto do Sheets; texto
 * pode vir em formato BR ("1.234,56"), daí o remove-ponto/troca-vírgula.
 */
function numeroDaCelula_(bruto) {
  if (typeof bruto === 'number') return bruto;
  var numero = parseFloat(String(bruto == null ? '' : bruto).replace(/\./g, '').replace(',', '.'));
  return isNaN(numero) ? null : numero;
}

/**
 * Pacote consolidado da Home. Uma única chamada devolve tudo que o dashboard
 * executivo precisa.
 *
 * Taxas calculadas com a fórmula do pilar:
 *   Taxa FAI = (Primeiros Socorros * 200.000) / HHT
 *   Taxa REC = ((Acidentes com + sem afastamento) * 200.000) / HHT
 * Os eventos vêm da Compilado (mesma fonte da Cruz Verde, cor amarelo =
 * Primeiros Socorros, laranja = sem afastamento, vermelho = com afastamento);
 * o HHT vem da Base HHT.
 *
 * CONFERIDO em 2026-07-26 contra a planilha viva (debugFontesHome): a taxa
 * calculada aqui REPRODUZ a publicada no Scorecard. Jan/2026: HHT 577.485 e 6
 * primeiros socorros dão 2,0780, igual ao First Aid oficial; fev a mai fecham
 * em ocorrências inteiras do mesmo jeito, e o TRR de mar (0,334) e mai (0,354)
 * dão exatamente 1 registrável cada. A série publicada continua sendo devolvida
 * em `oficial.*` como referência cruzada, não porque divirja.
 *
 * (Junho é a única exceção: 0,503 daria 1,33 ocorrência. O mais provável é o
 * Scorecard ter publicado o mês ainda aberto, com HHT parcial — não é erro de
 * cálculo daqui.)
 *
 * Os meses SEM HHT lançado ficam com taxa null (e não zero) — zero seria lido
 * como "desempenho perfeito", quando na verdade é ausência de denominador.
 */
function getResumoHome(ano) {
  var anosDisponiveis = getAnosDisponiveis();
  ano = Number(ano) || anosDisponiveis[0] || new Date().getFullYear();
  return montarResumoHome_(ano, anosDisponiveis, getCruzAnoCompleto(ano));
}

/**
 * Monta o resumo da Home a partir de um pacote da Cruz JÁ obtido. Separado de
 * getResumoHome para que getBootstrapDados reaproveite a mesma leitura em vez
 * de pedir o pacote de novo.
 */
/* ===================================================
 * PROGRAMA TAG — volume por vertente (KPI da home)
 *
 * MESMA PLANILHA da matriz de risco (10jrNXHG…), OUTRA ABA. O workbook tem as
 * duas abas de respostas lado a lado, recebendo dados em paralelo:
 *   - "TAG SAFETY"                (gid 305167276) -> matriz de risco do METRICS SAF
 *   - "Respostas ao formulário 5" (gid 684377552) -> este KPI da home
 * A terceira base de TAG do projeto é outra planilha e não se mistura com estas:
 *   - TAG_SAF_SPREADSHEET_ID (1a8cWEh…, "BASE TAG - SAF") -> Pirâmide
 *
 * Esta aba cobre TODAS as vertentes do programa (Safety, Ver e Agir,
 * Professional/Autonomous Maintenance, Environment, Workplace Organization), e
 * não só Safety. Em compensação cobre poucos dias (15–27/07 no export analisado)
 * e só as linhas de Safety trazem probabilidade/severidade — por isso alimenta um
 * KPI de VOLUME e não a matriz de risco, que continua na aba "TAG SAFETY", a
 * única com histórico e com avaliação de risco em toda linha.
 * =================================================== */
var PROGRAMA_TAG_SPREADSHEET_ID_ = '10jrNXHGOZwAdSLSCP3gVtJaUAV1FF97xyDvvHjFD1bE';
var PROGRAMA_TAG_ABA_ = 'Respostas ao formulário 5';
var PROGRAMA_TAG_CACHE_CHAVE_ = 'programaTagResumo_v1';

/**
 * Conta as respostas por vertente. A coluna do tipo de apontamento é localizada
 * pelo FORMATO dos valores ("TAG - SAF - Safety", "SEGURANÇA - VER E AGIR"),
 * não por nome de cabeçalho — mesma razão do obterTagSafety_: os cabeçalhos são
 * perguntas inteiras de formulário e mudam quando alguém edita o formulário.
 *
 * NUNCA lança: é fonte externa e opcional, e o KPI não pode derrubar a home.
 */
function obterResumoProgramaTag_(forcar) {
  if (!PROGRAMA_TAG_SPREADSHEET_ID_ || !PROGRAMA_TAG_ABA_) {
    return { fonte: 'nao_configurada' };
  }

  try {
    var cache = CacheService.getScriptCache();
    if (!forcar) {
      var cacheado = cache.get(PROGRAMA_TAG_CACHE_CHAVE_);
      if (cacheado) return JSON.parse(cacheado);
    }

    var planilha = SpreadsheetApp.openById(PROGRAMA_TAG_SPREADSHEET_ID_);
    var aba = localizarAbaTolerante_(planilha, PROGRAMA_TAG_ABA_);
    if (!aba) {
      throw new Error('Aba "' + PROGRAMA_TAG_ABA_ + '" não encontrada. Abas disponíveis: ' +
        planilha.getSheets().map(function (s) { return s.getName(); }).join(', '));
    }

    var ultimaLinha = aba.getLastRow();
    if (ultimaLinha < 2) return { fonte: 'ok', total: 0, vertentes: [], lider: null, periodo: null };

    var dados = aba.getRange(1, 1, ultimaLinha, aba.getLastColumn()).getValues();
    var colTipo = localizarColunaPorPadrao_(dados, /^\s*(tag|seguran)/i);
    var colData = localizarColunaPorData_(dados);
    var fuso = aba.getParent().getSpreadsheetTimeZone();

    var contagem = {};
    var total = 0;
    var menor = null, maior = null;

    for (var i = 1; i < dados.length; i++) {
      var rotulo = colTipo === -1 ? '' : String(dados[i][colTipo] || '').trim();
      var data = colData === -1 ? null : dados[i][colData];
      if (!rotulo && !(data instanceof Date)) continue;

      total++;
      if (rotulo) contagem[rotulo] = (contagem[rotulo] || 0) + 1;
      if (data instanceof Date) {
        if (!menor || data < menor) menor = data;
        if (!maior || data > maior) maior = data;
      }
    }

    var vertentes = Object.keys(contagem)
      .map(function (k) { return { rotulo: encurtarVertenteTag_(k), total: contagem[k] }; })
      .sort(function (a, b) { return b.total - a.total; });

    var resultado = {
      fonte: 'ok',
      total: total,
      vertentes: vertentes,
      lider: vertentes.length ? vertentes[0] : null,
      periodo: (menor && maior)
        ? Utilities.formatDate(menor, fuso, 'dd/MM') + '–' + Utilities.formatDate(maior, fuso, 'dd/MM')
        : null
    };

    var json = JSON.stringify(resultado);
    if (json.length < 95000) cache.put(PROGRAMA_TAG_CACHE_CHAVE_, json, TAG_SAF_CACHE_SEGUNDOS_);
    return resultado;
  } catch (e) {
    return { fonte: 'erro', erro: String(e && e.message ? e.message : e) };
  }
}

/**
 * "TAG - SAF - Safety" -> "Safety"; "SEGURANÇA - VER E AGIR" -> "Ver e Agir".
 * O prefixo é o mesmo em todas e só ocupa espaço num tile de ~130px.
 */
var VERTENTE_TAG_MINUSCULAS_ = ['e', 'de', 'da', 'do', 'das', 'dos', 'em', 'a', 'o'];

function encurtarVertenteTag_(bruto) {
  var partes = String(bruto).split(' - ');
  var ultima = (partes[partes.length - 1] || bruto).trim();

  // Só re-capitaliza o que veio TODO em caixa alta ("VER E AGIR"). Nomes que já
  // vêm capitalizados ("Professional Maintenance") passam intactos.
  if (ultima !== ultima.toUpperCase()) return ultima;

  return ultima.toLowerCase().split(/\s+/).map(function (palavra, i) {
    // Conjunção/preposição no meio fica minúscula: "Ver e Agir", não "Ver E Agir".
    if (i > 0 && VERTENTE_TAG_MINUSCULAS_.indexOf(palavra) !== -1) return palavra;
    return palavra.charAt(0).toUpperCase() + palavra.slice(1);
  }).join(' ');
}

/**
 * getSheetByName exige casamento exato, e "Respostas ao formulário 5" tem acento
 * e espaços — qualquer espaço sobrando ou acento diferente derrubaria a leitura.
 * Tenta o nome exato primeiro e só então cai na comparação normalizada.
 */
function localizarAbaTolerante_(planilha, nome) {
  var exata = planilha.getSheetByName(nome);
  if (exata) return exata;

  var alvo = normalizarChaveTexto_(nome);
  var abas = planilha.getSheets();
  for (var i = 0; i < abas.length; i++) {
    if (normalizarChaveTexto_(abas[i].getName()) === alvo) return abas[i];
  }
  return null;
}

/** Elege a coluna com mais valores casando um padrão (amostra de 400 linhas). */
function localizarColunaPorPadrao_(dados, padrao) {
  var limite = Math.min(dados.length, 401);
  var melhorCol = -1, melhorAcertos = 0;
  for (var c = 0; c < dados[0].length; c++) {
    var acertos = 0;
    for (var l = 1; l < limite; l++) {
      if (padrao.test(String(dados[l][c] || ''))) acertos++;
    }
    if (acertos > melhorAcertos) { melhorAcertos = acertos; melhorCol = c; }
  }
  return melhorAcertos >= 10 ? melhorCol : -1;
}

/**
 * Lê a aba do DOJO e calcula o percentual de aderência.
 */
function obterResumoDojo_(forcar) {
  try {
    var cache = CacheService.getScriptCache();
    if (!forcar) {
      var cacheado = cache.get(DOJO_CACHE_CHAVE_);
      if (cacheado) return JSON.parse(cacheado);
    }

    var planilha = SpreadsheetApp.openById(DOJO_SPREADSHEET_ID_);
    var aba = localizarAbaTolerante_(planilha, DOJO_ABA_);
    if (!aba) throw new Error('Aba "' + DOJO_ABA_ + '" não encontrada no DOJO.');

    var ultimaLinha = aba.getLastRow();
    var participantes = 0;

    if (ultimaLinha > 1) {
      // Lê apenas a primeira coluna (Data) para contar e ignorar eventuais linhas vazias
      var dados = aba.getRange(2, 1, ultimaLinha - 1, 1).getValues();
      for (var i = 0; i < dados.length; i++) {
        if (dados[i][0]) participantes++;
      }
    }

    var faltam = Math.max(0, DOJO_TOTAL_COLABORADORES_ - participantes);
    var pct = (participantes / DOJO_TOTAL_COLABORADORES_) * 100;

    var resultado = {
      fonte: 'ok',
      participantes: participantes,
      faltam: faltam,
      percentual: pct.toFixed(1).replace('.', ',') + '%'
    };

    cache.put(DOJO_CACHE_CHAVE_, JSON.stringify(resultado), CACHE_SEGUNDOS_6H_);
    return resultado;
  } catch (e) {
    return { fonte: 'erro', erro: String(e && e.message ? e.message : e) };
  }
}

function montarResumoHome_(ano, anosDisponiveis, cruz) {
  var totaisTodas = cruz.totaisPorDepartamentoMes['Todas'] || {};

  var hht = { porAnoMes: {}, porMacro: {}, erro: null };
  try {
    hht = obterDadosHHT_();
  } catch (e) {
    hht.erro = String(e && e.message ? e.message : e);
  }
  var hhtDoAno = (hht.porAnoMes && hht.porAnoMes[ano]) || {};

  var scorecard = null;
  var scorecardErro = null;
  try {
    scorecard = obterDadosScorecard_(ano);
  } catch (e) {
    scorecardErro = String(e && e.message ? e.message : e);
  }

  // Acumulado YTD publicado na aba "{ano} Acumulado" da Base HHT — fonte dos
  // tiles REC/FAI desde 29/07. NUNCA lança: se a aba sumir ou for renomeada, o
  // tile mostra o erro em vez de derrubar a home inteira.
  var acumulado = null;
  var acumuladoErro = null;
  try {
    acumulado = obterAcumuladoPlanta_(ano);
  } catch (e) {
    acumuladoErro = String(e && e.message ? e.message : e);
  }

  var meses = [];
  var acumFai = 0, acumRec = 0, acumHoras = 0, acumQuase = 0;

  for (var mes = 1; mes <= 12; mes++) {
    var t = totaisTodas[mes] || {};
    var fai = Number(t.amarelo) || 0;                          // Primeiros Socorros
    var rec = somaSegura_(t.laranja, t.vermelho);              // registráveis: sem + com afastamento
    var comAfastamento = Number(t.vermelho) || 0;
    var quase = Number(t.azul) || 0;
    var horas = Number(hhtDoAno[mes]) || 0;

    if (horas > 0) {
      acumFai += fai;
      acumRec += rec;
      acumQuase += quase;
      acumHoras += horas;
    }

    meses.push({
      mes: mes,
      fai: fai,
      rec: rec,
      comAfastamento: comAfastamento,
      quase: quase,
      hht: horas,
      taxaFai: horas > 0 ? (fai * TAXA_BASE_HORAS_) / horas : null,
      taxaRec: horas > 0 ? (rec * TAXA_BASE_HORAS_) / horas : null
    });
  }

  function serieDoIndicador_(chave, campo) {
    if (!scorecard || !scorecard.indicadores || !scorecard.indicadores[chave]) return null;
    var s = scorecard.indicadores[chave][campo];
    return (s && s.length) ? s : null;
  }

  function ytdDoIndicador_(chave, campo) {
    if (!scorecard || !scorecard.indicadores || !scorecard.indicadores[chave]) return null;
    var v = scorecard.indicadores[chave][campo];
    return (v === undefined) ? null : v;
  }

  // A meta é constante ao longo do ano na planilha; o valor exibido é o 1º mês
  // preenchido, pra não depender de o mês corrente já estar lançado.
  function primeiraMeta_(serie) {
    if (!serie) return null;
    for (var i = 0; i < serie.length; i++) {
      if (serie[i] !== null && serie[i] !== undefined) return serie[i];
    }
    return null;
  }

  var metaRecSerie = serieDoIndicador_('trr total recordable rate', 'meta');
  var metaFaiSerie = serieDoIndicador_('first aid', 'meta');

  return {
    ano: ano,
    anos: anosDisponiveis,
    // Mês que os tiles de taxa tentam exibir. Vem do SERVIDOR de propósito: o
    // relógio do navegador pode estar em outro fuso/errado, e isso mudaria em
    // silêncio qual mês a home apresenta como corrente.
    mesReferencia: (ano === new Date().getFullYear()) ? (new Date().getMonth() + 1) : 12,
    meses: meses,
    ytd: {
      fai: acumFai,
      rec: acumRec,
      quase: acumQuase,
      hht: acumHoras,
      mesesComHht: meses.filter(function (m) { return m.hht > 0; }).length,
      taxaFai: acumHoras > 0 ? (acumFai * TAXA_BASE_HORAS_) / acumHoras : null,
      taxaRec: acumHoras > 0 ? (acumRec * TAXA_BASE_HORAS_) / acumHoras : null
    },
    metas: {
      taxaFai: primeiraMeta_(metaFaiSerie),
      taxaRec: primeiraMeta_(metaRecSerie),
      serieFai: metaFaiSerie,
      serieRec: metaRecSerie
    },
    // Séries PUBLICADAS no Scorecard — é o que a liderança valida. Desde
    // 2026-07-27 são elas que a home exibe, e não mais a taxa que calculávamos
    // aqui a partir da Compilado + HHT. Motivo: as duas fecham exatamente de
    // janeiro a maio (as taxas oficiais dão ocorrências inteiras contra o HHT:
    // 6/4/7/5/3 de primeiros socorros, 1 registrável em mar e 1 em mai), mas
    // junho e julho divergem porque a base de HHT vem atrasada — julho não tem
    // HHT lançado, então a taxa calculada nem existia, enquanto o Scorecard já
    // publica 0,390. Exibir o publicado elimina a divergência na origem.
    oficial: {
      firstAid: serieDoIndicador_('first aid', 'real'),
      trr: serieDoIndicador_('trr total recordable rate', 'real'),
      comAfastamento: serieDoIndicador_('tx acidente com afastamento', 'real'),
      nearMiss: serieDoIndicador_('near miss', 'real'),
      atosCondicoes: serieDoIndicador_('atos e condicoes inseguras', 'real'),
      scoreSeguranca: serieDoIndicador_('score seguranca', 'real'),
      // Acumulado publicado na coluna YTD do Scorecard. NÃO é mais o que os tiles
      // exibem — desde 29/07 o YTD vem da aba "{ano} Acumulado" da Base HHT (campo
      // `acumulado` abaixo), que é a fonte que o usuário confirmou. Fica lido como
      // CONFERÊNCIA: o tooltip mostra este valor quando ele diverge daquele.
      faiYtd: ytdDoIndicador_('first aid', 'realYtd'),
      trrYtd: ytdDoIndicador_('trr total recordable rate', 'realYtd')
    },
    // YTD OFICIAL DE RIO CLARO — aba "{ano} Acumulado" da Base HHT. Fonte
    // confirmada pelo usuário em 2026-07-29; é o que os tiles REC/FAI exibem.
    //   fai  = coluna "Primeiros socorros atual", PUBLICADA por eles
    //   rec  = DERIVADA, (contagem de registráveis x 200.000) / horas — a aba
    //          não traz taxa REC pronta, só a contagem. Fórmula idêntica à que
    //          eles usam na coluna do FAI, e sobre os números deles.
    acumulado: acumulado ? {
      fai: acumulado.total.fai,
      rec: acumulado.total.rec,
      primeirosSocorros: acumulado.total.primeirosSocorros,
      recordaveis: acumulado.total.recordaveis,
      quase: acumulado.total.quase,
      horas: acumulado.total.horas,
      threshold: acumulado.total.threshold,
      faiRecalculado: acumulado.total.faiRecalculado,
      aba: acumulado.aba,
      erro: null
    } : { erro: acumuladoErro || 'Fonte indisponível' },
    // Acompanhamento da rotina do pilar (Major Actions/ATS, Cultura Bradley,
    // Expansão S3/S4). NÃO existe no Scorecard Manufatura LAR — as 49 abas do
    // workbook foram varridas e nenhuma traz esses indicadores. Fica declarado
    // como fonte pendente para a tela mostrar o estado "aguardando fonte" em
    // vez de inventar número.
    //
    // Expansão S3 / Extensão S4 passaram a carregar a META decidida na reunião
    // com a Beatriz. O REALIZADO continua sem fonte — ver META_ROTINA_.
    rotina: {
      fonte: 'nao_configurada',
      majorActions: null, // Substituído na interface
      dojo: obterResumoDojo_(),
      bradley: null,
      expansaoS3: { meta: META_EXPANSAO_S3_, realizado: null, origemMeta: META_ROTINA_ORIGEM_ },
      extensaoS4: { meta: META_EXTENSAO_S4_, realizado: null, origemMeta: META_ROTINA_ORIGEM_ }
    },
    tags: obterResumoProgramaTag_(),
    diagnostico: {
      hhtErro: hht.erro || null,
      hhtOrigemColunaHoras: hht.origemColunaHoras || null,
      hhtLinhasLidas: hht.linhasLidas || 0,
      scorecardErro: scorecardErro,
      scorecardAba: scorecard ? scorecard.aba : null,
      acumuladoErro: acumuladoErro,
      acumuladoAba: acumulado ? acumulado.aba : null,
      acumuladoOrigemColunas: acumulado ? acumulado.origemColunas : null,
      // Se isto vier > 0, a coluna publicada de FAI deixou de bater com
      // (primeiros socorros x 200.000 / horas) — vale investigar antes de confiar.
      acumuladoDivergenciaFai: acumulado ? acumulado.divergenciaFai : null
    }
  };
}

/**
 * BOOTSTRAP — uma chamada só para tudo que a home E o painel METRICS SAF
 * precisam. Antes eram duas chamadas separadas (getResumoHome e
 * getContextoCruzSeguranca) que pediam o MESMO pacote do MESMO ano, ou seja,
 * duas leituras completas da Compilado por sessão.
 *
 * O nome do usuário NÃO entra aqui de propósito: ele alimenta a abertura
 * cinematográfica e precisa chegar rápido. Se estivesse no mesmo pacote, uma
 * leitura lenta seguraria a tela de abertura com o usuário sem entender por quê.
 *
 * O painel RISK também fica de fora: é outra planilha, raramente aberta, e
 * entraria como latência fixa para todo mundo.
 */
function getBootstrapDados(ano) {
  var anos = getAnosDisponiveis();
  var anoAlvo = Number(ano) || anos[0] || new Date().getFullYear();
  var pacote = getCruzAnoCompleto(anoAlvo); // memoizado: só 1 leitura nesta execução

  return {
    home: montarResumoHome_(anoAlvo, anos, pacote),
    campanha: obterCampanhaAtual(), // nunca lança: cai no padrão embutido
    cruz: {
      anos: anos,
      anoAtual: anoAlvo,
      mesAtual: new Date().getMonth() + 1,
      departamentos: pacote.departamentos,
      porDepartamentoMes: pacote.porDepartamentoMes,
      totaisPorDepartamentoMes: pacote.totaisPorDepartamentoMes,
      ocorrenciasPorDepartamentoMes: pacote.ocorrenciasPorDepartamentoMes,
      totaisTagSaf: pacote.totaisTagSaf,
      tagSafety: pacote.tagSafety
    }
  };
}

/**
 * AQUECIMENTO DE CACHE — para ligar num acionador por tempo (a cada 5h, contra
 * um TTL de 6h). Sem isso, o primeiro usuário depois de cada expiração paga a
 * releitura completa (a TAG SAF sozinha tem ~65 mil linhas).
 *
 * Roda com `forcar = true` de propósito: se apenas lesse, encontraria o cache
 * ainda quente e não renovaria nada — e o cache expiraria assim mesmo, na cara
 * do próximo usuário.
 */
function aquecerCaches() {
  var inicio = new Date().getTime();
  var relatorio = [];

  var anos = [];
  try {
    anos = getAnosDisponiveis().slice(0, 1); // só o ano corrente: é o que a tela abre
  } catch (e) {
    relatorio.push('anos: ERRO ' + e.message);
  }

  try {
    obterTotaisTagSaf_(true);
    relatorio.push('TAG SAF: ok');
  } catch (e) {
    relatorio.push('TAG SAF: ERRO ' + e.message);
  }

  try {
    obterDadosHHT_(true);
    relatorio.push('HHT: ok');
  } catch (e) {
    relatorio.push('HHT: ERRO ' + e.message);
  }

  // KPI "TAGs registradas" da home. obterResumoProgramaTag_ nunca lança (trata
  // o erro por dentro e devolve fonte:'erro'), então o try aqui é só simetria.
  try {
    var tags = obterResumoProgramaTag_(true);
    relatorio.push('Programa TAG: ' + (tags.fonte === 'ok' ? 'ok' : tags.fonte));
  } catch (e) {
    relatorio.push('Programa TAG: ERRO ' + e.message);
  }

  anos.forEach(function (ano) {
    try {
      obterDadosScorecard_(ano, true);
      relatorio.push('Scorecard ' + ano + ': ok');
    } catch (e) {
      relatorio.push('Scorecard ' + ano + ': ERRO ' + e.message);
    }

    try {
      // forcar=false aqui: a TAG SAF já foi renovada logo acima, então este
      // recálculo aproveita o cache dela em vez de reler as 65 mil linhas.
      cacheRemoverGrande_(CRUZ_CACHE_CHAVE_ + ano);
      delete CRUZ_MEMO_[ano];
      getCruzAnoCompleto(ano);
      relatorio.push('Cruz ' + ano + ': ok');
    } catch (e) {
      relatorio.push('Cruz ' + ano + ': ERRO ' + e.message);
    }
  });

  var segundos = Math.round((new Date().getTime() - inicio) / 1000);
  var texto = 'aquecerCaches (' + segundos + 's): ' + relatorio.join(' | ');
  Logger.log(texto);
  return texto;
}

/**
 * Instala (ou reinstala) o acionador por tempo do aquecimento. Rodar UMA vez
 * no editor do Apps Script. Remove duplicatas antes de criar, então pode ser
 * executada de novo sem empilhar acionadores.
 */
/**
 * Instala (ou reinstala) o acionador por tempo do aquecimento. Rodar UMA vez
 * no editor do Apps Script. Remove duplicatas antes de criar, então pode ser
 * executada de novo sem empilhar acionadores.
 */
function criarAcionadorAquecimento() {
  ScriptApp.getProjectTriggers().forEach(function (gatilho) {
    if (gatilho.getHandlerFunction() === 'aquecerCaches') ScriptApp.deleteTrigger(gatilho);
  });

  // Alterado para rodar a cada 1 hora, já que o cache agora dura 1.5 horas
  ScriptApp.newTrigger('aquecerCaches').timeBased().everyHours(1).create();
  return 'Acionador de aquecimento criado (a cada 1h).';
}

/**
 * Zera todos os caches do portal. Usar depois de mexer nas planilhas quando
 * não se quer esperar as 6h do TTL.
 */
function limparCachesSaf() {
  var cache = CacheService.getScriptCache();
  // Toda chave de cache nova precisa entrar aqui, senão sobrevive à limpeza.
  var chaves = [
    HHT_CACHE_CHAVE_,
    CAMPANHA_CACHE_CHAVE_,
    TAG_SAFETY_CACHE_CHAVE_,
    PROGRAMA_TAG_CACHE_CHAVE_
  ];

  // Boneco — Partes do Corpo: fatiado (cacheGravarGrande_), remoção própria
  // igual TAG SAF, senão os pedaços _p0.._pN ficam pra trás.
  cacheRemoverGrande_(PARTES_CORPO_CACHE_CHAVE_);
  PARTES_CORPO_MEMO_ = null;

  // ATS e o painel de Ocorrências — também fatiados, mesma razão.
  cacheRemoverGrande_(ATS_CACHE_CHAVE_);
  cacheRemoverGrande_(OCORRENCIAS_PAINEL_CACHE_CHAVE_);

  // Causa raiz e objeto causador — mesma aba de ocorrências, chaves próprias.
  cacheRemoverGrande_(CAUSA_RAIZ_CACHE_CHAVE_);
  cacheRemoverGrande_(OBJETO_CAUSADOR_CACHE_CHAVE_);

  // Action Tracker de auditorias SAF — fatiado igual aos de cima.
  cacheRemoverGrande_(SAF_AUDITORIA_CACHE_CHAVE_);

  // Route Map (Base WCM) — fatiado, guarda TODOS os anos numa chave só.
  cacheRemoverGrande_(ROUTE_MAP_CACHE_CHAVE_);

  // Farol Pilar SAF — fonte de Expansão / Extensão / Aderência.
  cacheRemoverGrande_(FAROL_SAF_CACHE_CHAVE_);

  // Acumulado YTD é cacheado por ano — uma chave por ano disponível.
  getAnosDisponiveis().forEach(function (ano) {
    chaves.push(HHT_ACUMULADO_CACHE_CHAVE_ + ano);
  });

  // TAG SAF é fatiado (v2) — remoção própria, um removeAll simples deixaria os
  // pedaços _p0.._pN pra trás.
  cacheRemoverGrande_(TAG_SAF_CACHE_CHAVE_);

  getAnosDisponiveis().forEach(function (ano) {
    chaves.push(SCORECARD_CACHE_CHAVE_ + ano);
    cacheRemoverGrande_(CRUZ_CACHE_CHAVE_ + ano);
    delete CRUZ_MEMO_[ano];
  });

  cache.removeAll(chaves);
  return 'Caches limpos: ' + chaves.join(', ') + ' (+ TAG SAF e pacotes da Cruz, fatiados).';
}

/**
 * ===================================================
 * CAMPANHAS / DIVULGAÇÃO (espaço do Meu Feed)
 *
 * Por padrão exibe o programa de meses temáticos (Abril Verde, Maio Amarelo,
 * Setembro Amarelo...), escolhido pelo mês corrente. Os gestores da página
 * trocam a arte e o texto numa PLANILHA — nunca no código.
 *
 * O id dessa planilha fica em ScriptProperties, e a própria planilha é criada
 * por configurarCampanhas(). Ou seja: nem na primeira vez é preciso editar
 * código pra apontar o id.
 * ===================================================
 */
var CAMPANHA_PROP_CHAVE_ = 'campanhasPlanilhaId';
var CAMPANHA_ABA_ = 'Campanhas';
var CAMPANHA_CACHE_CHAVE_ = 'campanhaAtual_v1';
// 15 min (não 6h): quando o gestor troca a arte, ele espera ver no site logo.
var CAMPANHA_CACHE_SEGUNDOS_ = 900;

/**
 * Calendário de meses temáticos usado como padrão. Serve de conteúdo inicial da
 * planilha E de rede de segurança: se a planilha não existir, estiver vazia ou
 * falhar, o espaço mostra isso em vez de ficar em branco.
 * `corTexto` só é definido nos fundos claros, onde texto branco não teria
 * contraste suficiente.
 */
var CAMPANHAS_PADRAO_ = [
  { mes: 1, titulo: 'Janeiro Branco', tema: 'Saúde mental e qualidade de vida', cor: '#e2e8f0', corTexto: '#0f172a' },
  { mes: 2, titulo: 'Fevereiro Roxo', tema: 'Lúpus, Alzheimer e fibromialgia', cor: '#7c3aed' },
  { mes: 3, titulo: 'Março Lilás', tema: 'Prevenção do câncer de colo do útero', cor: '#a78bfa' },
  { mes: 4, titulo: 'Abril Verde', tema: 'Saúde e segurança no trabalho', cor: '#2e7d32' },
  { mes: 5, titulo: 'Maio Amarelo', tema: 'Segurança no trânsito', cor: '#f9a825', corTexto: '#3f2d00' },
  { mes: 6, titulo: 'Junho Vermelho', tema: 'Doação de sangue', cor: '#c62828' },
  { mes: 7, titulo: 'Julho Amarelo', tema: 'Prevenção das hepatites virais', cor: '#f6c026', corTexto: '#3f2d00' },
  { mes: 8, titulo: 'Agosto Dourado', tema: 'Aleitamento materno', cor: '#b8860b' },
  { mes: 9, titulo: 'Setembro Amarelo', tema: 'Valorização da vida e prevenção do suicídio', cor: '#fbc02d', corTexto: '#3f2d00' },
  { mes: 10, titulo: 'Outubro Rosa', tema: 'Prevenção do câncer de mama', cor: '#ec407a' },
  { mes: 11, titulo: 'Novembro Azul', tema: 'Saúde do homem', cor: '#1565c0' },
  { mes: 12, titulo: 'Dezembro Vermelho', tema: 'Prevenção ao HIV/Aids', cor: '#d32f2f' }
];

var CAMPANHA_CABECALHOS_ = ['Ativo', 'Título', 'Tema', 'Mês', 'Data início', 'Data fim', 'Imagem (link)', 'Link do card', 'Cor'];

/**
 * Converte o que o gestor colar na coluna "Imagem" numa URL que o <img> do
 * portal consegue exibir. Um link normal do Drive ("/file/d/ID/view") abre a
 * página do visualizador, não a imagem — por isso vira a URL de thumbnail, que
 * ainda por cima já devolve a imagem redimensionada.
 * Aceita: link de arquivo do Drive, link "open?id=", o id solto, ou uma URL
 * pública qualquer (que passa direto).
 */
function normalizarUrlImagem_(bruto) {
  var texto = String(bruto == null ? '' : bruto).trim();
  if (!texto) return '';

  var porCaminho = texto.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (porCaminho) return 'https://drive.google.com/thumbnail?id=' + porCaminho[1] + '&sz=w1000';

  var porParametro = texto.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (porParametro && texto.indexOf('drive.google.com') !== -1) {
    return 'https://drive.google.com/thumbnail?id=' + porParametro[1] + '&sz=w1000';
  }

  if (/^https?:\/\//i.test(texto)) return texto;

  // id solto colado da barra de endereço
  if (/^[a-zA-Z0-9_-]{20,60}$/.test(texto)) {
    return 'https://drive.google.com/thumbnail?id=' + texto + '&sz=w1000';
  }

  return '';
}

function campanhaPadraoDoMes_(mes) {
  for (var i = 0; i < CAMPANHAS_PADRAO_.length; i++) {
    if (CAMPANHAS_PADRAO_[i].mes === mes) return CAMPANHAS_PADRAO_[i];
  }
  return CAMPANHAS_PADRAO_[0];
}

function ehSim_(valor) {
  var t = normalizarChaveTexto_(valor);
  return t === '' || t === 'sim' || t === 's' || t === 'true' || t === 'x' || t === 'ativo';
}

function soData_(valor) {
  if (!(valor instanceof Date)) return null;
  return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate()).getTime();
}

/**
 * Cria (ou reaproveita) a planilha de campanhas, já com cabeçalho e os 12 meses
 * temáticos preenchidos, e guarda o id em ScriptProperties. Rodar UMA vez no
 * editor do Apps Script; devolve a URL pra compartilhar com os gestores.
 * É idempotente: se a planilha já existe, só devolve a URL dela.
 */
function configurarCampanhas() {
  var props = PropertiesService.getScriptProperties();
  var idExistente = props.getProperty(CAMPANHA_PROP_CHAVE_);

  if (idExistente) {
    try {
      var jaExiste = SpreadsheetApp.openById(idExistente);
      var jaMsg = 'Planilha de campanhas já configurada: ' + jaExiste.getUrl();
      Logger.log(jaMsg); // o editor não mostra valor de retorno, só o log
      return jaMsg;
    } catch (e) {
      // id guardado aponta pra algo apagado/inacessível — recria abaixo
    }
  }

  var planilha = SpreadsheetApp.create('Portal SAF — Campanhas e Divulgação');
  var aba = planilha.getSheets()[0];
  aba.setName(CAMPANHA_ABA_);

  var linhas = [CAMPANHA_CABECALHOS_];
  CAMPANHAS_PADRAO_.forEach(function (c) {
    linhas.push(['SIM', c.titulo, c.tema, c.mes, '', '', '', '', c.cor]);
  });

  aba.getRange(1, 1, linhas.length, CAMPANHA_CABECALHOS_.length).setValues(linhas);
  aba.getRange(1, 1, 1, CAMPANHA_CABECALHOS_.length).setFontWeight('bold').setBackground('#0d436b').setFontColor('#ffffff');
  aba.setFrozenRows(1);
  aba.setColumnWidth(2, 180);
  aba.setColumnWidth(3, 260);
  aba.setColumnWidth(7, 320);
  aba.setColumnWidth(8, 260);

  props.setProperty(CAMPANHA_PROP_CHAVE_, planilha.getId());
  CacheService.getScriptCache().remove(CAMPANHA_CACHE_CHAVE_);

  var msg = 'Planilha de campanhas criada: ' + planilha.getUrl();
  Logger.log(msg); // o editor não mostra valor de retorno, só o log
  return msg;
}

/**
 * Devolve (e loga) o link da planilha de campanhas já configurada. Existe
 * porque o editor do Apps Script não exibe valor de retorno — sem um Logger.log
 * não há como ver a URL depois que configurarCampanhas() já rodou.
 */
function linkPlanilhaCampanhas() {
  var id = PropertiesService.getScriptProperties().getProperty(CAMPANHA_PROP_CHAVE_);

  if (!id) {
    var faltando = 'Nenhuma planilha de campanhas configurada — rode configurarCampanhas().';
    Logger.log(faltando);
    return faltando;
  }

  var url;
  try {
    url = SpreadsheetApp.openById(id).getUrl();
  } catch (e) {
    url = 'https://docs.google.com/spreadsheets/d/' + id + '/edit  (id guardado: ' + id + ' — não consegui abrir: ' + e.message + ')';
  }

  Logger.log(url);
  return url;
}

/**
 * Campanha que o portal deve exibir agora.
 *
 * Prioridade:
 *  1. linha ativa com Data início/fim cobrindo hoje (evento pontual — SIPAT,
 *     semana de segurança, campanha de vacinação...). Entre várias, vence a de
 *     janela mais curta, que é a mais específica;
 *  2. linha ativa cujo "Mês" é o mês corrente (o programa de meses temáticos);
 *  3. o padrão embutido do mês, se a planilha não existir ou não tiver o mês.
 *
 * Nunca lança: qualquer falha cai no padrão embutido, porque um espaço de
 * divulgação quebrado é pior que um genérico.
 */
function obterCampanhaAtual() {
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get(CAMPANHA_CACHE_CHAVE_);
  if (cacheado) return JSON.parse(cacheado);

  var hoje = new Date();
  var mesAtual = hoje.getMonth() + 1;
  var padrao = campanhaPadraoDoMes_(mesAtual);

  var resultado = {
    titulo: padrao.titulo,
    tema: padrao.tema,
    imagem: '',
    link: '',
    cor: padrao.cor,
    corTexto: padrao.corTexto || '#ffffff',
    origem: 'padrao',
    mes: mesAtual,
    aviso: null
  };

  try {
    var id = PropertiesService.getScriptProperties().getProperty(CAMPANHA_PROP_CHAVE_);
    if (!id) {
      resultado.aviso = 'Planilha de campanhas ainda não configurada (rode configurarCampanhas).';
    } else {
      var aba = SpreadsheetApp.openById(id).getSheetByName(CAMPANHA_ABA_);
      if (!aba) throw new Error('Aba "' + CAMPANHA_ABA_ + '" não encontrada.');

      var ultimaLinha = aba.getLastRow();
      if (ultimaLinha >= 2) {
        var dados = aba.getRange(2, 1, ultimaLinha - 1, CAMPANHA_CABECALHOS_.length).getValues();
        var marcoHoje = soData_(hoje);
        var porData = null;
        var janelaVencedora = Infinity;
        var porMes = null;

        dados.forEach(function (linha) {
          if (!ehSim_(linha[0])) return;

          var titulo = String(linha[1] || '').trim();
          if (!titulo) return;

          var inicio = soData_(linha[4]);
          var fim = soData_(linha[5]);

          if (inicio !== null && fim !== null && marcoHoje >= inicio && marcoHoje <= fim) {
            var janela = fim - inicio;
            if (janela < janelaVencedora) {
              janelaVencedora = janela;
              porData = linha;
            }
            return;
          }

          if (!porMes && Number(linha[3]) === mesAtual) porMes = linha;
        });

        var escolhida = porData || porMes;
        if (escolhida) {
          resultado.titulo = String(escolhida[1] || '').trim();
          resultado.tema = String(escolhida[2] || '').trim();
          resultado.imagem = normalizarUrlImagem_(escolhida[6]);
          resultado.link = String(escolhida[7] || '').trim();
          var cor = String(escolhida[8] || '').trim();
          if (cor) {
            resultado.cor = cor;
            resultado.corTexto = '#ffffff'; // cor customizada: assume fundo escuro
          }
          resultado.origem = porData ? 'planilha-evento' : 'planilha-mes';
        }
      }
    }
  } catch (e) {
    resultado.aviso = 'Falha ao ler a planilha de campanhas: ' + (e && e.message ? e.message : e);
  }

  cache.put(CAMPANHA_CACHE_CHAVE_, JSON.stringify(resultado), CAMPANHA_CACHE_SEGUNDOS_);
  return resultado;
}

/**
 * DIAGNÓSTICO — só leitura. Roda no editor do Apps Script (Executar > ver
 * Registros) pra conferir, contra a planilha VIVA, o que as duas funções de
 * extração novas estão enxergando: HHT por mês e o bloco SEGURANÇA do
 * Scorecard (indicador, unidade, meta e real por mês).
 */
function debugFontesHome(ano) {
  ano = Number(ano) || getAnosDisponiveis()[0] || new Date().getFullYear();
  var linhas = [];

  try {
    var hht = obterDadosHHT_();
    linhas.push('HHT — coluna de horas via: ' + hht.origemColunaHoras + ' | linhas lidas: ' + hht.linhasLidas);
    Object.keys(hht.porAnoMes).sort().forEach(function (a) {
      Object.keys(hht.porAnoMes[a]).sort(function (x, y) { return x - y; }).forEach(function (m) {
        linhas.push('  HHT ' + a + '-' + m + ': ' + Math.round(hht.porAnoMes[a][m]));
      });
    });
  } catch (e) {
    linhas.push('HHT ERRO: ' + e.message);
  }

  try {
    var sc = obterDadosScorecard_(ano);
    linhas.push('');
    linhas.push('SCORECARD — aba "' + sc.aba + '"');
    Object.keys(sc.indicadores).forEach(function (chave) {
      var ind = sc.indicadores[chave];
      linhas.push('  [' + chave + '] ' + ind.rotulo + ' (' + ind.unidade + ')');
      linhas.push('     meta: ' + JSON.stringify(ind.meta));
      linhas.push('     real: ' + JSON.stringify(ind.real));
    });
  } catch (e) {
    linhas.push('SCORECARD ERRO: ' + e.message);
  }

  Logger.log(linhas.join('\n'));
  return linhas;
}


// ============================================================================
// PARTES DO CORPO — item "3 - Boneco" (One Page) + versão dinâmica no METRICS
// SAF (filtro Ano/Mês/Área) + versão estática do Mês Atual no Meu Feed.
//
// Fonte: planilha "Ocorrências (FAI / REC)", 145 colunas, cabeçalhos em
// INGLÊS. CORRIGIDO em 2026-08-07 — a planilha usada antes (aba "Default",
// 158 colunas, cabeçalhos em português) estava ERRADA; este módulo foi
// reescrito do zero pra planilha certa.
//
// MAPEAMENTO POR NOME DE CABEÇALHO (não por índice fixo): esta planilha não
// tem o problema de desalinhamento da anterior, e o usuário pediu
// explicitamente esse formato — evita quebrar se uma coluna for inserida ou
// movida. Ver obterIndicesOcorrencias_.
//
// ============================ REGRA v5 ======================================
// Classificação ATUAL (decidida em 2026-08-17, com base em medição — ver
// debugCriterioRecordable):
//   recordable        = "Locally Reportable?" == "Yes"     <-- critério BRASILEIRO
//   comAfastamento    = recordable E "Inj. DAFW?" verdadeiro
//   semAfastamento    = recordable E NÃO comAfastamento
//   primeirosSocorros = NÃO recordable  (categoria residual, cobre o resto)
//
// POR QUE MUDOU DE "U.S. OSHA Recordable?" PARA "Locally Reportable?":
// o gráfico que a Beatriz usa (slide "Página 2 - Métricas") contava 55
// recordables onde o portal contava 46. A medição fechou a questão — o critério
// LOCAL reproduz o slide EXATAMENTE, em 6 anos e 12 números:
//
//   ano    slide REC   Local=Yes      slide FAI   não-local
//   2020      18          18             84          84
//   2021      11          11             74          74
//   2022       4           4             49          49
//   2023       6           6             39          39
//   2024      11          11             38          38
//   2025       4           4             51          51
//
// (2026 diverge só porque o slide foi gerado antes de 11 casos entrarem.)
// Os 13 casos que são "local mas não OSHA" têm todos Extent "Non- OSHA" e DAFW
// vazio: é acidente comunicável no Brasil que não é OSHA Recordable. Faz
// sentido que uma planta brasileira reporte pela regra brasileira.
//
// A categoria FAI deixou de exigir "Extent contém non osha": os 2 casos
// OSHA-mas-não-local precisam cair em FAI pra fechar com o slide, e como
// residual as três categorias passam a cobrir 100% das linhas (415), sem
// descarte silencioso — antes uma linha fora das três sumia da conta.
//
// [HISTÓRICO] regra v4, vigente de 2026-08-07 a 2026-08-17:
//   recordable        = "U.S. OSHA Recordable?" == "Yes"
//   primeirosSocorros = OSHA == "No" E "Extent" contém "non osha"
//                       E NÃO comAfastamento E NÃO semAfastamento
// Se algum dia o padrão corporativo (OSHA) voltar a ser o oficial, é só trocar
// idx.locallyReportable por idx.oshaRecordable na classificação e restaurar o
// ehPrimeirosSocorros_ — a função continua no arquivo.
//
//   AS TRÊS CATEGORIAS SÃO MUTUAMENTE EXCLUSIVAS: cada linha cai em no máximo
//   uma delas, e todo caso Recordable cai em exatamente uma (comAfastamento ou
//   semAfastamento). Somar as três dá o total real, sem dupla contagem — é
//   disso que depende o filtro "Todas" do boneco no Index.html.
//
//   ATENÇÃO: até a v3 isto NÃO valia — semAfastamento era o flag "Inj. RWA?"
//   isolado, as categorias podiam se sobrepor e, pior, os casos "Other
//   Recordable Case" (Recordable sem DAFW e sem RWA) não caíam em nenhuma e
//   sumiam do boneco. Foi o que motivou a v4. Se algum dia esta regra voltar a
//   permitir sobreposição, o total de "Todas" passa a contar em dobro.
//
//   "Inj. RWA?" foi REMOVIDA de OCORRENCIAS_CABECALHOS_ em 2026-08-08: a v4
//   derruba tudo de DAFW + Recordable e a coluna não era lida por ninguém.
//   Como obterIndicesOcorrencias_ lança erro para todo cabeçalho declarado que
//   não exista, mantê-la obrigava a planilha a ter uma coluna inútil. Se algum
//   dia a regra voltar a precisar de RWA, basta redeclarar a entrada aqui —
//   o índice passa a vir resolvido em idx.rwa, sem mais nenhuma mudança.
// ============================================================================

var OCORRENCIAS_SPREADSHEET_ID_ = '1kYzkDMlG4lVdeEUiQz15iipardyLuRO6o0qegBKyPsk';
var OCORRENCIAS_ABA_ = 'Ocorrências (FAI / REC)';

// SEMPRE que o FORMATO do pacote mudar, suba a versão da chave (ver aviso
// idêntico em CRUZ_CACHE_CHAVE_) — já esquecemos isso uma vez (v1->v2) e as
// descrições sumiram do Tracker Overview por 6h de cache velho. v3: troca
// completa de planilha/mapeamento (aba "Default" -> "Ocorrências (FAI/REC)").
// v3 -> v4 em 2026-08-07: "semAfastamento" mudou de "flag RWA" pra "Recordable
// e não-DAFW" (corrige casos Recordable que sumiam do boneco — ver comentário
// na definição de comAfastamento/semAfastamento mais abaixo).
// v4 -> v5 em 2026-08-09: a coluna de área mudou de 'Location' pra 'Area'.
// O CONTEÚDO do pacote muda (as chaves de área são outras), não só o formato —
// sem subir a versão, o cache de 6h seguiria servindo o agrupamento por
// Location e o filtro de área do boneco continuaria mostrando "Fabrica 2" por
// mais 6 horas depois do deploy.
// v5 -> v6 em 2026-08-17: a classificação trocou de "U.S. OSHA Recordable?"
// para "Locally Reportable?" (regra v5 no cabeçalho). O CONTEÚDO muda em todo
// lugar que lê este pacote — Boneco, card do Meu Feed e o FAI x Recordable —
// então sem subir a versão o cache de 6h serviria a contagem antiga por até 6h
// depois do deploy, com o gráfico novo mostrando o número velho.
var PARTES_CORPO_CACHE_CHAVE_ = 'partesDoCorpoTudo_v6';
var PARTES_CORPO_CACHE_SEGUNDOS_ = CACHE_SEGUNDOS_6H_;
var PARTES_CORPO_MEMO_ = null; // dedup dentro de uma execução

// Nome EXATO do cabeçalho (linha 1) -> chave interna que o resto do código usa.
// Se um desses nomes não existir na planilha, obterIndicesOcorrencias_ lança
// erro explícito (em vez de silenciosamente ler a coluna errada).
var OCORRENCIAS_CABECALHOS_ = {
  dafw: 'Inj. DAFW?',
  oshaRecordable: 'U.S. OSHA Recordable?',
  // Critério BRASILEIRO de registrável (coluna P). Virou o oficial do portal em
  // 2026-08-17 — ver o bloco "REGRA v5" no comentário do módulo.
  locallyReportable: 'Locally Reportable?',
  extent: 'Extent',
  // 2026-08-09: era 'Location' (área macro, ex: "Fabrica 2"). O usuário
  // definiu 'Area' (a linha exata, ex: "LINHA 5 - REDENTOR 20") como a coluna
  // oficial, pra o boneco e a página de Ocorrências agruparem pela MESMA
  // taxonomia — antes cada um usaria uma e os totais por área não bateriam.
  area: 'Area',
  bodyPart: 'Body Part',
  detailedBodyPart: 'Detailed Body Part(s)',
  diagnostico: 'Injury/Illness Type',
  descricao: 'Description',
  caseDate: 'Case Date'
};

/**
 * Lê a linha 1 (cabeçalhos) e resolve OCORRENCIAS_CABECALHOS_ pros índices
 * REAIS (0-based, pra bater com getValues()) daquela planilha específica.
 * Implementa a sugestão do usuário de mapear por nome em vez de índice fixo.
 *
 * NOTA sobre "área": a planilha tem 3 colunas candidatas — "Location" (área
 * macro, ex: "Fabrica 2"), "Area" (linha/setor específico, ex: "LINHA 8") e
 * "Employee Dept, Area (WHERE)" (departamento de lotação do funcionário).
 * Usamos "Location" por ser a mais parecida com o que o filtro usava antes;
 * se não for a certa, troque OCORRENCIAS_CABECALHOS_.area pra 'Area' ou
 * 'Employee Dept, Area (WHERE)' — só essa linha muda.
 */
function obterIndicesOcorrencias_(aba) {
  var cabecalhos = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var mapaNomeIndice = {};
  cabecalhos.forEach(function (nome, i) {
    var chave = String(nome || '').trim();
    if (chave) mapaNomeIndice[chave] = i; // 0-based
  });

  var indices = {};
  Object.keys(OCORRENCIAS_CABECALHOS_).forEach(function (chaveInterna) {
    var nomeReal = OCORRENCIAS_CABECALHOS_[chaveInterna];
    if (!(nomeReal in mapaNomeIndice)) {
      throw new Error('Coluna "' + nomeReal + '" não encontrada na aba "' + OCORRENCIAS_ABA_ +
        '". O cabeçalho pode ter mudado — confira a linha 1 da planilha.');
    }
    indices[chaveInterna] = mapaNomeIndice[nomeReal];
  });
  return indices;
}

/**
 * Palavras-chave EM INGLÊS (a planilha nova traz "Body Part"/"Detailed Body
 * Part(s)" em inglês, ex: "Arm", "Left Forearm", "Right Thumb") -> região
 * canônica do boneco. Casamento por PREFIXO de token (não substring solta):
 * cada palavra do texto é comparada contra os radicais abaixo, o que cobre
 * plural de graça ("finger"/"fingers", "toe"/"toes") sem listar as duas
 * formas, e evita falso positivo tipo "arm" casando dentro de "forearm"
 * (forearm não COMEÇA com "arm", então não bate com o radical 'arm').
 */
var PARTES_CORPO_REGIOES_EN_ = [
  { chave: 'head', regiao: 'cabeca' },
  { chave: 'skull', regiao: 'cabeca' },
  { chave: 'face', regiao: 'cabeca' },
  { chave: 'eye', regiao: 'cabeca' },
  { chave: 'nose', regiao: 'cabeca' },
  { chave: 'mouth', regiao: 'cabeca' },
  { chave: 'tooth', regiao: 'cabeca' },
  { chave: 'teeth', regiao: 'cabeca' },
  { chave: 'ear', regiao: 'cabeca' },
  { chave: 'forehead', regiao: 'cabeca' },
  { chave: 'chin', regiao: 'cabeca' },
  { chave: 'scalp', regiao: 'cabeca' },
  { chave: 'cranium', regiao: 'cabeca' },
  { chave: 'neck', regiao: 'pescoco' },
  { chave: 'cervical', regiao: 'pescoco' },
  { chave: 'shoulder', regiao: 'ombro' },
  { chave: 'clavicle', regiao: 'ombro' },
  { chave: 'collarbone', regiao: 'ombro' },
  { chave: 'elbow', regiao: 'cotovelo' },
  { chave: 'forearm', regiao: 'antebraco' }, // ANTES de 'arm' na ordem não importa (prefixo evita colisão), mas mantém agrupado
  { chave: 'arm', regiao: 'braco' },
  { chave: 'bicep', regiao: 'braco' },
  { chave: 'tricep', regiao: 'braco' },
  { chave: 'wrist', regiao: 'punho' },
  { chave: 'hand', regiao: 'mao' },
  { chave: 'palm', regiao: 'mao' },
  { chave: 'finger', regiao: 'mao' },
  { chave: 'thumb', regiao: 'mao' },
  { chave: 'nail', regiao: 'mao' },
  { chave: 'chest', regiao: 'torax' },
  { chave: 'thorax', regiao: 'torax' },
  { chave: 'rib', regiao: 'torax' },
  { chave: 'abdomen', regiao: 'abdomen' },
  { chave: 'stomach', regiao: 'abdomen' },
  { chave: 'belly', regiao: 'abdomen' },
  { chave: 'back', regiao: 'costas' },
  { chave: 'spine', regiao: 'costas' },
  { chave: 'dorsal', regiao: 'costas' },
  { chave: 'lumbar', regiao: 'costas' },
  { chave: 'hip', regiao: 'quadril' },
  { chave: 'pelvis', regiao: 'quadril' },
  { chave: 'groin', regiao: 'quadril' },
  { chave: 'buttock', regiao: 'quadril' },
  { chave: 'glute', regiao: 'quadril' },
  { chave: 'thigh', regiao: 'coxa' },
  { chave: 'knee', regiao: 'joelho' },
  { chave: 'leg', regiao: 'perna' },
  { chave: 'shin', regiao: 'perna' },
  { chave: 'calf', regiao: 'perna' },
  { chave: 'ankle', regiao: 'tornozelo' },
  { chave: 'foot', regiao: 'pe' },
  { chave: 'feet', regiao: 'pe' },
  { chave: 'toe', regiao: 'pe' },
  { chave: 'heel', regiao: 'pe' }
];

/**
 * Acha a região canônica a partir de um texto em inglês (Body Part ou
 * Detailed Body Part). Tokeniza por espaço (normalizarChaveTexto_ já troca
 * pontuação por espaço) e casa PREFIXO de cada token contra os radicais —
 * "forearm" não bate com o radical 'arm' porque não COMEÇA com "arm".
 */
function regiaoCorpoDoTexto_(brutoEn) {
  var normalizado = normalizarChaveTexto_(brutoEn);
  if (!normalizado) return 'outro';

  var tokens = normalizado.split(' ');
  for (var t = 0; t < tokens.length; t++) {
    var token = tokens[t];
    if (!token) continue;
    for (var i = 0; i < PARTES_CORPO_REGIOES_EN_.length; i++) {
      var regra = PARTES_CORPO_REGIOES_EN_[i];
      if (token.indexOf(regra.chave) === 0) return regra.regiao;
    }
  }
  return 'outro';
}

/** true se a célula for um flag "verdadeiro": 1, "1", "sim", "yes", "x". */
function flagVerdadeiro_(valor) {
  if (valor === 1 || valor === true) return true;
  var norm = normalizarTexto_(valor).trim();
  return norm === '1' || norm === 'sim' || norm === 'yes' || norm === 'x';
}

/**
 * Regra de Primeiros Socorros (FAI) confirmada pelo usuário em 2026-08-07:
 * "U.S. OSHA Recordable?" == "No" E "Extent" contém "non osha" (normalizado,
 * pra não quebrar com o espaço/hífen estranho que aparece na planilha real,
 * ex: "Non- OSHA") E, como checagem extra pra evitar falso positivo (caso
 * não-OSHA mas com afastamento LOCAL), não ser nenhuma das outras duas
 * categorias — daí os parâmetros comAfastamento/semAfastamento, que chegam
 * JÁ RESOLVIDOS por quem chama. É o que torna as três mutuamente exclusivas.
 */
// SEM CHAMADOR desde 2026-08-17 (regra v5 trocou o critério para "Locally
// Reportable?" e o FAI virou categoria residual). NÃO é código morto por
// descuido: fica aqui pronta para o caso de o padrão OSHA voltar a ser o
// oficial — é a única peça que precisaria ser religada.
function ehPrimeirosSocorros_(oshaRecordableBruto, extentBruto, comAfastamento, semAfastamento) {
  var recordable = normalizarTexto_(oshaRecordableBruto).trim();
  var extentNormalizado = normalizarChaveTexto_(extentBruto); // hífen/espaços -> 1 espaço só
  var ehNaoRecordable = recordable === 'no';
  var ehNaoOsha = extentNormalizado.indexOf('non osha') !== -1;
  return ehNaoRecordable && ehNaoOsha && !comAfastamento && !semAfastamento;
}

function criarRegioesVazias_() {
  return {
    comAfastamento: {}, semAfastamento: {}, primeirosSocorros: {},
    // Ocorrências individuais por região, pra clique no boneco abrir o feed
    // filtrado (Tracker Overview). registros[categoria][regiao] = [...].
    registros: { comAfastamento: {}, semAfastamento: {}, primeirosSocorros: {} }
  };
}

/**
 * Empilha um registro de ocorrência (diagnóstico/data/área/descrição) na
 * lista da região, com teto defensivo — protege o tamanho do cache sem
 * prejudicar o feed lateral (que nunca mostraria mais que isso de uma vez).
 */
function empilharRegistroPartesCorpo_(porRegiao, regiao, registro) {
  if (!porRegiao[regiao]) porRegiao[regiao] = [];
  if (porRegiao[regiao].length < 60) porRegiao[regiao].push(registro);
}

function incrementarPartesCorpo_(porAreaMes, area, mes, regiao, comAfastamento, semAfastamento, primeirosSocorros, registro) {
  if (!porAreaMes[area]) porAreaMes[area] = {};
  if (!porAreaMes[area][mes]) porAreaMes[area][mes] = criarRegioesVazias_();
  var bucket = porAreaMes[area][mes];

  if (comAfastamento) {
    somarEm_(bucket.comAfastamento, regiao, 1);
    empilharRegistroPartesCorpo_(bucket.registros.comAfastamento, regiao, registro);
  }
  if (semAfastamento) {
    somarEm_(bucket.semAfastamento, regiao, 1);
    empilharRegistroPartesCorpo_(bucket.registros.semAfastamento, regiao, registro);
  }
  if (primeirosSocorros) {
    somarEm_(bucket.primeirosSocorros, regiao, 1);
    empilharRegistroPartesCorpo_(bucket.registros.primeirosSocorros, regiao, registro);
  }
}

/**
 * Lê a aba "Ocorrências (FAI / REC)" UMA vez e devolve TUDO agrupado por Ano
 * -> Área -> Mês, cacheado como um único pacote (a planilha tem todos os
 * anos numa aba só — não faz sentido cachear por ano separado, o custo de
 * leitura é o mesmo pra 1 ano ou pra todos).
 *
 * Ano/Mês NÃO vêm prontos nesta planilha (ao contrário da antiga, que tinha
 * EP/ES calculados) — são derivados de "Case Date" com o fuso da própria
 * planilha, mesma técnica de calcularCruzAnoCompleto_.
 *
 * Formato: { anos: number[], porAno: { [ano]: { areasVistas: {area:true},
 *   porAreaMes: { 'Todas': {mes: {comAfastamento,semAfastamento,
 *   primeirosSocorros,registros}}, [area]: {...} } } } }
 */
function obterPartesDoCorpoTudo_(forcar) {
  if (!forcar) {
    if (PARTES_CORPO_MEMO_) return PARTES_CORPO_MEMO_;
    var cacheado = cacheLerGrande_(PARTES_CORPO_CACHE_CHAVE_);
    if (cacheado) {
      PARTES_CORPO_MEMO_ = cacheado;
      return cacheado;
    }
  }

  var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
  var aba = localizarAbaTolerante_(planilha, OCORRENCIAS_ABA_);
  if (!aba) throw new Error('Aba "' + OCORRENCIAS_ABA_ + '" não encontrada na planilha de Ocorrências EHS.');

  var idx = obterIndicesOcorrencias_(aba);
  var fusoPlanilha = aba.getParent().getSpreadsheetTimeZone();

  var porAno = {};
  var ultimaLinha = aba.getLastRow();
  var ultimaColuna = aba.getLastColumn();

  if (ultimaLinha > 1) {
    var dados = aba.getRange(2, 1, ultimaLinha - 1, ultimaColuna).getValues();

    dados.forEach(function (linha) {
      var dataCaso = linha[idx.caseDate];
      if (!(dataCaso instanceof Date)) return; // sem data válida, não dá pra agrupar

      var ano = Number(Utilities.formatDate(dataCaso, fusoPlanilha, 'yyyy'));
      var mes = Number(Utilities.formatDate(dataCaso, fusoPlanilha, 'M'));

      // REGRA v5 (2026-08-17) — "registrável" é o critério LOCAL, não o
      // americano. Justificativa e a tabela de conferência estão no cabeçalho
      // do módulo. ATENÇÃO: `idx.oshaRecordable` deixou de ser lido aqui, mas o
      // cabeçalho continua declarado em OCORRENCIAS_CABECALHOS_ de propósito —
      // é o caminho de volta se o padrão corporativo voltar a valer.
      var ehRecordable = normalizarTexto_(linha[idx.locallyReportable]).trim() === 'yes';

      // A divisão do registrável em com/sem afastamento vem da v4 (07/08/2026) e
      // CONTINUA valendo: "sem afastamento" é qualquer registrável que não seja
      // DAFW. Isso cobre RWA-only E "Other Recordable Case" de uma vez —
      // garantindo que todo caso registrável caia em uma das duas, do jeito que
      // o usuário descreveu ("Afastamento: Sim/Não", não uma 3ª categoria).
      // Antes da v4 isso era o flag RWA isolado, e os casos sem DAFW e sem RWA
      // sumiam do boneco.

      var comAfastamento = ehRecordable && flagVerdadeiro_(linha[idx.dafw]);
      var semAfastamento = ehRecordable && !comAfastamento;
      // FAI = tudo que NÃO é registrável localmente. Sem exigir "non osha" no
      // Extent: os poucos casos OSHA-mas-não-local (2 na base) precisam cair em
      // FAI pra fechar com o gráfico da Beatriz, e a categoria residual garante
      // que as três somem 100% das linhas, sem descarte silencioso.
      var primeirosSocorros = !ehRecordable;

      // Detailed Body Part é mais específico ("Left Forearm"); só cai pro
      // Body Part genérico ("Arm") se o detalhado não bater em nenhuma região.
      var regiao = regiaoCorpoDoTexto_(linha[idx.detailedBodyPart]);
      if (regiao === 'outro') regiao = regiaoCorpoDoTexto_(linha[idx.bodyPart]);

      var area = String(linha[idx.area] || '').trim() || 'Não informado';

      var registro = {
        diagnostico: String(linha[idx.diagnostico] || '').trim() || 'Não informado',
        data: Utilities.formatDate(dataCaso, fusoPlanilha, 'dd/MM/yyyy'),
        area: area,
        descricao: String(linha[idx.descricao] || '').trim().slice(0, 200)
      };

      if (!porAno[ano]) porAno[ano] = { areasVistas: {}, porAreaMes: { 'Todas': {} } };
      porAno[ano].areasVistas[area] = true;

      incrementarPartesCorpo_(porAno[ano].porAreaMes, 'Todas', mes, regiao, comAfastamento, semAfastamento, primeirosSocorros, registro);
      incrementarPartesCorpo_(porAno[ano].porAreaMes, area, mes, regiao, comAfastamento, semAfastamento, primeirosSocorros, registro);
    });
  }

  var anos = Object.keys(porAno).map(Number).sort(function (a, b) { return a - b; });
  var resultado = { anos: anos, porAno: porAno };

  cacheGravarGrande_(PARTES_CORPO_CACHE_CHAVE_, resultado, PARTES_CORPO_CACHE_SEGUNDOS_);
  PARTES_CORPO_MEMO_ = resultado;
  return resultado;
}

/**
 * Endpoint DINÂMICO — usado pelo painel METRICS SAF. Devolve o ano inteiro
 * (todas as áreas e meses) numa única chamada; o front troca Mês/Área
 * localmente sem nova ida ao servidor (mesmo padrão de getCruzAnoCompleto).
 *
 * Formato: { ano, anosDisponiveis, areas, porAreaMes }
 */
function getPartesDoCorpoAnoCompleto(ano, forcar) {
  var tudo = obterPartesDoCorpoTudo_(!!forcar);
  var anoEscolhido = Number(ano) || tudo.anos[tudo.anos.length - 1] || new Date().getFullYear();
  var doAno = tudo.porAno[anoEscolhido] || { areasVistas: {}, porAreaMes: { 'Todas': {} } };

  return {
    ano: anoEscolhido,
    anosDisponiveis: tudo.anos,
    areas: Object.keys(doAno.areasVistas).sort(),
    porAreaMes: doAno.porAreaMes
  };
}

/**
 * Endpoint ESTÁTICO — usado pelo card do Meu Feed. Só o mês corrente
 * (calendário local do servidor), todas as áreas, sem filtro nenhum.
 */
function getPartesDoCorpoMesAtual() {
  var fuso = Session.getScriptTimeZone();
  var agora = new Date();
  var ano = Number(Utilities.formatDate(agora, fuso, 'yyyy'));
  var mes = Number(Utilities.formatDate(agora, fuso, 'M'));

  var tudo = obterPartesDoCorpoTudo_(false);
  var doAno = tudo.porAno[ano];
  var doMes = (doAno && doAno.porAreaMes['Todas'] && doAno.porAreaMes['Todas'][mes]) || criarRegioesVazias_();

  return {
    ano: ano,
    mes: mes,
    comAfastamento: doMes.comAfastamento,
    semAfastamento: doMes.semAfastamento,
    primeirosSocorros: doMes.primeirosSocorros
  };
}

// ============================================================================
// FAI x RECORDABLE POR ANO — card "Ocorrências por ano" da aba Áreas FAI / REC
//
// Pedido da Beatriz (slide "Página 2 - Métricas", item 4, 17/08/2026): comparar
// os dois indicadores ano a ano. O mapeamento pros buckets que este módulo já
// calcula é direto:
//
//   FAI        = primeirosSocorros                 (não-Recordable + "non osha")
//   Recordable = comAfastamento + semAfastamento
//
// Somar as duas categorias de Recordable dá 100% dos casos Recordable sem dupla
// contagem — é exatamente a garantia da regra v4 documentada no topo deste
// módulo. Se aquela regra algum dia voltar a permitir sobreposição, ESTE gráfico
// infla junto, então as duas coisas têm que mudar no mesmo commit.
//
// Deriva de obterPartesDoCorpoTudo_ em vez de reler a aba por índice fixo de
// coluna (era o desenho do pedido original: colunas U/V/W). Dois motivos: o
// gráfico e o Boneco passam a falar o MESMO número por construção — mesma fonte,
// mesma classificação, mesmo cache de 6h — e índice fixo quebra silenciosamente
// se alguém inserir uma coluna na planilha, enquanto o mapeamento por nome de
// cabeçalho (obterIndicesOcorrencias_) reclama alto.
// ============================================================================

/**
 * Soma todos os valores de um mapa {chave: número}. Os buckets de partes do
 * corpo guardam a contagem POR REGIÃO; o total da categoria é a soma de todas
 * elas — incluindo 'outro', que é uma região legítima (parte do corpo não
 * reconhecida pelos radicais), não um balde de descarte. Ignorar 'outro' aqui
 * faria o gráfico contar menos casos do que a planilha tem.
 */
function somarValoresMapa_(mapa) {
  if (!mapa) return 0;
  return Object.keys(mapa).reduce(function (soma, chave) {
    return soma + (Number(mapa[chave]) || 0);
  }, 0);
}

/**
 * Primeiro ano do gráfico, conforme o pedido da Beatriz ("Pareto com início no
 * ano de 2020"). Só o COMEÇO é fixo — o fim acompanha a planilha: todo ano
 * novo que entrar na base aparece sozinho, sem tocar em código.
 *
 * O corte vive aqui, no backend, e não em cada tela: assim o card do painel e o
 * do Meu Feed não têm como divergir de período.
 */
var PARETO_FAI_REC_ANO_INICIAL_ = 2020;

/**
 * Endpoint do card. NUNCA LANÇA: devolve { erro } pra um problema nesta base não
 * derrubar a aba inteira (mesmo padrão de getOcorrenciasPainel e getAtsAbertos).
 *
 * Cobre de PARETO_FAI_REC_ANO_INICIAL_ até o último ano com dado na planilha.
 *
 * A % acumulada corre na ordem CRONOLÓGICA, não do maior pro menor: o eixo aqui
 * é o tempo, e reordenar as barras por tamanho destruiria a leitura de tendência
 * — que é justamente o que o gráfico existe pra mostrar.
 *
 * Formato: { erro, anos: [{ano, fai, recordable, total, pctAcumulada}],
 *   totalFai, totalRecordable, total, periodo: {de, ate} }
 */
function getParetoFaiRec(forcar) {
  var vazio = {
    erro: null, anos: [], totalComAfastamento: 0, totalSemAfastamento: 0,
    totalRecordable: 0, totalFai: 0, total: 0, periodo: { de: null, ate: null }
  };

  try {
    var tudo = obterPartesDoCorpoTudo_(!!forcar);
    // Só o piso é fixo. Nada de listar anos na mão: o teto é o que a planilha
    // tiver, então 2027 entra sozinho quando houver lançamento nele.
    var anos = (tudo.anos || []).filter(function (a) {
      return Number(a) >= PARETO_FAI_REC_ANO_INICIAL_;
    });
    if (!anos.length) return vazio;

    var linhas = anos.map(function (ano) {
      // 'Todas' já é o agregado de todas as áreas — aqui só resta somar os meses.
      var porMes = (tudo.porAno[ano] && tudo.porAno[ano].porAreaMes['Todas']) || {};
      var comAfast = 0, semAfast = 0, fai = 0;

      Object.keys(porMes).forEach(function (mes) {
        var bucket = porMes[mes];
        if (!bucket) return;
        comAfast += somarValoresMapa_(bucket.comAfastamento);
        semAfast += somarValoresMapa_(bucket.semAfastamento);
        fai += somarValoresMapa_(bucket.primeirosSocorros);
      });

      return {
        ano: Number(ano),
        comAfastamento: comAfast,
        semAfastamento: semAfast,
        // Recordable segue no payload como SOMA das duas — é o indicador que a
        // Beatriz pediu no slide, e agora ele vem detalhado por gravidade sem
        // deixar de existir. comAfastamento + semAfastamento == recordable
        // sempre, porque a regra v4 garante exclusividade mútua.
        recordable: comAfast + semAfast,
        fai: fai,
        total: comAfast + semAfast + fai
      };
    });

    var total = linhas.reduce(function (s, l) { return s + l.total; }, 0);
    var acumulado = 0;
    linhas.forEach(function (l) {
      acumulado += l.total;
      l.pctAcumulada = total > 0 ? (acumulado / total) * 100 : 0;
    });

    var somar = function (campo) {
      return linhas.reduce(function (s, l) { return s + l[campo]; }, 0);
    };

    return {
      erro: null,
      anos: linhas,
      totalComAfastamento: somar('comAfastamento'),
      totalSemAfastamento: somar('semAfastamento'),
      totalRecordable: somar('recordable'),
      totalFai: somar('fai'),
      total: total,
      periodo: { de: linhas[0].ano, ate: linhas[linhas.length - 1].ano }
    };
  } catch (e) {
    vazio.erro = e.message || String(e);
    return vazio;
  }
}

/**
 * Debug: imprime a tabela ano / FAI / Recordable pra conferir contra o gráfico
 * do slide da Beatriz, que traz o gabarito (2020: FAI 84 e REC 18; 2021: 74 e
 * 11; 2022: 49 e 4; 2023: 39 e 6; 2024: 38 e 11; 2025: 51 e 4; 2026: 14 e 1).
 * Rodar no editor do Apps Script e ler os Logs.
 *
 * Divergência SISTEMÁTICA no FAI aponta pra exigência de "Extent" conter
 * "non osha" na regra v4 — não mexer nela por conta própria: o Boneco depende
 * da MESMA regra e mudaria junto.
 */
function debugParetoFaiRec() {
  var r = getParetoFaiRec(true);
  if (r.erro) { Logger.log('ERRO: ' + r.erro); return r; }

  var saida = ['ano   c/afast   s/afast   REC   FAI   total   %acum'];
  r.anos.forEach(function (l) {
    saida.push(l.ano + '   ' + l.comAfastamento + '   ' + l.semAfastamento + '   ' +
               l.recordable + '   ' + l.fai + '   ' + l.total +
               '   ' + l.pctAcumulada.toFixed(1) + '%');
  });
  saida.push('TOTAIS: c/afast=' + r.totalComAfastamento + '  s/afast=' + r.totalSemAfastamento +
             '  REC=' + r.totalRecordable + '  FAI=' + r.totalFai + '  geral=' + r.total);
  Logger.log(saida.join('\n'));
  return r;
}

/**
 * Debug: lista os valores BRUTOS de Body Part / Detailed Body Part que
 * caíram em "outro" (não reconhecidos por PARTES_CORPO_REGIOES_EN_), pra
 * revisar a lista de radicais. Rodar no editor do Apps Script, ver os Logs.
 */
function debugPartesDoCorpoNaoReconhecidas() {
  var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
  var aba = localizarAbaTolerante_(planilha, OCORRENCIAS_ABA_);
  if (!aba) throw new Error('Aba "' + OCORRENCIAS_ABA_ + '" não encontrada.');

  var idx = obterIndicesOcorrencias_(aba);
  var ultimaLinha = aba.getLastRow();
  var ultimaColuna = aba.getLastColumn();
  var naoReconhecidas = {};

  if (ultimaLinha > 1) {
    var dados = aba.getRange(2, 1, ultimaLinha - 1, ultimaColuna).getValues();
    dados.forEach(function (linha) {
      var detalhado = linha[idx.detailedBodyPart];
      var generico = linha[idx.bodyPart];
      var regiao = regiaoCorpoDoTexto_(detalhado);
      if (regiao === 'outro') regiao = regiaoCorpoDoTexto_(generico);
      if (regiao === 'outro') {
        var chaveLog = String(detalhado || generico || '(vazio)').trim();
        if (chaveLog) somarEm_(naoReconhecidas, chaveLog, 1);
      }
    });
  }

  Logger.log(JSON.stringify(naoReconhecidas, null, 2));
  return naoReconhecidas;
}

/**
 * Debug: mostra as primeiras N linhas com os valores BRUTOS de Injury/Illness
 * Type (diagnóstico), Description e Case Date lado a lado, pra confirmar
 * visualmente se o mapeamento por nome de cabeçalho está pegando o conteúdo
 * certo. Também conta quantas linhas têm Description vazio. Rodar no editor
 * do Apps Script, ver os Logs.
 */
function debugColunaDescricaoBoneco(quantidade) {
  var limite = Number(quantidade) || 15;
  var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
  var aba = localizarAbaTolerante_(planilha, OCORRENCIAS_ABA_);
  if (!aba) throw new Error('Aba "' + OCORRENCIAS_ABA_ + '" não encontrada.');

  var idx = obterIndicesOcorrencias_(aba);
  var fusoPlanilha = aba.getParent().getSpreadsheetTimeZone();
  var ultimaLinha = aba.getLastRow();
  var ultimaColuna = aba.getLastColumn();
  var amostra = [];
  var vaziosDescricao = 0;
  var totalChecado = 0;

  if (ultimaLinha > 1) {
    var dados = aba.getRange(2, 1, ultimaLinha - 1, ultimaColuna).getValues();
    dados.forEach(function (linha) {
      var diagnostico = linha[idx.diagnostico];
      var descricao = linha[idx.descricao];
      var dataCaso = linha[idx.caseDate];
      if (!diagnostico && !descricao) return;

      totalChecado++;
      if (!String(descricao || '').trim()) vaziosDescricao++;

      if (amostra.length < limite) {
        amostra.push({
          diagnostico: diagnostico,
          descricao: descricao,
          data: dataCaso instanceof Date ? Utilities.formatDate(dataCaso, fusoPlanilha, 'dd/MM/yyyy') : dataCaso
        });
      }
    });
  }

  Logger.log('Amostra (Diagnóstico | Descrição | Data):\n' + amostra.map(function (l) {
    return '  "' + l.diagnostico + '" | "' + l.descricao + '" | ' + l.data;
  }).join('\n'));
  Logger.log('Linhas com diagnóstico/descrição preenchido: ' + totalChecado + ' | Descrição vazia nessas: ' + vaziosDescricao);

  return { amostra: amostra, totalChecado: totalChecado, vaziosDescricao: vaziosDescricao };
}

/**
 * Debug: reproduz, pro ano pedido, a mesma tabela que o usuário montou
 * manualmente em 2026-08-07 (casos Recordable, Sim/Não afastamento, local da
 * lesão) — pra comparar direto contra a planilha e validar que a
 * classificação comAfastamento/semAfastamento bate. Rodar no editor do Apps
 * Script com o ano desejado, ex: debugResumoRecordable(2026).
 */
function debugResumoRecordable(ano) {
  ano = Number(ano) || new Date().getFullYear();

  var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
  var aba = localizarAbaTolerante_(planilha, OCORRENCIAS_ABA_);
  if (!aba) throw new Error('Aba "' + OCORRENCIAS_ABA_ + '" não encontrada.');

  var idx = obterIndicesOcorrencias_(aba);
  var fusoPlanilha = aba.getParent().getSpreadsheetTimeZone();
  var ultimaLinha = aba.getLastRow();
  var ultimaColuna = aba.getLastColumn();

  var linhasLog = [];
  var totalComAfastamento = 0;
  var totalSemAfastamento = 0;

  if (ultimaLinha > 1) {
    var dados = aba.getRange(2, 1, ultimaLinha - 1, ultimaColuna).getValues();
    dados.forEach(function (linha) {
      var dataCaso = linha[idx.caseDate];
      if (!(dataCaso instanceof Date)) return;
      if (Number(Utilities.formatDate(dataCaso, fusoPlanilha, 'yyyy')) !== ano) return;

      var recordableNorm = normalizarTexto_(linha[idx.oshaRecordable]).trim();
      if (recordableNorm !== 'yes') return; // só Recordable, igual à análise manual

      var comAfastamento = flagVerdadeiro_(linha[idx.dafw]);
      if (comAfastamento) totalComAfastamento++; else totalSemAfastamento++;

      linhasLog.push(
        '  ' + Utilities.formatDate(dataCaso, fusoPlanilha, 'dd/MM/yyyy') +
        ' — Afastamento: ' + (comAfastamento ? 'Sim' : 'Não') +
        ' — Local: ' + linha[idx.bodyPart] + ' / ' + linha[idx.detailedBodyPart]
      );
    });
  }

  var total = totalComAfastamento + totalSemAfastamento;
  Logger.log('Recordable em ' + ano + ': ' + total + ' casos — ' +
    totalComAfastamento + ' com afastamento, ' + totalSemAfastamento + ' sem afastamento');
  Logger.log(linhasLog.join('\n'));

  return { ano: ano, total: total, comAfastamento: totalComAfastamento, semAfastamento: totalSemAfastamento };
}

// ============================================================================
// ATS — AÇÕES EM ABERTO POR RESPONSÁVEL
//
// Fonte: MESMA planilha do boneco (OCORRENCIAS_SPREADSHEET_ID_), outra aba:
// "ATS". Por isso não precisou de id novo, autorização nova nem escopo novo.
//
// Recorte pedido pelo usuário (2026-08-09), com a especificação vinda de um
// slide da Página 2 - Métricas:
//   - responsável = coluna E "Responsible Person"
//   - status      = coluna AI "Action Status", filtrado em Open e Open Past Due
// Tudo que estiver fechado (Closed / Closed Past Due) fica de fora: o card é
// sobre carteira ABERTA, não sobre histórico.
//
// MAPEAMENTO POR NOME DE CABEÇALHO, não por letra. O dicionário que o usuário
// mandou lista A..AX, mas a convenção do projeto (e o pedido dele quando o
// boneco foi feito) é achar a coluna pelo nome, pra não quebrar se inserirem
// ou moverem coluna. Mesmo padrão de obterIndicesOcorrencias_.
// ============================================================================

var ATS_ABA_ = 'ATS';
// v1 -> v2 em 2026-08-09: o payload passou a carregar `registros` por
// responsável (Action Description, coluna AA), pro clique no nome abrir o
// Tracker Overview. Mudou FORMATO, então a versão sobe — senão o cache de 6h
// gravado antes do deploy segue sendo servido sem o campo novo e o feed abre
// vazio, exatamente o que aconteceu com o TAG Safety em 27/07.
// v2 -> v3 em 2026-08-17: porGerente/porArea passaram a acumular ABERTO além do
// vencido. O CONTEÚDO muda (não só o formato) e o campo `aberto` desses dois
// agregados era sempre 0 na v2 — sem subir a versão, o cache de 6h seguiria
// servindo zeros e a coluna "Ab." nova dos dois Paretos ficaria vazia por até
// 6h depois do deploy, parecendo bug de front.
var ATS_CACHE_CHAVE_ = 'atsAbertosPorResponsavel_v3';
var ATS_CACHE_SEGUNDOS_ = CACHE_SEGUNDOS_6H_;

var ATS_CABECALHOS_ = {
  responsavel: 'Responsible Person',        // coluna E no dicionário
  area: 'Area',                             // coluna T — linha/área exata
  status: 'Action Status',                  // coluna AI
  diasAberto: 'Days Open / To Close',       // coluna AW
  diasAtraso: 'Days Past Closure Due',      // coluna AX — positivo = atrasado
  descricao: 'Action Description'           // coluna AA — o que precisa ser feito
};

// Teto de registros guardados por responsável. Protege o tamanho do cache: a
// descrição é texto livre e pode ser longa. O feed lateral nunca mostraria
// mais que isso de uma vez. Mesmo raciocínio do teto de 60 do boneco.
var ATS_MAX_REGISTROS_ = 40;

// Hierarquia: A=Pessoas, B=Gerentes, C=Área. Mesma planilha, outra aba.
var ATS_PESSOAS_ABA_ = 'Base pessoas';

/**
 * Resolve os cabeçalhos de ATS_CABECALHOS_ pros índices reais (0-based).
 * Lança erro explícito se algum sumir, em vez de ler a coluna errada calado.
 */
function obterIndicesAts_(aba) {
  var cabecalhos = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var mapa = {};
  cabecalhos.forEach(function (nome, i) {
    var chave = String(nome || '').trim();
    if (chave) mapa[chave] = i;
  });

  var indices = {};
  Object.keys(ATS_CABECALHOS_).forEach(function (interna) {
    var real = ATS_CABECALHOS_[interna];
    if (!(real in mapa)) {
      throw new Error('Coluna "' + real + '" não encontrada na aba "' + ATS_ABA_ +
        '". Confira a linha 1 da planilha.');
    }
    indices[interna] = mapa[real];
  });
  return indices;
}

/**
 * Lê a aba "Base pessoas" e devolve { chaveNormalizada: {gerente, area} }.
 *
 * O cruzamento é por NOME, que é a única chave disponível — então é
 * normalizado (acento, caixa, espaço duplo) antes de comparar, senão
 * "João C Sousa" e "JOAO C SOUSA" viram pessoas diferentes.
 *
 * Não lança se a aba não existir: devolve mapa vazio e quem chama trata como
 * "sem gerente mapeado". O card de ATS não pode cair inteiro porque a
 * hierarquia está desatualizada.
 */
function obterMapaPessoasAts_(planilha) {
  var aba = localizarAbaTolerante_(planilha, ATS_PESSOAS_ABA_);
  if (!aba || aba.getLastRow() < 2) return { mapa: {}, total: 0, erro: aba ? null : 'aba não encontrada' };

  var dados = aba.getRange(2, 1, aba.getLastRow() - 1, 3).getValues();
  var mapa = {};
  var total = 0;
  dados.forEach(function (linha) {
    var pessoa = normalizarChaveTexto_(linha[0]);
    if (!pessoa) return;
    mapa[pessoa] = {
      gerente: String(linha[1] || '').trim(),
      area: String(linha[2] || '').trim()
    };
    total++;
  });
  return { mapa: mapa, total: total, erro: null };
}

/**
 * Classifica o Action Status em 'aberto' | 'vencido' | null (fechado/outro).
 *
 * COMPARAÇÃO EXATA sobre o texto normalizado, nunca indexOf: "Open Past Due"
 * CONTÉM "Open", então um indexOf('open') classificaria vencido como aberto e
 * o card mostraria 63 abertos e 0 vencidos. É a mesma armadilha que já pegou
 * o TAG Safety com "improvável"/"muito improvável".
 */
function classificarStatusAts_(bruto) {
  var s = normalizarChaveTexto_(bruto);
  if (s === 'open') return 'aberto';
  if (s === 'open past due') return 'vencido';
  return null;
}

/**
 * Lê a aba ATS e devolve a carteira aberta agregada por responsável.
 *
 * NUNCA LANÇA: devolve { erro } se a planilha/aba/coluna falhar, pra um
 * problema nessa base não derrubar o painel inteiro. Mesmo padrão de
 * obterTagSafetyDoAno_ e getRouteMap.
 *
 * Formato: { erro, total, aberto, vencido,
 *   porResponsavel: [{nome, gerente, aberto, vencido, total,
 *                     registros: [{descricao, area, status, diasAtraso, diasAberto}]}],
 *   porGerente: [{nome, vencido, aberto, total}],   // ordenado p/ Pareto
 *   porArea:    [{nome, vencido, aberto, total}],   // ordenado p/ Pareto
 *   topAtrasos: [{responsavel, gerente, area, diasAtraso, diasAberto}],
 *   linhasLidas, semResponsavel, semGerente, pessoasMapeadas }
 *
 * Os dois Paretos contam ABERTO **E** VENCIDO desde 17/08/2026 (antes só o
 * vencido). A pergunta que eles respondem passou a ser "quem/onde concentra a
 * FILA de ações", com o atraso destacado dentro dela — e não só "quem tem
 * pendência estourada". A ordenação sempre foi por total; agora a barra e a %
 * acumulada usam essa mesma base, que é o que faltava pra elas fazerem sentido.
 *
 * [Histórico — a versão anterior deste comentário dizia:]
 * Os dois Paretos contam SÓ os vencidos (Open Past Due), como pedido — é a
 * pergunta "quem/onde tem mais pendência estourada". O `aberto` vai junto em
 * cada linha só como contexto no tooltip, não entra na ordenação.
 */
function ATS_TOP_ATRASOS_() { return 5; }

function getAtsAbertos(forcar) {
  var vazio = {
    erro: null, total: 0, aberto: 0, vencido: 0,
    porResponsavel: [], porGerente: [], porArea: [], topAtrasos: [],
    linhasLidas: 0, semResponsavel: 0, semGerente: 0, pessoasMapeadas: 0
  };

  try {
    if (!forcar) {
      var cacheado = cacheLerGrande_(ATS_CACHE_CHAVE_);
      if (cacheado) return cacheado;
    }

    var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
    var aba = localizarAbaTolerante_(planilha, ATS_ABA_);
    if (!aba) {
      var nomes = planilha.getSheets().map(function (s) { return s.getName(); });
      throw new Error('Aba "' + ATS_ABA_ + '" não encontrada. Abas disponíveis: ' + nomes.join(', '));
    }

    var idx = obterIndicesAts_(aba);
    var ultimaLinha = aba.getLastRow();
    if (ultimaLinha < 2) return vazio;

    var pessoas = obterMapaPessoasAts_(planilha);

    // Lê só até a última coluna que interessa, não a planilha inteira (são 50
    // colunas e boa parte é texto longo: Update History, descrições).
    var colMax = Math.max(idx.responsavel, idx.area, idx.status, idx.diasAberto, idx.diasAtraso, idx.descricao) + 1;
    var dados = aba.getRange(2, 1, ultimaLinha - 1, colMax).getValues();

    var porNome = {}, porGerente = {}, porArea = {};
    var aberto = 0, vencido = 0, semResponsavel = 0, semGerente = 0;
    var atrasos = [];

    function acumular_(mapa, chave, classe) {
      if (!mapa[chave]) mapa[chave] = { nome: chave, aberto: 0, vencido: 0, total: 0 };
      mapa[chave][classe]++;
      mapa[chave].total++;
    }

    dados.forEach(function (linha) {
      var classe = classificarStatusAts_(linha[idx.status]);
      if (!classe) return;   // fechado, ou status desconhecido

      var nome = String(linha[idx.responsavel] || '').trim();
      if (!nome) { nome = 'Não informado'; semResponsavel++; }

      // Join com a hierarquia. Sem correspondência NÃO some do painel: vira
      // um balde próprio, senão a soma dos gerentes não fecharia com o total
      // e ninguém perceberia que a Base pessoas está desatualizada.
      var ficha = pessoas.mapa[normalizarChaveTexto_(nome)];
      var gerente = (ficha && ficha.gerente) ? ficha.gerente : 'Sem gerente mapeado';
      if (!ficha || !ficha.gerente) semGerente++;

      // Área do EVENTO (coluna T do ATS), não a área da pessoa: a pergunta é
      // onde o problema está, não onde o responsável está lotado.
      var area = String(linha[idx.area] || '').trim() || 'Não informada';

      if (!porNome[nome]) porNome[nome] = { nome: nome, gerente: gerente, aberto: 0, vencido: 0, total: 0, registros: [] };
      porNome[nome][classe]++;
      porNome[nome].total++;

      // Registro individual, pro clique no nome abrir o Tracker Overview com o
      // que precisa ser feito. `descricao` é a coluna AA (Action Description).
      if (porNome[nome].registros.length < ATS_MAX_REGISTROS_) {
        porNome[nome].registros.push({
          descricao: String(linha[idx.descricao] || '').trim() || 'Sem descrição da ação',
          area: area,
          status: classe,   // 'aberto' | 'vencido'
          diasAtraso: Math.round(Number(linha[idx.diasAtraso]) || 0),
          diasAberto: Math.round(Number(linha[idx.diasAberto]) || 0)
        });
      }

      // Os dois Paretos acumulam ABERTO **E** VENCIDO desde 17/08/2026, a pedido
      // da Beatriz ("incluir as quantidades de Aberto e Aberto/Vencido; o mesmo
      // para gráfico por área"). Antes só o vencido entrava aqui, o que deixava
      // `aberto` sempre zerado nesses dois agregados — e a ordenação por total
      // (ordenarPorTotal_) acabava sendo, na prática, ordenação por vencido.
      // NÃO voltar a condicionar isto ao `classe`: as duas colunas do card
      // dependem de os dois estados serem contados.
      acumular_(porGerente, gerente, classe);
      acumular_(porArea, area, classe);

      if (classe === 'aberto') { aberto++; } else {
        vencido++;
        // A lista de atrasos, essa sim, segue só com os vencidos.
        var dias = Number(linha[idx.diasAtraso]);
        if (isFinite(dias)) {
          atrasos.push({
            responsavel: nome, gerente: gerente, area: area,
            diasAtraso: Math.round(dias),
            diasAberto: Math.round(Number(linha[idx.diasAberto]) || 0)
          });
        }
      }
    });

    // Ordena por total desc; desempate por VENCIDO desc (entre dois com a
    // mesma carteira, quem tem mais atraso aparece primeiro), depois por nome
    // pra a ordem não oscilar entre execuções.
    function ordenarPorTotal_(mapa) {
      return Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (a, b) {
        return (b.total - a.total) || (b.vencido - a.vencido) || a.nome.localeCompare(b.nome, 'pt-BR');
      });
    }

    atrasos.sort(function (a, b) {
      return (b.diasAtraso - a.diasAtraso) || a.responsavel.localeCompare(b.responsavel, 'pt-BR');
    });

    var resultado = {
      erro: null,
      total: aberto + vencido,
      aberto: aberto,
      vencido: vencido,
      porResponsavel: ordenarPorTotal_(porNome),
      porGerente: ordenarPorTotal_(porGerente),
      porArea: ordenarPorTotal_(porArea),
      topAtrasos: atrasos.slice(0, ATS_TOP_ATRASOS_()),
      linhasLidas: dados.length,
      semResponsavel: semResponsavel,
      semGerente: semGerente,
      pessoasMapeadas: pessoas.total
    };

    cacheGravarGrande_(ATS_CACHE_CHAVE_, resultado, ATS_CACHE_SEGUNDOS_);
    return resultado;

  } catch (e) {
    vazio.erro = String(e && e.message ? e.message : e);
    return vazio;
  }
}

/**
 * Diagnóstico: roda no editor e mostra os valores BRUTOS distintos da coluna
 * de status, com contagem. Serve pra conferir se "Open"/"Open Past Due" são
 * mesmo os textos da planilha viva — se aparecer variação de grafia, é aqui
 * que ela fica visível antes de virar número errado na tela.
 */
function debugStatusAts() {
  var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
  var aba = localizarAbaTolerante_(planilha, ATS_ABA_);
  if (!aba) throw new Error('Aba "' + ATS_ABA_ + '" não encontrada.');

  var idx = obterIndicesAts_(aba);
  var colMax = Math.max(idx.responsavel, idx.status) + 1;
  var dados = aba.getRange(2, 1, aba.getLastRow() - 1, colMax).getValues();

  var contagem = {};
  dados.forEach(function (linha) {
    var bruto = String(linha[idx.status] || '').trim() || '(vazio)';
    contagem[bruto] = (contagem[bruto] || 0) + 1;
  });

  Logger.log('Índices: Responsible Person=' + idx.responsavel + '  Action Status=' + idx.status);
  Logger.log('Linhas lidas: ' + dados.length);
  Object.keys(contagem).sort().forEach(function (k) {
    Logger.log('  "' + k + '" -> ' + contagem[k] + '  [classificado como: ' + (classificarStatusAts_(k) || 'ignorado') + ']');
  });

  var r = getAtsAbertos(true);
  Logger.log('Resumo: total=' + r.total + ' aberto=' + r.aberto + ' vencido=' + r.vencido +
    ' responsaveis=' + r.porResponsavel.length);
  return r;
}

// ============================================================================
// OCORRÊNCIAS — painel analítico da aba "Ocorrências (FAI / REC)"
//
// MESMA aba que o boneco já lê, com um recorte diferente: aqui interessam
// supervisor, gravidade, status da investigação e parte do corpo. Por isso um
// mapa de cabeçalhos PRÓPRIO em vez de estender OCORRENCIAS_CABECALHOS_ — se
// "Supervisor" ou "Follow-up Status" sumirem da planilha, quebra só este
// painel, não o boneco.
//
// Cruza com "Base pessoas" (Supervisor -> Gerente), reusando o
// obterMapaPessoasAts_ que o ATS já criou: é a mesma aba de hierarquia.
//
// ESCOPO: a base INTEIRA, sem filtro de ano. A tela diz o período coberto no
// rodapé, pra ninguém achar que é o ano corrente.
// ============================================================================

var OCORRENCIAS_PAINEL_CACHE_CHAVE_ = 'ocorrenciasPainel_v1';
var OCORRENCIAS_PAINEL_MAX_ABERTOS_ = 200;   // teto da tabela, protege o cache
var OCORRENCIAS_PAINEL_TOP_CORPO_ = 12;

var OCORRENCIAS_PAINEL_CABECALHOS_ = {
  caseDate: 'Case Date',              // coluna H
  extent: 'Extent',                   // coluna Q — gravidade
  supervisor: 'Supervisor',           // coluna AU
  area: 'Area',                       // coluna BD — mesma coluna do boneco
  bodyPart: 'Body Part',              // coluna BM
  followUp: 'Follow-up Status'        // coluna CL
};

function obterIndicesOcorrenciasPainel_(aba) {
  var cabecalhos = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var mapa = {};
  cabecalhos.forEach(function (nome, i) {
    var chave = String(nome || '').trim();
    if (chave) mapa[chave] = i;
  });

  var indices = {};
  Object.keys(OCORRENCIAS_PAINEL_CABECALHOS_).forEach(function (interna) {
    var real = OCORRENCIAS_PAINEL_CABECALHOS_[interna];
    if (!(real in mapa)) {
      throw new Error('Coluna "' + real + '" não encontrada na aba "' + OCORRENCIAS_ABA_ +
        '". Confira a linha 1 da planilha.');
    }
    indices[interna] = mapa[real];
  });
  return indices;
}

/**
 * Investigação em aberto? 'Open' e 'Not Initiated' contam; 'Closed' não.
 * Comparação EXATA sobre o texto normalizado — mesma razão do ATS.
 */
function ocorrenciaEmAberto_(bruto) {
  var s = normalizarChaveTexto_(bruto);
  return s === 'open' || s === 'not initiated';
}

/**
 * Painel de Ocorrências. NUNCA LANÇA: devolve { erro } pra um problema nesta
 * base não derrubar a aba inteira.
 *
 * Formato: { erro, total, porStatus[], porGravidade[], porGerente[],
 *   porParteCorpo[], abertos[], periodo:{de,ate}, linhasLidas, semSupervisor,
 *   semGerente, totalAbertos, abertosExibidos }
 * Cada agregado é [{ nome, total }] ordenado desc.
 */
function getOcorrenciasPainel(forcar) {
  var vazio = {
    erro: null, total: 0, porStatus: [], porGravidade: [], porGerente: [],
    porParteCorpo: [], abertos: [], periodo: { de: null, ate: null },
    linhasLidas: 0, semSupervisor: 0, semGerente: 0, totalAbertos: 0, abertosExibidos: 0
  };

  try {
    if (!forcar) {
      var cacheado = cacheLerGrande_(OCORRENCIAS_PAINEL_CACHE_CHAVE_);
      if (cacheado) return cacheado;
    }

    var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
    var aba = localizarAbaTolerante_(planilha, OCORRENCIAS_ABA_);
    if (!aba) throw new Error('Aba "' + OCORRENCIAS_ABA_ + '" não encontrada.');

    var idx = obterIndicesOcorrenciasPainel_(aba);
    var ultimaLinha = aba.getLastRow();
    if (ultimaLinha < 2) return vazio;

    var pessoas = obterMapaPessoasAts_(planilha);
    var fuso = planilha.getSpreadsheetTimeZone();

    var colMax = Math.max(idx.caseDate, idx.extent, idx.supervisor, idx.area, idx.bodyPart, idx.followUp) + 1;
    var dados = aba.getRange(2, 1, ultimaLinha - 1, colMax).getValues();

    var status = {}, gravidade = {}, gerentes = {}, partes = {};
    var abertos = [];
    var semSupervisor = 0, semGerente = 0, totalAbertos = 0;
    var maisAntiga = null, maisNova = null;

    function contar_(mapa, chave) {
      var k = String(chave || '').trim() || 'Não informado';
      mapa[k] = (mapa[k] || 0) + 1;
      return k;
    }

    dados.forEach(function (linha) {
      var supervisor = String(linha[idx.supervisor] || '').trim();
      if (!supervisor) { supervisor = 'Não informado'; semSupervisor++; }

      // Join com a hierarquia. Sem correspondência vira balde próprio, nunca
      // some — senão a soma dos gerentes não fecharia com o total.
      var ficha = pessoas.mapa[normalizarChaveTexto_(supervisor)];
      var gerente = (ficha && ficha.gerente) ? ficha.gerente : 'Sem gerente mapeado';
      if (!ficha || !ficha.gerente) semGerente++;

      var rotuloStatus = contar_(status, linha[idx.followUp]);
      contar_(gravidade, linha[idx.extent]);
      contar_(gerentes, gerente);
      contar_(partes, linha[idx.bodyPart]);

      var dataCaso = linha[idx.caseDate];
      var ehData = (dataCaso instanceof Date) && !isNaN(dataCaso.getTime());
      if (ehData) {
        if (!maisAntiga || dataCaso < maisAntiga) maisAntiga = dataCaso;
        if (!maisNova || dataCaso > maisNova) maisNova = dataCaso;
      }

      if (ocorrenciaEmAberto_(linha[idx.followUp])) {
        totalAbertos++;
        if (abertos.length < OCORRENCIAS_PAINEL_MAX_ABERTOS_) {
          abertos.push({
            data: ehData ? Utilities.formatDate(dataCaso, fuso, 'dd/MM/yyyy') : '—',
            // ordenação precisa de valor comparável; a data formatada em
            // dd/MM/yyyy ordena errado como texto
            ordem: ehData ? dataCaso.getTime() : 0,
            supervisor: supervisor,
            gerente: gerente,
            area: String(linha[idx.area] || '').trim() || 'Não informada',
            gravidade: String(linha[idx.extent] || '').trim() || 'Não informada',
            status: rotuloStatus
          });
        }
      }
    });

    function ordenar_(mapa) {
      return Object.keys(mapa).map(function (k) { return { nome: k, total: mapa[k] }; })
        .sort(function (a, b) { return (b.total - a.total) || a.nome.localeCompare(b.nome, 'pt-BR'); });
    }

    abertos.sort(function (a, b) { return b.ordem - a.ordem; });   // mais recente primeiro

    var resultado = {
      erro: null,
      total: dados.length,
      porStatus: ordenar_(status),
      porGravidade: ordenar_(gravidade),
      porGerente: ordenar_(gerentes),
      porParteCorpo: ordenar_(partes).slice(0, OCORRENCIAS_PAINEL_TOP_CORPO_),
      abertos: abertos,
      periodo: {
        de: maisAntiga ? Utilities.formatDate(maisAntiga, fuso, 'MM/yyyy') : null,
        ate: maisNova ? Utilities.formatDate(maisNova, fuso, 'MM/yyyy') : null
      },
      linhasLidas: dados.length,
      semSupervisor: semSupervisor,
      semGerente: semGerente,
      totalAbertos: totalAbertos,
      abertosExibidos: abertos.length
    };

    cacheGravarGrande_(OCORRENCIAS_PAINEL_CACHE_CHAVE_, resultado, CACHE_SEGUNDOS_6H_);
    return resultado;

  } catch (e) {
    vazio.erro = String(e && e.message ? e.message : e);
    return vazio;
  }
}

/**
 * Diagnóstico: valores BRUTOS distintos de Follow-up Status e Extent, com
 * contagem, mais como cada status foi classificado. Rodar no editor antes de
 * confiar nos números — a classificação de "em aberto" é comparação EXATA, e
 * qualquer variação de grafia na planilha aparece aqui.
 */
function debugOcorrenciasPainel() {
  var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
  var aba = localizarAbaTolerante_(planilha, OCORRENCIAS_ABA_);
  if (!aba) throw new Error('Aba "' + OCORRENCIAS_ABA_ + '" não encontrada.');

  var idx = obterIndicesOcorrenciasPainel_(aba);
  Logger.log('Índices resolvidos: ' + JSON.stringify(idx));

  var dados = aba.getRange(2, 1, aba.getLastRow() - 1,
    Math.max(idx.followUp, idx.extent, idx.area) + 1).getValues();

  var st = {}, ex = {}, ar = {};
  dados.forEach(function (l) {
    var s = String(l[idx.followUp] || '').trim() || '(vazio)';
    var e = String(l[idx.extent] || '').trim() || '(vazio)';
    var a = String(l[idx.area] || '').trim() || '(vazio)';
    st[s] = (st[s] || 0) + 1; ex[e] = (ex[e] || 0) + 1; ar[a] = (ar[a] || 0) + 1;
  });

  Logger.log('--- Follow-up Status ---');
  Object.keys(st).sort().forEach(function (k) {
    Logger.log('  "' + k + '" -> ' + st[k] + '  [em aberto: ' + ocorrenciaEmAberto_(k) + ']');
  });
  Logger.log('--- Extent ---');
  Object.keys(ex).sort().forEach(function (k) { Logger.log('  "' + k + '" -> ' + ex[k]); });
  Logger.log('--- Area (coluna usada também pelo boneco) --- ' + Object.keys(ar).length + ' valores distintos');
  Object.keys(ar).sort().slice(0, 40).forEach(function (k) { Logger.log('  "' + k + '" -> ' + ar[k]); });

  var r = getOcorrenciasPainel(true);
  Logger.log('Resumo: total=' + r.total + ' abertos=' + r.totalAbertos +
    ' gerentes=' + r.porGerente.length + ' semGerente=' + r.semGerente +
    ' periodo=' + (r.periodo.de || '?') + '..' + (r.periodo.ate || '?'));
  return r;
}

// ============================================================================
// CAUSA RAIZ — item 5 do slide "Página 2 - Métricas" (Beatriz, 17/08/2026):
// "Barras horizontais com as informações da coluna CB aba ocorrências".
//
// MESMA aba "Ocorrências (FAI / REC)" que o painel e o boneco já leem, com mais
// um recorte. Mapa de cabeçalhos PRÓPRIO pelo mesmo motivo dos outros: se o
// cabeçalho da causa raiz mudar, quebra só este card.
//
// A COLUNA FOI INDICADA POR LETRA (CB = índice 79), não por nome — e letra é
// exatamente o que o projeto evita, porque uma coluna inserida antes desloca
// tudo em silêncio. Por isso aqui vale a convenção de SAF_AUDITORIA_COLUNAS_:
// tenta casar por NOME entre os candidatos abaixo e só CAI pra posição 79 se
// nenhum bater. Qual caminho foi usado sai em `diagnostico.origemColuna`, e é
// por ali que se descobre um cabeçalho renomeado antes de virar contagem errada.
//
// PENDÊNCIA CONHECIDA: o nome real do cabeçalho de CB ainda não foi conferido
// contra a planilha viva. Rodar debugColunasOcorrencias() (logo abaixo) e, se o
// nome não estiver na lista, acrescentá-lo em CAUSA_RAIZ_CANDIDATOS_ — é uma
// linha só, e a partir daí o card para de depender da posição.
// ============================================================================

// v1 -> v2 em 2026-08-17: o payload ganhou `porGrupo`, `totalMencoes` e
// `comMultiplas`, e as contagens de `porCausa` mudaram de base (agora sem o
// prefixo numérico e com célula multi-causa desmembrada). Mudou formato E
// conteúdo — sem subir a versão, o cache de 6h serviria a contagem velha.
var CAUSA_RAIZ_CACHE_CHAVE_ = 'causaRaiz_v2';
var CAUSA_RAIZ_POSICAO_CB_ = 79;      // CB, 0-based (A=0 ... CB=79)
var CAUSA_RAIZ_TOP_ = 12;             // teto de barras no card

// Ordem importa: o primeiro que existir na planilha ganha.
var CAUSA_RAIZ_CANDIDATOS_ = [
  'Root Cause', 'Root Cause(s)', 'Root Causes', 'Primary Root Cause',
  'Causa Raiz', 'Causa raiz'
];

/**
 * Resolve uma coluna por NOME (entre uma lista de candidatos) com QUEDA
 * POSICIONAL. É o padrão do projeto pra toda coluna que chegou indicada por
 * letra: a letra funciona hoje e quebra calada quando inserirem coluna, então
 * ela vira só a rede de segurança.
 *
 * `origem` sai como 'nome' ou 'posicao_<LETRA>' e é o que o card mostra no
 * rodapé — é assim que se descobre um cabeçalho renomeado antes de ele virar
 * número errado numa reunião.
 *
 * Devolve { indice, origem, cabecalho }.
 */
function resolverColunaPorNomeOuPosicao_(cabecalhos, candidatos, posicaoQueda, letraQueda) {
  var mapa = {};
  cabecalhos.forEach(function (nome, i) {
    var chave = normalizarChaveTexto_(nome);
    if (chave && !(chave in mapa)) mapa[chave] = i;
  });

  for (var i = 0; i < candidatos.length; i++) {
    var chave = normalizarChaveTexto_(candidatos[i]);
    if (chave in mapa) {
      return {
        indice: mapa[chave],
        origem: 'nome',
        cabecalho: String(cabecalhos[mapa[chave]] || '').trim()
      };
    }
  }

  return {
    indice: posicaoQueda,
    origem: 'posicao_' + letraQueda,
    cabecalho: String(cabecalhos[posicaoQueda] || '').trim()
  };
}

/** Causa raiz: coluna CB (índice 79). Ver resolverColunaPorNomeOuPosicao_. */
function resolverColunaCausaRaiz_(cabecalhos) {
  return resolverColunaPorNomeOuPosicao_(
    cabecalhos, CAUSA_RAIZ_CANDIDATOS_, CAUSA_RAIZ_POSICAO_CB_, 'CB');
}

/**
 * Desmembra e normaliza o texto de "Root Cause". MEDIDO na planilha viva em
 * 2026-08-17 (debugCausaRaiz): 415 linhas produziam **304 causas distintas**,
 * o que torna qualquer Pareto inútil. Duas razões, as duas tratadas aqui:
 *
 * 1) PREFIXO NUMÉRICO VARIÁVEL. A mesma causa aparece com códigos diferentes —
 *    "2.1 Attitude Behavior: Negligence" (11 casos) e "4.1 Attitude Behavior:
 *    Negligence" (10 casos) são a MESMA coisa contada separada. O número é o
 *    item do checklist de investigação, não a causa; sai fora.
 *
 * 2) VÁRIAS CAUSAS NA MESMA CÉLULA, separadas por quebra de linha:
 *    "6.3 Machines...poor design\n\n7.1 Procedure Systems: Lack of standard
 *    procedures". Contar isso como uma string única cria uma "causa" que só
 *    existe naquela combinação. Cada uma passa a contar sozinha — então uma
 *    ocorrência com 2 causas soma 2 menções, e por isso o payload separa
 *    `total` (linhas) de `totalMencoes` (causas citadas).
 *
 * Devolve [] se não houver texto.
 */
function desmembrarCausaRaiz_(bruto) {
  var texto = String(bruto || '').trim();
  if (!texto) return [];

  return texto.split(/[\r\n]+/).map(function (parte) {
    // Tira o código do checklist: "2.1 ", "6.3 - ", "10 ". Só quando vem no
    // COMEÇO e seguido de espaço — assim um número que faça parte do texto
    // ("Norma 12 não aplicada") não é mutilado.
    return parte.replace(/^\s*\d+(\.\d+)*\s*[-–—.)]?\s+/, '').trim();
  }).filter(function (p) { return p; });
}

/**
 * Macro-grupo da causa: o que vem ANTES dos dois pontos.
 * "Attitude Behavior: Negligence" -> "Attitude Behavior".
 * É o agrupamento que dá um Pareto realmente curto (4-8 grupos contra ~100
 * causas detalhadas). Sem dois pontos, o próprio texto vira o grupo.
 */
function grupoCausaRaiz_(causa) {
  var i = String(causa).indexOf(':');
  return i > 0 ? String(causa).slice(0, i).trim() : String(causa).trim();
}

/**
 * Contagem de ocorrências por causa raiz, ordenada desc — o formato que
 * desenharBarrasOcor_ já consome no frontend ([{nome, total}]).
 *
 * NUNCA LANÇA: devolve { erro } pra um problema aqui não derrubar a aba.
 *
 * Escopo: a base INTEIRA, como os outros cards desta aba (o rodapé diz o período
 * coberto). Diferente do gráfico FAI x Recordable, que a Beatriz pediu de 2020
 * em diante — aqui ela não pediu recorte, e inventar um esconderia histórico.
 *
 * Célula VAZIA vira o balde "Não informado" em vez de ser descartada: quantas
 * ocorrências estão sem causa raiz preenchida é um achado de gestão, não
 * sujeira. O frontend já pinta baldes de lacuna em cinza (ver o Pareto por
 * Gerente, onde "Sem gerente mapeado" é 45% da base).
 *
 * Formato: { erro, porCausa: [{nome, total}], total, semCausa, distintas,
 *   exibidas, diagnostico: {origemColuna, cabecalho, indice} }
 */
function getCausaRaiz(forcar) {
  var vazio = {
    erro: null, porCausa: [], total: 0, semCausa: 0, distintas: 0, exibidas: 0,
    diagnostico: { origemColuna: null, cabecalho: null, indice: null }
  };

  try {
    if (!forcar) {
      var cacheado = cacheLerGrande_(CAUSA_RAIZ_CACHE_CHAVE_);
      if (cacheado) return cacheado;
    }

    var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
    var aba = localizarAbaTolerante_(planilha, OCORRENCIAS_ABA_);
    if (!aba) throw new Error('Aba "' + OCORRENCIAS_ABA_ + '" não encontrada.');

    var ultimaLinha = aba.getLastRow();
    var ultimaColuna = aba.getLastColumn();
    if (ultimaLinha < 2) return vazio;

    var cabecalhos = aba.getRange(1, 1, 1, ultimaColuna).getValues()[0];
    var col = resolverColunaCausaRaiz_(cabecalhos);
    if (col.indice >= ultimaColuna) {
      throw new Error('A aba tem só ' + ultimaColuna + ' colunas — não existe coluna CB (índice ' +
        CAUSA_RAIZ_POSICAO_CB_ + '). Confira a planilha.');
    }

    // Lê só até a coluna necessária, não as 145.
    var dados = aba.getRange(2, 1, ultimaLinha - 1, col.indice + 1).getValues();

    var contagem = {}, porGrupo = {}, semCausa = 0, comMultiplas = 0, totalMencoes = 0;
    dados.forEach(function (linha) {
      var causas = desmembrarCausaRaiz_(linha[col.indice]);
      if (!causas.length) { semCausa++; return; }
      if (causas.length > 1) comMultiplas++;

      // Dedup DENTRO da linha: a planilha tem célula com a mesma causa repetida
      // ("6.3 ...\n\n6.3 ..."), que é erro de digitação do investigador, não
      // duas causas. Sem isso, uma linha inflaria o número em 2.
      var vistas = {};
      causas.forEach(function (c) {
        if (vistas[c]) return;
        vistas[c] = true;
        totalMencoes++;
        somarEm_(contagem, c, 1);
        somarEm_(porGrupo, grupoCausaRaiz_(c), 1);
      });
    });

    if (semCausa > 0) {
      contagem['Não informado'] = semCausa;
      porGrupo['Não informado'] = semCausa;
      totalMencoes += semCausa;
    }

    var ordenar = function (mapa) {
      return Object.keys(mapa).map(function (nome) {
        return { nome: nome, total: mapa[nome] };
      }).sort(function (a, b) { return b.total - a.total || a.nome.localeCompare(b.nome); });
    };

    var ordenada = ordenar(contagem);
    var grupos = ordenar(porGrupo);

    var resultado = {
      erro: null,
      porCausa: ordenada.slice(0, CAUSA_RAIZ_TOP_),
      // Pareto macro: 4-8 grupos em vez de ~100 causas detalhadas. Vai inteiro,
      // sem teto — é curto por natureza.
      porGrupo: grupos,
      total: dados.length,
      totalMencoes: totalMencoes,
      comMultiplas: comMultiplas,
      semCausa: semCausa,
      distintas: ordenada.length,
      exibidas: Math.min(ordenada.length, CAUSA_RAIZ_TOP_),
      diagnostico: { origemColuna: col.origem, cabecalho: col.cabecalho, indice: col.indice }
    };

    // Gravação de cache em try PRÓPRIO: um CacheService indisponível não pode
    // transformar um payload já calculado em {erro} (blindagem copiada do
    // getSafAuditoria).
    try {
      cacheGravarGrande_(CAUSA_RAIZ_CACHE_CHAVE_, resultado, CACHE_SEGUNDOS_6H_);
    } catch (eCache) {
      // segue com o payload em mãos
    }

    return resultado;
  } catch (e) {
    vazio.erro = e.message || String(e);
    return vazio;
  }
}

/**
 * Debug: imprime TODAS as colunas da aba de ocorrências como
 * "letra | índice | cabeçalho". Rodar no editor do Apps Script.
 *
 * É o mapa que faltava pra amarrar por NOME as próximas colunas pedidas pela
 * Beatriz (causa raiz, comportamento/condição, causa relacionada) em vez de
 * depender de letra. Confere de uma vez: o que é CB de verdade e se existe
 * alguma coluna de comportamento/condição já classificada na planilha.
 */
function debugColunasOcorrencias() {
  var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
  var aba = localizarAbaTolerante_(planilha, OCORRENCIAS_ABA_);
  if (!aba) throw new Error('Aba "' + OCORRENCIAS_ABA_ + '" não encontrada.');

  var cabecalhos = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var linhas = ['--- ' + cabecalhos.length + ' colunas em "' + OCORRENCIAS_ABA_ + '" ---'];
  cabecalhos.forEach(function (nome, i) {
    var marca = (i === CAUSA_RAIZ_POSICAO_CB_) ? '   <<<< CB (causa raiz?)' : '';
    linhas.push(farolSafLetraColuna_(i) + ' | ' + i + ' | "' + String(nome || '').trim() + '"' + marca);
  });
  Logger.log(linhas.join('\n'));

  var col = resolverColunaCausaRaiz_(cabecalhos);
  Logger.log('\nCausa raiz resolvida por: ' + col.origem +
    ' | índice ' + col.indice + ' (' + farolSafLetraColuna_(col.indice) + ')' +
    ' | cabeçalho "' + col.cabecalho + '"');
  return cabecalhos;
}

/**
 * Debug: distribuição da causa raiz na planilha viva. Rodar no editor e conferir
 * o topo da lista contra o que a Beatriz espera ver no card.
 */
function debugCausaRaiz() {
  var r = getCausaRaiz(true);
  if (r.erro) { Logger.log('ERRO: ' + r.erro); return r; }

  Logger.log('Coluna: ' + farolSafLetraColuna_(r.diagnostico.indice) +
    ' "' + r.diagnostico.cabecalho + '" (origem: ' + r.diagnostico.origemColuna + ')');
  Logger.log('Linhas: ' + r.total + ' | menções de causa: ' + r.totalMencoes +
    ' | linhas com mais de uma causa: ' + r.comMultiplas +
    ' | causas distintas: ' + r.distintas + ' | sem causa: ' + r.semCausa);

  Logger.log('--- MACRO-GRUPO (antes dos dois pontos) ---');
  r.porGrupo.forEach(function (g) {
    Logger.log('  ' + g.total + '  ' + g.nome);
  });

  Logger.log('--- CAUSA DETALHADA (top ' + r.exibidas + ' de ' + r.distintas + ') ---');
  r.porCausa.forEach(function (c) {
    Logger.log('  ' + c.total + '  ' + c.nome);
  });
  return r;
}

// ============================================================================
// OBJETO CAUSADOR — coluna "Cause Object" (BO, índice 66) da aba de ocorrências.
//
// A coluna é TEXTO LIVRE, sem padrão: "Gabinete", "Caixa com motores", "Trava do
// puxador", "Empilhadeira". Este módulo faz duas leituras dela:
//   1) agrupa em macro-categorias por palavra-chave (para um Pareto);
//   2) devolve a frequência das palavras soltas (para uma nuvem de palavras).
//
// CASAMENTO POR PREFIXO DE TOKEN, não indexOf solto. O dicionário pedido tem
// colisões reais de substring que dariam categoria errada em silêncio:
//   - "transpaleteira" CONTÉM "paleteira", que CONTÉM "palete";
//   - "motorista" contém "motor"; "chaveiro" contém "chave".
// Com indexOf, "Transpaleteira elétrica" (Veículos) cairia em Movimentação
// Manual por causa de "palete". É a mesma armadilha que já custou caro no ATS
// ("Open Past Due" contém "Open") e no TAG Safety ("muito improvável" contém
// "improvável"), e a mesma solução de PARTES_CORPO_REGIOES_EN_.
//
// A ORDEM DAS CATEGORIAS É PARTE DA REGRA: a primeira que casar vence, então
// vão da mais específica para a mais genérica. Veículos Industriais vem ANTES
// de Movimentação Manual de propósito — senão "transpaleteira elétrica" nunca
// chegaria em Veículos.
//
// Chave com ESPAÇO ("transpaleteira eletrica") é casada como expressão no texto
// inteiro normalizado; chave de uma palavra é casada como PREFIXO DE TOKEN.
// ============================================================================

// v1 -> v2 em 2026-08-17: dicionário ampliado com os termos reais da planilha e
// "contra" virou stop word. As contagens mudam — sem subir a versão, o cache de
// 6h serviria a classificação velha (55% em "Outros") depois do deploy.
var OBJETO_CAUSADOR_CACHE_CHAVE_ = 'objetoCausador_v2';
var OBJETO_CAUSADOR_POSICAO_BO_ = 66;      // BO, 0-based (A=0 ... BO=66)
var OBJETO_CAUSADOR_TOP_PALAVRAS_ = 40;    // teto da nuvem
var OBJETO_CAUSADOR_TOP_NAO_CLASSIF_ = 25; // teto da lista de "Outros" cru

var OBJETO_CAUSADOR_CANDIDATOS_ = [
  'Cause Object', 'Causing Object', 'Objeto Causador'
];

// Ordem = prioridade. Não reordenar sem reler o comentário acima.
//
// AMPLIADO em 2026-08-17 com os termos REAIS da planilha. O dicionário inicial
// (só as palavras do slide) deixava **55,3% em "Outros"** — medido por
// debugObjetoCausador em 255 textos preenchidos. Cada termo abaixo marcado com
// (viva) saiu da lista de não-classificados ou da nuvem de palavras da própria
// base, não de chute.
//
// "Substâncias e Fluidos" é categoria NOVA: água quente, óleo e cola aquecida
// apareceram várias vezes e não são peça, estrutura nem ferramenta — forçá-las
// em qualquer uma das outras seria pior que criar a categoria.
var OBJETO_CAUSADOR_CATEGORIAS_ = [
  { nome: 'Veículos Industriais',      chaves: ['transpaleteira eletrica', 'empilhadeira', 'rebocador'] },
  { nome: 'Movimentação Manual',       chaves: ['carrinho', 'shooter', 'palete', 'paleteira', 'transpaleteira',
                                                'artok', 'aramado', 'engate', 'contentor'] },  // (viva)
  // Ferramentas ANTES de Substâncias: em "bico da cola aquecido" o objeto que a
  // pessoa tocou é o bico, não a cola. Só cai em Substâncias quando não há
  // objeto físico no texto ("Água quente").
  { nome: 'Ferramentas e Dispositivos', chaves: ['dispositivo', 'ferramenta', 'chave', 'trava',
                                                'parafusadeira', 'caneta', 'atuador', 'bico',
                                                'pistola', 'alicate', 'martelo'] },  // (viva)
  { nome: 'Substâncias e Fluidos',     chaves: ['agua', 'oleo', 'cola', 'graxa', 'vapor', 'quimico'] },  // (viva)
  { nome: 'Peças e Produtos',          chaves: ['gabinete', 'motor', 'peca', 'console', 'vidro', 'caixa',
                                                'embalagem', 'cesto', 'fogao', 'tanque', 'anel', 'porta',
                                                'cavidade', 'eixo', 'painel', 'tampa', 'cooktop',
                                                'mecanismo', 'forno', 'grade'] },  // (viva)
  { nome: 'Estruturas e Layout',       chaves: ['pilar', 'monovia', 'gancheira', 'mesa', 'bancada', 'estrutura',
                                                'cantoneira', 'calha', 'camara', 'guarda corpo', 'corrimao',
                                                'escada', 'rampa', 'piso', 'gravitacional', 'esteira'] }  // (viva)
];

var OBJETO_CAUSADOR_CATEGORIA_RESTO_ = 'Outros';

// Stop words PT + as que aparecem em descrição de objeto e não distinguem nada.
var OBJETO_CAUSADOR_STOPWORDS_ = {
  'de': 1, 'da': 1, 'do': 1, 'das': 1, 'dos': 1, 'para': 1, 'com': 1, 'sem': 1,
  'em': 1, 'no': 1, 'na': 1, 'nos': 1, 'nas': 1, 'o': 1, 'a': 1, 'os': 1, 'as': 1,
  'um': 1, 'uma': 1, 'uns': 1, 'umas': 1, 'e': 1, 'ou': 1, 'ao': 1, 'aos': 1,
  'que': 1, 'por': 1, 'pelo': 1, 'pela': 1, 'se': 1, 'ser': 1, 'foi': 1,
  // (viva) "contra" era a 3ª palavra mais frequente da nuvem (20x) — é a
  // preposição de "bateu contra o gravitacional", não um objeto. Sem ela na
  // lista, a nuvem destacava uma preposição acima de "cesto" e "caixa".
  'contra': 1
};

/**
 * Classifica um texto livre numa macro-categoria.
 * Devolve { categoria, chave } — `chave` é a palavra que decidiu, e vai no
 * diagnóstico pra dar pra auditar por que um texto caiu onde caiu.
 */
function classificarObjetoCausador_(textoBruto) {
  var texto = normalizarTexto_(textoBruto).replace(/\s+/g, ' ').trim();
  if (!texto) return { categoria: OBJETO_CAUSADOR_CATEGORIA_RESTO_, chave: null };

  // Tokens sem pontuação: "caixa, com motores" -> ["caixa","com","motores"]
  var tokens = texto.split(/[^0-9a-z]+/).filter(function (t) { return t; });

  for (var c = 0; c < OBJETO_CAUSADOR_CATEGORIAS_.length; c++) {
    var cat = OBJETO_CAUSADOR_CATEGORIAS_[c];
    for (var k = 0; k < cat.chaves.length; k++) {
      var chave = cat.chaves[k];

      if (chave.indexOf(' ') !== -1) {
        // Expressão: casa no texto inteiro.
        if (texto.indexOf(chave) !== -1) return { categoria: cat.nome, chave: chave };
        continue;
      }

      // Palavra única: PREFIXO de token. Cobre plural e flexão de graça
      // ("peca"/"pecas", "motor"/"motores") sem deixar "palete" casar dentro
      // de "transpaleteira", que não COMEÇA com "palete".
      for (var t = 0; t < tokens.length; t++) {
        if (tokens[t].indexOf(chave) === 0) return { categoria: cat.nome, chave: chave };
      }
    }
  }

  return { categoria: OBJETO_CAUSADOR_CATEGORIA_RESTO_, chave: null };
}

/**
 * Indicador do objeto causador. NUNCA LANÇA: devolve { erro }.
 *
 * A coluna é resolvida por NOME entre OBJETO_CAUSADOR_CANDIDATOS_ e só cai pra
 * posição 66 (BO) se nenhum bater — mesma convenção da causa raiz, pelo mesmo
 * motivo: letra de coluna quebra calada quando alguém insere coluna.
 *
 * `naoClassificados` devolve os textos crus que caíram em "Outros", do maior
 * pro menor. É o que permite melhorar o dicionário com evidência em vez de
 * chute — em coluna de texto livre, "Outros" grande é o normal no começo.
 *
 * Formato: { erro, categorias: [{nome, total, pct, pctAcumulada}],
 *   palavras: [{palavra, total}], total, comTexto, ignoradasVazias,
 *   distintos, naoClassificados: [{texto, total}],
 *   diagnostico: {origemColuna, cabecalho, indice} }
 */
function getObjetoCausadorData(forcar) {
  var vazio = {
    erro: null, categorias: [], palavras: [], total: 0, comTexto: 0,
    ignoradasVazias: 0, distintos: 0, naoClassificados: [],
    diagnostico: { origemColuna: null, cabecalho: null, indice: null }
  };

  try {
    if (!forcar) {
      var cacheado = cacheLerGrande_(OBJETO_CAUSADOR_CACHE_CHAVE_);
      if (cacheado) return cacheado;
    }

    var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
    var aba = localizarAbaTolerante_(planilha, OCORRENCIAS_ABA_);
    if (!aba) throw new Error('Aba "' + OCORRENCIAS_ABA_ + '" não encontrada.');

    var ultimaLinha = aba.getLastRow();
    var ultimaColuna = aba.getLastColumn();
    if (ultimaLinha < 2) return vazio;

    var cabecalhos = aba.getRange(1, 1, 1, ultimaColuna).getValues()[0];
    var col = resolverColunaPorNomeOuPosicao_(
      cabecalhos, OBJETO_CAUSADOR_CANDIDATOS_, OBJETO_CAUSADOR_POSICAO_BO_, 'BO');
    if (col.indice >= ultimaColuna) {
      throw new Error('A aba tem só ' + ultimaColuna + ' colunas — não existe coluna BO (índice ' +
        OBJETO_CAUSADOR_POSICAO_BO_ + ').');
    }

    var dados = aba.getRange(2, 1, ultimaLinha - 1, col.indice + 1).getValues();

    var porCategoria = {}, porPalavra = {}, crusForaDeCategoria = {}, distintos = {};
    var comTexto = 0, ignoradasVazias = 0;

    dados.forEach(function (linha) {
      var bruto = String(linha[col.indice] || '').trim();
      if (!bruto) { ignoradasVazias++; return; }   // linha sem objeto: fora da conta
      comTexto++;
      distintos[bruto] = true;

      var classe = classificarObjetoCausador_(bruto);
      somarEm_(porCategoria, classe.categoria, 1);
      if (classe.categoria === OBJETO_CAUSADOR_CATEGORIA_RESTO_) {
        somarEm_(crusForaDeCategoria, bruto, 1);
      }

      // Nuvem de palavras: minúsculas, sem acento, sem stop word, sem token de
      // 1-2 letras (resto de pontuação) e sem número solto ("2", "10").
      normalizarTexto_(bruto).split(/[^0-9a-z]+/).forEach(function (p) {
        if (!p || p.length < 3) return;
        if (OBJETO_CAUSADOR_STOPWORDS_[p]) return;
        if (/^\d+$/.test(p)) return;
        somarEm_(porPalavra, p, 1);
      });
    });

    var ordenarMapa = function (mapa, chaveNome) {
      return Object.keys(mapa).map(function (k) {
        var o = { total: mapa[k] };
        o[chaveNome] = k;
        return o;
      }).sort(function (a, b) {
        return b.total - a.total || String(a[chaveNome]).localeCompare(String(b[chaveNome]));
      });
    };

    // Pareto: ordenado desc + % e % acumulada já prontas pro front.
    var categorias = ordenarMapa(porCategoria, 'nome');
    var acumulado = 0;
    categorias.forEach(function (c) {
      acumulado += c.total;
      c.pct = comTexto > 0 ? (c.total / comTexto) * 100 : 0;
      c.pctAcumulada = comTexto > 0 ? (acumulado / comTexto) * 100 : 0;
    });

    var resultado = {
      erro: null,
      categorias: categorias,
      palavras: ordenarMapa(porPalavra, 'palavra').slice(0, OBJETO_CAUSADOR_TOP_PALAVRAS_),
      total: dados.length,
      comTexto: comTexto,
      ignoradasVazias: ignoradasVazias,
      distintos: Object.keys(distintos).length,
      naoClassificados: ordenarMapa(crusForaDeCategoria, 'texto').slice(0, OBJETO_CAUSADOR_TOP_NAO_CLASSIF_),
      diagnostico: { origemColuna: col.origem, cabecalho: col.cabecalho, indice: col.indice }
    };

    try {
      cacheGravarGrande_(OBJETO_CAUSADOR_CACHE_CHAVE_, resultado, CACHE_SEGUNDOS_6H_);
    } catch (eCache) {
      // payload já calculado: segue sem cache
    }

    return resultado;
  } catch (e) {
    vazio.erro = e.message || String(e);
    return vazio;
  }
}

/**
 * Debug: distribuição das categorias, o que ficou em "Outros" e o topo da nuvem.
 * A lista de "Outros" é o insumo pra ampliar OBJETO_CAUSADOR_CATEGORIAS_.
 */
function debugObjetoCausador() {
  var r = getObjetoCausadorData(true);
  if (r.erro) { Logger.log('ERRO: ' + r.erro); return r; }

  Logger.log('Coluna: ' + farolSafLetraColuna_(r.diagnostico.indice) +
    ' "' + r.diagnostico.cabecalho + '" (origem: ' + r.diagnostico.origemColuna + ')');
  Logger.log('Linhas: ' + r.total + ' | com texto: ' + r.comTexto +
    ' | vazias ignoradas: ' + r.ignoradasVazias + ' | textos distintos: ' + r.distintos);

  Logger.log('--- Macro-categorias (Pareto) ---');
  r.categorias.forEach(function (c) {
    Logger.log('  ' + c.total + '  ' + c.nome +
      '  (' + c.pct.toFixed(1) + '% | acum ' + c.pctAcumulada.toFixed(1) + '%)');
  });

  Logger.log('--- "Outros": textos crus mais frequentes (insumo pro dicionário) ---');
  r.naoClassificados.forEach(function (o) { Logger.log('  ' + o.total + '  "' + o.texto + '"'); });

  Logger.log('--- Nuvem: 20 palavras mais frequentes ---');
  r.palavras.slice(0, 20).forEach(function (p) { Logger.log('  ' + p.total + '  ' + p.palavra); });
  return r;
}

// ============================================================================
// COMPORTAMENTO / CONDIÇÃO — item 6 do slide "Página 2 - Métricas" (Beatriz,
// 17/08/2026): "Gráfico de pizza".
//
// NÃO PRECISA DE IA, e isso vale registrar: a base "BASE TAG - SAF" (~65 mil
// linhas) já traz a classificação PRONTA na coluna RELATO — "CONDIÇÃO INSEGURA"
// e "ATO INSEGURO - SEGURANÇA..." (= comportamento inseguro). O
// obterTotaisTagSaf_ já lê e agrega isso desde 2026-07-26 pros 2 níveis de baixo
// da Pirâmide; aqui só se soma o que já está cacheado, sem nenhuma leitura nova.
//
// (A linha "Treinar IA, levantar o valor" do mesmo slide é OUTRA iniciativa —
// um assistente de chat no site respondendo perguntas sobre todas as planilhas.
// Não tem relação com este card.)
//
// ESCOPO: "ATO SEGURO" fica de fora porque obterTotaisTagSaf_ nunca o contou —
// é observação positiva, e os 2 níveis da Pirâmide que ele alimenta são de
// desvio. Se algum dia a pizza precisar da fatia de Ato Seguro, o lugar de
// mudar é lá, não aqui.
// ============================================================================

/**
 * Totais de Condição Insegura x Comportamento Inseguro, para o gráfico de pizza.
 *
 * NUNCA LANÇA: devolve { erro } pra um problema nesta base não derrubar a aba.
 *
 * Cobre TODO o período da base TAG SAF. `porAno` vai junto porque sai de graça
 * do mesmo laço e é o que permite conferir o número contra a Pirâmide, que é
 * filtrada por ano.
 *
 * Formato: { erro, itens: [{chave, nome, total, pct}], total,
 *   porAno: [{ano, condicaoInsegura, comportamentoInseguro, total}],
 *   periodo: {de, ate} }
 */
function getComportamentoCondicao(forcar) {
  var vazio = {
    erro: null, itens: [], total: 0, porAno: [], periodo: { de: null, ate: null }
  };

  try {
    var tudo = obterTotaisTagSaf_(!!forcar) || {};

    // O pacote é indexado por ANO; qualquer chave não-numérica que apareça
    // (metadado futuro) não pode virar uma linha de ano.
    var anos = Object.keys(tudo)
      .map(Number)
      .filter(function (a) { return !isNaN(a) && a > 0; })
      .sort(function (a, b) { return a - b; });

    if (!anos.length) return vazio;

    var porAno = anos.map(function (ano) {
      var porMes = (tudo[ano] && tudo[ano]['Todas']) || {};
      var condicao = 0, comportamento = 0;

      Object.keys(porMes).forEach(function (mes) {
        var b = porMes[mes];
        if (!b) return;
        condicao += Number(b.condicaoInsegura) || 0;
        comportamento += Number(b.comportamentoInseguro) || 0;
      });

      return {
        ano: ano,
        condicaoInsegura: condicao,
        comportamentoInseguro: comportamento,
        total: condicao + comportamento
      };
    }).filter(function (l) { return l.total > 0; });

    if (!porAno.length) return vazio;

    var somar = function (campo) {
      return porAno.reduce(function (s, l) { return s + l[campo]; }, 0);
    };
    var condicao = somar('condicaoInsegura');
    var comportamento = somar('comportamentoInseguro');
    var total = condicao + comportamento;

    // Ordenado desc: a maior fatia primeiro, pra pizza começar pelo que pesa.
    var itens = [
      { chave: 'condicaoInsegura', nome: 'Condição Insegura', total: condicao },
      { chave: 'comportamentoInseguro', nome: 'Comportamento Inseguro', total: comportamento }
    ].sort(function (a, b) { return b.total - a.total; });

    itens.forEach(function (i) { i.pct = total > 0 ? (i.total / total) * 100 : 0; });

    return {
      erro: null,
      itens: itens,
      total: total,
      porAno: porAno,
      periodo: { de: porAno[0].ano, ate: porAno[porAno.length - 1].ano }
    };
  } catch (e) {
    vazio.erro = e.message || String(e);
    return vazio;
  }
}

/**
 * Debug: imprime a pizza e a quebra por ano. O total por ano tem que bater com
 * os 2 níveis de baixo da Pirâmide no mesmo ano — é a conferência cruzada mais
 * barata que existe aqui, já que as duas telas leem o MESMO pacote.
 */
function debugComportamentoCondicao() {
  var r = getComportamentoCondicao(true);
  if (r.erro) { Logger.log('ERRO: ' + r.erro); return r; }

  Logger.log('Período: ' + r.periodo.de + '..' + r.periodo.ate + ' | total: ' + r.total);
  r.itens.forEach(function (i) {
    Logger.log('  ' + i.nome + ': ' + i.total + ' (' + i.pct.toFixed(1) + '%)');
  });
  Logger.log('--- por ano (conferir contra a Pirâmide) ---');
  Logger.log('ano   condicao   comportamento   total');
  r.porAno.forEach(function (l) {
    Logger.log('  ' + l.ano + '   ' + l.condicaoInsegura + '   ' +
      l.comportamentoInseguro + '   ' + l.total);
  });
  return r;
}

/**
 * Debug das TRÊS divergências do SAF Action Tracker levantadas em 17/08/2026.
 * Cada bloco existe pra substituir uma suposição por medição:
 *
 * 1) 1.080 linhas com Planta/Pillar VAZIA (de 1.501). Foi sugerido tratá-las
 *    como Rio Claro e afrouxar o filtro. NÃO fazer isso às cegas: a base tem
 *    JLLE (106) e MNS (32), e assumir "vazio = RCL" infla os indicadores da
 *    planta — que é o motivo de o filtro existir. Este bloco cruza planta vazia
 *    x ÁREA/UGB: as áreas de RCL têm padrão reconhecível ("L8RC", "SCOTT1",
 *    "... - RCL"). Se as vazias tiverem esse padrão, aí sim há evidência.
 *
 * 2) Conformidade "0% Sim" (187 Parcial / 96 Não). Foi sugerido que "Sim" viria
 *    com outra grafia. O log de debugSafAuditoria JÁ lista todos os valores
 *    distintos, e só apareceram dois — então não há "OK"/"Yes" escondido em
 *    RCL. Aqui a checagem é mais ampla: valores de Resposta em TODAS as plantas.
 *    Se nem lá existir "Sim", a conclusão é que a base só registra DESVIO (é um
 *    action tracker), e o percentualSim não deve ser chamado de conformidade.
 *
 * 3) 213 "Atrasada" na planilha x 14 vencidas calculadas. Antes de teorizar
 *    sobre histórico, medir o simples: quantas dessas 213 têm PRAZO preenchido,
 *    quantas já têm data de conclusão, e quantas têm prazo no futuro. Linha sem
 *    prazo não tem como entrar no cálculo, e isso sozinho pode explicar o gap.
 */
function debugSafAuditoriaDivergencias() {
  var planilha = SpreadsheetApp.openById(SAF_AUDITORIA_SPREADSHEET_ID_);
  var aba = localizarAbaTolerante_(planilha, SAF_AUDITORIA_ABA_);
  if (!aba) throw new Error('Aba "' + SAF_AUDITORIA_ABA_ + '" não encontrada.');

  // .indices, não o objeto inteiro: obterIndicesSafAuditoria_ devolve
  // { indices, origem, cabecalhos }. Usar o retorno direto faz idx.planta virar
  // undefined e TODA leitura sair vazia — sem erro nenhum, só zeros.
  var idx = obterIndicesSafAuditoria_(aba).indices;
  var ultimaLinha = aba.getLastRow();
  // Math.max(..., 16) pelo mesmo motivo de obterIndicesSafAuditoria_: as últimas
  // colunas podem estar vazias e encurtar o getLastColumn().
  var dados = aba.getRange(2, 1, ultimaLinha - 1, Math.max(aba.getLastColumn(), 16)).getValues();
  var hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  // Guarda contra o erro que este próprio debug cometeu na 1ª versão: índice
  // undefined lê `linha[undefined]`, devolve vazio em TODAS as linhas e o log
  // sai cheio de zeros parecendo achado. Falhar alto é melhor que zerar calado.
  ['planta', 'area', 'resposta', 'status', 'prazo', 'conclusao'].forEach(function (chave) {
    if (typeof idx[chave] !== 'number') {
      throw new Error('Índice da coluna "' + chave + '" não resolveu (veio ' + idx[chave] +
        '). O log sairia todo zerado — conferir obterIndicesSafAuditoria_.');
    }
  });

  // ---- 1) Planta vazia: de quem são essas linhas? ----
  var PADRAO_RCL_ = /(^|[^a-z])(l\d+rc|scott\d*|rcl)([^a-z]|$)/i;
  var vaziasPorArea = {}, vaziasComCaraDeRcl = 0, vazias = 0;

  dados.forEach(function (l) {
    var planta = String(l[idx.planta] || '').trim();
    if (planta) return;
    vazias++;
    var area = String(l[idx.area] || '').trim() || '(área vazia)';
    somarEm_(vaziasPorArea, area, 1);
    if (PADRAO_RCL_.test(area)) vaziasComCaraDeRcl++;
  });

  Logger.log('=== 1) LINHAS COM PLANTA VAZIA ===');
  Logger.log('  total sem planta: ' + vazias +
    ' | com ÁREA em padrão de Rio Claro (L#RC / SCOTT / -RCL): ' + vaziasComCaraDeRcl +
    ' (' + (vazias ? Math.round((vaziasComCaraDeRcl / vazias) * 100) : 0) + '%)');
  Logger.log('  --- áreas mais frequentes entre as SEM planta ---');
  Object.keys(vaziasPorArea).sort(function (a, b) { return vaziasPorArea[b] - vaziasPorArea[a]; })
    .slice(0, 20).forEach(function (k) {
      Logger.log('    ' + vaziasPorArea[k] + '  "' + k + '"' + (PADRAO_RCL_.test(k) ? '   <- cara de RCL' : ''));
    });

  // ---- 2) "Sim" existe em ALGUMA planta? ----
  var respostaPorPlanta = {};
  dados.forEach(function (l) {
    var planta = String(l[idx.planta] || '').trim() || '(vazio)';
    var resp = String(l[idx.resposta] || '').trim() || '(vazio)';
    if (!respostaPorPlanta[planta]) respostaPorPlanta[planta] = {};
    somarEm_(respostaPorPlanta[planta], resp, 1);
  });

  Logger.log('=== 2) RESPOSTA POR PLANTA (procurando qualquer "Sim") ===');
  Object.keys(respostaPorPlanta).sort().forEach(function (p) {
    var m = respostaPorPlanta[p];
    Logger.log('  [' + p + ']');
    Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).forEach(function (k) {
      Logger.log('      ' + m[k] + '  "' + k + '"');
    });
  });

  // ---- 3) Anatomia das "Atrasada" ----
  var atrasadas = 0, semPrazo = 0, comConclusao = 0, prazoFuturo = 0, prazoVencidoSemConclusao = 0;
  dados.forEach(function (l) {
    var status = normalizarChaveTexto_(l[idx.status]);
    if (status !== 'atrasada') return;
    atrasadas++;

    var prazo = safParseData_(l[idx.prazo]);
    var conclusao = safParseData_(l[idx.conclusao]);
    if (!prazo) { semPrazo++; return; }
    if (conclusao) { comConclusao++; return; }
    if (prazo >= hoje) { prazoFuturo++; return; }
    prazoVencidoSemConclusao++;
  });

  Logger.log('=== 3) ANATOMIA DAS LINHAS COM STATUS "Atrasada" (todas as plantas) ===');
  Logger.log('  total "Atrasada": ' + atrasadas);
  Logger.log('    sem PRAZO preenchido (não dá pra calcular): ' + semPrazo);
  Logger.log('    já tem data de CONCLUSÃO (status desatualizado): ' + comConclusao);
  Logger.log('    prazo ainda no FUTURO (status errado): ' + prazoFuturo);
  Logger.log('    prazo vencido E sem conclusão (atraso REAL): ' + prazoVencidoSemConclusao);
  Logger.log('  >> a soma das 4 linhas acima tem que dar o total de "Atrasada".');
}

/**
 * Debug: qual CRITÉRIO de "registrável" reproduz o gráfico da Beatriz.
 *
 * Medido em 17/08/2026 por debugRecorteOcorrencias: o universo é o MESMO (Site
 * = "Rio Claro" nas 415 linhas, e o total por ano bate exato com o slide de
 * 2020 a 2025). O que diverge é a classificação dentro do ano:
 *
 *   ano    meu REC   slide REC
 *   2020      18        18      (bate)
 *   2021       9        11
 *   2023       4         6
 *   2024       6        11
 *   total     43        54      -> 11 casos de diferença
 *
 * Meu Recordable = "U.S. OSHA Recordable? = Yes", que dá 46 no período inteiro
 * e casa exatamente com os 46 de Extent OSHA (38 Other + 7 DAFW + 1 Job
 * Transfer). O slide conta 55.
 *
 * HIPÓTESE: o gráfico dela usa o critério LOCAL (coluna P, "Locally
 * Reportable?"), não o americano. Faz sentido — a regra brasileira de acidente
 * registrável não é a mesma do OSHA, e um caso pode ser reportável aqui sem ser
 * OSHA Recordable.
 *
 * Este log cruza os dois critérios por ano. Se a coluna "OSHA=No mas Local=Yes"
 * tiver ~11 casos distribuídos como a diferença acima, está achado.
 *
 * NÃO trocar a regra do módulo por causa disto sem falar com a Beatriz: a mesma
 * classificação sustenta o Boneco e o card do Meu Feed.
 */
function debugCriterioRecordable() {
  var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
  var aba = localizarAbaTolerante_(planilha, OCORRENCIAS_ABA_);
  if (!aba) throw new Error('Aba "' + OCORRENCIAS_ABA_ + '" não encontrada.');

  var dados = aba.getRange(1, 1, aba.getLastRow(), aba.getLastColumn()).getValues();
  var cab = dados[0];
  var idxDe = function (nome) {
    for (var i = 0; i < cab.length; i++) {
      if (normalizarChaveTexto_(cab[i]) === normalizarChaveTexto_(nome)) return i;
    }
    return -1;
  };

  var iOsha = idxDe('U.S. OSHA Recordable?');
  var iLocal = idxDe('Locally Reportable?');
  var iData = idxDe('Case Date');
  var iExtent = idxDe('Extent');
  var iDafw = idxDe('Inj. DAFW?');
  var iOutro = idxDe('Inj. Other Recordable Case?');
  if (iOsha < 0 || iLocal < 0 || iData < 0) {
    throw new Error('Colunas OSHA/Local/Case Date não encontradas.');
  }

  var fuso = aba.getParent().getSpreadsheetTimeZone();
  var sim = function (v) { return normalizarTexto_(v).trim() === 'yes'; };

  var porAno = {}, soLocal = [];
  for (var i = 1; i < dados.length; i++) {
    var d = dados[i][iData];
    if (!(d instanceof Date)) continue;
    var ano = Utilities.formatDate(d, fuso, 'yyyy');
    if (!porAno[ano]) porAno[ano] = { linhas: 0, osha: 0, local: 0, ambos: 0, soOsha: 0, soLocal: 0, nenhum: 0 };

    var o = sim(dados[i][iOsha]);
    var l = sim(dados[i][iLocal]);
    var b = porAno[ano];
    b.linhas++;
    if (o) b.osha++;
    if (l) b.local++;
    if (o && l) b.ambos++;
    else if (o) b.soOsha++;
    else if (l) {
      b.soLocal++;
      soLocal.push(ano + ' | Extent="' + String(dados[i][iExtent] || '').replace(/\s+/g, ' ').trim() +
        '" | DAFW=' + String(dados[i][iDafw] || '') +
        ' | OtherRec=' + String(dados[i][iOutro] || ''));
    } else b.nenhum++;
  }

  Logger.log('=== CRITÉRIO OSHA x LOCAL, por ano ===');
  Logger.log('ano   linhas   OSHA=Yes   Local=Yes   ambos   só OSHA   só LOCAL   nenhum');
  Object.keys(porAno).sort().forEach(function (a) {
    var b = porAno[a];
    Logger.log('  ' + a + '     ' + b.linhas + '        ' + b.osha + '          ' + b.local +
      '         ' + b.ambos + '        ' + b.soOsha + '         ' + b.soLocal + '         ' + b.nenhum);
  });

  var totOsha = 0, totLocal = 0, totSoLocal = 0;
  Object.keys(porAno).forEach(function (a) {
    totOsha += porAno[a].osha; totLocal += porAno[a].local; totSoLocal += porAno[a].soLocal;
  });
  Logger.log('TOTAIS: OSHA=Yes ' + totOsha + ' | Local=Yes ' + totLocal +
    ' | só Local (não OSHA) ' + totSoLocal);
  Logger.log('>> o slide da Beatriz conta 55 recordables em 2020-2026.' +
    ' Se "Local=Yes" der ~55, o critério dela é o LOCAL.');

  Logger.log('=== Casos "só LOCAL" (não são OSHA Recordable) ===');
  soLocal.slice(0, 30).forEach(function (s) { Logger.log('  ' + s); });
}

/**
 * Debug: valores BRUTOS da coluna RELATO e distribuição por ANO da base
 * "BASE TAG - SAF". Existe por causa de um resultado suspeito de
 * debugComportamentoCondicao em 17/08/2026:
 *
 *   2025 -> 129 apontamentos | 2026 -> 58.082 apontamentos
 *   Condição 29.087 x Comportamento 29.124  (50,0% / 50,0%)
 *
 * Duas coisas a explicar: (a) por que praticamente TUDO cai em 2026, e (b) um
 * empate de 50/50 com diferença de 37 em 58 mil, que é improvável demais em
 * dado real. Isto NÃO é só do card novo — a Pirâmide de Segurança lê o MESMO
 * pacote, então se houver defeito de leitura ela está errada junto.
 *
 * O log mostra: quantas linhas têm data inválida, os valores crus de RELATO com
 * contagem, e a distribuição ano a ano.
 */
function debugTagSafRelatos() {
  var planilha = SpreadsheetApp.openById(TAG_SAF_SPREADSHEET_ID);
  var aba = planilha.getSheetByName('BASE TAG - SAF');
  if (!aba) throw new Error('Aba "BASE TAG - SAF" não encontrada.');

  var ultimaLinha = aba.getLastRow();
  var cabecalhos = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var colData = localizarColuna_(cabecalhos, 'data');
  var colRelato = localizarColuna_(cabecalhos, 'relato');

  Logger.log('Linhas de dado: ' + (ultimaLinha - 1) +
    ' | coluna data: ' + farolSafLetraColuna_(colData) +
    ' | coluna relato: ' + farolSafLetraColuna_(colRelato));

  var n = ultimaLinha - 1;
  var datas = aba.getRange(2, colData + 1, n, 1).getValues();
  var relatos = aba.getRange(2, colRelato + 1, n, 1).getValues();
  var fuso = aba.getParent().getSpreadsheetTimeZone();

  var porRelato = {}, porAno = {}, semData = 0, tiposPorAno = {};
  for (var i = 0; i < n; i++) {
    somarEm_(porRelato, String(relatos[i][0] || '(vazio)').trim(), 1);

    var d = datas[i][0];
    if (!(d instanceof Date)) { semData++; continue; }
    var ano = Utilities.formatDate(d, fuso, 'yyyy');
    somarEm_(porAno, ano, 1);

    var norm = normalizarTexto_(relatos[i][0]);
    var tipo = norm.indexOf('condicao insegura') !== -1 ? 'condicao'
             : (norm.indexOf('ato inseguro') !== -1 ? 'comportamento' : 'outro');
    if (!tiposPorAno[ano]) tiposPorAno[ano] = { condicao: 0, comportamento: 0, outro: 0 };
    tiposPorAno[ano][tipo]++;
  }

  Logger.log('Linhas SEM data válida (ignoradas pelo agregador): ' + semData);

  Logger.log('--- Valores brutos de RELATO ---');
  Object.keys(porRelato).sort(function (a, b) { return porRelato[b] - porRelato[a]; })
    .slice(0, 25).forEach(function (k) { Logger.log('  ' + porRelato[k] + '  "' + k + '"'); });

  Logger.log('--- Linhas por ANO (todas, classificadas ou não) ---');
  Object.keys(porAno).sort().forEach(function (a) { Logger.log('  ' + a + ': ' + porAno[a]); });

  Logger.log('--- Classificação por ano ---');
  Object.keys(tiposPorAno).sort().forEach(function (a) {
    var t = tiposPorAno[a];
    Logger.log('  ' + a + ': condicao=' + t.condicao + ' comportamento=' + t.comportamento +
      ' fora das duas=' + t.outro);
  });
  return { porRelato: porRelato, porAno: porAno, semData: semData };
}

/**
 * Debug: distribuição das ocorrências por Site / Sub-Organization / Extent.
 * Existe para explicar a divergência entre debugParetoFaiRec e o gráfico do
 * slide da Beatriz, medida em 17/08/2026:
 *
 *   ano   meu FAI/REC     slide FAI/REC
 *   2020    84 / 18   =    84 / 18   (bate exato)
 *   2021    76 /  9   x    74 / 11
 *   2024    43 /  6   x    38 / 11
 *   2026    23 /  3   x    14 /  1
 *
 * Meu total cobre as 415 linhas da aba; o slide soma 404 no mesmo período. A
 * hipótese mais provável é RECORTE DE BASE — a aba pode conter mais de um site
 * (colunas Organization / Sub-Organization / Site) e o relatório dela filtrar
 * só Rio Claro. A segunda hipótese é COLUNA DE DATA diferente ("Date Recorded"
 * ou "Date First Recorded" em vez de "Case Date"), que desloca casos entre anos
 * sem mudar o total — o que explicaria 2020 bater e os outros não.
 *
 * NÃO mudar a regra de classificação por causa disso sem falar com a Beatriz:
 * ela é a mesma que sustenta o Boneco.
 */
function debugRecorteOcorrencias() {
  var planilha = SpreadsheetApp.openById(OCORRENCIAS_SPREADSHEET_ID_);
  var aba = localizarAbaTolerante_(planilha, OCORRENCIAS_ABA_);
  if (!aba) throw new Error('Aba "' + OCORRENCIAS_ABA_ + '" não encontrada.');

  var ultimaLinha = aba.getLastRow();
  var dados = aba.getRange(1, 1, ultimaLinha, aba.getLastColumn()).getValues();
  var cab = dados[0];
  var idxDe = function (nome) {
    for (var i = 0; i < cab.length; i++) {
      if (normalizarChaveTexto_(cab[i]) === normalizarChaveTexto_(nome)) return i;
    }
    return -1;
  };

  var campos = ['Organization', 'Sub-Organization', 'Site', 'SubSite', 'Location', 'Extent'];
  var fuso = aba.getParent().getSpreadsheetTimeZone();

  campos.forEach(function (nome) {
    var idx = idxDe(nome);
    if (idx < 0) { Logger.log('--- ' + nome + ': coluna não encontrada'); return; }
    var contagem = {};
    for (var i = 1; i < dados.length; i++) {
      somarEm_(contagem, String(dados[i][idx] || '(vazio)').trim(), 1);
    }
    var chaves = Object.keys(contagem).sort(function (a, b) { return contagem[b] - contagem[a]; });
    Logger.log('--- ' + nome + ' (' + farolSafLetraColuna_(idx) + '): ' + chaves.length + ' valores');
    chaves.slice(0, 12).forEach(function (k) { Logger.log('    ' + contagem[k] + '  "' + k + '"'); });
  });

  // As 3 colunas de data candidatas, lado a lado por ano: se o slide usar outra,
  // é aqui que a diferença aparece.
  ['Case Date', 'Date Recorded', 'Date First Recorded'].forEach(function (nome) {
    var idx = idxDe(nome);
    if (idx < 0) { Logger.log('--- ' + nome + ': não encontrada'); return; }
    var porAno = {}, invalidas = 0;
    for (var i = 1; i < dados.length; i++) {
      var d = dados[i][idx];
      if (!(d instanceof Date)) { invalidas++; continue; }
      somarEm_(porAno, Utilities.formatDate(d, fuso, 'yyyy'), 1);
    }
    Logger.log('--- ' + nome + ' (' + farolSafLetraColuna_(idx) + ') — inválidas: ' + invalidas);
    Object.keys(porAno).sort().forEach(function (a) { Logger.log('    ' + a + ': ' + porAno[a]); });
  });
}

/**
 * ===================================================
 * SAF — ACTION TRACKER DE AUDITORIAS
 *
 * Planilha PRÓPRIA (id novo, não é nenhuma das que já lemos), aba "SAF".
 * Cada linha é UMA PERGUNTA de checklist respondida numa auditoria; quando a
 * resposta aponta desvio, a mesma linha carrega o plano de ação
 * (Contramedida / Responsável / Prazo / Status).
 *
 * FILTRO OBRIGATÓRIO: só entram linhas com Planta/Pillar (coluna J) = "RCL".
 * A base é multiplanta (JLLE, MNS, RCL) e este portal é de Rio Claro — sem o
 * filtro, todo indicador viria inflado com auditoria de outra unidade.
 * A comparação é sobre o texto NORMALIZADO (trim + caixa), não `=== 'RCL'`:
 * espaço à direita numa célula é rotina em planilha e descartaria a linha
 * calado. Quais valores de planta apareceram e quantas linhas cada um trouxe
 * fica em `diagnostico.plantasVistas`, pra conferir que o filtro pegou.
 *
 * ACESSO: o app roda com `executeAs: USER_DEPLOYING` (appsscript.json), então
 * quem precisa enxergar esta planilha é a CONTA QUE PUBLICOU o deployment, não
 * cada usuário. Se ela não tiver acesso, `getSafAuditoria` devolve { erro } e o
 * resto da tela segue de pé.
 * ===================================================
 */
var SAF_AUDITORIA_SPREADSHEET_ID_ = '1Zec0nfhD9y9mMi3A2N1amL-b9seWHi27-p9vEhFqYtY';
var SAF_AUDITORIA_ABA_ = 'SAF';
var SAF_AUDITORIA_PLANTA_ = 'rcl'; // já normalizado (normalizarChaveTexto_)
var SAF_AUDITORIA_CACHE_CHAVE_ = 'safAuditoria_v1';
var SAF_AUDITORIA_CACHE_SEGUNDOS_ = CACHE_SEGUNDOS_6H_;

// Teto da lista de contramedidas vencidas devolvida ao frontend. Motivo é texto
// livre e pode ser longo; o cache é fatiado mas não é elástico. Mesmo
// raciocínio do teto de 40 do ATS e de 60 do boneco.
var SAF_AUDITORIA_MAX_REGISTROS_ = 60;

/**
 * Mapa das colunas A..P. `nome` é o cabeçalho da linha 1 e é o que manda;
 * `posicao` (0-based) é só a queda quando o nome não aparece.
 *
 * A COLUNA E NÃO TEM CABEÇALHO — está vazia na linha 1 por design da planilha.
 * É a única que não tem como ser localizada por nome, então vai por posição
 * declarada (`nome: null`). Todas as outras seguem a convenção do projeto de
 * casar por nome normalizado, pra não quebrar se inserirem/moverem coluna.
 *
 * Qual caminho cada coluna usou fica em `diagnostico.origemColunas` — é por ali
 * que se descobre um cabeçalho renomeado antes de ele virar número errado.
 */
var SAF_AUDITORIA_COLUNAS_ = {
  data:         { nome: 'Data',              posicao: 0 },
  auditor:      { nome: 'Auditor',           posicao: 1 },
  resposta:     { nome: 'Resposta',          posicao: 2 },
  tipo:         { nome: 'Tipo de Auditoria', posicao: 3 },
  area:         { nome: null,                posicao: 4 },  // cabeçalho VAZIO
  step:         { nome: 'Step',              posicao: 5 },
  pergunta:     { nome: 'Pergunta',          posicao: 6 },
  motivo:       { nome: 'Motivo',            posicao: 7 },
  contramedida: { nome: 'Contramedida',      posicao: 8 },
  planta:       { nome: 'Planta / Pillar',   posicao: 9 },
  responsavel:  { nome: 'Responsável',       posicao: 10 },
  inicio:       { nome: 'Início',            posicao: 11 },
  prazo:        { nome: 'Prazo',             posicao: 12 },
  conclusao:    { nome: 'Data Conclusão',    posicao: 13 },
  status:       { nome: 'Status',            posicao: 14 },
  comentarios:  { nome: 'Comentários',       posicao: 15 }
};

/**
 * Status da contramedida, casado por texto NORMALIZADO e por IGUALDADE EXATA.
 * Nunca indexOf: a armadilha que já custou caro no ATS ("Open Past Due" contém
 * "Open") e no TAG Safety ("muito improvável" contém "improvável"). Valor fora
 * desta tabela não é descartado — vira balde com o texto cru e é contado em
 * `diagnostico.statusNaoMapeado`, senão a soma não fecharia com o total.
 */
var SAF_AUDITORIA_STATUS_ = {
  'concluido': 'Concluído',
  'planejada': 'Planejada',
  'planejado': 'Planejada',
  'atrasada': 'Atrasada',
  'atrasado': 'Atrasada',
  'cancelada': 'Cancelada',
  'cancelado': 'Cancelada'
};

var SAF_AUDITORIA_RESPOSTAS_ = {
  'sim': 'Sim',
  'nao': 'Não',
  'parcial': 'Parcial'
};

/**
 * Resolve os índices das colunas. Não lança: devolve o que achou e registra a
 * origem de cada uma, porque a queda posicional é legítima aqui (coluna E) e
 * derrubar a leitura inteira por um cabeçalho renomeado seria pior que ler e
 * mostrar de onde veio.
 */
function obterIndicesSafAuditoria_(aba) {
  var totalColunas = Math.max(aba.getLastColumn(), 16);
  var cabecalhos = aba.getRange(1, 1, 1, totalColunas).getValues()[0];

  var indices = {}, origem = {};
  Object.keys(SAF_AUDITORIA_COLUNAS_).forEach(function (interna) {
    var def = SAF_AUDITORIA_COLUNAS_[interna];
    var achado = -1;

    if (def.nome) {
      var alvo = normalizarChaveTexto_(def.nome);
      for (var i = 0; i < cabecalhos.length; i++) {
        if (normalizarChaveTexto_(cabecalhos[i]) === alvo) { achado = i; break; }
      }
    }

    if (achado >= 0) {
      indices[interna] = achado;
      origem[interna] = 'cabecalho';
    } else {
      indices[interna] = def.posicao;
      origem[interna] = def.nome
        ? 'POSICAO (cabecalho "' + def.nome + '" nao encontrado)'
        : 'posicao (cabecalho vazio por design)';
    }
  });

  return { indices: indices, origem: origem, cabecalhos: cabecalhos };
}

/**
 * Data tolerante. Célula de data no Sheets chega como Date; quando a coluna
 * está formatada como texto, chega string.
 *
 * NÃO usa `new Date(texto)` no caso brasileiro: "03/04/2026" seria lido como
 * 4 de março (mês/dia, convenção americana) e o cálculo de atraso sairia
 * errado por até 11 meses sem nenhum sintoma visível.
 */
function safParseData_(valor) {
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;

  var texto = String(valor == null ? '' : valor).trim();
  if (!texto) return null;

  var m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);        // dd/mm/aaaa
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);              // aaaa-mm-dd
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  return null;
}

/** Data -> 'aaaa-mm-dd' no fuso da planilha, ou null. Formato serializável. */
function safFormatarData_(data, fuso) {
  if (!(data instanceof Date) || isNaN(data.getTime())) return null;
  return Utilities.formatDate(data, fuso, 'yyyy-MM-dd');
}

/**
 * Extrai o número do Step do rótulo livre ("Step 3 - SAF" -> 3). Devolve null
 * quando não há número — o rótulo continua valendo como categoria, só não
 * participa dos marcos de certificação, que são por número.
 */
function safNumeroStep_(rotulo) {
  var m = String(rotulo == null ? '' : rotulo).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** {chave:total} -> [{nome,total}] ordenado desc. Formato de Pareto do projeto. */
function safOrdenarContagem_(mapa) {
  return Object.keys(mapa).map(function (nome) {
    return { nome: nome, total: mapa[nome] };
  }).sort(function (a, b) { return b.total - a.total; });
}

/**
 * Action Tracker de auditorias SAF, só Rio Claro (Planta/Pillar = RCL).
 *
 * NUNCA LANÇA: devolve { erro } se planilha/aba/acesso falhar, pra um problema
 * nesta base não derrubar a tela. Mesmo padrão de getOcorrenciasPainel,
 * getAtsAbertos e getRouteMap.
 *
 * DOIS UNIVERSOS NO MESMO PAYLOAD, e a diferença importa na hora de ler:
 *  - AUDITORIA (todas as linhas RCL): Resposta, Step, Tipo, Auditor, Área.
 *    Denominador = `total`.
 *  - PLANO DE AÇÃO (só linhas com Contramedida ou Status preenchidos): Status,
 *    Responsável, Prazo, vencidas. Denominador = `totalPlanos`.
 * Misturar os dois faria, por exemplo, "% concluído" cair sempre que a planta
 * fosse BEM auditada — pergunta conforme não gera contramedida, e entraria no
 * denominador como se fosse plano em aberto.
 *
 * Formato: { erro, total, totalPlanos, porStatus[], porResposta[], porStep[],
 *   porTipo[], porArea[], porResponsavel[], porAuditor[], porMes[],
 *   vencidas[], conformidade{}, periodo{de,ate}, diagnostico{} }
 */
function getSafAuditoria(forcar) {
  var vazio = {
    erro: null, total: 0, totalPlanos: 0,
    porStatus: [], porResposta: [], porStep: [], porStepMes: [], porTipo: [], porArea: [],
    porResponsavel: [], porAuditor: [], porMes: [], vencidas: [],
    certificacaoAlvo: SAF_CERTIFICACAO_ALVO_,
    conformidade: { sim: 0, nao: 0, parcial: 0, avaliadas: 0, percentualSim: null },
    periodo: { de: null, ate: null },
    diagnostico: {
      origemColunas: {}, plantasVistas: [], linhasLidas: 0, linhasRCL: 0,
      statusNaoMapeado: [], respostaNaoMapeada: [], semResponsavel: 0,
      vencidasCalculadas: 0, atrasadasPelaPlanilha: 0, vencidasExibidas: 0,
      semPrazo: 0
    }
  };

  // ==========================================================================
  // DOIS AVISOS MEDIDOS NA BASE VIVA EM 2026-08-17. Ler antes de montar
  // qualquer indicador em cima deste payload.
  //
  // 1) `conformidade.percentualSim` É SEMPRE 0 — e isso NÃO é defeito.
  //    debugSafAuditoriaDivergencias varreu as 3 plantas e não existe UMA
  //    resposta "Sim" na base inteira: RCL 187 Parcial / 96 Não, JLLE 76 / 30,
  //    MNS 14 / 18. A explicação é a natureza do arquivo — um Action Tracker só
  //    ganha linha quando há DESVIO; item conforme não vira registro. Portanto
  //    NÃO rotular isso como "conformidade da planta" em tela nenhuma: o
  //    denominador só tem não-conformidades, e "0% de conformidade" seria uma
  //    afirmação falsa sobre a operação.
  //
  // 2) `diagnostico.vencidasCalculadas` SUBESTIMA o atraso, porque a coluna
  //    Prazo é quase toda vazia (284 das 285 linhas com status "Atrasada" não
  //    têm prazo). Comparar esse número com `atrasadasPelaPlanilha` sem dizer
  //    isso sugere que o time exagera no status — quando o que existe é falta de
  //    preenchimento de prazo. Por isso `semPrazo` vai junto no diagnóstico.
  // ==========================================================================

  try {
    if (!forcar) {
      var cacheado = cacheLerGrande_(SAF_AUDITORIA_CACHE_CHAVE_);
      if (cacheado) return cacheado;
    }

    var planilha = SpreadsheetApp.openById(SAF_AUDITORIA_SPREADSHEET_ID_);
    var aba = localizarAbaTolerante_(planilha, SAF_AUDITORIA_ABA_);
    if (!aba) throw new Error('Aba "' + SAF_AUDITORIA_ABA_ + '" não encontrada na planilha do Action Tracker.');

    var mapa = obterIndicesSafAuditoria_(aba);
    var idx = mapa.indices;
    vazio.diagnostico.origemColunas = mapa.origem;

    var ultimaLinha = aba.getLastRow();
    if (ultimaLinha < 2) return vazio;

    var fuso = planilha.getSpreadsheetTimeZone();

    var colMax = 0;
    Object.keys(idx).forEach(function (k) { colMax = Math.max(colMax, idx[k]); });
    colMax = Math.min(colMax + 1, aba.getMaxColumns());

    var dados = aba.getRange(2, 1, ultimaLinha - 1, colMax).getValues();

    // Hoje zerado na meia-noite: senão uma contramedida que vence HOJE contaria
    // como vencida durante o dia inteiro, e o prazo ainda não passou.
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    var status = {}, respostas = {}, steps = {}, tipos = {}, areas = {};
    var responsaveis = {}, auditores = {}, meses = {}, plantas = {};
    var stepMes = {}; // { step: { 'aaaa-mm': {total,sim,nao,parcial} } }
    var statusNaoMapeado = {}, respostaNaoMapeada = {};
    var vencidas = [];
    var total = 0, totalPlanos = 0, semResponsavel = 0;
    var vencidasCalculadas = 0, atrasadasPelaPlanilha = 0, semPrazo = 0;
    var maisAntiga = null, maisNova = null;

    function contar_(alvo, chave, vazioRotulo) {
      var k = String(chave == null ? '' : chave).replace(/\s+/g, ' ').trim() || (vazioRotulo || 'Não informado');
      alvo[k] = (alvo[k] || 0) + 1;
      return k;
    }

    dados.forEach(function (linha) {
      var plantaBruta = String(linha[idx.planta] == null ? '' : linha[idx.planta]).trim();
      contar_(plantas, plantaBruta, '(vazio)');

      // O FILTRO. Fora daqui nada é contado.
      if (normalizarChaveTexto_(plantaBruta) !== SAF_AUDITORIA_PLANTA_) return;
      total++;

      // --- universo AUDITORIA ---
      var respostaBruta = String(linha[idx.resposta] == null ? '' : linha[idx.resposta]).trim();
      var respostaNorm = normalizarChaveTexto_(respostaBruta);
      var respostaRotulo = SAF_AUDITORIA_RESPOSTAS_[respostaNorm];
      if (!respostaRotulo && respostaBruta) {
        respostaRotulo = respostaBruta;
        respostaNaoMapeada[respostaBruta] = (respostaNaoMapeada[respostaBruta] || 0) + 1;
      }
      contar_(respostas, respostaRotulo, 'Sem resposta');

      var stepRotulo = contar_(steps, linha[idx.step], 'Sem step');
      contar_(tipos, linha[idx.tipo], 'Sem tipo');
      contar_(areas, linha[idx.area], 'Sem área');
      contar_(auditores, linha[idx.auditor], 'Sem auditor');

      var dataAuditoria = safParseData_(linha[idx.data]);
      if (dataAuditoria) {
        if (!maisAntiga || dataAuditoria < maisAntiga) maisAntiga = dataAuditoria;
        if (!maisNova || dataAuditoria > maisNova) maisNova = dataAuditoria;
        var chaveMes = Utilities.formatDate(dataAuditoria, fuso, 'yyyy-MM');
        contar_(meses, chaveMes);

        // Step x mês: é a série que sustenta a linha do tempo "Step x
        // percentual" pedida na reunião. Guarda as 3 respostas, não só o
        // total — o percentual precisa ser recalculável no frontend quando o
        // usuário filtrar, e um percentual pronto não se re-agrega.
        if (!stepMes[stepRotulo]) stepMes[stepRotulo] = {};
        if (!stepMes[stepRotulo][chaveMes]) {
          stepMes[stepRotulo][chaveMes] = { total: 0, sim: 0, nao: 0, parcial: 0 };
        }
        var balde = stepMes[stepRotulo][chaveMes];
        balde.total++;
        if (respostaRotulo === 'Sim') balde.sim++;
        else if (respostaRotulo === 'Não') balde.nao++;
        else if (respostaRotulo === 'Parcial') balde.parcial++;
      }

      // --- universo PLANO DE AÇÃO ---
      var contramedida = String(linha[idx.contramedida] == null ? '' : linha[idx.contramedida]).trim();
      var statusBruto = String(linha[idx.status] == null ? '' : linha[idx.status]).trim();
      if (!contramedida && !statusBruto) return;

      totalPlanos++;

      var statusNorm = normalizarChaveTexto_(statusBruto);
      var statusRotulo = SAF_AUDITORIA_STATUS_[statusNorm];
      if (!statusRotulo && statusBruto) {
        statusRotulo = statusBruto;
        statusNaoMapeado[statusBruto] = (statusNaoMapeado[statusBruto] || 0) + 1;
      }
      statusRotulo = contar_(status, statusRotulo, 'Sem status');
      if (statusRotulo === 'Atrasada') atrasadasPelaPlanilha++;

      var responsavel = String(linha[idx.responsavel] == null ? '' : linha[idx.responsavel]).replace(/\s+/g, ' ').trim();
      if (!responsavel) { responsavel = 'Sem responsável'; semResponsavel++; }
      if (!responsaveis[responsavel]) {
        responsaveis[responsavel] = { nome: responsavel, total: 0, concluido: 0, pendente: 0, vencida: 0 };
      }
      responsaveis[responsavel].total++;

      var concluida = (statusRotulo === 'Concluído') || !!safParseData_(linha[idx.conclusao]);
      if (concluida) responsaveis[responsavel].concluido++;
      else responsaveis[responsavel].pendente++;

      // Vencida CALCULADA: prazo passou e não há conclusão. É independente da
      // coluna Status, que é preenchida à mão e pode estar desatualizada.
      //
      // MEDIDO em 2026-08-17 (debugSafAuditoriaDivergencias): das 285 linhas com
      // status "Atrasada" em todas as plantas, **284 NÃO TÊM PRAZO PREENCHIDO**.
      // Ou seja, a divergência "213 atrasadas x 14 calculadas" não é status
      // desatualizado nem histórico — é a coluna Prazo praticamente vazia. Sem
      // prazo não há como calcular vencimento, e a linha não entra aqui.
      // `semPrazo` viaja no diagnóstico pra esse número nunca mais ser lido como
      // "quase nada está atrasado".
      var prazo = safParseData_(linha[idx.prazo]);
      if (!prazo) semPrazo++;
      if (!concluida && prazo && prazo < hoje) {
        vencidasCalculadas++;
        responsaveis[responsavel].vencida++;
        vencidas.push({
          responsavel: responsavel,
          area: String(linha[idx.area] == null ? '' : linha[idx.area]).trim(),
          step: stepRotulo,
          contramedida: contramedida,
          motivo: String(linha[idx.motivo] == null ? '' : linha[idx.motivo]).trim(),
          status: statusRotulo,
          prazo: safFormatarData_(prazo, fuso),
          diasAtraso: Math.round((hoje.getTime() - prazo.getTime()) / 86400000)
        });
      }
    });

    vencidas.sort(function (a, b) { return b.diasAtraso - a.diasAtraso; });

    var avaliadas = (respostas['Sim'] || 0) + (respostas['Não'] || 0) + (respostas['Parcial'] || 0);

    var resultado = {
      erro: null,
      total: total,
      totalPlanos: totalPlanos,
      porStatus: safOrdenarContagem_(status),
      porResposta: safOrdenarContagem_(respostas),
      porStep: Object.keys(steps).sort().map(function (nome) {   // ordinal: ordem alfabética = Step 0,1,2...
        return { nome: nome, total: steps[nome], numero: safNumeroStep_(nome) };
      }),
      // Linha do tempo Step x mês x conformidade (pedido da reunião). Os meses
      // de cada step vêm ordenados; 'aaaa-mm' ordena certo como texto.
      porStepMes: Object.keys(stepMes).sort().map(function (nome) {
        return {
          nome: nome,
          numero: safNumeroStep_(nome),
          meses: Object.keys(stepMes[nome]).sort().map(function (mes) {
            var b = stepMes[nome][mes];
            var avaliadasMes = b.sim + b.nao + b.parcial;
            return {
              nome: mes, total: b.total, sim: b.sim, nao: b.nao, parcial: b.parcial,
              percentualSim: avaliadasMes ? Math.round((b.sim / avaliadasMes) * 1000) / 10 : null
            };
          })
        };
      }),
      // Marcos acordados na reunião, viajam com o payload pra tela não ter
      // regra de negócio hardcoded no HTML.
      certificacaoAlvo: SAF_CERTIFICACAO_ALVO_,
      porTipo: safOrdenarContagem_(tipos),
      porArea: safOrdenarContagem_(areas),
      porResponsavel: Object.keys(responsaveis).map(function (k) { return responsaveis[k]; })
        .sort(function (a, b) { return (b.vencida - a.vencida) || (b.pendente - a.pendente) || (b.total - a.total); }),
      porAuditor: safOrdenarContagem_(auditores),
      porMes: Object.keys(meses).sort().map(function (nome) {    // 'aaaa-mm' ordena certo como texto
        return { nome: nome, total: meses[nome] };
      }),
      vencidas: vencidas.slice(0, SAF_AUDITORIA_MAX_REGISTROS_),
      conformidade: {
        sim: respostas['Sim'] || 0,
        nao: respostas['Não'] || 0,
        parcial: respostas['Parcial'] || 0,
        avaliadas: avaliadas,
        // "Parcial" NÃO é contado como meio ponto: seria uma regra inventada
        // aqui dentro. Os três números vão crus pra tela decidir.
        percentualSim: avaliadas ? Math.round(((respostas['Sim'] || 0) / avaliadas) * 1000) / 10 : null
      },
      periodo: { de: safFormatarData_(maisAntiga, fuso), ate: safFormatarData_(maisNova, fuso) },
      diagnostico: {
        origemColunas: mapa.origem,
        plantasVistas: safOrdenarContagem_(plantas),
        linhasLidas: dados.length,
        linhasRCL: total,
        statusNaoMapeado: safOrdenarContagem_(statusNaoMapeado),
        respostaNaoMapeada: safOrdenarContagem_(respostaNaoMapeada),
        semResponsavel: semResponsavel,
        vencidasCalculadas: vencidasCalculadas,
        atrasadasPelaPlanilha: atrasadasPelaPlanilha,
        // Quantas linhas de RCL estão sem Prazo. É o que explica a distância
        // entre os dois números acima — ver o aviso 2 no topo desta função.
        semPrazo: semPrazo,
        vencidasExibidas: Math.min(vencidas.length, SAF_AUDITORIA_MAX_REGISTROS_)
      }
    };

    // Gravação de cache em try PRÓPRIO: se o CacheService falhar, o payload já
    // está calculado e correto — devolvê-lo sem cache é muito melhor que cair no
    // catch de baixo e responder { erro } com tudo zerado. Cache é otimização,
    // não requisito da resposta.
    try {
      cacheGravarGrande_(SAF_AUDITORIA_CACHE_CHAVE_, resultado, SAF_AUDITORIA_CACHE_SEGUNDOS_);
    } catch (eCache) {
      resultado.diagnostico.avisoCache = 'não foi possível gravar o cache: ' + eCache.message;
    }

    return resultado;

  } catch (e) {
    vazio.erro = e.message;
    return vazio;
  }
}

/**
 * DIAGNÓSTICO — rodar UMA vez no editor do Apps Script antes de confiar em
 * qualquer número desta base. Nada aqui foi conferido contra a planilha viva.
 *
 * O que olhar no log, em ordem de importância:
 *  1. `origemColunas` — qualquer "POSICAO (cabecalho ... nao encontrado)" quer
 *     dizer que o cabeçalho mudou e a leitura caiu na posição. Só a coluna
 *     `area` deve aparecer como posicional (cabeçalho vazio por design).
 *  2. `plantasVistas` — tem que listar JLLE/MNS/RCL com contagens plausíveis.
 *     Se só vier um valor, ou vier "(vazio)", o filtro está lendo a coluna
 *     errada e TODO o resto está errado junto.
 *  3. Status e Resposta distintos — a grafia real manda. Valor que aparecer em
 *     `statusNaoMapeado` precisa entrar em SAF_AUDITORIA_STATUS_.
 *  4. `vencidasCalculadas` x `atrasadasPelaPlanilha` — divergência grande é
 *     achado pra levar à reunião, não necessariamente defeito de código.
 */
function debugSafAuditoria() {
  var r = getSafAuditoria(true);

  if (r.erro) {
    Logger.log('ERRO: ' + r.erro);
    Logger.log('Se for permissão, confirme que a CONTA QUE PUBLICOU o deployment enxerga a planilha ' +
      SAF_AUDITORIA_SPREADSHEET_ID_);
    return r;
  }

  Logger.log('=== ORIGEM DAS COLUNAS ===');
  Object.keys(r.diagnostico.origemColunas).forEach(function (k) {
    Logger.log('  ' + k + ': ' + r.diagnostico.origemColunas[k]);
  });

  Logger.log('=== PLANTAS (o filtro) === lidas=' + r.diagnostico.linhasLidas + ' RCL=' + r.diagnostico.linhasRCL);
  r.diagnostico.plantasVistas.forEach(function (p) { Logger.log('  "' + p.nome + '" -> ' + p.total); });

  Logger.log('=== RESPOSTA === (auditoria: ' + r.total + ' linhas)');
  r.porResposta.forEach(function (x) { Logger.log('  "' + x.nome + '" -> ' + x.total); });
  Logger.log('  conformidade: Sim ' + r.conformidade.sim + ' / Não ' + r.conformidade.nao +
    ' / Parcial ' + r.conformidade.parcial + ' = ' + r.conformidade.percentualSim + '% Sim');

  Logger.log('=== STATUS === (planos de ação: ' + r.totalPlanos + ' linhas)');
  r.porStatus.forEach(function (x) { Logger.log('  "' + x.nome + '" -> ' + x.total); });
  if (r.diagnostico.statusNaoMapeado.length) {
    Logger.log('  !! STATUS FORA DA TABELA (adicionar em SAF_AUDITORIA_STATUS_):');
    r.diagnostico.statusNaoMapeado.forEach(function (x) { Logger.log('     "' + x.nome + '" -> ' + x.total); });
  }
  if (r.diagnostico.respostaNaoMapeada.length) {
    Logger.log('  !! RESPOSTA FORA DA TABELA:');
    r.diagnostico.respostaNaoMapeada.forEach(function (x) { Logger.log('     "' + x.nome + '" -> ' + x.total); });
  }

  Logger.log('=== STEP ===');
  r.porStep.forEach(function (x) { Logger.log('  "' + x.nome + '" -> ' + x.total); });

  Logger.log('=== TIPO DE AUDITORIA ===');
  r.porTipo.forEach(function (x) { Logger.log('  "' + x.nome + '" -> ' + x.total); });

  Logger.log('=== ÁREA / UGB (coluna E, sem cabeçalho) === ' + r.porArea.length + ' distintas');
  r.porArea.slice(0, 30).forEach(function (x) { Logger.log('  "' + x.nome + '" -> ' + x.total); });

  Logger.log('=== RESPONSÁVEIS === ' + r.porResponsavel.length + ' (sem responsável: ' + r.diagnostico.semResponsavel + ')');
  r.porResponsavel.slice(0, 15).forEach(function (x) {
    Logger.log('  ' + x.nome + ': total=' + x.total + ' concluído=' + x.concluido +
      ' pendente=' + x.pendente + ' vencida=' + x.vencida);
  });

  Logger.log('=== ATRASO === calculadas(prazo vencido e sem conclusão)=' + r.diagnostico.vencidasCalculadas +
    ' x status "Atrasada" na planilha=' + r.diagnostico.atrasadasPelaPlanilha);
  Logger.log('   >> linhas SEM PRAZO preenchido: ' + r.diagnostico.semPrazo +
    '. É isto que separa os dois números acima — não status desatualizado.' +
    ' Sem prazo, não há como calcular vencimento.');
  r.vencidas.slice(0, 10).forEach(function (v) {
    Logger.log('  ' + v.diasAtraso + 'd — ' + v.responsavel + ' — ' + v.area + ' — ' + (v.contramedida || '(sem contramedida)'));
  });

  Logger.log('=== PERÍODO === ' + (r.periodo.de || '?') + ' .. ' + (r.periodo.ate || '?') +
    ' (' + r.porMes.length + ' meses com auditoria)');

  return r;
}

/**
 * ===================================================
 * ROUTE MAP (Base WCM) — avanço de STEP por área
 *
 * Aba "Route Map_2026". Topologia (dicionário do usuário, 2026-08-12):
 *  - Cabeçalho DUPLO: linha 1 = ano mesclado a cada 12 colunas; linha 2 = meses
 *    JAN..DEZ e os títulos de A..F. Dados começam na linha 3.
 *  - 1 área = BLOCO DE 3 LINHAS, distinguidas pela coluna F: Meta | Real |
 *    Percentual. Meta e Real são STEPS (0..6); Percentual é aderência.
 *  - A..E mescladas verticalmente: só a 1ª linha do bloco traz o valor.
 *    A/B = Área · C = Classificação (Matriz S) · D = Gerente · E = RISCOS.
 *  - Eixo de tempo G..BB (2023, 2024, 2025, 2026) · BC = validação (OK/ok).
 *
 * NADA AQUI USA LETRA DE COLUNA FIXA. O ano vem de preenchimento-para-frente da
 * linha 1 (a mescla faz as 11 colunas seguintes virem vazias), o mês por
 * prefixo de 3 letras na linha 2, e a coluna-pivô por VOCABULÁRIO
 * (Meta/Real/Percentual) com queda posicional pra F. A origem de cada decisão
 * fica em `diagnostico.origemColunas` — é por ali que se descobre layout
 * mexido antes de virar número errado.
 * ===================================================
 */
var ROUTE_MAP_SPREADSHEET_ID_ = '1X0l4yO7eXI4xRrY-SkIa5UVny8uhGfUOBWCEAF2Rsww';
var ROUTE_MAP_ABA_ = 'Route Map_2026';
var ROUTE_MAP_CACHE_CHAVE_ = 'routeMapTudo_v1';
var ROUTE_MAP_STEP_MAX_ = 6;

// Coluna F por posição, só como queda se o vocabulário Meta/Real/Percentual
// não aparecer em nenhuma coluna.
var ROUTE_MAP_PIVO_POSICAO_ = 5;

var ROUTE_MAP_MESES_ = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Mês pelo prefixo de 3 letras do cabeçalho da linha 2.
 *
 * Compara o prefixo de 3 LETRAS, não `indexOf`: 'mar' está contido em 'março'
 * mas também casaria por dentro de outras palavras, e 'mai' x 'mar' se
 * confundem se a comparação for frouxa. Devolve 0-based, ou -1.
 */
function routeMapIndiceMes_(bruto) {
  var t = normalizarChaveTexto_(bruto).replace(/\s/g, '');
  if (!t) return -1;
  var prefixo = t.substring(0, 3);
  return ROUTE_MAP_MESES_.indexOf(prefixo);
}

/**
 * Ano de cada coluna, por preenchimento-para-frente da linha 1.
 *
 * O ano é UMA célula mesclada sobre 12 colunas: no getValues() só a primeira
 * traz o texto e as 11 seguintes vêm vazias. Sem o fill-forward, 11 de cada 12
 * colunas ficariam sem ano e o mapa inteiro sairia com um mês por ano.
 */
function routeMapAnoPorColuna_(linha1) {
  var anos = [];
  var atual = null;
  for (var i = 0; i < linha1.length; i++) {
    var texto = String(linha1[i] == null ? '' : linha1[i]).trim();
    var m = texto.match(/(20\d{2})/);
    if (m) atual = Number(m[1]);
    anos.push(atual);
  }
  return anos;
}

/**
 * Elege a coluna-pivô (a que diz Meta/Real/Percentual) por vocabulário, olhando
 * as primeiras linhas de dados. Vence a coluna com mais acertos.
 */
function routeMapColunaPivo_(valores, linhaInicio) {
  var limite = Math.min(valores.length, linhaInicio + 60);
  var melhorCol = -1, melhorAcertos = 0;

  for (var c = 0; c < (valores[0] || []).length; c++) {
    var acertos = 0;
    for (var l = linhaInicio; l < limite; l++) {
      var t = normalizarChaveTexto_((valores[l] || [])[c]);
      if (t === 'meta' || t === 'real' || t === 'percentual') acertos++;
    }
    if (acertos > melhorAcertos) { melhorAcertos = acertos; melhorCol = c; }
  }

  if (melhorAcertos >= 3) return { coluna: melhorCol, origem: 'vocabulario (Meta/Real/Percentual)' };
  return { coluna: ROUTE_MAP_PIVO_POSICAO_, origem: 'POSICAO (vocabulario nao encontrado — queda pra coluna F)' };
}

/**
 * Classificação da Matriz S. A célula pode trazer HISTÓRICO em várias linhas:
 * "C - Matriz Inicial \n A - 2026". Devolve a classificação VIGENTE (a de maior
 * ano; "Matriz Inicial" é a linha de base, usada só quando não há nenhuma com
 * ano) e o histórico completo.
 *
 * Isso é o que sustenta o "prio AA e A" da ata: sem separar a vigente da
 * inicial, uma área que ERA C e virou A continuaria contando como C.
 */
function routeMapClassificacao_(bruto) {
  var texto = String(bruto == null ? '' : bruto).trim();
  if (!texto) return { texto: '', atual: null, ano: null, historico: [] };

  var historico = [];
  texto.split(/[\n\r]+/).forEach(function (parte) {
    var t = parte.trim();
    if (!t) return;
    var m = t.match(/^([A-Za-z]{1,2})\s*[-–]\s*(.+)$/);
    if (!m) return;
    var contexto = m[2].trim();
    var anoM = contexto.match(/(20\d{2})/);
    historico.push({
      letra: m[1].toUpperCase(),
      contexto: contexto,
      ano: anoM ? Number(anoM[1]) : null
    });
  });

  if (!historico.length) return { texto: texto, atual: null, ano: null, historico: [] };

  var comAno = historico.filter(function (h) { return h.ano !== null; });
  var vigente = comAno.length
    ? comAno.reduce(function (a, b) { return b.ano >= a.ano ? b : a; })
    : historico[0];

  return { texto: texto, atual: vigente.letra, ano: vigente.ano, historico: historico };
}

/**
 * Lê os blocos de área.
 *
 * ABRE BLOCO quando o nome está preenchido E (a área mudou OU a linha é
 * "Meta"). Isso funciona nos DOIS formatos possíveis: com A..E mescladas (só a
 * 1ª linha traz o nome) e sem mescla (nome repetido nas 3, onde quem abre é a
 * linha de Meta). NÃO presumir sempre 3 linhas por bloco — área sem alguma das
 * três linhas existe e não pode desalinhar as de baixo.
 */
function routeMapLerBlocos_(valores, linhaInicio, colPivo, anosPorColuna, idxIdent) {
  var blocos = [];
  var atual = null;
  var ultimaArea = null;

  for (var l = linhaInicio; l < valores.length; l++) {
    var linha = valores[l] || [];
    var nome = String(linha[idxIdent.area] == null ? '' : linha[idxIdent.area]).replace(/\s+/g, ' ').trim();
    var papel = normalizarChaveTexto_(linha[colPivo]);

    if (nome && (nome !== ultimaArea || papel === 'meta')) {
      atual = {
        area: nome,
        classificacao: routeMapClassificacao_(linha[idxIdent.classificacao]),
        gerente: String(linha[idxIdent.gerente] == null ? '' : linha[idxIdent.gerente]).replace(/\s+/g, ' ').trim(),
        riscos: Number(linha[idxIdent.riscos]) || 0,
        validacao: String(linha[idxIdent.validacao] == null ? '' : linha[idxIdent.validacao]).trim(),
        anos: {}
      };
      blocos.push(atual);
      ultimaArea = nome;
    }

    if (!atual) continue;
    if (papel !== 'meta' && papel !== 'real' && papel !== 'percentual') continue;

    // Distribui a linha inteira nos anos/meses conforme o cabeçalho.
    for (var c = 0; c < linha.length; c++) {
      var ano = anosPorColuna.ano[c];
      var mes = anosPorColuna.mes[c];
      if (!ano || mes < 0) continue;

      if (!atual.anos[ano]) {
        atual.anos[ano] = { meta: novaSerie12_(), real: novaSerie12_(), percentual: novaSerie12_() };
      }

      var valor = linha[c];
      if (valor === '' || valor === null || valor === undefined) continue;

      var numero = (typeof valor === 'number') ? valor : Number(String(valor).replace('%', '').replace(',', '.'));
      if (isNaN(numero)) continue;

      // Percentual vem 0..1 quando a célula é formatada como porcentagem no
      // Sheets, e 0..100 quando é texto. Normaliza pra 0..100.
      if (papel === 'percentual' && numero > 0 && numero <= 1) numero = numero * 100;

      atual.anos[ano][papel][mes] = numero;
    }
  }

  return blocos;
}

function novaSerie12_() {
  return [null, null, null, null, null, null, null, null, null, null, null, null];
}

/**
 * Parse da aba inteira (TODOS os anos de uma vez) + cache. Fatiar por ano na
 * leitura obrigaria reler a planilha a cada troca de filtro.
 */
function obterRouteMap_(forcar) {
  if (!forcar) {
    var cacheado = cacheLerGrande_(ROUTE_MAP_CACHE_CHAVE_);
    if (cacheado) return cacheado;
  }

  var planilha = SpreadsheetApp.openById(ROUTE_MAP_SPREADSHEET_ID_);
  var aba = localizarAbaTolerante_(planilha, ROUTE_MAP_ABA_);
  if (!aba) throw new Error('Aba "' + ROUTE_MAP_ABA_ + '" não encontrada na planilha do Route Map.');

  var ultimaLinha = aba.getLastRow();
  var ultimaColuna = aba.getLastColumn();
  if (ultimaLinha < 3) throw new Error('Aba "' + ROUTE_MAP_ABA_ + '" sem linhas de dados (esperado a partir da linha 3).');

  var valores = aba.getRange(1, 1, ultimaLinha, ultimaColuna).getValues();

  var anoPorColuna = routeMapAnoPorColuna_(valores[0] || []);
  var mesPorColuna = (valores[1] || []).map(function (c) { return routeMapIndiceMes_(c); });

  var pivo = routeMapColunaPivo_(valores, 2);

  // Identificação: Área é a 1ª coluna com texto antes do pivô; as demais são
  // localizadas por nome na linha 2, com queda posicional relativa.
  var linha2 = (valores[1] || []).map(function (c) { return normalizarChaveTexto_(c); });
  function acharIdent_(alvo, posicaoPadrao) {
    var i = linha2.indexOf(alvo);
    return i >= 0 ? { indice: i, origem: 'cabecalho' } : { indice: posicaoPadrao, origem: 'POSICAO' };
  }

  var identArea = acharIdent_('area', 0);
  var identClassificacao = acharIdent_('classificacao', 2);
  var identGerente = acharIdent_('gerente', 3);
  var identRiscos = acharIdent_('riscos', 4);

  // BC (validação) não tem título: é a 1ª coluna DEPOIS do último mês.
  var ultimaColunaMes = -1;
  mesPorColuna.forEach(function (m, i) { if (m >= 0 && anoPorColuna[i]) ultimaColunaMes = i; });
  var idxValidacao = ultimaColunaMes >= 0 ? ultimaColunaMes + 1 : ultimaColuna - 1;

  var idxIdent = {
    area: identArea.indice,
    classificacao: identClassificacao.indice,
    gerente: identGerente.indice,
    riscos: identRiscos.indice,
    validacao: idxValidacao
  };

  var blocos = routeMapLerBlocos_(valores, 2, pivo.coluna,
    { ano: anoPorColuna, mes: mesPorColuna }, idxIdent);

  var anosVistos = {};
  anoPorColuna.forEach(function (a, i) { if (a && mesPorColuna[i] >= 0) anosVistos[a] = true; });

  var pacote = {
    blocos: blocos,
    anosDisponiveis: Object.keys(anosVistos).map(Number).sort(),
    diagnostico: {
      origemColunas: {
        pivo: pivo.origem + ' (indice ' + pivo.coluna + ')',
        area: identArea.origem + ' (indice ' + identArea.indice + ')',
        classificacao: identClassificacao.origem + ' (indice ' + identClassificacao.indice + ')',
        gerente: identGerente.origem + ' (indice ' + identGerente.indice + ')',
        riscos: identRiscos.origem + ' (indice ' + identRiscos.indice + ')',
        validacao: 'posicao apos o ultimo mes (indice ' + idxValidacao + ')'
      },
      linhasLidas: ultimaLinha,
      colunasLidas: ultimaColuna,
      areas: blocos.length,
      colunasDeMes: mesPorColuna.filter(function (m, i) { return m >= 0 && anoPorColuna[i]; }).length
    }
  };

  try {
    cacheGravarGrande_(ROUTE_MAP_CACHE_CHAVE_, pacote, CACHE_SEGUNDOS_6H_);
  } catch (eCache) {
    pacote.diagnostico.avisoCache = 'não foi possível gravar o cache: ' + eCache.message;
  }

  return pacote;
}

/** Último índice não-nulo de uma série de 12. -1 se toda vazia. */
function routeMapUltimoMes_(serie) {
  for (var i = 11; i >= 0; i--) {
    if (serie[i] !== null && serie[i] !== undefined) return i;
  }
  return -1;
}

/**
 * Route Map de UM ano, pronto pra tela. NUNCA LANÇA: devolve { erro }.
 *
 * MÊS DE REFERÊNCIA É GLOBAL — o mês mais recente em que QUALQUER área lançou
 * Real. Comparar cada área no seu próprio último mês misturaria períodos e
 * faria uma área parada em março parecer tão em dia quanto uma atualizada em
 * julho.
 */
function getRouteMap(ano, forcar) {
  try {
    var pacote = obterRouteMap_(forcar);
    var alvo = Number(ano);

    var areas = [];

    // 1ª passada: cobertura de Real por mês, pra escolher o mês de referência.
    //
    // NÃO usar "o mês mais recente em que QUALQUER área lançou Real" — foi a
    // regra original e ela QUEBRA na planilha real (conferido em 12/08 com
    // debugRouteMap): 2 áreas de 51 já tinham lançado agosto enquanto as outras
    // 49 tinham fechado julho, e a referência pulou pra agosto. Resultado:
    // 50 áreas "atrasadas", aderência 50% e Expansão S3 = 0%, tudo artefato de
    // comparar quase todo mundo num mês que ainda não existe pra elas.
    //
    // Regra atual: o mês mais recente cuja cobertura alcança METADE da melhor
    // cobertura do ano — ou seja, o último mês que a planta de fato fechou.
    // Uma ou duas áreas adiantadas não movem mais a referência.
    var coberturaReal = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    pacote.blocos.forEach(function (b) {
      var dados = b.anos[alvo];
      if (!dados) return;
      for (var m = 0; m < 12; m++) {
        if (dados.real[m] !== null && dados.real[m] !== undefined) coberturaReal[m]++;
      }
    });

    var melhorCobertura = coberturaReal.reduce(function (a, b) { return Math.max(a, b); }, 0);
    var limiarCobertura = Math.max(1, Math.ceil(melhorCobertura / 2));
    var mesReferencia = -1;
    for (var mm = 11; mm >= 0; mm--) {
      if (coberturaReal[mm] >= limiarCobertura) { mesReferencia = mm; break; }
    }

    // 2ª passada: monta cada área NO MESMO mês.
    pacote.blocos.forEach(function (b) {
      var dados = b.anos[alvo];
      var meta = null, real = null, percentual = null;

      if (dados && mesReferencia >= 0) {
        meta = dados.meta[mesReferencia];
        real = dados.real[mesReferencia];
        percentual = dados.percentual[mesReferencia];
      }

      var temNumero = (meta !== null && meta !== undefined) || (real !== null && real !== undefined);

      areas.push({
        area: b.area,
        gerente: b.gerente,
        riscos: b.riscos,
        validacao: b.validacao,
        classificacao: b.classificacao.atual,
        classificacaoAno: b.classificacao.ano,
        classificacaoTexto: b.classificacao.texto,
        meta: (meta === undefined) ? null : meta,
        real: (real === undefined) ? null : real,
        percentual: (percentual === undefined) ? null : percentual,
        gap: temNumero ? (Number(meta || 0) - Number(real || 0)) : null,
        serie: dados ? { meta: dados.meta, real: dados.real, percentual: dados.percentual } : null,
        semDados: !temNumero
      });
    });

    // Ordem: pior gap primeiro, desempate por menor aderência; área sem
    // meta/real vai pro fim (não é "em dia", é "não avaliada").
    areas.sort(function (a, b) {
      if (a.semDados !== b.semDados) return a.semDados ? 1 : -1;
      if ((b.gap || 0) !== (a.gap || 0)) return (b.gap || 0) - (a.gap || 0);
      return (a.percentual === null ? 999 : a.percentual) - (b.percentual === null ? 999 : b.percentual);
    });

    var comNumero = areas.filter(function (a) { return !a.semDados; });
    var comPercentual = areas.filter(function (a) { return a.percentual !== null; });

    var noAlvo = comNumero.filter(function (a) { return Number(a.real || 0) >= Number(a.meta || 0); }).length;
    var somaPercentual = comPercentual.reduce(function (s, a) { return s + a.percentual; }, 0);

    // Matriz S: agrupa pela classificação VIGENTE. Área sem classificação vira
    // balde próprio — nunca some, senão a soma não fecha com o total.
    var matriz = {};
    areas.forEach(function (a) {
      var k = a.classificacao || 'Sem classificação';
      if (!matriz[k]) matriz[k] = { nome: k, total: 0, riscos: 0, areas: [] };
      matriz[k].total++;
      matriz[k].riscos += a.riscos || 0;
      matriz[k].areas.push(a.area);
    });

    var resultado = {
      erro: null,
      ano: alvo,
      mesReferencia: mesReferencia >= 0 ? mesReferencia + 1 : null, // 1-based pra tela
      areas: areas,
      stepMax: ROUTE_MAP_STEP_MAX_,
      resumo: {
        totalAreas: areas.length,
        areasComDados: comNumero.length,
        noAlvo: noAlvo,
        atrasadas: comNumero.length - noAlvo,
        aderenciaMedia: comPercentual.length ? Math.round((somaPercentual / comPercentual.length) * 10) / 10 : null,
        riscosTotal: areas.reduce(function (s, a) { return s + (a.riscos || 0); }, 0)
      },
      matrizS: Object.keys(matriz).sort().map(function (k) { return matriz[k]; }),
      expansaoS3: routeMapAtingimentoStep_(comNumero, 3, META_EXPANSAO_S3_),
      extensaoS4: routeMapAtingimentoStep_(comNumero, 4, META_EXTENSAO_S4_),
      diagnostico: Object.keys(pacote.diagnostico).reduce(function (acc, k) {
        acc[k] = pacote.diagnostico[k]; return acc;
      }, {
        // Cobertura mês a mês: é o que permite auditar a escolha do mês de
        // referência sem abrir a planilha.
        coberturaRealPorMes: coberturaReal,
        melhorCobertura: melhorCobertura,
        limiarCobertura: limiarCobertura
      }),
      anosDisponiveis: pacote.anosDisponiveis
    };

    return resultado;

  } catch (e) {
    return {
      erro: e.message, ano: Number(ano), mesReferencia: null, areas: [],
      stepMax: ROUTE_MAP_STEP_MAX_,
      resumo: { totalAreas: 0, areasComDados: 0, noAlvo: 0, atrasadas: 0, aderenciaMedia: null, riscosTotal: 0 },
      matrizS: [], expansaoS3: null, extensaoS4: null,
      diagnostico: {}, anosDisponiveis: []
    };
  }
}

/**
 * Atingimento de um STEP: quantas áreas já chegaram nele.
 *
 * DEFINIÇÃO ESCOLHIDA: % de áreas com Real >= step, sobre as áreas que têm
 * número no mês de referência. É a leitura direta de "Expansão S3" / "Extensão
 * S4", e é a única que dá pra sustentar com o que a base tem.
 *
 * ATENÇÃO — AINDA NÃO CONFERIDO CONTRA O QUE A BEATRIZ CALCULA. As metas da ata
 * (62,84% e 55,88%) não são múltiplos de 1/nº de áreas, o que sugere que o
 * número oficial pode ter outro denominador (ponderação por risco, por
 * quantidade de ferramentas do step, ou universo de áreas diferente). Por isso
 * o retorno carrega `numerador`/`denominador` explícitos: dá pra comparar com o
 * oficial e ajustar a regra sem adivinhar. Ver debugRouteMap.
 */
function routeMapAtingimentoStep_(areasComNumero, step, meta) {
  var atingiram = areasComNumero.filter(function (a) { return Number(a.real || 0) >= step; });

  return {
    step: step,
    meta: meta,
    numerador: atingiram.length,
    denominador: areasComNumero.length,
    percentual: areasComNumero.length
      ? Math.round((atingiram.length / areasComNumero.length) * 10000) / 100
      : null,
    areas: atingiram.map(function (a) { return a.area; }),
    definicao: '% de áreas com Real >= Step ' + step + ' no mês de referência'
  };
}

/**
 * DIAGNÓSTICO — rodar no editor ANTES de confiar em qualquer número. Nada desta
 * base foi conferido contra a planilha viva.
 *
 * O que olhar, em ordem:
 *  1. `origemColunas` — qualquer "POSICAO" quer dizer que o cabeçalho esperado
 *     não apareceu e a leitura caiu na posição. Só `validacao` deve ser
 *     posicional (a coluna BC não tem título).
 *  2. Nº de áreas e de colunas de mês (esperado 48 = 4 anos x 12).
 *  3. A tabela por área: Meta/Real precisam ser STEP (0..6), não percentual.
 *  4. Expansão S3 / Extensão S4 x as metas da ata (62,84% / 55,88%): se o
 *     percentual calculado destoar muito, a definição do numerador/denominador
 *     é outra — os dois números vão no log pra permitir a comparação.
 */
function debugRouteMap(ano) {
  var alvo = Number(ano) || new Date().getFullYear();
  var r = getRouteMap(alvo, true);

  if (r.erro) {
    Logger.log('ERRO: ' + r.erro);
    Logger.log('Se for permissão, confirme que a CONTA QUE PUBLICOU o deployment enxerga ' +
      ROUTE_MAP_SPREADSHEET_ID_);
    return r;
  }

  Logger.log('=== ORIGEM DAS COLUNAS ===');
  Object.keys(r.diagnostico.origemColunas || {}).forEach(function (k) {
    Logger.log('  ' + k + ': ' + r.diagnostico.origemColunas[k]);
  });
  Logger.log('  linhas=' + r.diagnostico.linhasLidas + ' colunas=' + r.diagnostico.colunasLidas +
    ' areas=' + r.diagnostico.areas + ' colunasDeMes=' + r.diagnostico.colunasDeMes + ' (esperado 48)');
  Logger.log('  anos disponíveis: ' + (r.anosDisponiveis || []).join(', '));

  Logger.log('=== COBERTURA DE "REAL" POR MÊS (base da escolha do mês de referência) ===');
  Logger.log('  jan..dez: ' + (r.diagnostico.coberturaRealPorMes || []).join(' | '));
  Logger.log('  melhor mês teve ' + r.diagnostico.melhorCobertura + ' área(s); limiar aplicado = ' +
    r.diagnostico.limiarCobertura + ' (metade da melhor)');

  Logger.log('=== RESUMO ' + alvo + ' === mês de referência = ' + (r.mesReferencia || '?'));
  Logger.log('  áreas=' + r.resumo.totalAreas + ' comDados=' + r.resumo.areasComDados +
    ' noAlvo=' + r.resumo.noAlvo + ' atrasadas=' + r.resumo.atrasadas +
    ' aderênciaMédia=' + r.resumo.aderenciaMedia + '% riscos=' + r.resumo.riscosTotal);

  Logger.log('=== ÁREAS (ordem da tela: pior gap primeiro) ===');
  r.areas.forEach(function (a) {
    Logger.log('  ' + a.area + ' | classif=' + (a.classificacao || '-') +
      (a.classificacaoAno ? '(' + a.classificacaoAno + ')' : '') +
      ' | gerente=' + (a.gerente || '-') + ' | riscos=' + a.riscos +
      ' | meta=' + a.meta + ' real=' + a.real + ' pct=' + a.percentual +
      ' gap=' + a.gap + (a.semDados ? ' [SEM DADOS]' : ''));
  });

  Logger.log('=== MATRIZ S (classificação vigente) ===');
  r.matrizS.forEach(function (m) {
    Logger.log('  ' + m.nome + ': ' + m.total + ' área(s), ' + m.riscos + ' risco(s) — ' + m.areas.join(' / '));
  });

  Logger.log('=== EXPANSÃO S3 / EXTENSÃO S4 (comparar com a ata) ===');
  [r.expansaoS3, r.extensaoS4].forEach(function (x) {
    if (!x) return;
    Logger.log('  Step ' + x.step + ': ' + x.numerador + '/' + x.denominador + ' = ' + x.percentual +
      '%  |  META da ata = ' + x.meta + '%  |  ' + x.definicao);
    Logger.log('     áreas que atingiram: ' + (x.areas.join(', ') || '(nenhuma)'));
  });

  return r;
}

/**
 * ===================================================
 * FAROL PILAR SAF — a fonte REAL de Expansão / Extensão / Aderência
 *
 * Planilha própria, aba "Farol Pilar SAF New". Substitui o Route Map como
 * fonte destes indicadores: o usuário corrigiu em 12/08 ("a planilha para
 * essas métricas é a [Farol] e não a Route Map como eu tinha te passado").
 *
 * ISTO ELIMINA O PALPITE QUE EU TINHA DEIXADO EM ABERTO. Antes eu calculava
 * "% de áreas com Real >= step" e avisava que 62,84% / 55,88% não fechavam com
 * nenhum denominador óbvio. Aqui os números vêm PRONTOS, em linhas de resumo no
 * fim da tabela — não há mais o que inferir.
 *
 * Layout:
 *  - Linha 1: cabeçalho macro mesclado ("Plano de Expansão WCM", nome do mês
 *    sobre cada par de colunas, e blocos "META").
 *  - Linha 2: subcabeçalho ("Área Geral", "Real", "Meta", "JAN".."DEZ").
 *  - Linha 3+: dados. A=Status (ADERENTE / NÃO ADERENTE / TROCA DE STEP) ·
 *    B=Área Geral · C=Classificação (AA/A/B/C) · D=Área.
 *  - E..AB: 12 meses, DOIS por mês — Real e Meta alternados.
 *  - AD..AO e AQ..BB: dois blocos "META" mensais (0/1 e gaps negativos). NÃO
 *    lidos aqui: o mapa do usuário descreve o comportamento como "parecem ser"
 *    e "parecem representar", ou seja, a semântica não está confirmada. Ler e
 *    exibir número de significado incerto é pior que não exibir.
 *  - Linhas de resumo no fim: coluna C traz o rótulo ("Aderência ano",
 *    "Expansão ano YTD", "Extensão ano YTD") e a coluna D o percentual.
 *
 * As linhas de resumo são localizadas POR RÓTULO na coluna C, nunca pelo número
 * 205/206/207 do mapa: basta alguém inserir uma área pra tudo deslizar.
 * ===================================================
 */
var FAROL_SAF_SPREADSHEET_ID_ = '1BIWMpahnoEz9Awe5rCDqAbotp0N68ZrCyN6jiP5-pH4';
var FAROL_SAF_ABA_ = 'Farol Pilar SAF New';
var FAROL_SAF_CACHE_CHAVE_ = 'farolPilarSaf_v1';

// Rótulos das linhas de resumo, normalizados. Casados por INÍCIO do texto, pra
// tolerar sufixo ("Expansão ano YTD 2026"). "expansao" e "extensao" diferem na
// 3ª letra, então não há risco de um casar dentro do outro.
/**
 * Quantas áreas a coluna D deve ter. **202**, medido na planilha viva por
 * debugFarolSaf em 2026-08-12: 1ª área na linha 3, última na linha 204, e as
 * linhas 205-207 são o resumo (3..204 = 202 linhas).
 *
 * O usuário havia dito "205 áreas" — era o número da LINHA onde começa o
 * resumo, não a contagem. A própria planilha confirma 202: é o valor que a
 * linha "Expansão ano YTD" usa como Meta mensal (colunas J, L, N... = 202),
 * ou seja, "todas as áreas".
 *
 * NÃO é usado em cálculo nenhum — é só um CANÁRIO. Se a contagem sair diferente,
 * `diagnostico.avisos` avisa, porque nesse caso ou a planilha cresceu (aí é só
 * atualizar esta constante) ou o parser passou a contar/perder linha, que é o
 * tipo de erro que envenena todo indicador em silêncio.
 */
var FAROL_SAF_AREAS_ESPERADAS_ = 202;

var FAROL_SAF_RESUMOS_ = {
  aderenciaAno: 'aderencia ano',
  expansaoYtd: 'expansao ano',
  extensaoYtd: 'extensao ano'
};

/**
 * Percentual tolerante a formato. A célula pode chegar como:
 *  - number 0.306  (célula formatada como porcentagem no Sheets)
 *  - number 30.6   (número puro)
 *  - texto "30,60%" ou "30.60%"
 * Devolve sempre 0..100, ou null.
 *
 * A fronteira: <= 1 é tratado como fração. Isso torna 100% e 1% ambíguos —
 * 1 vira 100. É o trade-off certo aqui porque a célula do Sheets formatada
 * como porcentagem SEMPRE chega em fração, e aderência de exatamente 1% num
 * indicador anual é muito menos provável que 100%.
 */
/** Índice 0-based -> letra de coluna ('A', 'AB', ...). Só pro diagnóstico. */
function farolSafLetraColuna_(indice) {
  var n = indice + 1, letra = '';
  while (n > 0) {
    var resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

function farolSafParsePercentual_(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  var numero;
  if (typeof valor === 'number') {
    numero = valor;
  } else {
    var t = String(valor).replace('%', '').replace(/\s/g, '').replace(',', '.');
    numero = Number(t);
  }
  if (isNaN(numero)) return null;

  if (numero > 0 && numero <= 1) numero = numero * 100;
  return Math.round(numero * 100) / 100;
}

/**
 * Farol Pilar SAF. NUNCA LANÇA: devolve { erro }.
 *
 * Formato: { erro, aderenciaAno, expansaoYtd, extensaoYtd,
 *   porStatus[], porClassificacao[], porAreaGeral[], totalAreas,
 *   mesesReal[], diagnostico{} }
 */
function getFarolSaf(forcar) {
  var vazio = {
    erro: null, aderenciaAno: null, expansaoYtd: null, extensaoYtd: null,
    porStatus: [], porClassificacao: [], porAreaGeral: [], totalAreas: 0,
    mesesReal: [],
    diagnostico: { linhasLidas: 0, colunasLidas: 0, linhasResumo: {}, paresMesEncontrados: 0, avisos: [] }
  };

  try {
    if (!forcar) {
      var cacheado = cacheLerGrande_(FAROL_SAF_CACHE_CHAVE_);
      if (cacheado) return cacheado;
    }

    var planilha = SpreadsheetApp.openById(FAROL_SAF_SPREADSHEET_ID_);
    var aba = localizarAbaTolerante_(planilha, FAROL_SAF_ABA_);
    if (!aba) throw new Error('Aba "' + FAROL_SAF_ABA_ + '" não encontrada na planilha do Farol.');

    var ultimaLinha = aba.getLastRow();
    var ultimaColuna = aba.getLastColumn();
    if (ultimaLinha < 3) throw new Error('Aba "' + FAROL_SAF_ABA_ + '" sem linhas de dados.');

    var valores = aba.getRange(1, 1, ultimaLinha, ultimaColuna).getValues();
    var linha1 = valores[0] || [];
    var linha2 = valores[1] || [];

    // --- eixo de meses: par (Real, Meta) sob o nome do mês na linha 1 ---
    // Fill-forward do mês porque o nome é mesclado sobre as 2 colunas do par.
    // Só conta a coluna cujo subcabeçalho é Real/Meta — isso EXCLUI sozinho os
    // blocos "META" (AD..BB), onde a linha 2 traz JAN..DEZ mas a linha 1 não é
    // nome de mês.
    var mesAtual = -1;
    var pares = {}; // { mesIndice: {real: col, meta: col} }
    for (var c = 0; c < linha1.length; c++) {
      var m = routeMapIndiceMes_(linha1[c]);
      if (m >= 0) mesAtual = m;

      var papel = normalizarChaveTexto_(linha2[c]);
      if (mesAtual < 0) continue;
      if (papel !== 'real' && papel !== 'meta') continue;

      if (!pares[mesAtual]) pares[mesAtual] = { real: -1, meta: -1 };
      if (pares[mesAtual][papel] < 0) pares[mesAtual][papel] = c;
    }

    // --- varredura das linhas ---
    var status = {}, classificacoes = {}, areasGerais = {};
    var totalAreas = 0;
    var resumos = {};
    var linhasResumo = {};
    var mesesReal = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    // Auditoria da contagem da coluna D. O usuário informou que hoje são
    // EXATAMENTE 205 áreas; se `totalAreas` sair diferente, estes contadores
    // dizem por onde o desvio entrou, sem precisar abrir a planilha.
    var varridas = 0, ignoradasResumo = 0, ignoradasSemArea = 0;
    var suspeitasDNumerico = [];
    var primeiraArea = null, ultimaArea = null;

    for (var l = 2; l < valores.length; l++) {
      var linha = valores[l];
      var rotuloC = normalizarChaveTexto_(linha[2]);

      // Linha de resumo? (rótulo em C, percentual em D)
      var ehResumo = false;
      Object.keys(FAROL_SAF_RESUMOS_).forEach(function (chave) {
        if (resumos[chave] !== undefined) return;
        if (rotuloC.indexOf(FAROL_SAF_RESUMOS_[chave]) === 0) {
          resumos[chave] = farolSafParsePercentual_(linha[3]);

          // A linha inteira (só as células preenchidas, com a letra da coluna)
          // viaja no diagnóstico. É o que permite descobrir o NUMERADOR e o
          // DENOMINADOR de cada percentual sem abrir a planilha — que é o que
          // falta pra confirmar se as metas 62,84% / 55,88% da ata estão na
          // mesma base destes YTD.
          var celulas = [];
          for (var cc = 4; cc < linha.length; cc++) {
            var v = linha[cc];
            if (v === '' || v === null || v === undefined) continue;
            celulas.push(farolSafLetraColuna_(cc) + '=' + v);
          }

          linhasResumo[chave] = {
            linha: l + 1,
            rotulo: String(linha[2] || '').trim(),
            bruto: linha[3],
            celulas: celulas
          };
          ehResumo = true;
        }
      });
      varridas++;
      if (ehResumo) { ignoradasResumo++; continue; }

      var area = String(linha[3] == null ? '' : linha[3]).replace(/\s+/g, ' ').trim();
      if (!area) { ignoradasSemArea++; continue; } // linha em branco ou separador

      // Nome de área é TEXTO. D numérico numa linha contada quase sempre é uma
      // linha de resumo cujo rótulo em C não casou com FAROL_SAF_RESUMOS_ —
      // e aí o percentual dela estaria entrando no total como se fosse área.
      if (typeof linha[3] === 'number') {
        suspeitasDNumerico.push({ linha: l + 1, c: String(linha[2] || '').trim(), d: linha[3] });
      }

      if (primeiraArea === null) primeiraArea = { linha: l + 1, area: area };
      ultimaArea = { linha: l + 1, area: area };
      totalAreas++;

      var st = String(linha[0] == null ? '' : linha[0]).replace(/\s+/g, ' ').trim() || 'Sem status';
      status[st] = (status[st] || 0) + 1;

      var cl = String(linha[2] == null ? '' : linha[2]).replace(/\s+/g, ' ').trim() || 'Sem classificação';
      classificacoes[cl] = (classificacoes[cl] || 0) + 1;

      var ag = String(linha[1] == null ? '' : linha[1]).replace(/\s+/g, ' ').trim() || 'Sem área geral';
      areasGerais[ag] = (areasGerais[ag] || 0) + 1;

      // Cobertura de Real por mês — serve pra saber até onde a planta lançou.
      Object.keys(pares).forEach(function (mi) {
        var col = pares[mi].real;
        if (col < 0) return;
        var v = linha[col];
        if (v !== '' && v !== null && v !== undefined && !isNaN(Number(v))) mesesReal[Number(mi)]++;
      });
    }

    var avisos = [];
    Object.keys(FAROL_SAF_RESUMOS_).forEach(function (chave) {
      if (resumos[chave] === undefined || resumos[chave] === null) {
        avisos.push('linha de resumo "' + FAROL_SAF_RESUMOS_[chave] + '" não encontrada ou sem percentual em D');
      }
    });

    if (suspeitasDNumerico.length) {
      avisos.push(suspeitasDNumerico.length + ' linha(s) contadas como área têm coluna D NUMÉRICA — ' +
        'provável linha de resumo com rótulo fora de FAROL_SAF_RESUMOS_ (ver diagnostico.suspeitasDNumerico)');
    }

    if (totalAreas !== FAROL_SAF_AREAS_ESPERADAS_) {
      avisos.push('contagem da coluna D = ' + totalAreas + ', esperado ' + FAROL_SAF_AREAS_ESPERADAS_ +
        ' (valor informado pelo usuário em 12/08). Diferença de ' + (totalAreas - FAROL_SAF_AREAS_ESPERADAS_) +
        '. Se a planilha cresceu de verdade, atualizar FAROL_SAF_AREAS_ESPERADAS_.');
    }

    var resultado = {
      erro: null,
      aderenciaAno: resumos.aderenciaAno === undefined ? null : resumos.aderenciaAno,
      expansaoYtd: resumos.expansaoYtd === undefined ? null : resumos.expansaoYtd,
      extensaoYtd: resumos.extensaoYtd === undefined ? null : resumos.extensaoYtd,
      porStatus: safOrdenarContagem_(status),
      porClassificacao: safOrdenarContagem_(classificacoes),
      porAreaGeral: safOrdenarContagem_(areasGerais),
      totalAreas: totalAreas,
      mesesReal: mesesReal,
      diagnostico: {
        linhasLidas: ultimaLinha,
        colunasLidas: ultimaColuna,
        linhasResumo: linhasResumo,
        paresMesEncontrados: Object.keys(pares).length,
        avisos: avisos,
        contagemColunaD: {
          contadas: totalAreas,
          esperadas: FAROL_SAF_AREAS_ESPERADAS_,
          linhasVarridas: varridas,
          ignoradasResumo: ignoradasResumo,
          ignoradasSemArea: ignoradasSemArea,
          primeira: primeiraArea,
          ultima: ultimaArea
        },
        suspeitasDNumerico: suspeitasDNumerico
      }
    };

    try {
      cacheGravarGrande_(FAROL_SAF_CACHE_CHAVE_, resultado, CACHE_SEGUNDOS_6H_);
    } catch (eCache) {
      resultado.diagnostico.avisos.push('cache não gravado: ' + eCache.message);
    }

    return resultado;

  } catch (e) {
    vazio.erro = e.message;
    return vazio;
  }
}

/**
 * DIAGNÓSTICO do Farol. Rodar no editor antes de confiar nos números.
 *
 * O que olhar:
 *  1. `paresMesEncontrados` = 12. Menos que isso e o eixo Real/Meta não foi
 *     reconhecido — provavelmente o nome do mês da linha 1 mudou de formato.
 *  2. `linhasResumo` — precisa achar as TRÊS. O log mostra a linha em que cada
 *     uma caiu e o valor CRU da coluna D, pra conferir se o percentual foi
 *     interpretado certo (fração x número x texto).
 *  3. Expansão / Extensão contra as metas da ata (62,84% / 55,88%).
 */
function debugFarolSaf() {
  var r = getFarolSaf(true);

  if (r.erro) {
    Logger.log('ERRO: ' + r.erro);
    Logger.log('Se for permissão, confirme que a CONTA QUE PUBLICOU o deployment enxerga ' +
      FAROL_SAF_SPREADSHEET_ID_);
    return r;
  }

  Logger.log('=== ESTRUTURA ===');
  Logger.log('  linhas=' + r.diagnostico.linhasLidas + ' colunas=' + r.diagnostico.colunasLidas +
    ' paresMes=' + r.diagnostico.paresMesEncontrados + ' (esperado 12)');

  var cd = r.diagnostico.contagemColunaD || {};
  Logger.log('=== CONTAGEM DA COLUNA D (Área) ===');
  Logger.log('  CONTADAS = ' + cd.contadas + '   (esperado ' + cd.esperadas + ') ' +
    (cd.contadas === cd.esperadas ? '<-- BATE' : '<-- NAO BATE, ver abaixo'));
  Logger.log('  linhas varridas (da 3 em diante) = ' + cd.linhasVarridas);
  Logger.log('    - ignoradas por serem linha de resumo : ' + cd.ignoradasResumo);
  Logger.log('    - ignoradas por D vazia (branco/separador) : ' + cd.ignoradasSemArea);
  if (cd.primeira) Logger.log('  1ª área: linha ' + cd.primeira.linha + ' — "' + cd.primeira.area + '"');
  if (cd.ultima) Logger.log('  última área: linha ' + cd.ultima.linha + ' — "' + cd.ultima.area + '"');
  (r.diagnostico.suspeitasDNumerico || []).forEach(function (s) {
    Logger.log('  !! linha ' + s.linha + ' contada como área mas D é NÚMERO (' + s.d + '), C="' + s.c + '"');
  });
  if (r.diagnostico.avisos.length) {
    r.diagnostico.avisos.forEach(function (a) { Logger.log('  !! AVISO: ' + a); });
  }

  Logger.log('=== LINHAS DE RESUMO (achadas pelo rótulo na coluna C) ===');
  Object.keys(r.diagnostico.linhasResumo).forEach(function (k) {
    var d = r.diagnostico.linhasResumo[k];
    Logger.log('  ' + k + ': linha ' + d.linha + ' · rótulo "' + d.rotulo + '" · D bruto = ' + d.bruto);
    Logger.log('     células E+ : ' + ((d.celulas || []).join('  ') || '(nenhuma)'));
  });
  Logger.log('  ^ é daqui que sai o numerador/denominador de cada %. Confronto pendente:');
  Logger.log('    56/183 = 30,60% (Expansão YTD) e 115/183 = 62,84% (meta da ata) — mesma base?');
  Logger.log('    18/56  = 32,14% (Extensão YTD) — a Extensão é funil sobre a Expansão?');

  Logger.log('=== OS NÚMEROS (comparar com a ata) ===');
  Logger.log('  Aderência ano : ' + r.aderenciaAno + '%');
  Logger.log('  Expansão YTD  : ' + r.expansaoYtd + '%   |  META da ata = ' + META_EXPANSAO_S3_ + '%');
  Logger.log('  Extensão YTD  : ' + r.extensaoYtd + '%   |  META da ata = ' + META_EXTENSAO_S4_ + '%');

  Logger.log('=== STATUS (coluna A) ===');
  r.porStatus.forEach(function (x) { Logger.log('  "' + x.nome + '" -> ' + x.total); });

  Logger.log('=== CLASSIFICAÇÃO (coluna C) ===');
  r.porClassificacao.forEach(function (x) { Logger.log('  "' + x.nome + '" -> ' + x.total); });

  Logger.log('=== ÁREA GERAL (coluna B) ===');
  r.porAreaGeral.forEach(function (x) { Logger.log('  "' + x.nome + '" -> ' + x.total); });

  Logger.log('=== COBERTURA DE "REAL" POR MÊS ===');
  Logger.log('  jan..dez: ' + r.mesesReal.join(' | '));

  return r;
}
