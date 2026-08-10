if (typeof google === 'undefined') {
      window.google = {
        script: {
          run: (function () {
            // NÃO declarar onSuccess/onFailure aqui. Até 2026-07-27 eram duas variáveis
            // únicas compartilhadas por TODAS as chamadas, e withSuccessHandler
            // sobrescrevia a anterior. Com duas chamadas em voo — obterDadosIniciais
            // (500ms) do DOMContentLoaded e getBootstrapDados (400ms) — a última a
            // registrar vencia, e aos 500ms o payload { nome: 'Leopoldo' } caía no
            // handler do bootstrap: dados.home vinha undefined e onResumoHomeCarregado
            // estourava. Agora cada cadeia carrega o seu par de handlers (ver chain),
            // que é como o google.script.run real se comporta — o defeito era só do mock.
            // Mock de Departamento (coluna I) — filtro da Cruz/Totais/Feed/Pareto, os 13
            // valores reais confirmados via debugAreasCompiladoAno.
            var mockDepartamentos = ['Engenharia Industrial', 'Esmaltação', 'Fabricação - Caixa de Engrenagem', 'Fabricação - Perfiladoras', 'Fabricação - Plástico', 'Fabricação - Prensas', 'Fabricação Cocção', 'Fabricação Lavanderia', 'Logística Interna', 'Montagem Cocção', 'Montagem Lavanderia', 'Manutenção', 'Qualidade'];
            function mockSemente(texto) {
              var h = 0;
              for (var i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
              return h;
            }
            function mockRng(semente) {
              var estado = semente >>> 0;
              return function () {
                estado = (estado * 1664525 + 1013904223) >>> 0;
                return estado / 4294967296;
              };
            }
            function mockGerarDias(ano, mes, area) {
              var diasNoMes = new Date(ano, mes, 0).getDate();
              var rng = mockRng(mockSemente(ano + '-' + mes + '-' + (area || 'Todas')));
              var pesos = [['verde', 60], ['azul', 25], ['amarelo', 8], ['cinza', 3], ['laranja', 3], ['vermelho', 1]];
              var dias = {};
              for (var dia = 1; dia <= diasNoMes; dia++) {
                var r = rng() * 100;
                var acumulado = 0;
                for (var i = 0; i < pesos.length; i++) {
                  acumulado += pesos[i][1];
                  if (r <= acumulado) {
                    if (pesos[i][0] !== 'verde') dias[dia] = pesos[i][0];
                    break;
                  }
                }
              }
              return dias;
            }
            function mockGerarTotais(ano, mes, area) {
              var rng = mockRng(mockSemente('totais-' + ano + '-' + mes + '-' + (area || 'Todas')));
              var azulA = Math.floor(rng() * 6);
              var azulB = Math.floor(rng() * 4);
              var azulC = Math.floor(rng() * 30);
              var azul = azulA + azulB + azulC;
              var amarelo = Math.floor(rng() * 4);
              var laranja = Math.floor(rng() * 100 < 15) ? 1 : 0;
              var vermelho = Math.floor(rng() * 100 < 5) ? 1 : 0;
              var cinza = Math.floor(rng() * 100 < 8) ? 1 : 0;
              var verde = Math.floor(rng() * 12);
              return {
                vermelho: vermelho, laranja: laranja, amarelo: amarelo,
                azul: azul, azulA: azulA, azulB: azulB, azulC: azulC,
                cinza: cinza, verde: verde,
                total: vermelho + laranja + amarelo + azul + cinza
              };
            }
            function mockGerarTagSaf(ano, mes, area) {
              var rng = mockRng(mockSemente('tagsaf-' + ano + '-' + mes + '-' + (area || 'Todas')));
              return {
                condicaoInsegura: Math.floor(rng() * 90),
                comportamentoInseguro: Math.floor(rng() * 70)
              };
            }
            var mockDescricoes = [
              'Colaborador identificou vazamento de óleo próximo ao equipamento.',
              'Escorregão em piso molhado próximo à linha de montagem.',
              'Ferramenta manual apresentou desgaste e foi retirada de uso preventivamente.',
              'Bag de matéria-prima tombou durante manuseio no galpão.',
              'Colaborador relatou desconforto ao manusear peça sem uso de luva.',
              'Corte superficial na mão durante operação de parafusamento manual.',
              'Guarda-corpo apresentou sinal de folga e foi sinalizado pra manutenção.'
            ];
            function mockGerarOcorrencias(ano, mes, departamento, dias) {
              var rng = mockRng(mockSemente('desc-' + ano + '-' + mes + '-' + (departamento || 'Todas')));
              var lista = [];
              Object.keys(dias).forEach(function (dia) {
                lista.push({
                  dia: Number(dia),
                  tipoEvento: dias[dia],
                  cor: dias[dia],
                  departamento: departamento === 'Todas' ? mockDepartamentos[Math.floor(rng() * mockDepartamentos.length)] : departamento,
                  descricao: mockDescricoes[Math.floor(rng() * mockDescricoes.length)]
                });
              });
              lista.sort(function (a, b) { return b.dia - a.dia; });
              return lista;
            }
            function mockGerarPacoteAno(ano) {
              var porDepartamentoMes = {};
              var totaisPorDepartamentoMes = {};
              var ocorrenciasPorDepartamentoMes = {};
              var totaisTagSaf = {};
              ['Todas'].concat(mockDepartamentos).forEach(function (departamento) {
                porDepartamentoMes[departamento] = {};
                totaisPorDepartamentoMes[departamento] = {};
                ocorrenciasPorDepartamentoMes[departamento] = {};
                totaisTagSaf[departamento] = {};
                for (var mes = 1; mes <= 12; mes++) {
                  var dias = mockGerarDias(ano, mes, departamento);
                  porDepartamentoMes[departamento][mes] = dias;
                  totaisPorDepartamentoMes[departamento][mes] = mockGerarTotais(ano, mes, departamento);
                  ocorrenciasPorDepartamentoMes[departamento][mes] = mockGerarOcorrencias(ano, mes, departamento, dias);
                  totaisTagSaf[departamento][mes] = mockGerarTagSaf(ano, mes, departamento);
                }
              });
              return {
                departamentos: mockDepartamentos,
                porDepartamentoMes: porDepartamentoMes,
                totaisPorDepartamentoMes: totaisPorDepartamentoMes,
                ocorrenciasPorDepartamentoMes: ocorrenciasPorDepartamentoMes,
                totaisTagSaf: totaisTagSaf,
                tagSafety: mockGerarTagSafety(ano)
              };
            }

            /* Mock do TAG SAFETY.
               O volume mensal e os TOTAIS por área são REAIS, contados no export
               "TAG DIGITAL (respostas) - Novo - TAG SAFETY.pdf" (9.621 respostas,
               nov/2025 a jul/2026).
               Já a distribuição de cada área AO LONGO dos meses é sintética: o
               PDF não permite associar linha a linha área × mês de forma
               confiável, então cada total é espalhado na mesma proporção do
               volume mensal. Serve pra conferir layout e ordenação, NÃO pra
               conferir número de célula — esses só na planilha viva.
               2025 só tem nov-dez, que é quando o formulário entrou no ar, e isso
               exercita de propósito o caso "ano com a maioria dos meses zerada". */
            function mockGerarTagSafety(ano) {
              var base = {
                2026: {
                  porMes: [1134, 1603, 1662, 1344, 1197, 632, 684, 0, 0, 0, 0, 0],
                  total: 8256
                },
                2025: {
                  porMes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 516, 849],
                  total: 1365
                }
              }[ano];

              if (!base) {
                return { porMes: [0,0,0,0,0,0,0,0,0,0,0,0], porAreaMes: {}, total: 0, erro: null };
              }

              // Totais por área medidos no export (soma dos dois anos), rateados
              // aqui na proporção do ano pedido.
              var totaisArea = {
                'Fabricação Lavanderia': 3687,
                'Fabricação Cocção': 1250,
                'Montagem Lavanderia': 1203,
                'Montagem Cocção': 759,
                'Manutenção': 643,
                'Outro': 99,
                'Esmaltação': 15,
                'Qualidade': 13
              };

              var somaGeral = 9621;
              var porAreaMes = {};
              Object.keys(totaisArea).forEach(function (area) {
                var totalNoAno = Math.round(totaisArea[area] * (base.total / somaGeral));
                porAreaMes[area] = base.porMes.map(function (v) {
                  return base.total > 0 ? Math.round(totalNoAno * (v / base.total)) : 0;
                });
              });

              return { porMes: base.porMes, porAreaMes: porAreaMes, total: base.total, erro: null };
            }
            /* Mock da HOME. Os números NÃO são aleatórios: são os valores REAIS
               de 2026 lidos das planilhas vivas em 26/07 (debugFontesHome), pra
               a tela local bater com o que a liderança vê. Jul-Dez ficam sem HHT
               porque é assim que a planilha está — julho ainda não foi lançado —
               e isso exercita o caminho "mês sem denominador" (taxa null, não
               zero). Julho tem ocorrência sem HHT de propósito, que é o caso
               chato: contagem existe, taxa não pode existir.
               Atenção: `rotina` vem preenchida aqui só pra dar pra ver o bloco
               montado; no servidor ela volta nula (fonte ainda não existe). */
            function mockGerarResumoHome(ano) {
              var hhtPorMes = [577485, 541316, 601663, 582331, 565948, 527409, 0, 0, 0, 0, 0, 0];
              var faiPorMes = [6, 4, 7, 5, 3, 1, 3, 0, 0, 0, 0, 0];
              var semAfastamento = [0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0];
              var comAfastamento = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
              var quasePorMes = [42, 40, 50, 65, 76, 48, 54, 0, 0, 0, 0, 0];

              var meses = [];
              var acFai = 0, acRec = 0, acQuase = 0, acHht = 0, mesesComHht = 0;

              for (var i = 0; i < 12; i++) {
                var horas = hhtPorMes[i];
                var fai = faiPorMes[i];
                var rec = semAfastamento[i] + comAfastamento[i];

                if (horas > 0) {
                  acFai += fai; acRec += rec; acQuase += quasePorMes[i]; acHht += horas; mesesComHht++;
                }

                meses.push({
                  mes: i + 1,
                  fai: fai,
                  rec: rec,
                  comAfastamento: comAfastamento[i],
                  quase: quasePorMes[i],
                  hht: horas,
                  taxaFai: horas > 0 ? (fai * 200000) / horas : null,
                  taxaRec: horas > 0 ? (rec * 200000) / horas : null
                });
              }

              function serieConstante(v) {
                var s = [];
                for (var k = 0; k < 12; k++) s.push(v);
                return s;
              }

              return {
                ano: ano,
                anos: [2026, 2025],
                mesReferencia: ano === new Date().getFullYear() ? (new Date().getMonth() + 1) : 12,
                meses: meses,
                ytd: {
                  fai: acFai, rec: acRec, quase: acQuase, hht: acHht,
                  mesesComHht: mesesComHht,
                  taxaFai: acHht > 0 ? (acFai * 200000) / acHht : null,
                  taxaRec: acHht > 0 ? (acRec * 200000) / acHht : null
                },
                metas: {
                  taxaFai: 1.571,
                  taxaRec: 0.095,
                  serieFai: serieConstante(1.571),
                  serieRec: serieConstante(0.095)
                },
                oficial: {
                  firstAid: [2.079, 1.478, 2.340, 1.717, 1.061, 0.503, 0.390, null, null, null, null, null],
                  trr: [0, 0, 0.334, 0, 0.354, 0, 0, null, null, null, null, null],
                  // YTD do SCORECARD segue nulo de propósito: nunca foi confirmado
                  // que a coluna está preenchida, e inventar um valor aqui daria a
                  // impressão de que a tela já mostra o oficial. Desde 29/07 os
                  // tiles não dependem mais dele — leem `acumulado` (Base HHT).
                  faiYtd: null,
                  trrYtd: null,
                  comAfastamento: serieConstante(0),
                  nearMiss: [42, 40, 50, 65, 76, 48, 54, null, null, null, null, null],
                  atosCondicoes: [1009, 3277, 2608, 930, 4039, 658, 2000, null, null, null, null, null],
                  scoreSeguranca: [0.67, 1, 0.33, 0.67, 0.67, 1, 1, 0, 0, 0, 0, 0]
                },
                // Acumulado YTD da aba "2026 Acumulado" da Base HHT. Números REAIS,
                // lidos da planilha viva em 29/07 (linha RIO CLARO) — mesmo critério
                // do resto deste mock, que usa medição e não estimativa.
                // `rec` é derivado: a aba traz a CONTAGEM de registráveis (3), não a
                // taxa. 3 x 200.000 / 3.392.704,301 = 0,1769.
                acumulado: {
                  fai: 1.710,
                  rec: (3 * 200000) / 3392704.301,
                  primeirosSocorros: 29,
                  recordaveis: 3,
                  quase: 290,
                  horas: 3392704.301,
                  threshold: 1.571,
                  faiRecalculado: (29 * 200000) / 3392704.301,
                  aba: '2026 Acumulado',
                  erro: null
                },
                rotina: {
                  fonte: 'mock',
                  majorActions: { valor: '68%', detalhe: '17 de 25 fechadas', status: 'atencao' },
                  bradley: { valor: 'Independente', detalhe: 'Alvo: Interdependente', status: 'atencao' },
                  expansaoS3: { valor: '82%', detalhe: '9 de 11 áreas', status: 'bom' },
                  extensaoS4: { valor: '35%', detalhe: '4 de 11 áreas', status: 'critico' }
                },
                /* Números REAIS contados no export "Planilha sem título -
                   Respostas ao formulário 5.pdf" (2.983 respostas, 15 a 27/07).
                   Atenção: as vertentes somam 1.353, não 2.983 — o restante ficou
                   sem vertente identificável na extração do PDF. Está assim de
                   propósito, pra a tela local mostrar a mesma folga que a
                   produção provavelmente vai mostrar; se na planilha viva a
                   coluna estiver preenchida em todas as linhas, os números do
                   servidor fecham e este mock é que fica desatualizado. */
                tags: {
                  fonte: 'mock',
                  total: 2983,
                  periodo: '15/07–27/07',
                  vertentes: [
                    { rotulo: 'Ver e Agir', total: 821 },
                    { rotulo: 'Safety', total: 262 },
                    { rotulo: 'Professional Maintenance', total: 121 },
                    { rotulo: 'Autonomous Maintenance', total: 108 },
                    { rotulo: 'Environment', total: 21 },
                    { rotulo: 'Workplace Organization', total: 20 }
                  ],
                  lider: { rotulo: 'Ver e Agir', total: 821 }
                },
                diagnostico: {
                  hhtErro: null,
                  hhtOrigemColunaHoras: 'mock',
                  hhtLinhasLidas: 454,
                  scorecardErro: null,
                  scorecardAba: 'Semanal/Mensal RC ' + ano
                }
              };
            }
            // Mock do painel RISK — valores aproximados do relatório real de
            // Riscos Altos (46 Andamento / 29 Concluído / 3 Atrasado).
            function mockGerarRiscos() {
              var areas = ['Logistica', 'Fabricação Metal', 'Montagem Lavanderia', 'Utilidades', 'Fabricação Cocção', 'Almoxarifado'];
              var temas = ['Máquinas e Equip. NR12', 'Movimentação NR11', 'Interface Homem x Máquina (Estruturas)', 'Infraestrutura', 'Queda Mesmo Nível', 'NR10'];
              var statusPesos = [['Andamento', 46], ['Concluído', 29], ['Atrasado', 3]];
              var rng = mockRng(mockSemente('riscos'));

              var riscos = [];
              statusPesos.forEach(function (par) {
                for (var i = 0; i < par[1]; i++) {
                  riscos.push({
                    ranking: String(1 + Math.floor(rng() * 5)),
                    area: areas[Math.floor(rng() * areas.length)],
                    macroTema: temas[Math.floor(rng() * temas.length)],
                    risco: 'Risco mapeado durante inspeção de campo na área.',
                    planoAcao: 'Plano de ação definido com o time técnico responsável.',
                    quantidade: 1 + Math.floor(rng() * 8),
                    orcamento: Math.floor(rng() * 400000),
                    validado: rng() > 0.5 ? 'SIM' : 'NÃO',
                    status: par[0],
                    dataInicio: '01/07/2026',
                    dataFechamento: par[0] === 'Concluído' ? '15/07/2026' : ''
                  });
                }
              });

              // Espelha o servidor: as agregações somam QUANTIDADE (itens), não
              // linhas. Só porStatusLinhas conta linha.
              var porStatus = {}, porArea = {}, porMacroTema = {}, porValidado = {};
              var porStatusLinhas = {};
              var orcamentoTotal = 0, quantidadeTotal = 0, linhasSemQuantidade = 0;
              riscos.forEach(function (r) {
                var q = Number(r.quantidade) || 0;
                porStatus[r.status] = (porStatus[r.status] || 0) + q;
                porArea[r.area] = (porArea[r.area] || 0) + q;
                porMacroTema[r.macroTema] = (porMacroTema[r.macroTema] || 0) + q;
                porValidado[r.validado] = (porValidado[r.validado] || 0) + q;
                porStatusLinhas[r.status] = (porStatusLinhas[r.status] || 0) + 1;
                orcamentoTotal += r.orcamento;
                quantidadeTotal += q;
                if (q <= 0) linhasSemQuantidade++;
              });

              var serieSemanal = [];
              var realizado = 0;
              for (var s = 1; s <= 28; s++) {
                realizado += Math.floor(rng() * 14);
                serieSemanal.push({ semana: 'Semana ' + s, meta: s * 9, realizado: realizado });
              }

              return {
                riscos: riscos, porStatus: porStatus, porStatusLinhas: porStatusLinhas,
                porArea: porArea, porMacroTema: porMacroTema, porValidado: porValidado,
                serieSemanal: serieSemanal, orcamentoTotal: orcamentoTotal,
                quantidadeTotal: quantidadeTotal, linhasSemQuantidade: linhasSemQuantidade,
                totalLinhas: riscos.length, totalRiscos: riscos.length
              };
            }
            // Boneco / Partes do Corpo. Reproduz o formato de
            // getPartesDoCorpoAnoCompleto: { ano, anosDisponiveis, areas,
            // porAreaMes: { area: { mes: { comAfastamento:{regiao:n},
            // semAfastamento:{}, primeirosSocorros:{}, registros:{cat:{regiao:[]}} } } } }
            // com o bucket 'Todas' agregando todas as áreas, igual ao servidor.
            //
            // Os pesos por região saem do padrão real de lesão industrial (mão e
            // dedos na frente, depois olho/cabeça, pé e coluna) — dado sintético
            // que serve pra conferir layout e ordenação do ranking, NÃO pra
            // conferir número.
            function mockGerarPartesDoCorpo(ano) {
              var anoAlvo = Number(ano) || 2026;
              var pesos = {
                mao: 26, punho: 7, antebraco: 6, cotovelo: 4, braco: 6, ombro: 8,
                cabeca: 11, pescoco: 3, torax: 4, abdomen: 2, costas: 9, quadril: 3,
                coxa: 4, joelho: 7, perna: 5, tornozelo: 6, pe: 12, outro: 5
              };
              var regioes = Object.keys(pesos);
              var areas = ['Fabrica 1', 'Fabrica 2', 'Logistica', 'Manutencao'];
              var categorias = ['comAfastamento', 'semAfastamento', 'primeirosSocorros'];
              // Volume relativo por categoria: primeiros socorros é ordem de
              // grandeza maior que acidente com afastamento, como na planta real.
              var volume = { comAfastamento: 0.05, semAfastamento: 0.12, primeirosSocorros: 1 };

              var rng = (function (semente) {
                return function () { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
              })(anoAlvo * 7919);

              var porAreaMes = {};
              function balde(area, mes) {
                if (!porAreaMes[area]) porAreaMes[area] = {};
                if (!porAreaMes[area][mes]) {
                  porAreaMes[area][mes] = {
                    comAfastamento: {}, semAfastamento: {}, primeirosSocorros: {},
                    registros: { comAfastamento: {}, semAfastamento: {}, primeirosSocorros: {} }
                  };
                }
                return porAreaMes[area][mes];
              }

              var diagnosticos = ['Corte', 'Contusão', 'Entorse', 'Queimadura', 'Fratura', 'Corpo estranho'];
              var mesLimite = anoAlvo >= 2026 ? 7 : 12; // 2026 ainda em curso, mesmo corte do resto do mock

              for (var mes = 1; mes <= mesLimite; mes++) {
                areas.forEach(function (area) {
                  regioes.forEach(function (regiao) {
                    categorias.forEach(function (cat) {
                      var esperado = (pesos[regiao] / 100) * volume[cat] * 9;
                      var n = Math.floor(esperado + rng() * 1.4);
                      if (n <= 0) return;
                      [balde(area, mes), balde('Todas', mes)].forEach(function (b, i) {
                        b[cat][regiao] = (b[cat][regiao] || 0) + n;
                        if (!b.registros[cat][regiao]) b.registros[cat][regiao] = [];
                        for (var k = 0; k < n; k++) {
                          if (b.registros[cat][regiao].length >= 60) break; // mesmo teto do servidor
                          b.registros[cat][regiao].push({
                            diagnostico: diagnosticos[Math.floor(rng() * diagnosticos.length)],
                            data: String(1 + Math.floor(rng() * 28)).padStart(2, '0') + '/' +
                                  String(mes).padStart(2, '0') + '/' + anoAlvo,
                            area: area,
                            // parênteses obrigatórios: '+' liga mais forte que '||',
                            // e 'costas'/'outro' não existem em CORPO_REGIAO_ROTULO_
                            descricao: 'Registro sintético para desenvolvimento local — ' +
                                       (CORPO_REGIAO_ROTULO_[regiao] || regiao)
                          });
                        }
                      });
                    });
                  });
                });
              }

              return {
                ano: anoAlvo,
                anosDisponiveis: [2025, 2026],
                areas: areas,
                porAreaMes: porAreaMes
              };
            }

            // Os métodos leem os handlers de `this` — chain() faz o apply com o
            // contexto da cadeia que originou a chamada.
            var api = {
              obterDadosIniciais: function () {
                var ctx = this;
                setTimeout(function () { ctx.onSuccess && ctx.onSuccess({ nome: 'Leopoldo' }); }, 500);
              },
              getContextoCruzSeguranca: function () {
                var ctx = this;
                setTimeout(function () {
                  var pacote = mockGerarPacoteAno(2026);
                  ctx.onSuccess && ctx.onSuccess({
                    anos: [2026, 2025],
                    anoAtual: 2026,
                    mesAtual: 7,
                    departamentos: pacote.departamentos,
                    porDepartamentoMes: pacote.porDepartamentoMes,
                    totaisPorDepartamentoMes: pacote.totaisPorDepartamentoMes,
                    ocorrenciasPorDepartamentoMes: pacote.ocorrenciasPorDepartamentoMes,
                    totaisTagSaf: pacote.totaisTagSaf,
                    tagSafety: pacote.tagSafety
                  });
                }, 400);
              },
              getCruzAnoCompleto: function (ano) {
                var ctx = this;
                setTimeout(function () { ctx.onSuccess && ctx.onSuccess(mockGerarPacoteAno(ano)); }, 400);
              },
              getRiscosAltos: function () {
                var ctx = this;
                setTimeout(function () { ctx.onSuccess && ctx.onSuccess(mockGerarRiscos()); }, 400);
              },
              getOcorrenciasPainel: function () {
                var ctx = this;
                setTimeout(function () {
                  // NÚMEROS REAIS, conferidos contra a planilha viva em
                  // 2026-08-09. O mock antigo era inventado e escondia dois
                  // fatos que mudam o layout: "Sem gerente mapeado" é 185 de
                  // 415 (45%, a MAIOR barra do Pareto) e a base cobre 6 anos e
                  // meio, não um ano.
                  var partes = [['Mão',52],['Dedo',41],['Olho',33],['Pé',24],['Joelho',19],['Braço',17],
                                ['Costas',14],['Cabeça',11],['Ombro',9],['Tornozelo',7],['Punho',6],['Perna',5]];
                  var gerentes = [['Sem gerente mapeado',185],['BEATRIZ SILVA',48],['PAULO REGO',37],
                                  ['MARCOS ANTUNES',29],['ANA LUCIA PRADO',22],['CARLOS EDUARDO M',18],
                                  ['RENATO FIGUEIRA',14],['SILVIA CAMARGO',12],['JORGE MENDES',10],
                                  ['PATRICIA NUNES',9],['EDUARDO BASTOS',8],['LUCIA HELENA R',7],
                                  ['FABIO CORREIA',6],['MARIANA DIAS',5],['ROBERTO ALVES',5]];
                  var gravidade = [['Non-OSHA',369],['OSHA Other OSHA Case',38],['OSHA DAFW',7],
                                   ['OSHA Job Transfer or Restriction',1]];
                  var status = [['Closed',382],['Open',24],['Not Initiated',9]];
                  var areas = ['ALMOXARIFADO A','ALMOXARIFADO B','CX ENGRENAGEM - GERAL','BABEL','FOX'];
                  var sup = ['FELIPE IANO','IVAN CARVALHO','JOÃO C SOUSA','REGIS TAVANO','ANA PAULA XAVIER'];
                  var ger = ['Sem gerente mapeado','BEATRIZ SILVA','Sem gerente mapeado','PAULO REGO'];
                  var abertos = [];
                  for (var i = 0; i < 33; i++) {
                    abertos.push({
                      data: String(1 + (i % 28)).padStart(2, '0') + '/' + String(1 + (i % 7)).padStart(2, '0') + '/2026',
                      ordem: 1000000 - i,
                      supervisor: sup[i % sup.length], gerente: ger[i % ger.length],
                      area: areas[i % areas.length], gravidade: gravidade[i % gravidade.length][0],
                      status: i % 4 === 0 ? 'Not Initiated' : 'Open'
                    });
                  }
                  var par = function (a) { return a.map(function (x) { return { nome: x[0], total: x[1] }; }); };
                  ctx.onSuccess && ctx.onSuccess({
                    erro: null, total: 415,
                    porStatus: par(status), porGravidade: par(gravidade),
                    porGerente: par(gerentes), porParteCorpo: par(partes),
                    abertos: abertos, periodo: { de: '01/2020', ate: '07/2026' },
                    linhasLidas: 415, semSupervisor: 0, semGerente: 185,
                    totalAbertos: 33, abertosExibidos: 33
                  });
                }, 400);
              },
              getAtsAbertos: function () {
                var ctx = this;
                setTimeout(function () {
                  // Números REAIS medidos no slide de origem (14 abertos / 49
                  // vencidos = 63), pra o layout ser conferido contra o mesmo
                  // total que o usuário já viu.
                  // [nome, aberto, vencido, gerente, area]
                  var brutos = [
                    ['FELIPE IANO', 0, 17, 'BEATRIZ SILVA', 'LINHA 5 - REDENTOR 20'],
                    ['JEANDERSON SOUZA', 0, 7, 'BEATRIZ SILVA', 'LINHA 5 - REDENTOR 20'],
                    ['IVAN CARVALHO', 4, 0, 'MARCOS ANTUNES', 'UTILIDADES'],
                    ['LUIZ RODRIGUES', 4, 0, 'MARCOS ANTUNES', 'UTILIDADES'],
                    ['LUCAS GABAN LINARD', 0, 4, 'MARCOS ANTUNES', 'FERRAMENTARIA'],
                    ['ADALBERTO ALVES', 0, 3, 'BEATRIZ SILVA', 'LINHA 8 - COCÇÃO'],
                    ['DEIVID MICHEL DA SILVA ALVES', 0, 3, 'PAULO REGO', 'LINHA 8 - COCÇÃO'],
                    ['JOÃO C SOUSA', 0, 3, 'PAULO REGO', 'ESMALTAÇÃO'],
                    ['EZIO MARINHO', 0, 3, 'PAULO REGO', 'ESMALTAÇÃO'],
                    ['TIAGO GUIMARÃES', 1, 2, 'MARCOS ANTUNES', 'UTILIDADES'],
                    ['ANA PAULA XAVIER', 1, 1, 'BEATRIZ SILVA', 'LOGÍSTICA INTERNA'],
                    ['LILIAN MEIGA', 0, 1, '', 'LOGÍSTICA INTERNA'],
                    ['ALLAN FERNANDO CANO', 1, 1, 'PAULO REGO', 'LINHA 5 - REDENTOR 20'],
                    ['REGIS TAVANO', 1, 1, 'MARCOS ANTUNES', 'FERRAMENTARIA'],
                    ['ROBERTO PEREIRA', 0, 1, '', 'LINHA 8 - COCÇÃO'],
                    ['IGOR VALERICA', 1, 1, 'BEATRIZ SILVA', 'LOGÍSTICA INTERNA'],
                    ['WESLEY LELIS', 0, 1, 'PAULO REGO', 'ESMALTAÇÃO'],
                    ['BEATRIZ SILVA', 1, 0, 'DIRETORIA', 'ADM']
                  ];
                  var ordena = function (a, b) {
                    return (b.total - a.total) || (b.vencido - a.vencido) || a.nome.localeCompare(b.nome, 'pt-BR');
                  };
                  var acoesExemplo = [
                    'Instalar proteção fixa no ponto de prensagem da estação 3 e registrar no checklist diário.',
                    'Revisar procedimento de bloqueio e etiquetagem (LOTO) com toda a equipe do turno.',
                    'Substituir cabo de alimentação danificado do painel elétrico e testar o dispositivo residual.',
                    'Sinalizar a área de movimentação de empilhadeira com faixa amarela e espelho convexo.',
                    'Treinar operadores no uso correto do EPI para manuseio de produto químico.',
                    'Corrigir vazamento de óleo na base do equipamento e conter com bandeja de retenção.'
                  ];
                  var lista = brutos.map(function (b, i) {
                    var qtd = b[1] + b[2];
                    var registros = [];
                    for (var k = 0; k < qtd && k < 40; k++) {
                      var ehVencido = k < b[2];   // vencidas primeiro
                      registros.push({
                        descricao: acoesExemplo[(i + k) % acoesExemplo.length],
                        area: b[4],
                        status: ehVencido ? 'vencido' : 'aberto',
                        diasAtraso: ehVencido ? (8 + k * 5) : 0,
                        diasAberto: 30 + k * 4
                      });
                    }
                    return { nome: b[0], gerente: b[3] || 'Sem gerente mapeado', aberto: b[1], vencido: b[2], total: qtd, registros: registros };
                  }).sort(ordena);

                  var aberto = 0, vencido = 0, semGerente = 0;
                  var ger = {}, are = {}, atrasos = [];
                  brutos.forEach(function (b) {
                    aberto += b[1]; vencido += b[2];
                    var g = b[3] || 'Sem gerente mapeado';
                    if (!b[3]) semGerente += b[2] + b[1];
                    if (b[2] > 0) {   // Paretos contam só vencido, igual ao servidor
                      [[ger, g], [are, b[4]]].forEach(function (par) {
                        var m = par[0], k = par[1];
                        if (!m[k]) m[k] = { nome: k, aberto: 0, vencido: 0, total: 0 };
                        m[k].vencido += b[2]; m[k].total += b[2];
                      });
                      atrasos.push({ responsavel: b[0], gerente: g, area: b[4], diasAtraso: 12 + b[2] * 7, diasAberto: 40 + b[2] * 9 });
                    }
                  });
                  var mapaLista = function (m) { return Object.keys(m).map(function (k) { return m[k]; }).sort(ordena); };
                  atrasos.sort(function (a, b) { return b.diasAtraso - a.diasAtraso; });

                  ctx.onSuccess && ctx.onSuccess({
                    erro: null, total: aberto + vencido, aberto: aberto, vencido: vencido,
                    porResponsavel: lista, porGerente: mapaLista(ger), porArea: mapaLista(are),
                    topAtrasos: atrasos.slice(0, 5),
                    linhasLidas: 412, semResponsavel: 0, semGerente: semGerente, pessoasMapeadas: 96
                  });
                }, 400);
              },
              getPartesDoCorpoAnoCompleto: function (ano) {
                var ctx = this;
                setTimeout(function () { ctx.onSuccess && ctx.onSuccess(mockGerarPartesDoCorpo(ano || 2026)); }, 400);
              },
              getPartesDoCorpoMesAtual: function () {
                var ctx = this;
                setTimeout(function () {
                  // Mesmo recorte do servidor: mês corrente, bucket 'Todas'.
                  // Se o mês corrente não existir no mock (ano em curso), cai no
                  // último mês gerado — senão o card do feed nasceria vazio.
                  var pacote = mockGerarPartesDoCorpo(2026);
                  var todas = pacote.porAreaMes['Todas'] || {};
                  var mes = new Date().getMonth() + 1;
                  if (!todas[mes]) {
                    var disponiveis = Object.keys(todas).map(Number).sort(function (a, b) { return a - b; });
                    mes = disponiveis[disponiveis.length - 1] || 1;
                  }
                  var doMes = todas[mes] || { comAfastamento: {}, semAfastamento: {}, primeirosSocorros: {} };
                  ctx.onSuccess && ctx.onSuccess({
                    ano: pacote.ano, mes: mes,
                    comAfastamento: doMes.comAfastamento,
                    semAfastamento: doMes.semAfastamento,
                    primeirosSocorros: doMes.primeirosSocorros
                  });
                }, 400);
              },
              getResumoHome: function (ano) {
                var ctx = this;
                setTimeout(function () { ctx.onSuccess && ctx.onSuccess(mockGerarResumoHome(ano || 2026)); }, 400);
              },
              getBootstrapDados: function (ano) {
                var ctx = this;
                setTimeout(function () {
                  var anoAlvo = ano || 2026;
                  var pacote = mockGerarPacoteAno(anoAlvo);
                  // Campanha mock: sem arte de propósito, pra exercitar a faixa
                  // colorida de fallback (que é o estado antes de os gestores
                  // subirem a primeira imagem na planilha).
                  var mesCorrente = new Date().getMonth() + 1;
                  var mesesTematicos = [
                    ['Janeiro Branco', 'Saúde mental e qualidade de vida', '#e2e8f0', '#0f172a'],
                    ['Fevereiro Roxo', 'Lúpus, Alzheimer e fibromialgia', '#7c3aed', '#ffffff'],
                    ['Março Lilás', 'Prevenção do câncer de colo do útero', '#a78bfa', '#ffffff'],
                    ['Abril Verde', 'Saúde e segurança no trabalho', '#2e7d32', '#ffffff'],
                    ['Maio Amarelo', 'Segurança no trânsito', '#f9a825', '#3f2d00'],
                    ['Junho Vermelho', 'Doação de sangue', '#c62828', '#ffffff'],
                    ['Julho Amarelo', 'Prevenção das hepatites virais', '#f6c026', '#3f2d00'],
                    ['Agosto Dourado', 'Aleitamento materno', '#b8860b', '#ffffff'],
                    ['Setembro Amarelo', 'Valorização da vida e prevenção do suicídio', '#fbc02d', '#3f2d00'],
                    ['Outubro Rosa', 'Prevenção do câncer de mama', '#ec407a', '#ffffff'],
                    ['Novembro Azul', 'Saúde do homem', '#1565c0', '#ffffff'],
                    ['Dezembro Vermelho', 'Prevenção ao HIV/Aids', '#d32f2f', '#ffffff']
                  ][mesCorrente - 1];

                  ctx.onSuccess && ctx.onSuccess({
                    home: mockGerarResumoHome(anoAlvo),
                    campanha: {
                      titulo: mesesTematicos[0], tema: mesesTematicos[1],
                      imagem: '', link: '', cor: mesesTematicos[2], corTexto: mesesTematicos[3],
                      origem: 'padrao', mes: mesCorrente, aviso: null
                    },
                    cruz: {
                      anos: [2026, 2025],
                      anoAtual: anoAlvo,
                      mesAtual: 7,
                      departamentos: pacote.departamentos,
                      porDepartamentoMes: pacote.porDepartamentoMes,
                      totaisPorDepartamentoMes: pacote.totaisPorDepartamentoMes,
                      ocorrenciasPorDepartamentoMes: pacote.ocorrenciasPorDepartamentoMes,
                      totaisTagSaf: pacote.totaisTagSaf,
                      tagSafety: pacote.tagSafety
                    }
                  });
                }, 400);
              }
            };
            // Cada withSuccessHandler/withFailureHandler devolve uma cadeia NOVA, com
            // o seu próprio par de handlers — chamadas simultâneas não se atropelam.
            function chain(ctx) {
              var elo = {
                withSuccessHandler: function (fn) { return chain({ onSuccess: fn, onFailure: ctx.onFailure }); },
                withFailureHandler: function (fn) { return chain({ onSuccess: ctx.onSuccess, onFailure: fn }); }
              };
              Object.keys(api).forEach(function (nome) {
                elo[nome] = function () { return api[nome].apply(ctx, arguments); };
              });
              return elo;
            }
            return chain({});
          })()
        }
      };
    }

    var nomeUsuario = 'Guardião';

    document.addEventListener('DOMContentLoaded', function () {
      marcarNavAtiva('nav-home'); // a home é a tela inicial
      google.script.run
        .withSuccessHandler(onDadosCarregados)
        .withFailureHandler(onErroCarregamento)
        .obterDadosIniciais();
      carregarHome(); // dashboard executivo da home (roda por trás do shield)
      carregarFeedBonecoMesAtual(); // card estático do Meu Feed — fonte própria, à parte do bootstrap
    });

    function onDadosCarregados(dados) {
      nomeUsuario = dados.nome;
      preencherHeader(nomeUsuario);
      iniciarSequenciaCinematica(nomeUsuario);
    }

    function onErroCarregamento(erro) {
      nomeUsuario = 'Guardião';
      preencherHeader(nomeUsuario);
      console.error(erro);
      iniciarSequenciaCinematica(nomeUsuario);
    }

    function iniciarSequenciaCinematica(nome) {
      var shield = document.getElementById('main-shield');
      var hora = new Date().getHours();
      var saudacaoTempo = hora < 12 ? 'BOM DIA' : hora < 18 ? 'BOA TARDE' : 'BOA NOITE';

      document.getElementById('saudacao-cinematica').innerText = saudacaoTempo + ', ' + nome.toUpperCase();

      setTimeout(function () { shield.classList.add('phase-solidify'); }, 1500);
      setTimeout(function () { shield.classList.add('phase-greeting'); }, 1200);
      setTimeout(function () {
        shield.classList.add('phase-dissolve');
        document.getElementById('feed-lateral').classList.add('feed-in');
      }, 3300);
      setTimeout(function () { shield.style.display = 'none'; }, 3600);
    }

    function preencherHeader(nome) {
      document.getElementById('user-greeting').textContent = 'Bem-vindo(a), ' + nome;
    }

    /* ==========================================================================
       HOME — DASHBOARD EXECUTIVO
       Taxas de frequência (FAI/REC) publicadas no Scorecard; Cruz/Pirâmide de
       resumo vindas do mesmo pacote da Cruz. Carregada uma vez, no bootstrap.
       ========================================================================== */

    var HOME_MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    var HOME_COR_REAL = '#00a0dd';
    var HOME_COR_META = '#94a3b8';

    // Paleta de status — reservada, e sempre acompanhada de símbolo + texto,
    // nunca cor sozinha (daltonismo / impressão P&B).
    var HOME_STATUS_ESTILO = {
      bom: { cor: '#2e7d32', fundo: '#e8f5e9', simbolo: '✓' },
      atencao: { cor: '#b45309', fundo: '#fef3c7', simbolo: '!' },
      critico: { cor: '#c62828', fundo: '#ffebee', simbolo: '!' },
      neutro: { cor: '#64748b', fundo: '#f1f5f9', simbolo: '•' }
    };

    function homeChipStatus(tipo, texto) {
      var e = HOME_STATUS_ESTILO[tipo] || HOME_STATUS_ESTILO.neutro;
      return '<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold" ' +
        'style="color:' + e.cor + ';background:' + e.fundo + '">' +
        '<span aria-hidden="true">' + e.simbolo + '</span>' + texto + '</span>';
    }

    function homeFormatarTaxa(valor) {
      if (valor === null || valor === undefined || isNaN(valor)) return '—';
      return valor.toFixed(3).replace('.', ',');
    }

    // FAI e REC são "quanto menor melhor": dentro da meta = bom, até 10% acima
    // = atenção, acima disso = crítico.
    function homeAvaliarTaxa(valor, meta) {
      if (valor === null || valor === undefined || meta === null || meta === undefined) {
        return { tipo: 'neutro', texto: meta == null ? 'Meta não encontrada' : 'Sem HHT lançado' };
      }
      var metaTexto = 'meta ' + homeFormatarTaxa(meta);
      if (valor <= meta) return { tipo: 'bom', texto: 'Dentro da ' + metaTexto };
      if (valor <= meta * 1.1) return { tipo: 'atencao', texto: 'Acima da ' + metaTexto };
      return { tipo: 'critico', texto: 'Acima da ' + metaTexto };
    }

    /* Bootstrap — uma chamada só traz a home E o contexto do METRICS SAF (são a
       mesma leitura de planilha no servidor). Disparado no DOMContentLoaded,
       por trás da abertura cinematográfica; a saudação vem noutra chamada, mais
       leve, pra a tela de abertura nunca ficar presa esperando planilha. */
    var bootstrapEstado = 'ocioso'; // ocioso | carregando | pronto | erro
    var bootstrapDados = null;
    var bootstrapFila = [];         // quem pediu dado enquanto a chamada voava

    function resolverFilaBootstrap() {
      var fila = bootstrapFila;
      bootstrapFila = [];
      fila.forEach(function (fn) { fn(); });
    }

    function carregarBootstrap() {
      if (bootstrapEstado === 'carregando' || bootstrapEstado === 'pronto') return;
      bootstrapEstado = 'carregando';

      // Numa nova tentativa depois de erro, volta pro estado de carregamento —
      // senão a caixa de erro anterior fica na tela enquanto a chamada voa.
      document.getElementById('home-erro').classList.add('hidden');
      document.getElementById('home-carregando').classList.remove('hidden');

      google.script.run
        .withSuccessHandler(function (dados) {
          bootstrapDados = dados;
          bootstrapEstado = 'pronto';
          adotarPacoteCruz(dados.cruz);
          onResumoHomeCarregado(dados.home);
          renderizarHomeCruzPiramide(dados.cruz);
          renderizarCampanha(dados.campanha);
          resolverFilaBootstrap();
        })
        .withFailureHandler(function (erro) {
          bootstrapEstado = 'erro';
          onErroHome(erro);
          resolverFilaBootstrap(); // quem estava na fila cai no caminho direto
        })
        .getBootstrapDados();
    }

    /* ESPAÇO DE DIVULGAÇÃO (feed) — campanha do mês ou evento pontual. */

    function escaparHtml(texto) {
      return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /**
     * Renderiza o card da campanha. Se a planilha trouxer uma arte, ela é o
     * card; se não trouxer (ou se a imagem falhar ao carregar), cai numa faixa
     * colorida com o nome e o tema do mês — o espaço nunca aparece quebrado nem
     * vazio, que é o pior resultado possível num mural de divulgação.
     */
    function renderizarCampanha(campanha) {
      var card = document.getElementById('feed-campanha');
      if (!card || !campanha) return;

      var titulo = escaparHtml(campanha.titulo || '');
      var tema = escaparHtml(campanha.tema || '');
      var cor = campanha.cor || '#0d436b';
      var corTexto = campanha.corTexto || '#ffffff';
      var ehEvento = campanha.origem === 'planilha-evento';
      var etiqueta = ehEvento ? 'Em destaque' : 'Campanha do mês';
      var temArte = !!campanha.imagem;

      // A etiqueta usa a cor da campanha só como FUNDO (10% de opacidade); o
      // texto fica sempre em tinta escura fixa. Colorir o texto com a cor da
      // campanha quebraria o contraste sempre que ela fosse clara — e ela é
      // arbitrária, vem da planilha. O alfa exige hex de 6 dígitos: se o gestor
      // digitar um nome de cor ("amarelo"), o fundo cai pra cinza neutro.
      var fundoEtiqueta = /^#[0-9a-f]{6}$/i.test(cor) ? cor + '2e' : '#f1f5f9';
      var textoEtiqueta = '#334155';

      // Sem arte, a faixa colorida É o card — então ela leva o título grande e o
      // rodapé não repete. Com arte, a imagem manda e o texto todo vai no rodapé.
      // max-h + object-contain: a arte vem de gestores, e uma imagem em retrato
      // (cartaz 1080x1920) tomaria o feed inteiro. O teto limita a altura, e
      // object-contain preserva a arte inteira em vez de cortar — texto de
      // campanha cortado seria pior. A sobra ganha a cor da campanha, pra a
      // faixa parecer proposital e não um erro de enquadramento.
      var cabecalho = temArte
        ? '<img src="' + escaparHtml(campanha.imagem) + '" alt="' + titulo + '" ' +
          'class="w-full block max-h-[24rem] object-contain" ' +
          'style="background:' + escaparHtml(cor) + '" ' +
          'onerror="aoFalharArteCampanha(this)" />'
        : '<div class="px-4 py-7 text-center" style="background:' + escaparHtml(cor) + ';color:' + escaparHtml(corTexto) + '">' +
            '<p class="text-xl font-extrabold leading-tight">' + titulo + '</p>' +
          '</div>';

      var rodape =
        '<div class="bg-white p-4 flex flex-col gap-2">' +
          '<span class="self-start text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" ' +
            'style="background:' + fundoEtiqueta + ';color:' + textoEtiqueta + '">' + etiqueta + '</span>' +
          (temArte ? '<h3 class="font-bold text-brand-primary text-sm leading-tight">' + titulo + '</h3>' : '') +
          (tema ? '<p class="text-slate-500 text-xs">' + tema + '</p>' : '') +
          (campanha.link
            ? '<a href="' + escaparHtml(campanha.link) + '" target="_top" ' +
              'class="self-start text-xs font-bold text-brand-secondary hover:text-brand-primary transition-colors duration-200">Saiba mais →</a>'
            : '') +
        '</div>';

      card.innerHTML = cabecalho + rodape;
      card.classList.remove('hidden');

      if (campanha.aviso) console.warn('Campanha: ' + campanha.aviso);
    }

    /**
     * A arte pode falhar por permissão do Drive (arquivo não compartilhado com
     * o domínio) ou link inválido. Nesse caso a imagem é trocada pela faixa
     * colorida em vez de deixar o ícone de imagem quebrada no mural.
     */
    function aoFalharArteCampanha(img) {
      var campanha = (bootstrapDados && bootstrapDados.campanha) || null;
      if (!campanha) { img.remove(); return; }

      console.warn('Campanha: a arte não carregou (' + campanha.imagem + '). Confira se o arquivo do Drive está compartilhado com o domínio.');
      var semArte = {};
      Object.keys(campanha).forEach(function (k) { semArte[k] = campanha[k]; });
      semArte.imagem = '';
      renderizarCampanha(semArte);
    }

    /**
     * Guarda o pacote da Cruz no mesmo global que o painel METRICS SAF usa. A
     * home precisa dele para a Cruz e a Pirâmide de resumo, e quando o painel
     * abrir depois vai encontrar tudo já em memória.
     */
    function adotarPacoteCruz(cruz) {
      if (!cruz) return;
      cruzDadosAno = {
        departamentos: cruz.departamentos,
        porDepartamentoMes: cruz.porDepartamentoMes,
        totaisPorDepartamentoMes: cruz.totaisPorDepartamentoMes,
        ocorrenciasPorDepartamentoMes: cruz.ocorrenciasPorDepartamentoMes,
        totaisTagSaf: cruz.totaisTagSaf,
        tagSafety: cruz.tagSafety
      };
    }

    /**
     * Clona a Pirâmide do painel para a home, prefixando TODO id e toda
     * referência url(#...)/href="#..." — sem isso os dois SVGs teriam ids
     * repetidos e os gradientes/máscaras do clone apontariam para o original.
     * Feito uma vez só.
     *
     * Copia o wrapper #piramide-visual, não o <svg> direto. Desde 2026-07-28 os
     * valores e os rótulos voltaram pra DENTRO do SVG, então o wrapper hoje só
     * tem o <svg> — mas continua sendo ele o clonado, porque o prefixo por
     * string-replace precisa pegar o outerHTML inteiro (inclusive o filter=
     * "url(#numeroSombra)" de cada número).
     */
    function montarPiramideHome() {
      var alvo = document.getElementById('home-piramide-wrap');
      if (!alvo || alvo.getAttribute('data-pronta') === '1') return;

      var origem = document.getElementById('piramide-visual');
      if (!origem) return;

      alvo.innerHTML = origem.outerHTML
        .replace(/id="/g, 'id="home-')
        .replace(/url\(#/g, 'url(#home-')
        .replace(/href="#/g, 'href="#home-');
      alvo.setAttribute('data-pronta', '1');
    }

    // Cruz do mês corrente + Pirâmide do ano inteiro, ambas sem filtro.
    function renderizarHomeCruzPiramide(cruz) {
      if (!cruz) return;

      var ano = cruz.anoAtual;
      var mes = cruz.mesAtual;
      var diasDoMes = (cruz.porDepartamentoMes &&
        cruz.porDepartamentoMes['Todas'] &&
        cruz.porDepartamentoMes['Todas'][mes]) || {};

      renderizarCruzEm('home-cruz-grid', ano, mes, diasDoMes, false);
      document.getElementById('home-cruz-subtitulo').textContent =
        CRUZ_MESES[mes - 1] + ' de ' + ano + ' — todas as áreas';

      montarPiramideHome();
      renderizarPiramideSeguranca('Todas', 'todos', 'home-');
      document.getElementById('home-piramide-subtitulo').textContent =
        'Acumulado de ' + ano + ' — todas as áreas';
    }

    function carregarHome() {
      if (bootstrapEstado === 'pronto' && bootstrapDados) {
        onResumoHomeCarregado(bootstrapDados.home);
        renderizarHomeCruzPiramide(bootstrapDados.cruz);
        renderizarCampanha(bootstrapDados.campanha);
        return;
      }
      if (bootstrapEstado === 'carregando') return; // já está a caminho
      carregarBootstrap();                          // ocioso, ou nova tentativa após erro
    }

    function onErroHome(erro) {
      document.getElementById('home-carregando').classList.add('hidden');
      document.getElementById('home-erro').classList.remove('hidden');
      document.getElementById('home-erro-texto').textContent = erro && erro.message ? erro.message : String(erro);
    }

    function onResumoHomeCarregado(dados) {
      document.getElementById('home-carregando').classList.add('hidden');
      document.getElementById('home-erro').classList.add('hidden');
      document.getElementById('home-conteudo').classList.remove('hidden');

      homeRenderizarKpis(dados);
      // A série exibida é a PUBLICADA no Scorecard (dados.oficial), não a que
      // calculávamos da Compilado + HHT — ver comentário do campo `oficial` no
      // Code.js. A calculada continua vindo no payload (dados.meses) e é usada
      // só como conferência no rodapé.
      homeDesenharTaxa('home-taxa-rec-svg', dados.meses, 'taxaRec', 'rec',
        (dados.metas || {}).serieRec, (dados.metas || {}).taxaRec, (dados.oficial || {}).trr);
      homeDesenharTaxa('home-taxa-fai-svg', dados.meses, 'taxaFai', 'fai',
        (dados.metas || {}).serieFai, (dados.metas || {}).taxaFai, (dados.oficial || {}).firstAid);
      homeRenderizarRotina(dados.rotina || {});
      homeRenderizarNota(dados);
    }

    function homeRenderizarKpis(dados) {
      var ytd = dados.ytd || {};
      var metas = dados.metas || {};

      // Os tiles mostram o ACUMULADO DO ANO da aba "{ano} Acumulado" da Base HHT
      // (fonte confirmada pelo usuário em 29/07, linha RIO CLARO). O FAI vem
      // PUBLICADO ali; o REC é derivado da contagem publicada, porque a aba não
      // traz taxa REC pronta. O YTD do Scorecard e a nossa conta da Compilado
      // sobrevivem só como conferência no tooltip.
      var oficial = dados.oficial || {};
      var ac = dados.acumulado || { erro: 'Fonte indisponível' };
      homeRenderizarKpiTaxa('rec', {
        valor: ac.rec, derivado: true, meta: metas.taxaRec, ano: dados.ano,
        eventos: ac.recordaveis, hht: ac.horas, rotuloEvento: ['registrável', 'registráveis'],
        conferenciaScorecard: oficial.trrYtd, nossaConta: ytd.taxaRec, erro: ac.erro
      });
      homeRenderizarKpiTaxa('fai', {
        valor: ac.fai, derivado: false, meta: metas.taxaFai, ano: dados.ano,
        eventos: ac.primeirosSocorros, hht: ac.horas, rotuloEvento: ['primeiro socorro', 'primeiros socorros'],
        conferenciaScorecard: oficial.faiYtd, nossaConta: ytd.taxaFai, erro: ac.erro
      });

      homeRenderizarKpiTags(dados.tags);

      var dojo = (dados.rotina || {}).dojo;
      var kpiDojo = document.getElementById('home-kpi-dojo');
      var statusDojo = document.getElementById('home-kpi-dojo-status');
      
      if (kpiDojo && statusDojo) {
        if (!dojo || dojo.fonte === 'nao_configurada') {
          kpiDojo.textContent = '—';
          statusDojo.innerHTML = homeChipStatus('neutro', 'Fonte não configurada');
        } else if (dojo.fonte === 'erro') {
          kpiDojo.textContent = '—';
          statusDojo.innerHTML = homeChipStatus('critico', 'Fonte indisponível');
        } else {
          kpiDojo.textContent = dojo.percentual;
          var textoStatus = dojo.participantes.toLocaleString('pt-BR') + ' concluíram · ' + dojo.faltam.toLocaleString('pt-BR') + ' pendentes';
          statusDojo.innerHTML = homeChipStatus('bom', textoStatus);
        }
      }
    }

    /**
     * Tile de taxa (REC/FAI) — ACUMULADO DO ANO (YTD) da aba "{ano} Acumulado"
     * da Base HHT, linha RIO CLARO. Fonte confirmada pelo usuário em 2026-07-29.
     *
     * REGRA FIRMADA EM 2026-07-27, depois da conversa com a Beatriz: "o número
     * precisa ser o deles". Sem fonte, o tile mostra "—" e diz por quê; NÃO cai
     * na taxa que calculamos da Compilado. Não reintroduzir fallback silencioso.
     *
     * DUAS PROCEDÊNCIAS DIFERENTES, e o tooltip diz qual é qual:
     *  - FAI: PUBLICADO na aba (coluna "Primeiros socorros atual"). d.derivado=false.
     *  - REC: DERIVADO — a aba traz só a CONTAGEM de registráveis, não a taxa.
     *    É (contagem deles x 200.000) / (horas deles), a mesma fórmula que eles
     *    usam na coluna do FAI. d.derivado=true, e o tooltip escreve "derivado".
     *
     * As outras duas fontes viram CONFERÊNCIA no tooltip, só quando divergem:
     * o YTD publicado no Scorecard e a nossa conta a partir da Compilado + HHT.
     * É o que permite auditar a diferença na tela em vez de descobri-la numa
     * reunião — mesma convenção do gráfico mensal em homeDesenharTaxa.
     */
    function homeRenderizarKpiTaxa(sufixo, d) {
      var valor = document.getElementById('home-kpi-' + sufixo);
      var status = document.getElementById('home-kpi-' + sufixo + '-status');
      var rotulo = document.getElementById('home-kpi-' + sufixo + '-rotulo');
      var nome = sufixo === 'rec' ? 'Taxa REC' : 'Taxa FAI';
      var ok = function (v) { return v !== null && v !== undefined && !isNaN(v); };

      var temValor = ok(d.valor);
      rotulo.textContent = nome + ' — YTD' + (d.ano ? ' ' + d.ano : '');
      valor.textContent = temValor ? homeFormatarTaxa(d.valor) : '—';

      var t = [d.derivado
        ? 'Acumulado do ano · derivado da contagem publicada na Base HHT'
        : 'Acumulado do ano · publicado na Base HHT'];
      if (ok(d.meta)) t.push('Meta: ' + homeFormatarTaxa(d.meta));
      if (ok(d.conferenciaScorecard) && (!temValor || Math.abs(d.valor - d.conferenciaScorecard) > 0.0005)) {
        t.push('Scorecard YTD: ' + homeFormatarTaxa(d.conferenciaScorecard));
      }
      if (ok(d.nossaConta) && (!temValor || Math.abs(d.valor - d.nossaConta) > 0.0005)) {
        t.push('nossa conta (Compilado): ' + homeFormatarTaxa(d.nossaConta));
      }
      if (d.hht > 0) {
        var n = d.eventos || 0;
        // Singular e plural vêm explícitos: "registrável"→"registráveis" e
        // "primeiro socorro"→"primeiros socorros" não saem de um + 's'.
        t.push(n + ' ' + (n === 1 ? d.rotuloEvento[0] : d.rotuloEvento[1]) +
          ' · HHT ' + Math.round(d.hht).toLocaleString('pt-BR'));
      }
      // Tooltip no CARD inteiro, não só no número: alvo de hover maior.
      (valor.closest('.painel-bloco') || valor).setAttribute('title', t.join(' · '));

      if (temValor) {
        var av = homeAvaliarTaxa(d.valor, d.meta);
        status.innerHTML = homeChipStatus(av.tipo, av.texto);
      } else {
        status.innerHTML = homeChipStatus('neutro', d.erro ? 'Fonte indisponível' : 'Sem YTD publicado');
      }
    }

    /**
     * KPI "TAGs registradas" — volume do programa TAG e a vertente que lidera.
     *
     * A vertente entra na sub-linha em vez de virar um gráfico no tile: com 6
     * vertentes e ~130px de largura, qualquer gráfico aqui viraria borrão. O
     * detalhamento completo é assunto de um card próprio, não do tile.
     *
     * Segue o mesmo padrão de "fonte não configurada" já usado pelos cards da
     * Rotina do pilar: sem fonte, mostra o estado em vez de inventar número.
     */
    function homeRenderizarKpiTags(tags) {
      var valor = document.getElementById('home-kpi-tags');
      var sub = document.getElementById('home-kpi-tags-sub');
      var status = document.getElementById('home-kpi-tags-status');
      if (!valor) return;

      if (!tags || tags.fonte === 'nao_configurada') {
        valor.textContent = '—';
        sub.textContent = 'Programa TAG — todas as vertentes';
        status.innerHTML = homeChipStatus('neutro', 'Fonte não configurada');
        return;
      }

      if (tags.erro) {
        valor.textContent = '—';
        sub.textContent = 'Programa TAG — todas as vertentes';
        status.innerHTML = homeChipStatus('critico', 'Fonte indisponível');
        return;
      }

      valor.textContent = formatarInteiroBr_(tags.total || 0);

      var lider = tags.lider;
      sub.textContent = lider
        ? (lider.rotulo + ' lidera · ' + formatarInteiroBr_(lider.total))
        : 'Programa TAG — todas as vertentes';

      var qtdVertentes = (tags.vertentes || []).length;
      status.innerHTML = homeChipStatus('neutro',
        qtdVertentes + (qtdVertentes === 1 ? ' vertente' : ' vertentes') +
        (tags.periodo ? ' · ' + tags.periodo : ''));
    }

    /**
     * Linha "realizado x meta" de uma taxa, mês a mês. Duas séries no MESMO
     * eixo (as duas são a mesma taxa), Meta como referência tracejada cinza —
     * mesmo tratamento do gráfico de avanço do RISK.
     * Meses sem HHT lançado NÃO viram zero: ficam fora da linha, senão a
     * ausência de denominador seria lida como desempenho perfeito.
     */
    function homeDesenharTaxa(idSvg, meses, campoTaxa, campoEventos, serieMeta, metaConstante, serieOficial) {
      var svg = document.getElementById(idSvg);
      if (!svg) return;

      var largura = 720, altura = 300;
      var margemEsq = 52, margemDir = 16, margemTopo = 18, margemBase = 40;
      var larguraPlot = largura - margemEsq - margemDir;
      var alturaPlot = altura - margemTopo - margemBase;
      var eixoBase = margemTopo + alturaPlot;

      var pontos = (meses || []).map(function (m, i) {
        var meta = serieMeta && serieMeta[i] !== null && serieMeta[i] !== undefined ? serieMeta[i] : metaConstante;
        // Valor plotado = SÓ o publicado no Scorecard. Mês que o Scorecard não
        // publicou fica sem ponto — não é substituído pela nossa conta, que
        // entraria na linha sem o leitor perceber que mudou de fonte. A nossa
        // conta fica em `calculado`, exibida rotulada no tooltip.
        var oficialMes = serieOficial && serieOficial[i] !== null && serieOficial[i] !== undefined
          ? serieOficial[i] : null;
        var calculado = (m[campoTaxa] === null || m[campoTaxa] === undefined) ? null : m[campoTaxa];
        return {
          indice: i,
          valor: oficialMes,
          oficial: oficialMes,
          calculado: calculado,
          eventos: m[campoEventos] || 0,
          hht: m.hht || 0,
          meta: (meta === null || meta === undefined) ? null : meta
        };
      });

      var comValor = pontos.filter(function (p) { return p.valor !== null && p.valor !== undefined; });

      if (!comValor.length) {
        svg.innerHTML = '<text x="' + (largura / 2) + '" y="' + (altura / 2) + '" text-anchor="middle" font-size="13" fill="#94a3b8">' +
          'Scorecard sem valores publicados para este ano</text>';
        return;
      }

      var maximo = 0;
      pontos.forEach(function (p) {
        if (p.valor !== null && p.valor !== undefined) maximo = Math.max(maximo, p.valor);
        if (p.meta !== null) maximo = Math.max(maximo, p.meta);
      });
      var domMax = maximo > 0 ? maximo * 1.25 : 1;

      function x(i) { return margemEsq + (i / 11) * larguraPlot; }
      function y(v) { return eixoBase - (v / domMax) * alturaPlot; }

      var partes = [];

      for (var t = 0; t <= 4; t++) {
        var valorMarca = (domMax / 4) * t;
        var yy = y(valorMarca);
        partes.push('<line x1="' + margemEsq + '" y1="' + yy + '" x2="' + (margemEsq + larguraPlot) + '" y2="' + yy + '" stroke="#e2e8f0" stroke-width="1" />');
        partes.push('<text x="' + (margemEsq - 8) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="10" fill="#94a3b8">' + valorMarca.toFixed(2).replace('.', ',') + '</text>');
      }

      var pontosMeta = pontos.filter(function (p) { return p.meta !== null; })
        .map(function (p) { return x(p.indice) + ',' + y(p.meta); }).join(' ');
      if (pontosMeta) {
        partes.push('<polyline points="' + pontosMeta + '" fill="none" stroke="' + HOME_COR_META + '" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round" />');
      }

      partes.push('<polyline points="' + comValor.map(function (p) { return x(p.indice) + ',' + y(p.valor); }).join(' ') +
        '" fill="none" stroke="' + HOME_COR_REAL + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />');

      comValor.forEach(function (p) {
        // O tooltip diz DE ONDE veio o número e, quando a nossa conta diverge do
        // publicado, mostra as duas — é o que permite auditar a diferença em vez
        // de descobri-la numa reunião.
        var detalhe = HOME_MESES_CURTOS[p.indice] + ' — Scorecard: ' + homeFormatarTaxa(p.valor) +
          (p.meta !== null ? ' · Meta: ' + homeFormatarTaxa(p.meta) : '');

        if (p.oficial !== null && p.calculado !== null && Math.abs(p.oficial - p.calculado) > 0.0005) {
          detalhe += ' · nossa conta: ' + homeFormatarTaxa(p.calculado);
        }
        if (p.hht > 0) {
          detalhe += ' · ' + p.eventos + (p.eventos === 1 ? ' ocorrência' : ' ocorrências') +
            ' · HHT ' + Math.round(p.hht).toLocaleString('pt-BR');
        }

        partes.push('<circle cx="' + x(p.indice) + '" cy="' + y(p.valor) + '" r="4" fill="' + HOME_COR_REAL + '" stroke="#ffffff" stroke-width="1.5">' +
          '<title>' + detalhe + '</title></circle>');
          
        // NOVO: Adiciona o valor numérico acima do ponto
        partes.push('<text x="' + x(p.indice) + '" y="' + (y(p.valor) - 10) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">' + 
          homeFormatarTaxa(p.valor) + '</text>');
      });
      
      for (var m = 0; m < 12; m++) {
        partes.push('<text x="' + x(m) + '" y="' + (eixoBase + 16) + '" text-anchor="middle" font-size="9.5" fill="#64748b">' + HOME_MESES_CURTOS[m] + '</text>');
      }

      partes.push('<line x1="' + margemEsq + '" y1="' + eixoBase + '" x2="' + (margemEsq + larguraPlot) + '" y2="' + eixoBase + '" stroke="#cbd5e1" stroke-width="1" />');
      svg.innerHTML = partes.join('');
    }

    function homeRenderizarRotina(rotina) {
      var itens = [
        { chave: 'majorActions', titulo: 'Major Actions (ATS)', descricao: 'Ações de risco abertas x fechadas' },
        { chave: 'bradley', titulo: 'Cultura de Segurança', descricao: 'Estágio na curva de Bradley' },
        { chave: 'expansaoS3', titulo: 'Expansão S3', descricao: 'Avanço da implantação' },
        { chave: 'extensaoS4', titulo: 'Extensão S4', descricao: 'Avanço da implantação' }
      ];

      document.getElementById('home-rotina').innerHTML = itens.map(function (item) {
        var dado = rotina[item.chave];

        if (!dado) {
          return '<div class="rounded-xl border-2 border-dashed border-slate-200 px-3.5 py-3">' +
            '<p class="text-[11px] font-bold text-slate-500">' + item.titulo + '</p>' +
            '<p class="text-lg font-extrabold text-slate-300 mt-1">—</p>' +
            '<p class="text-[10px] text-slate-400 mt-1">Fonte não configurada</p>' +
            '</div>';
        }

        return '<div class="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">' +
          '<p class="text-[11px] font-bold text-slate-500">' + item.titulo + '</p>' +
          '<p class="text-lg font-extrabold text-brand-primary mt-1">' + (dado.valor || '—') + '</p>' +
          '<p class="text-[10px] text-slate-400 mt-0.5">' + item.descricao + '</p>' +
          (dado.detalhe ? '<div class="mt-2">' + homeChipStatus(dado.status || 'neutro', dado.detalhe) + '</div>' : '') +
          '</div>';
      }).join('');
    }

    // Rodapé de procedência: diz de onde veio cada número e onde a fonte falhou,
    // pra ninguém tomar decisão em cima de um dado incompleto sem perceber.
    function homeRenderizarNota(dados) {
      var d = dados.diagnostico || {};
      var partes = ['Taxas REC e FAI: valores publicados no Scorecard Manufatura LAR' +
        (d.scorecardAba ? ' (' + d.scorecardAba + ')' : '') +
        ' · Ocorrências da Cruz e Pirâmide: Compilado ' + dados.ano + '.'];

      // A cobertura do HHT deixou de afetar a taxa exibida (que agora vem
      // publicada), mas continua valendo como aviso: é o HHT que sustenta a
      // conferência mês a mês no tooltip.
      var mesesComHht = (dados.ytd || {}).mesesComHht || 0;
      if (mesesComHht < 12) {
        partes.push('HHT lançado em ' + mesesComHht + ' de 12 meses — nos demais, o tooltip não traz a conferência da nossa conta.');
      }
      if (d.hhtErro) partes.push('Falha ao ler o HHT: ' + d.hhtErro);
      if (d.scorecardErro) partes.push('Falha ao ler o Scorecard: ' + d.scorecardErro);

      document.getElementById('home-nota-fonte').textContent = partes.join(' ');
    }

    var CRUZ_CORES_HEX = {
      vermelho: '#e53935',
      laranja: '#fb8c00',
      amarelo: '#fdd835',
      azul: '#00a0dd',
      cinza: '#9e9e9e',
      verde: '#43a047'
    };

    var CRUZ_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    var cruzAbertaUmaVez = false;
    var cruzDadosAno = null;

    /* ==========================================================================
       NAVEGAÇÃO — os módulos ficam só no menu lateral (os cards da home saíram).
       Cada destino esconde os outros painéis, então nunca há dois abertos.
       ========================================================================== */

    // Marca visualmente o item ativo do menu (o SMAT é link externo, nunca fica ativo).
    function marcarNavAtiva(idAtivo) {
      ['nav-home', 'nav-metrics', 'nav-risk'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var ativo = id === idAtivo;
        el.classList.toggle('bg-brand-bg', ativo);
        el.classList.toggle('text-brand-secondary', ativo);
        el.classList.toggle('text-slate-400', !ativo);
      });
    }

    function irParaHome() {
      document.getElementById('painel-cruz').classList.add('hidden');
      document.getElementById('painel-risk').classList.add('hidden');
      document.getElementById('secao-modulos').classList.remove('hidden');

      // Devolve o feed lateral ao estado da home.
      document.getElementById('feed-cruz-conteudo').classList.add('hidden');
      document.getElementById('feed-cruz-conteudo').classList.remove('flex');
      document.getElementById('feed-home-conteudo').classList.remove('hidden');
      document.getElementById('feed-lateral-titulo').textContent = 'Meu Feed';
      document.getElementById('feed-lateral-subtitulo').classList.add('hidden');

      marcarNavAtiva('nav-home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      carregarHome(); // no-op se já carregou; re-tenta se a 1ª chamada falhou
    }

    // ---------------------------------------------------------------------
    // ATS — carteira aberta por responsável
    // Chamada PRÓPRIA ao servidor, fora do getBootstrapDados: é outra aba de
    // planilha e a latência dela não pode entrar na frente da home. Mesmo
    // padrão adotado no Route Map.
    // ---------------------------------------------------------------------
    var atsDados_ = null;
    var atsCarregadoUmaVez_ = false;

    var ATS_COR_ABERTO_ = '#fb8c00';    // laranja canônico do projeto
    var ATS_COR_VENCIDO_ = '#e53935';   // vermelho canônico do projeto

    function carregarAts_() {
      if (atsCarregadoUmaVez_) return;
      atsCarregadoUmaVez_ = true;
      google.script.run
        .withSuccessHandler(onAtsCarregado_)
        .withFailureHandler(function (erro) {
          atsCarregadoUmaVez_ = false; // permite nova tentativa ao reabrir
          mostrarErroAts_(String(erro && erro.message ? erro.message : erro));
        })
        .getAtsAbertos(false);
    }

    function mostrarErroAts_(msg) {
      var carregando = document.getElementById('ats-carregando');
      var alvo = document.getElementById('ats-erro');
      if (carregando) carregando.classList.add('hidden');
      if (alvo) {
        alvo.textContent = 'Não foi possível carregar o ATS: ' + msg;
        alvo.classList.remove('hidden');
      }
    }

    function onAtsCarregado_(dados) {
      atsDados_ = dados || {};
      // getAtsAbertos nunca lança — devolve {erro} pra um problema nessa base
      // não derrubar o painel. O estado de erro é tratado aqui.
      if (atsDados_.erro) { mostrarErroAts_(atsDados_.erro); return; }
      renderizarAts_();
    }

    /**
     * Desenha um Pareto: barras ordenadas + % acumulada como texto.
     *
     * Barras HORIZONTAIS, não o Pareto clássico de barras verticais + linha
     * acumulada: os rótulos aqui são nomes de gerente e de área ("MANUTENÇÃO
     * FERRAMENTARIA METAL"), que na vertical exigiriam rotação a 45° e
     * ficariam ilegíveis. A % acumulada, que é a informação que a linha do
     * Pareto carrega, vira uma coluna à direita.
     */
    function desenharParetoAts_(idContainer, linhas) {
      var alvo = document.getElementById(idContainer);
      if (!alvo) return;

      if (!linhas || !linhas.length) {
        alvo.innerHTML = '<p class="text-xs text-slate-400">Nenhuma ação vencida neste recorte.</p>';
        return;
      }

      var soma = linhas.reduce(function (s, l) { return s + l.vencido; }, 0);
      var max = linhas[0].vencido || 1;
      var acumulado = 0;

      alvo.innerHTML = linhas.map(function (l) {
        acumulado += l.vencido;
        var pctAcum = soma > 0 ? (acumulado / soma) * 100 : 0;
        var largura = (l.vencido / max) * 100;
        var dica = l.nome + ' — ' + l.vencido + ' vencida(s), ' + l.aberto + ' aberta(s)';
        return '' +
          '<div class="flex items-center gap-2 text-xs" title="' + atsEscapar_(dica) + '">' +
            '<span class="w-28 sm:w-36 shrink-0 truncate text-slate-600 font-semibold" title="' + atsEscapar_(l.nome) + '">' + atsEscapar_(l.nome) + '</span>' +
            '<span class="flex-1 h-4 flex items-center">' +
              '<span class="h-full rounded-sm" style="width:' + largura + '%;background:' + ATS_COR_VENCIDO_ + '"></span>' +
            '</span>' +
            '<span class="w-6 shrink-0 text-right font-bold text-brand-primary" style="font-variant-numeric: tabular-nums;">' + l.vencido + '</span>' +
            '<span class="w-11 shrink-0 text-right text-slate-400" style="font-variant-numeric: tabular-nums;">' + Math.round(pctAcum) + '%</span>' +
          '</div>';
      }).join('');
    }

    function renderizarAts_() {
      var d = atsDados_;
      if (!d) return;

      document.getElementById('ats-carregando').classList.add('hidden');
      document.getElementById('ats-conteudo').classList.remove('hidden');

      var total = d.total || 0;
      var pctAberto = total > 0 ? (d.aberto / total) * 100 : 0;
      var pctVencido = total > 0 ? (d.vencido / total) * 100 : 0;

      document.getElementById('ats-kpi-aberto').textContent = formatarNumeroSvg_(d.aberto || 0);
      document.getElementById('ats-kpi-vencido').textContent = formatarNumeroSvg_(d.vencido || 0);
      document.getElementById('ats-kpi-aberto-pct').textContent = atsPct_(pctAberto);
      document.getElementById('ats-kpi-vencido-pct').textContent = atsPct_(pctVencido);

      // Rosca. Circunferência = 2·π·46 ≈ 289 (o mesmo valor está no
      // stroke-dasharray inicial do markup). O segmento vencido começa no topo
      // e o aberto é deslocado por stroke-dashoffset NEGATIVO para começar
      // onde o outro terminou.
      var CIRC = 2 * Math.PI * 46;
      var arcoVencido = total > 0 ? (d.vencido / total) * CIRC : 0;
      var arcoAberto = total > 0 ? (d.aberto / total) * CIRC : 0;
      var elV = document.getElementById('ats-donut-vencido');
      var elA = document.getElementById('ats-donut-aberto');
      elV.setAttribute('stroke-dasharray', arcoVencido + ' ' + (CIRC - arcoVencido));
      elA.setAttribute('stroke-dasharray', arcoAberto + ' ' + (CIRC - arcoAberto));
      elA.setAttribute('stroke-dashoffset', -arcoVencido);
      document.getElementById('ats-donut-total').textContent = formatarNumeroSvg_(total);

      desenharParetoAts_('ats-pareto-gerente', d.porGerente);
      desenharParetoAts_('ats-pareto-area', d.porArea);

      var corpoTop = document.getElementById('ats-top-atrasos');
      var top = d.topAtrasos || [];
      corpoTop.innerHTML = top.length ? top.map(function (t) {
        return '<tr class="border-b border-slate-50">' +
          '<td class="py-1 pr-2 text-slate-600 truncate" title="' + atsEscapar_(t.responsavel) + '">' + atsEscapar_(t.responsavel) + '</td>' +
          '<td class="py-1 pr-2 text-slate-500 truncate" title="' + atsEscapar_(t.gerente + ' · ' + t.area) + '">' + atsEscapar_(t.gerente) + '</td>' +
          '<td class="py-1 text-right font-bold" style="color:#c62828;font-variant-numeric:tabular-nums">' + t.diasAtraso + 'd</td>' +
        '</tr>';
      }).join('') : '<tr><td colspan="3" class="py-2 text-slate-400">Nenhuma ação vencida.</td></tr>';

      var lista = d.porResponsavel || [];
      var max = lista.length ? lista[0].total : 0;
      var alvo = document.getElementById('ats-barras');

      alvo.innerHTML = lista.length ? lista.map(function (r) {
        // Larguras em % DA MAIOR carteira, pra comparação entre pessoas.
        var wA = max > 0 ? (r.aberto / max) * 100 : 0;
        var wV = max > 0 ? (r.vencido / max) * 100 : 0;
        var dica = r.nome + ' — ' + r.aberto + ' aberto(s), ' + r.vencido + ' vencido(s). Clique para ver as ações.';
        // O nome vai num DATA-ATRIBUTO e o clique é tratado por delegação, não
        // por onclick inline com o nome interpolado. Nome de pessoa é texto
        // livre: com onclick="fn('...')" um apóstrofo ("D'Ávila") quebra o
        // atributo, e escapar isso direito exige escapar pro JS ANTES do HTML
        // (o parser decodifica &#39; de volta pra ' antes de o JS rodar). A
        // delegação some com a classe inteira do problema.
        return '' +
          '<div class="flex items-center gap-2 text-xs cursor-pointer rounded hover:bg-slate-50 transition-colors duration-150" ' +
               'role="button" tabindex="0" data-ats-nome="' + atsEscapar_(r.nome) + '" ' +
               'title="' + atsEscapar_(dica) + '">' +
            '<span class="w-32 sm:w-44 shrink-0 truncate text-slate-600 font-semibold" title="' + atsEscapar_(r.nome) + '">' + atsEscapar_(r.nome) + '</span>' +
            // gap-[2px]: separação entre segmentos é vão de superfície, não borda
            '<span class="flex-1 flex gap-[2px] h-4 items-center">' +
              (r.aberto > 0 ? '<span class="h-full rounded-sm" style="width:' + wA + '%;background:' + ATS_COR_ABERTO_ + '"></span>' : '') +
              (r.vencido > 0 ? '<span class="h-full rounded-sm" style="width:' + wV + '%;background:' + ATS_COR_VENCIDO_ + '"></span>' : '') +
            '</span>' +
            // UM número por linha (o total). O detalhe aberto/vencido está no
            // tooltip — número em cada segmento vira ruído (anti-padrão).
            '<span class="w-8 shrink-0 text-right font-bold text-brand-primary" style="font-variant-numeric: tabular-nums;">' + r.total + '</span>' +
          '</div>';
      }).join('') : '<p class="text-xs text-slate-400">Nenhuma ação em aberto no ATS.</p>';

      // Delegação: UM listener no container, que sobrevive a cada innerHTML.
      // Pendurado uma vez só (marcado no próprio elemento) — sem a guarda, cada
      // re-render empilharia mais um listener e o clique dispararia N vezes.
      if (alvo.getAttribute('data-ats-clique') !== '1') {
        alvo.setAttribute('data-ats-clique', '1');
        alvo.addEventListener('click', function (ev) {
          var linha = ev.target.closest ? ev.target.closest('[data-ats-nome]') : null;
          if (linha) onAtsResponsavelClicado_(linha.getAttribute('data-ats-nome'));
        });
        alvo.addEventListener('keydown', function (ev) {
          if (ev.key !== 'Enter' && ev.key !== ' ') return;
          var linha = ev.target.closest ? ev.target.closest('[data-ats-nome]') : null;
          if (linha) { ev.preventDefault(); onAtsResponsavelClicado_(linha.getAttribute('data-ats-nome')); }
        });
      }

      // Rodapé expõe as folgas em vez de escondê-las: se a Base pessoas estiver
      // desatualizada, o número de "sem gerente mapeado" aparece na tela.
      var rodape = [];
      rodape.push(formatarNumeroSvg_(d.linhasLidas || 0) + ' linha(s) na aba ATS');
      rodape.push(formatarNumeroSvg_(d.pessoasMapeadas || 0) + ' pessoa(s) na Base pessoas');
      if (d.semGerente > 0) rodape.push(d.semGerente + ' ação(ões) sem gerente mapeado');
      if (d.semResponsavel > 0) rodape.push(d.semResponsavel + ' sem responsável preenchido');
      document.getElementById('ats-rodape').textContent = rodape.join(' · ');
    }

    // -------------------------------------------------------------------------
    // CLIQUE NO RESPONSÁVEL -> Tracker Overview com as ações dele
    // Mostra a Action Description (coluna AA) de cada ação em aberto daquela
    // pessoa. Mesmo mecanismo do clique no boneco: um flag faz
    // renderizarFeedOcorrencias trocar o conteúdo do painel lateral.
    // -------------------------------------------------------------------------
    var atsFeedAtivo_ = false;
    var atsFeedResponsavel_ = null;
    var atsFeedItens_ = [];

    function onAtsResponsavelClicado_(nome) {
      if (!atsDados_) return;
      var pessoa = (atsDados_.porResponsavel || []).filter(function (r) { return r.nome === nome; })[0];
      if (!pessoa) return;

      bonecoFeedAtivo_ = false;   // sai do modo boneco
      cruzDiaFiltrado = null;     // e do filtro de dia da Cruz
      atsFeedResponsavel_ = pessoa;
      // Vencidas primeiro, e dentro delas o maior atraso no topo: é a ordem em
      // que a pessoa deveria atacar a própria carteira.
      atsFeedItens_ = (pessoa.registros || []).slice().sort(function (a, b) {
        if (a.status !== b.status) return a.status === 'vencido' ? -1 : 1;
        return (b.diasAtraso - a.diasAtraso);
      });
      atsFeedAtivo_ = true;
      renderizarFeedOcorrencias();
    }

    function renderizarFeedAts_() {
      var lista = document.getElementById('cruz-feed-lista');
      var vazio = document.getElementById('cruz-feed-vazio');
      var subtitulo = document.getElementById('cruz-feed-subtitulo');
      var botaoLimpar = document.getElementById('cruz-feed-limpar-filtro');
      var p = atsFeedResponsavel_ || { nome: '', gerente: '', aberto: 0, vencido: 0 };

      subtitulo.textContent = p.nome + ' — ' + p.vencido + ' vencida(s), ' + p.aberto +
        ' aberta(s) · gerente: ' + p.gerente;

      botaoLimpar.classList.remove('hidden');
      botaoLimpar.classList.add('flex');
      lista.innerHTML = '';

      if (!atsFeedItens_.length) {
        vazio.classList.remove('hidden');
        vazio.textContent = 'Nenhuma ação em aberto para esta pessoa.';
        return;
      }
      vazio.classList.add('hidden');

      atsFeedItens_.forEach(function (item) {
        var vencido = item.status === 'vencido';

        var card = document.createElement('div');
        card.className = 'flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-brand-secondary/30 hover:shadow-sm transition-all duration-200';

        var bolinha = document.createElement('span');
        bolinha.className = 'w-2.5 h-2.5 rounded-full mt-1 shrink-0';
        bolinha.style.backgroundColor = vencido ? ATS_COR_VENCIDO_ : ATS_COR_ABERTO_;

        var corpo = document.createElement('div');
        corpo.className = 'flex-1 min-w-0';

        var cabecalho = document.createElement('div');
        cabecalho.className = 'flex items-center justify-between gap-2';

        var estado = document.createElement('span');
        estado.className = 'text-[10px] font-bold uppercase tracking-wide';
        estado.style.color = vencido ? '#c62828' : '#b45309';
        // Status por TEXTO, não só pela cor da bolinha.
        estado.textContent = vencido ? 'Vencida' : 'Aberta';

        var prazo = document.createElement('span');
        prazo.className = 'text-[10px] text-slate-400 shrink-0';
        prazo.textContent = vencido
          ? (item.diasAtraso + ' dia(s) de atraso')
          : (item.diasAberto + ' dia(s) em aberto');

        cabecalho.appendChild(estado);
        cabecalho.appendChild(prazo);

        // Action Description (coluna AA) — o conteúdo que o usuário pediu.
        // textContent, nunca innerHTML: é texto livre digitado na planilha.
        var descricao = document.createElement('p');
        descricao.className = 'text-xs text-slate-600 mt-1 leading-snug';
        descricao.textContent = item.descricao;

        var area = document.createElement('p');
        area.className = 'text-[10px] text-slate-400 mt-1';
        area.textContent = item.area;

        corpo.appendChild(cabecalho);
        corpo.appendChild(descricao);
        corpo.appendChild(area);
        card.appendChild(bolinha);
        card.appendChild(corpo);
        lista.appendChild(card);
      });
    }

    function atsPct_(v) {
      return (Math.round(v * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1 }) + '% do total';
    }

    /** Nome de pessoa vai pra dentro de innerHTML — escapar é obrigatório. */
    function atsEscapar_(txt) {
      return String(txt == null ? '' : txt)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ---------------------------------------------------------------------
    // OCORRÊNCIAS — painel da aba "Ocorrências (FAI / REC)" + Base pessoas
    // ---------------------------------------------------------------------
    var ocorDados_ = null;
    var ocorCarregadoUmaVez_ = false;

    // Cor por ESTADO da investigação. Status é cor reservada, sempre com
    // rótulo em texto junto — nunca só a cor. Trio validado com
    // scripts/validate_palette.js (pior par ΔE 13,9 sob protanopia).
    var OCOR_COR_STATUS_ = { 'closed': '#2e7d32', 'open': '#fb8c00', 'not initiated': '#c62828' };
    var OCOR_COR_NEUTRA_ = '#0d436b';   // série única = uma cor só

    function ocorNormalizar_(t) {
      return String(t == null ? '' : t).toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
    }

    function carregarOcorrenciasPainel_() {
      if (ocorCarregadoUmaVez_) return;
      ocorCarregadoUmaVez_ = true;
      ocorPlaceholder_('Carregando…', 'text-slate-400');
      google.script.run
        .withSuccessHandler(function (d) {
          ocorDados_ = d || {};
          if (ocorDados_.erro) { mostrarErroOcor_(ocorDados_.erro); return; }
          renderizarOcorrencias_();
        })
        .withFailureHandler(function (e) {
          ocorCarregadoUmaVez_ = false;   // permite nova tentativa ao reabrir
          mostrarErroOcor_(String(e && e.message ? e.message : e));
        })
        .getOcorrenciasPainel(false);
    }

    // Os quatro containers de conteúdo dos cards de Ocorrências. Todos recebem
    // o MESMO tratamento de carregando/erro — antes o aviso morava só no card
    // de status e os outros três ficavam como caixas vazias, o que parecia
    // defeito de layout.
    var OCOR_CONTAINERS_ = ['ocor-gravidade', 'ocor-pareto-gerente', 'ocor-partes', 'ocor-tabela-abertos'];

    function ocorPlaceholder_(texto, classe) {
      OCOR_CONTAINERS_.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        // A tabela precisa de <tr><td>, não de <p>, senão o navegador joga o
        // conteúdo pra fora do <tbody>.
        el.innerHTML = (el.tagName === 'TBODY')
          ? '<tr><td colspan="6" class="py-2 ' + classe + '">' + atsEscapar_(texto) + '</td></tr>'
          : '<p class="text-xs ' + classe + '">' + atsEscapar_(texto) + '</p>';
      });
    }

    function mostrarErroOcor_(msg) {
      var c = document.getElementById('ocor-carregando');
      var alvo = document.getElementById('ocor-erro');
      if (c) c.classList.add('hidden');
      if (alvo) { alvo.textContent = 'Não foi possível carregar as ocorrências: ' + msg; alvo.classList.remove('hidden'); }
      ocorPlaceholder_('Dados indisponíveis.', 'text-red-400');
    }

    /**
     * Barras horizontais ordenadas para listas [{nome, total}].
     * Horizontais porque os rótulos são nomes de gerente, área e parte do
     * corpo — na vertical exigiriam rotação e ficariam ilegíveis.
     * `acumulada` liga a coluna de % acumulada, que é o que a linha de um
     * Pareto clássico carrega.
     */
    function desenharBarrasOcor_(idContainer, linhas, cor, acumulada) {
      var alvo = document.getElementById(idContainer);
      if (!alvo) return;
      if (!linhas || !linhas.length) {
        alvo.innerHTML = '<p class="text-xs text-slate-400">Sem dados para este recorte.</p>';
        return;
      }
      var max = linhas[0].total || 1;
      var soma = linhas.reduce(function (s, l) { return s + l.total; }, 0);
      var acum = 0;

      alvo.innerHTML = linhas.map(function (l) {
        acum += l.total;
        var pct = soma > 0 ? Math.round((acum / soma) * 100) : 0;
        // Balde de LACUNA DE DADO ("Sem gerente mapeado", "Não informado") sai
        // em cinza, nunca na cor da série. Com 185 de 415 sem gerente, esse
        // balde é a maior barra do Pareto — pintado igual aos outros, o
        // gráfico afirmaria que o maior gerente da planta é a falha de
        // cadastro. Cinza + o rótulo deixam claro que é ausência de dado.
        var lacuna = /^(sem |não informad)/i.test(l.nome);
        var corBarra = lacuna ? '#94a3b8' : cor;
        return '' +
          '<div class="flex items-center gap-2 text-xs" title="' + atsEscapar_(l.nome + ' — ' + l.total) + '">' +
            '<span class="w-24 sm:w-32 shrink-0 truncate font-semibold ' + (lacuna ? 'text-slate-400 italic' : 'text-slate-600') + '" title="' + atsEscapar_(l.nome) + '">' + atsEscapar_(l.nome) + '</span>' +
            '<span class="flex-1 h-4 flex items-center">' +
              '<span class="h-full rounded-sm" style="width:' + ((l.total / max) * 100) + '%;background:' + corBarra + '"></span>' +
            '</span>' +
            '<span class="w-8 shrink-0 text-right font-bold text-brand-primary" style="font-variant-numeric: tabular-nums;">' + l.total + '</span>' +
            (acumulada ? '<span class="w-11 shrink-0 text-right text-slate-400" style="font-variant-numeric: tabular-nums;">' + pct + '%</span>' : '') +
          '</div>';
      }).join('');
    }

    function renderizarOcorrencias_() {
      var d = ocorDados_;
      if (!d) return;

      document.getElementById('ocor-carregando').classList.add('hidden');
      document.getElementById('ocor-status-wrap').classList.remove('hidden');

      // Rosca de N fatias: cada arco começa onde o anterior terminou, via
      // stroke-dashoffset negativo acumulado.
      var CIRC = 2 * Math.PI * 46;
      var total = d.total || 0;
      var arcos = '', legenda = '', offset = 0;

      (d.porStatus || []).forEach(function (s) {
        var cor = OCOR_COR_STATUS_[ocorNormalizar_(s.nome)] || '#94a3b8';
        var arco = total > 0 ? (s.total / total) * CIRC : 0;
        arcos += '<circle cx="60" cy="60" r="46" fill="none" stroke="' + cor + '" stroke-width="16"' +
                 ' stroke-dasharray="' + arco + ' ' + (CIRC - arco) + '"' +
                 ' stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 60 60)"></circle>';
        offset += arco;

        var pct = total > 0 ? Math.round((s.total / total) * 100) : 0;
        legenda += '<div class="flex items-center gap-1.5">' +
          '<span class="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style="background:' + cor + '"></span>' +
          '<span class="text-slate-600 font-semibold truncate" title="' + atsEscapar_(s.nome) + '">' + atsEscapar_(s.nome) + '</span>' +
          '<span class="ml-auto font-bold text-brand-primary shrink-0" style="font-variant-numeric: tabular-nums;">' + s.total + '</span>' +
          '<span class="text-slate-400 shrink-0 w-8 text-right">' + pct + '%</span>' +
        '</div>';
      });

      document.getElementById('ocor-donut-arcos').innerHTML = arcos;
      document.getElementById('ocor-donut-total').textContent = formatarNumeroSvg_(total);
      document.getElementById('ocor-status-legenda').innerHTML = legenda ||
        '<p class="text-slate-400">Sem status registrado.</p>';

      desenharBarrasOcor_('ocor-gravidade', d.porGravidade, OCOR_COR_NEUTRA_, false);
      desenharBarrasOcor_('ocor-pareto-gerente', d.porGerente, OCOR_COR_NEUTRA_, true);
      desenharBarrasOcor_('ocor-partes', d.porParteCorpo, OCOR_COR_NEUTRA_, false);

      var chip = document.getElementById('ocor-abertos-chip');
      chip.textContent = formatarNumeroSvg_(d.totalAbertos || 0) + ' em aberto';

      var corpo = document.getElementById('ocor-tabela-abertos');
      var abertos = d.abertos || [];
      corpo.innerHTML = abertos.length ? abertos.map(function (o) {
        var cor = OCOR_COR_STATUS_[ocorNormalizar_(o.status)] || '#94a3b8';
        return '<tr class="border-b border-slate-50">' +
          // truncate precisa de largura definida: quem define é o <colgroup>
          // da tabela (table-fixed), não um max-w por célula.
          '<td class="py-1 pr-2 text-slate-500 whitespace-nowrap">' + atsEscapar_(o.data) + '</td>' +
          '<td class="py-1 pr-2 text-slate-600 truncate" title="' + atsEscapar_(o.supervisor) + '">' + atsEscapar_(o.supervisor) + '</td>' +
          '<td class="py-1 pr-2 text-slate-500 truncate" title="' + atsEscapar_(o.gerente) + '">' + atsEscapar_(o.gerente) + '</td>' +
          '<td class="py-1 pr-2 text-slate-500 truncate" title="' + atsEscapar_(o.area) + '">' + atsEscapar_(o.area) + '</td>' +
          '<td class="py-1 pr-2 text-slate-500 truncate" title="' + atsEscapar_(o.gravidade) + '">' + atsEscapar_(o.gravidade) + '</td>' +
          // Status com bolinha E texto — cor nunca sozinha. O texto trunca, mas
          // a bolinha já distingue os três estados de relance.
          '<td class="py-1 truncate" title="' + atsEscapar_(o.status) + '"><span class="inline-block w-2 h-2 rounded-full mr-1 align-middle shrink-0" style="background:' + cor + '"></span>' + atsEscapar_(o.status) + '</td>' +
        '</tr>';
      }).join('') : '<tr><td colspan="6" class="py-2 text-slate-400">Nenhuma ocorrência em aberto.</td></tr>';

      // Rodapé expõe as folgas em vez de escondê-las.
      var rodape = [];
      if (d.periodo && d.periodo.de) rodape.push('período ' + d.periodo.de + ' a ' + d.periodo.ate + ' (base inteira, sem filtro de ano)');
      rodape.push(formatarNumeroSvg_(d.linhasLidas || 0) + ' linha(s) lidas');
      if (d.totalAbertos > d.abertosExibidos) rodape.push('tabela limitada às ' + d.abertosExibidos + ' mais recentes');
      if (d.semGerente > 0) rodape.push(d.semGerente + ' sem gerente mapeado');
      if (d.semSupervisor > 0) rodape.push(d.semSupervisor + ' sem supervisor preenchido');
      document.getElementById('ocor-rodape').textContent = rodape.join(' · ');
    }

    // ---------------------------------------------------------------------
    // ABAS DO METRICS SAF
    // O painel tem 7 cards altos; sem abas o usuário precisava rolar pra
    // descobrir que Boneco, TAG Safety e os heatmaps de área existiam.
    // Cada aba é uma faixa do grid e cabe numa tela.
    // ---------------------------------------------------------------------
    var METRICS_ABAS_ = ['panorama', 'apontamentos', 'ats', 'areas'];
    var metricsAbaAtiva_ = 'panorama';

    function mostrarAbaMetrics(nome) {
      if (METRICS_ABAS_.indexOf(nome) === -1) nome = 'panorama';
      metricsAbaAtiva_ = nome;

      // data-aba nos BLOCOS; os botões usam data-aba-alvo, senão o seletor
      // abaixo pegaria os próprios botões junto e eles sumiriam.
      //
      // data-aba aceita LISTA separada por espaço. Hoje todo bloco pertence a
      // uma aba só, mas a divisão fica: é mais robusta que comparar a string
      // inteira (tolera espaço sobrando) e permite pôr um card em duas abas
      // sem duplicar markup — duplicar geraria id repetido.
      document.querySelectorAll('#painel-cruz [data-aba]').forEach(function (bloco) {
        var abas = (bloco.getAttribute('data-aba') || '').split(/\s+/);
        bloco.classList.toggle('hidden', abas.indexOf(nome) === -1);
      });

      document.querySelectorAll('#painel-cruz .metrics-aba-btn').forEach(function (btn) {
        var ativa = btn.getAttribute('data-aba-alvo') === nome;
        btn.classList.toggle('metrics-aba-ativa', ativa);
        btn.setAttribute('aria-selected', ativa ? 'true' : 'false');
      });
    }

    function abrirPainelCruz() {
      document.getElementById('secao-modulos').classList.add('hidden');
      document.getElementById('painel-risk').classList.add('hidden');
      document.getElementById('feed-home-conteudo').classList.add('hidden');
      document.getElementById('feed-cruz-conteudo').classList.remove('hidden');
      document.getElementById('feed-cruz-conteudo').classList.add('flex');
      document.getElementById('feed-lateral-titulo').textContent = 'Tracker Overview';

      var subtituloFeed = document.getElementById('feed-lateral-subtitulo');
      subtituloFeed.textContent = 'Monitoramento e descrição detalhada das ocorrências.';
      subtituloFeed.classList.remove('hidden');

      var painel = document.getElementById('painel-cruz');
      painel.classList.remove('hidden');
      marcarNavAtiva('nav-metrics');
      // Aplica a aba corrente. No markup os 7 blocos nascem VISÍVEIS de
      // propósito: se o JS falhar, a página degrada pro comportamento antigo
      // (tudo empilhado) em vez de ficar em branco.
      mostrarAbaMetrics(metricsAbaAtiva_);
      // Fontes próprias, à parte do bootstrap; cada uma carrega uma vez só.
      carregarAts_();
      carregarOcorrenciasPainel_();
      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (!cruzAbertaUmaVez) {
        cruzAbertaUmaVez = true;
        renderizarEsqueletoCruz();
        mostrarCarregamentoCruz();
        consumirContextoCruz();
      }

      // Boneco — fonte própria (planilha de Ocorrências EHS), carregado à parte
      // na 1ª vez que o painel abre (não faz parte do pacote da Cruz/bootstrap).
      if (!bonecoMetricsAbertoUmaVez) {
        bonecoMetricsAbertoUmaVez = true;
        carregarBonecoMetrics_();
      }
    }

    /**
     * O contexto da Cruz normalmente já veio no bootstrap disparado na abertura
     * da página — nesse caso o painel abre instantâneo, sem ida ao servidor.
     * Se o bootstrap ainda estiver voando, entra na fila; se tiver falhado (ou
     * nunca rodado), busca direto, pra o painel nunca ficar refém dele.
     */
    function consumirContextoCruz() {
      if (bootstrapEstado === 'pronto' && bootstrapDados && bootstrapDados.cruz) {
        onContextoCruzCarregado(bootstrapDados.cruz);
        return;
      }

      if (bootstrapEstado === 'carregando') {
        bootstrapFila.push(consumirContextoCruz); // reavaliado quando o bootstrap resolver
        return;
      }

      google.script.run
        .withSuccessHandler(onContextoCruzCarregado)
        .withFailureHandler(onErroCruz)
        .getContextoCruzSeguranca();
    }

    function mostrarCarregamentoCruz() {
      document.getElementById('cruz-carregando-spinner').classList.remove('hidden');
      document.getElementById('cruz-carregando-texto').textContent = 'Carregando Cruz Verde...';
      document.getElementById('cruz-carregando-texto').classList.remove('text-red-500');
      document.getElementById('cruz-carregando-texto').classList.add('text-brand-primary');
      document.getElementById('cruz-carregando').classList.remove('cruz-carregando-oculto');
    }

    function ocultarCarregamentoCruz() {
      document.getElementById('cruz-carregando').classList.add('cruz-carregando-oculto');
    }

    // Os botões "voltar" dos painéis levam pro mesmo lugar do ícone de casa.
    function fecharPainelCruz() {
      irParaHome();
    }

    /* ==========================================================================
       PAINEL RISK — Riscos Altos (planilha "Riscos Altos EHS")
       ========================================================================== */
    var riskDados = null;
    var riskCarregadoUmaVez = false;

    // Status são cores SEMÂNTICAS (bom / em curso / crítico), sempre acompanhadas
    // do rótulo em texto — nunca identificadas só pela cor.
    var RISK_STATUS_CORES = {
      'concluido': '#2e7d32',
      'andamento': '#0277bd',
      'atrasado': '#c62828'
    };

    function riskCorStatus(status) {
      var chave = String(status || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      return RISK_STATUS_CORES[chave] || '#64748b';
    }

    function abrirPainelRisk() {
      document.getElementById('secao-modulos').classList.add('hidden');
      document.getElementById('painel-cruz').classList.add('hidden');
      document.getElementById('painel-risk').classList.remove('hidden');

      // O feed lateral volta ao conteúdo da home (o feed de ocorrências é da Cruz).
      document.getElementById('feed-cruz-conteudo').classList.add('hidden');
      document.getElementById('feed-cruz-conteudo').classList.remove('flex');
      document.getElementById('feed-home-conteudo').classList.remove('hidden');
      document.getElementById('feed-lateral-titulo').textContent = 'Meu Feed';
      document.getElementById('feed-lateral-subtitulo').classList.add('hidden');

      marcarNavAtiva('nav-risk');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (riskCarregadoUmaVez) return;
      riskCarregadoUmaVez = true;

      google.script.run
        .withSuccessHandler(onRiscosCarregados)
        .withFailureHandler(onErroRisk)
        .getRiscosAltos();
    }

    function fecharPainelRisk() {
      irParaHome();
    }

    function onErroRisk(erro) {
      var texto = document.getElementById('risk-carregando-texto');
      texto.textContent = 'Erro ao carregar: ' + (erro && erro.message ? erro.message : erro);
      texto.classList.remove('text-brand-primary');
      texto.classList.add('text-red-500');
      var spinner = document.querySelector('#risk-carregando .cruz-spinner');
      if (spinner) spinner.classList.add('hidden');
      riskCarregadoUmaVez = false; // permite tentar de novo ao reabrir
    }

    function onRiscosCarregados(dados) {
      riskDados = dados;
      document.getElementById('risk-carregando').classList.add('hidden');
      document.getElementById('risk-conteudo').classList.remove('hidden');

      // O TOTAL É A SOMA DA COLUNA QUANTIDADE, não a contagem de linhas
      // (2026-07-29, pedido do usuário): o risco é o item físico. Uma linha
      // concluída com 30 na coluna G tira 30 do que falta, não 1.
      // dados.porStatus já vem pesado por quantidade do servidor.
      var total = dados.quantidadeTotal || 0;
      var concluidos = riskContarStatus(dados.porStatus, 'concluido');
      var andamento = riskContarStatus(dados.porStatus, 'andamento');
      var atrasados = riskContarStatus(dados.porStatus, 'atrasado');

      document.getElementById('risk-kpi-total').textContent = riskFormatarInteiro(total);
      document.getElementById('risk-kpi-concluido').textContent = riskFormatarInteiro(concluidos);
      document.getElementById('risk-kpi-concluido-pct').textContent =
        (total ? Math.round(concluidos / total * 100) : 0) + '% dos itens';
      document.getElementById('risk-kpi-andamento').textContent = riskFormatarInteiro(andamento);
      document.getElementById('risk-kpi-atrasado').textContent = riskFormatarInteiro(atrasados);
      document.getElementById('risk-kpi-orcamento').textContent = formatarMoedaCompacta(dados.orcamentoTotal || 0);

      // Sub-linha inverteu (era "N itens" sob a contagem de linhas): agora o
      // número grande é o item e a sub-linha diz de quantas linhas ele saiu.
      // Linha sem Quantidade preenchida soma 0 e some dos gráficos — é dito
      // aqui em vez de sumir calado.
      var linhas = dados.totalLinhas || dados.totalRiscos || 0;
      var semQtd = dados.linhasSemQuantidade || 0;
      var sub = document.getElementById('risk-kpi-quantidade');
      sub.textContent = riskFormatarInteiro(linhas) + (linhas === 1 ? ' linha' : ' linhas') +
        (semQtd ? ' · ' + semQtd + ' sem quantidade' : '');
      sub.setAttribute('title', semQtd
        ? semQtd + ' linha(s) estão com a coluna Quantidade vazia ou zerada, então não entram em nenhum total nem gráfico deste painel.'
        : 'Todas as linhas têm a coluna Quantidade preenchida.');

      riskRenderizarStatus(dados.porStatus, total);
      riskRenderizarBarras('risk-macrotema-lista', dados.porMacroTema);
      riskRenderizarBarras('risk-area-lista', dados.porArea);
      riskDesenharAvanco(dados.serieSemanal || []);
      riskPreencherFiltroStatus(dados.porStatus);
      riskRenderizarTabela('Todos');
    }

    // Soma entradas cujo status normalizado contém a chave, pra tolerar
    // variações de grafia/acento vindas da planilha ("Concluído", "CONCLUIDO").
    // O que é somado são QUANTIDADES (itens), não linhas — o mapa já vem pesado
    // do servidor. Ver somarEm_ no Code.js.
    function riskContarStatus(porStatus, chave) {
      var soma = 0;
      Object.keys(porStatus || {}).forEach(function (status) {
        var norm = status.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (norm.indexOf(chave) !== -1) soma += porStatus[status];
      });
      return soma;
    }

    function formatarMoedaCompacta(valor) {
      if (valor >= 1000000) return 'R$ ' + (valor / 1000000).toFixed(1).replace('.', ',') + ' mi';
      if (valor >= 1000) return 'R$ ' + Math.round(valor / 1000) + ' mil';
      return 'R$ ' + Math.round(valor);
    }

    function riskRenderizarStatus(porStatus, total) {
      var container = document.getElementById('risk-status-lista');
      if (!container) return;

      var linhas = Object.keys(porStatus || {})
        .map(function (s) { return { status: s, valor: porStatus[s] }; })
        .sort(function (a, b) { return b.valor - a.valor; });

      if (!linhas.length) {
        container.innerHTML = '<p class="text-slate-400 text-xs italic">Nenhum risco registrado.</p>';
        return;
      }

      container.innerHTML = linhas.map(function (l) {
        var pct = total ? (l.valor / total * 100) : 0;
        var cor = riskCorStatus(l.status);
        return '<div>' +
          '<div class="flex items-center justify-between text-xs mb-1">' +
            '<span class="inline-flex items-center gap-1.5 font-semibold text-slate-600">' +
              '<span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:' + cor + '"></span>' + l.status +
            '</span>' +
            '<span class="font-bold text-brand-primary">' + l.valor + ' <span class="text-slate-400 font-semibold">(' + pct.toFixed(0) + '%)</span></span>' +
          '</div>' +
          '<div class="h-2 rounded-full bg-slate-100 overflow-hidden">' +
            '<div class="h-full rounded-full" style="width:' + pct + '%;background:' + cor + '"></div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // Barras horizontais de uma série só (contagem por categoria) — cor única,
    // sem legenda: o rótulo de cada barra já identifica a categoria.
    function riskRenderizarBarras(idContainer, mapa) {
      var container = document.getElementById(idContainer);
      if (!container) return;

      var linhas = Object.keys(mapa || {})
        .map(function (k) { return { rotulo: k, valor: mapa[k] }; })
        .filter(function (l) { return l.rotulo && l.valor > 0; })
        .sort(function (a, b) { return b.valor - a.valor; });

      if (!linhas.length) {
        container.innerHTML = '<p class="text-slate-400 text-xs italic">Sem dados.</p>';
        return;
      }

      var maximo = linhas[0].valor;
      container.innerHTML = linhas.map(function (l) {
        var pct = maximo ? (l.valor / maximo * 100) : 0;
        return '<div class="flex items-center gap-2">' +
          '<span class="text-[10.5px] text-slate-600 w-32 shrink-0 truncate" title="' + l.rotulo + '">' + l.rotulo + '</span>' +
          '<div class="flex-1 h-4 rounded-sm bg-slate-50 overflow-hidden min-w-0">' +
            '<div class="h-full rounded-sm" style="width:' + pct + '%;background:#00a0dd"></div>' +
          '</div>' +
          '<span class="text-[10.5px] font-bold text-brand-primary w-6 text-right shrink-0">' + l.valor + '</span>' +
        '</div>';
      }).join('');
    }

    // Meta x Realizado acumulado. Duas séries no MESMO eixo (ambas são
    // "quantidade acumulada"), Meta como referência tracejada cinza.
    function riskDesenharAvanco(serie) {
      var svg = document.getElementById('risk-avanco-svg');
      if (!svg) return;

      if (!serie.length) {
        svg.innerHTML = '<text x="390" y="150" text-anchor="middle" font-size="13" fill="#94a3b8">Sem série semanal disponível</text>';
        return;
      }

      var largura = 780, altura = 300;
      var margemEsq = 44, margemDir = 14, margemTopo = 18, margemBase = 40;
      var larguraPlot = largura - margemEsq - margemDir;
      var alturaPlot = altura - margemTopo - margemBase;
      var eixoBase = margemTopo + alturaPlot;

      var maximo = 0;
      serie.forEach(function (p) {
        maximo = Math.max(maximo, p.meta || 0, p.realizado || 0);
      });
      var domMax = Math.max(maximo * 1.1, 10);

      function x(i) { return margemEsq + (serie.length === 1 ? larguraPlot / 2 : (i / (serie.length - 1)) * larguraPlot); }
      function y(v) { return eixoBase - (v / domMax) * alturaPlot; }

      var partes = [];
      var passo = Math.max(1, Math.ceil(domMax / 4 / 10) * 10);
      for (var marca = 0; marca <= domMax; marca += passo) {
        var yy = y(marca);
        partes.push('<line x1="' + margemEsq + '" y1="' + yy + '" x2="' + (margemEsq + larguraPlot) + '" y2="' + yy + '" stroke="#e2e8f0" stroke-width="1" />');
        partes.push('<text x="' + (margemEsq - 8) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="10" fill="#94a3b8">' + marca + '</text>');
      }

      var pontosMeta = serie.map(function (p, i) { return x(i) + ',' + y(p.meta || 0); }).join(' ');
      var pontosReal = serie.map(function (p, i) { return x(i) + ',' + y(p.realizado || 0); }).join(' ');

      partes.push('<polyline points="' + pontosMeta + '" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round" />');
      partes.push('<polyline points="' + pontosReal + '" fill="none" stroke="#00a0dd" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />');

      // Marcadores só no Realizado (a Meta é referência, não precisa de ponto a ponto).
      serie.forEach(function (p, i) {
        partes.push('<circle cx="' + x(i) + '" cy="' + y(p.realizado || 0) + '" r="3.5" fill="#00a0dd" stroke="#ffffff" stroke-width="1.5">' +
          '<title>' + p.semana + ' — Meta: ' + (p.meta || 0) + ' · Realizado: ' + (p.realizado || 0) + '</title></circle>');
      });

      // Rótulo do eixo X só a cada N semanas, pra não colidir.
      var salto = Math.max(1, Math.ceil(serie.length / 12));
      // Marcadores só no Realizado (a Meta é referência, não precisa de ponto a ponto).
      // Marcadores só no Realizado (a Meta é referência, não precisa de ponto a ponto).
      // Marcadores só no Realizado (a Meta é referência, não precisa de ponto a ponto).
      // Marcadores só no Realizado (a Meta é referência, não precisa de ponto a ponto).
      serie.forEach(function (p, i) {
        partes.push('<circle cx="' + x(i) + '" cy="' + y(p.realizado || 0) + '" r="3.5" fill="#00a0dd" stroke="#ffffff" stroke-width="1.5">' +
          '<title>' + p.semana + ' — Meta: ' + (p.meta || 0) + ' · Realizado: ' + (p.realizado || 0) + '</title></circle>');
      });

      // Rótulo do eixo X mostrando a data exata, mas com espaçamento (salto) para não colidir
      var mesesAbrev = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      var anoAtual = new Date().getFullYear(); 
      
      // Calcula o salto ideal para caberem no máximo ~10 rótulos no eixo X
      var salto = Math.max(1, Math.ceil(serie.length / 10));

      serie.forEach(function (p, i) {
        // Exibe apenas a cada N semanas, garantindo que o último ponto também apareça
        if (i % salto !== 0 && i !== serie.length - 1) return;

        // Extrai o número da semana da string (ex: "Semana 1" -> 1)
        var numSemana = parseInt(String(p.semana).replace(/\D/g, ''), 10) || (i + 1);
        
        // Calcula a data aproximada
        var dataSemana = new Date(anoAtual, 0, 1 + (numSemana - 1) * 7);
        
        var dia = String(dataSemana.getDate()).padStart(2, '0');
        var mes = mesesAbrev[dataSemana.getMonth()];
        var rotulo = dia + '/' + mes;
        
        partes.push('<text x="' + x(i) + '" y="' + (eixoBase + 16) + '" text-anchor="middle" font-size="9" font-weight="600" fill="#64748b">' + rotulo + '</text>');
      });

      partes.push('<line x1="' + margemEsq + '" y1="' + eixoBase + '" x2="' + (margemEsq + larguraPlot) + '" y2="' + eixoBase + '" stroke="#cbd5e1" stroke-width="1" />');
      svg.innerHTML = partes.join('');
       }

    function riskPreencherFiltroStatus(porStatus) {
      var select = document.getElementById('risk-filtro-status');
      if (!select) return;
      select.innerHTML = '<option value="Todos">Todos os status</option>';
      Object.keys(porStatus || {}).sort().forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        select.appendChild(opt);
      });
      select.onchange = function () { riskRenderizarTabela(select.value); };
    }

    // Separador de milhar pt-BR. A Quantidade é contagem de itens, então nunca
    // tem casa decimal — arredonda pra não herdar sujeira da planilha.
    function riskFormatarInteiro(valor) {
      return (Math.round(Number(valor) || 0)).toLocaleString('pt-BR');
    }

    function riskRenderizarTabela(statusFiltro) {
      var corpo = document.getElementById('risk-tabela-corpo');
      if (!corpo || !riskDados) return;

      var lista = (riskDados.riscos || []).filter(function (r) {
        return statusFiltro === 'Todos' || r.status === statusFiltro;
      });

      if (!lista.length) {
        corpo.innerHTML = '<tr><td class="py-3 text-slate-400 italic" colspan="7">Nenhum risco neste filtro.</td></tr>';
        return;
      }

      corpo.innerHTML = lista.map(function (r) {
        var cor = riskCorStatus(r.status);
        return '<tr class="align-top">' +
          '<td class="py-2 pr-2 text-slate-600 whitespace-nowrap">' + (r.area || '—') + '</td>' +
          '<td class="py-2 pr-2 text-slate-600">' + (r.macroTema || '—') + '</td>' +
          '<td class="py-2 pr-2 text-slate-600 max-w-[22rem]">' + (r.risco || '—') + '</td>' +
          '<td class="py-2 pr-2 text-slate-500 max-w-[20rem]">' + (r.planoAcao || '—') + '</td>' +
          '<td class="py-2 pr-2 text-right font-semibold text-slate-600 whitespace-nowrap tabular-nums">' + (r.quantidade ? riskFormatarInteiro(r.quantidade) : '—') + '</td>' +
          '<td class="py-2 pr-2 text-right font-semibold text-brand-primary whitespace-nowrap">' + (r.orcamento ? formatarMoedaCompacta(r.orcamento) : '—') + '</td>' +
          '<td class="py-2 pr-2 whitespace-nowrap">' +
            '<span class="inline-flex items-center gap-1.5 font-semibold" style="color:' + cor + '">' +
              '<span class="w-2 h-2 rounded-full shrink-0" style="background:' + cor + '"></span>' + (r.status || '—') +
            '</span>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function onContextoCruzCarregado(ctx) {
      cruzDadosAno = {
        departamentos: ctx.departamentos,
        porDepartamentoMes: ctx.porDepartamentoMes,
        totaisPorDepartamentoMes: ctx.totaisPorDepartamentoMes,
        ocorrenciasPorDepartamentoMes: ctx.ocorrenciasPorDepartamentoMes,
        totaisTagSaf: ctx.totaisTagSaf,
        tagSafety: ctx.tagSafety
      };
      preencherSelectAno(ctx.anos, ctx.anoAtual);
      preencherSelectMes(ctx.mesAtual);
      preencherSelectDepartamento(ctx.departamentos);
      preencherSelectAreaPiramide(ctx.departamentos);
      preencherSelectPeriodoPiramide();
      renderizarCruzLocal();
      renderizarPiramideLocal();
      renderizarVisaoGeral();
    }

    function preencherSelectAno(anos, atual) {
      var select = document.getElementById('cruz-select-ano');
      select.innerHTML = '';
      (anos && anos.length ? anos : [atual]).forEach(function (ano) {
        var opt = document.createElement('option');
        opt.value = ano;
        opt.textContent = ano;
        if (ano === atual) opt.selected = true;
        select.appendChild(opt);
      });
      select.onchange = onAnoCruzAlterado;
    }

    function preencherSelectMes(atual) {
      var select = document.getElementById('cruz-select-mes');
      select.innerHTML = '';
      CRUZ_MESES.forEach(function (nome, indice) {
        var opt = document.createElement('option');
        opt.value = indice + 1;
        opt.textContent = nome;
        if (indice + 1 === atual) opt.selected = true;
        select.appendChild(opt);
      });
      select.onchange = renderizarCruzLocal;
    }

    function preencherSelectDepartamento(departamentos, valorSelecionado) {
      var select = document.getElementById('cruz-select-departamento');
      select.innerHTML = '<option value="Todas">Todas as áreas</option>';
      (departamentos || []).forEach(function (departamento) {
        var opt = document.createElement('option');
        opt.value = departamento;
        opt.textContent = departamento;
        select.appendChild(opt);
      });
      if (valorSelecionado === 'Todas' || (departamentos || []).indexOf(valorSelecionado) !== -1) {
        select.value = valorSelecionado;
      }
      select.onchange = renderizarCruzLocal;
    }

    // Filtro PRÓPRIO da Pirâmide (Área + Período) — independente do filtro de
    // Área/Mês da Cruz acima, não interagem entre si. Mesma lista de áreas
    // (já deduplicada no servidor), mas seleção separada.
    function preencherSelectAreaPiramide(departamentos, valorSelecionado) {
      var select = document.getElementById('piramide-select-area');
      select.innerHTML = '<option value="Todas">Todas as áreas</option>';
      (departamentos || []).forEach(function (departamento) {
        var opt = document.createElement('option');
        opt.value = departamento;
        opt.textContent = departamento;
        select.appendChild(opt);
      });
      if (valorSelecionado === 'Todas' || (departamentos || []).indexOf(valorSelecionado) !== -1) {
        select.value = valorSelecionado;
      }
      select.onchange = renderizarPiramideLocal;
    }

    // "Todo o período" é o padrão ao carregar a página — soma os 12 meses do
    // Ano corrente. Usuário pode trocar pra um mês específico depois.
    function preencherSelectPeriodoPiramide() {
      var select = document.getElementById('piramide-select-periodo');
      select.innerHTML = '<option value="todos">Todo o período</option>';
      CRUZ_MESES.forEach(function (nome, indice) {
        var opt = document.createElement('option');
        opt.value = indice + 1;
        opt.textContent = nome;
        select.appendChild(opt);
      });
      select.onchange = renderizarPiramideLocal;
    }

    function onAnoCruzAlterado() {
      var ano = Number(document.getElementById('cruz-select-ano').value);
      var departamentoAtual = document.getElementById('cruz-select-departamento').value;
      var areaPiramideAtual = document.getElementById('piramide-select-area').value;
      renderizarEsqueletoCruz();
      mostrarCarregamentoCruz();
      google.script.run
        .withSuccessHandler(function (pacote) {
          cruzDadosAno = pacote;
          preencherSelectDepartamento(pacote.departamentos, departamentoAtual);
          preencherSelectAreaPiramide(pacote.departamentos, areaPiramideAtual);
          renderizarCruzLocal();
          renderizarPiramideLocal();
          renderizarVisaoGeral();
        })
        .withFailureHandler(onErroCruz)
        .getCruzAnoCompleto(ano);
    }

    var cruzOcorrenciasMes = [];
    var cruzDiaFiltrado = null;

    function renderizarCruzLocal() {
      var ano = Number(document.getElementById('cruz-select-ano').value);
      var mes = Number(document.getElementById('cruz-select-mes').value);
      var departamento = document.getElementById('cruz-select-departamento').value;

      var dias = (cruzDadosAno && cruzDadosAno.porDepartamentoMes[departamento] && cruzDadosAno.porDepartamentoMes[departamento][mes]) || {};
      var ocorrencias = (cruzDadosAno && cruzDadosAno.ocorrenciasPorDepartamentoMes[departamento] && cruzDadosAno.ocorrenciasPorDepartamentoMes[departamento][mes]) || [];

      renderizarCruz(ano, mes, dias);

      cruzOcorrenciasMes = ocorrencias;
      cruzDiaFiltrado = null;
      renderizarFeedOcorrencias();
    }

    // VISÃO GERAL — substitui o Pareto (2026-07-26), espelhando a aba "Visão Geral"
    // da planilha Cruz Verde_RC 2026: tabelas com os 12 meses do Ano corrente lado a
    // lado (não um snapshot de 1 mês). Não usa o filtro Área/Período da Pirâmide de
    // propósito — o objetivo aqui é ver o ano inteiro. Tudo já vem de
    // cruzDadosAno.totaisPorDepartamentoMes, carregado junto com o resto do pacote.
    var VISAO_GERAL_MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    function renderizarVisaoGeral() {
      var totaisGeral = (cruzDadosAno && cruzDadosAno.totaisPorDepartamentoMes && cruzDadosAno.totaisPorDepartamentoMes['Todas']) || {};
      var areas = (cruzDadosAno && cruzDadosAno.departamentos) || [];
      var totaisPorArea = (cruzDadosAno && cruzDadosAno.totaisPorDepartamentoMes) || {};

      var corpoCruz = document.getElementById('visao-geral-cruz-corpo');
      if (!corpoCruz) return;

      var totalAno = { cinza: 0, azul: 0, amarelo: 0, laranja: 0, vermelho: 0 };
      var linhasCruz = [];

      for (var mes = 1; mes <= 12; mes++) {
        var t = totaisGeral[mes] || { cinza: 0, azul: 0, amarelo: 0, laranja: 0, vermelho: 0 };
        ['cinza', 'azul', 'amarelo', 'laranja', 'vermelho'].forEach(function (campo) { totalAno[campo] += t[campo] || 0; });

        linhasCruz.push(
          '<tr><td class="py-1 pl-2 pr-1 text-slate-600">' + VISAO_GERAL_MESES_ABREV[mes - 1] + '</td>' +
          '<td class="py-1 px-1 text-center text-slate-600">' + (t.cinza || 0) + '</td>' +
          '<td class="py-1 px-1 text-center text-slate-600">' + (t.azul || 0) + '</td>' +
          '<td class="py-1 px-1 text-center text-slate-600">' + (t.amarelo || 0) + '</td>' +
          '<td class="py-1 px-1 text-center text-slate-600">' + (t.laranja || 0) + '</td>' +
          '<td class="py-1 px-1 text-center text-slate-600">' + (t.vermelho || 0) + '</td></tr>'
        );
      }

      linhasCruz.push(
        '<tr class="font-bold text-brand-primary bg-brand-bg/60"><td class="py-1.5 pl-2 pr-1">Total</td>' +
        '<td class="py-1.5 px-1 text-center">' + totalAno.cinza + '</td>' +
        '<td class="py-1.5 px-1 text-center">' + totalAno.azul + '</td>' +
        '<td class="py-1.5 px-1 text-center">' + totalAno.amarelo + '</td>' +
        '<td class="py-1.5 px-1 text-center">' + totalAno.laranja + '</td>' +
        '<td class="py-1.5 px-1 text-center">' + totalAno.vermelho + '</td></tr>'
      );

      corpoCruz.innerHTML = linhasCruz.join('');

      // Gráficos da faixa 2 — mesmo escopo (ano inteiro), mesmo ponto de entrada.
      // O detalhamento por classificação (A/B/C) e por área saiu daqui e virou
      // esses 3 gráficos, pra não repetir o mesmo número em dois lugares.
      renderizarTagSafety();
      renderizarHeatmapAreas('fai-heatmap', 'fai-heatmap-max', areas, totaisPorArea, 'amarelo', FAI_RAMPA_);
      renderizarHeatmapAreas('rec-heatmap', 'rec-heatmap-max', areas, totaisPorArea, 'laranja', REC_RAMPA_);
    }

    /* ==========================================================================
       GRÁFICOS DA FAIXA 2 (trazidos da aba "Visão Geral" da planilha)
       Todos cobrem o ano inteiro do Ano selecionado; não usam Mês/Área.
       ========================================================================== */

    // Ramps sequenciais (claro -> escuro, UM hue só). O hue de cada um é o mesmo
    // da categoria correspondente na Cruz: âmbar = Primeiros Socorros, laranja =
    // Acidente sem afastamento. Ramp sequencial (e não 12 cores categóricas para
    // os 12 meses) porque o dado é magnitude, e 12 hues seria ilegível.
    var FAI_RAMPA_ = ['#fff8e6', '#7c4a03'];
    var REC_RAMPA_ = ['#fff4e6', '#9a3412'];

    // Rampa sequencial do TAG Safety. Os 5 passos foram VALIDADOS com
    // scripts/validate_palette.js --ordinal (L monótona, ΔL >= 0.06, hue único,
    // extremo claro 2,10:1 contra o branco). Não trocar passo no olho: rodar de
    // novo o validador. Os dois do meio são exatamente os tons de Condição e
    // Comportamento Inseguro da Pirâmide, o que amarra os dois cards.
    var TAG_SAFETY_COR_BARRA_ = '#7c3aed';

    // Rampa do heatmap Área × Mês: violeta, no formato de EXTREMOS (claro, escuro)
    // porque corSequencial_ interpola entre os dois — mesmo formato de
    // FAI_RAMPA_/REC_RAMPA_. Hue escolhido pra bater com a Condição/Comportamento
    // Inseguro da Pirâmide, amarrando os dois cards. A monotonia de luminosidade
    // é garantida pela própria interpolação, e a célula zerada tem tratamento à
    // parte (cinza), então o extremo claro nunca precisa se distinguir do vazio.
    var TAG_SAFETY_RAMPA_AREA_ = ['#efe9fd', '#4c1d95'];

    function hexParaRgb_(hex) {
      return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
      };
    }

    function corSequencial_(rampa, t) {
      var ini = hexParaRgb_(rampa[0]);
      var fim = hexParaRgb_(rampa[1]);
      var f = Math.max(0, Math.min(1, t));
      return {
        r: Math.round(ini.r + (fim.r - ini.r) * f),
        g: Math.round(ini.g + (fim.g - ini.g) * f),
        b: Math.round(ini.b + (fim.b - ini.b) * f)
      };
    }

    function luminanciaRelativa_(cor) {
      var canais = [cor.r, cor.g, cor.b].map(function (v) {
        var c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
    }

    // Escolhe texto claro ou escuro pelo contraste REAL contra o fundo da célula,
    // em vez de um limiar fixo no ramp (que quebra se o ramp mudar).
    function corTextoSobre_(fundo) {
      var lum = luminanciaRelativa_(fundo);
      var contrasteBranco = 1.05 / (lum + 0.05);
      return contrasteBranco >= 4 ? '#ffffff' : '#1f1503';
    }

    /**
     * TAG SAFETY — volume mensal + Área × Mês (coluna D da aba).
     * Escopo: ano inteiro do filtro de Ano, igual à Visão Geral (não usa Mês/Área).
     */
    function renderizarTagSafety() {
      var alvoVazio = document.getElementById('tagsafety-vazio');
      var alvoMensal = document.getElementById('tagsafety-mensal');
      var alvoArea = document.getElementById('tagsafety-area-heatmap');
      var rodape = document.getElementById('tagsafety-rodape');
      if (!alvoMensal || !alvoArea) return;

      var dados = cruzDadosAno && cruzDadosAno.tagSafety;

      if (!dados || dados.erro) {
        if (alvoVazio) {
          alvoVazio.innerHTML = '<p class="text-xs text-slate-400 italic py-6 text-center">' +
            (dados && dados.erro ? 'Fonte indisponível: ' + escaparHtml(dados.erro) : 'Fonte não configurada.') + '</p>';
        }
        alvoMensal.innerHTML = '';
        alvoArea.innerHTML = '';
        if (rodape) rodape.textContent = '';
        return;
      }
      if (alvoVazio) alvoVazio.innerHTML = '';

      // ---- Volume mensal ------------------------------------------------
      var porMes = dados.porMes || [];
      var maxMes = Math.max.apply(null, porMes.concat([1]));
      var indiceMax = porMes.indexOf(maxMes);

      var barras = '<div class="flex items-end gap-[3px] h-20">';
      for (var m = 0; m < 12; m++) {
        var v = porMes[m] || 0;
        var alturaPct = maxMes > 0 ? (v / maxMes) * 100 : 0;
        // Rótulo direto SÓ no mês de pico (o resto tem tooltip) — número em
        // cima de toda barra vira ruído com 12 delas.
        var rotulo = (m === indiceMax && v > 0)
          ? '<span class="text-[9px] font-extrabold text-brand-primary leading-none mb-0.5">' + formatarInteiroBr_(v) + '</span>'
          : '';
        barras += '<div class="flex-1 flex flex-col items-center justify-end h-full" ' +
          'title="' + CRUZ_MESES[m] + ': ' + formatarInteiroBr_(v) + ' apontamento' + (v === 1 ? '' : 's') + '">' +
          rotulo +
          '<div class="w-full rounded-t-[3px]" style="height:' + Math.max(alturaPct, v > 0 ? 3 : 0) + '%;' +
          'background:' + (v > 0 ? TAG_SAFETY_COR_BARRA_ : 'transparent') + ';min-height:' + (v > 0 ? '3px' : '0') + '"></div>' +
          '</div>';
      }
      barras += '</div><div class="flex gap-[3px] mt-1">';
      for (var mm = 0; mm < 12; mm++) {
        barras += '<div class="flex-1 text-center text-[9px] text-slate-400">' + VISAO_GERAL_MESES_ABREV[mm] + '</div>';
      }
      barras += '</div>';
      alvoMensal.innerHTML = barras;

      // ---- Área × mês (coluna D) -----------------------------------------
      var porAreaMes = dados.porAreaMes || {};
      desenharHeatmapAreaMes_(
        'tagsafety-area-heatmap',
        'tagsafety-area-max',
        Object.keys(porAreaMes).map(function (area) {
          return { area: area, valores: porAreaMes[area] };
        }),
        TAG_SAFETY_RAMPA_AREA_,
        'Nenhum apontamento com área preenchida.'
      );

      // ---- Rodapé --------------------------------------------------------
      if (rodape) {
        var comArea = Object.keys(porAreaMes).reduce(function (a, k) {
          return a + porAreaMes[k].reduce(function (x, y) { return x + y; }, 0);
        }, 0);
        var texto = formatarInteiroBr_(dados.total || 0) + ' apontamentos no ano';
        // A folga entre o total e o que tem área preenchida é informação, não
        // erro: mostra quanta resposta veio sem a coluna D.
        if (dados.total > comArea) {
          texto += ' · ' + formatarInteiroBr_(dados.total - comArea) + ' sem área preenchida';
        }
        rodape.textContent = texto;
      }
    }

    function formatarInteiroBr_(valor) {
      return (Math.round(Number(valor) || 0)).toLocaleString('pt-BR');
    }

    // Mapa de calor Área × Mês de um campo (amarelo = FAI, laranja = REC).
    // Só entram áreas com pelo menos uma ocorrência no ano — senão a tabela fica
    // dominada por linhas zeradas.
    function renderizarHeatmapAreas(idContainer, idMax, areas, totaisPorArea, campo, rampa) {
      var linhas = areas.map(function (area) {
        var totaisMeses = totaisPorArea[area] || {};
        var valores = [];
        for (var mes = 1; mes <= 12; mes++) {
          valores.push((totaisMeses[mes] && totaisMeses[mes][campo]) || 0);
        }
        return { area: area, valores: valores };
      });

      desenharHeatmapAreaMes_(idContainer, idMax, linhas, rampa, 'Nenhuma ocorrência registrada no ano.');
    }

    /**
     * Desenho compartilhado do mapa de calor Área × Mês. Recebe as linhas já no
     * formato { area, valores[12] } — quem chama monta a partir da SUA estrutura,
     * o desenho é o mesmo. Filtra área zerada, ordena por total e escala a cor
     * pelo máximo da própria tabela.
     */
    function desenharHeatmapAreaMes_(idContainer, idMax, linhasBrutas, rampa, textoVazio) {
      var container = document.getElementById(idContainer);
      if (!container) return;

      var linhas = linhasBrutas.map(function (l) {
        return {
          area: l.area,
          valores: l.valores,
          total: l.valores.reduce(function (a, b) { return a + b; }, 0)
        };
      }).filter(function (l) { return l.total > 0; })
        .sort(function (a, b) { return b.total - a.total; });

      var maximo = 0;
      linhas.forEach(function (l) {
        l.valores.forEach(function (v) { if (v > maximo) maximo = v; });
      });

      var elMax = document.getElementById(idMax);
      if (elMax) elMax.textContent = maximo || '+';

      if (!linhas.length) {
        container.innerHTML = '<p class="text-slate-400 text-xs italic py-3">' + escaparHtml(textoVazio) + '</p>';
        return;
      }

      // table-fixed + colgroup: a coluna de Área fica com largura fixa (nome longo
      // trunca com reticências, nome completo no title) e os 12 meses dividem o
      // resto por igual — assim a tabela cabe na coluna do grid sem scroll lateral.
      var colgroup = '<colgroup><col style="width:34%"><col span="12" style="width:5%"><col style="width:6%"></colgroup>';

      var cabecalho = '<tr><th class="text-left font-bold text-slate-400 uppercase text-[9px] pb-1 pr-1.5">Área</th>' +
        VISAO_GERAL_MESES_ABREV.map(function (m) {
          return '<th class="font-bold text-slate-400 uppercase text-[7.5px] pb-1 text-center">' + m + '</th>';
        }).join('') +
        '<th class="font-bold text-slate-400 uppercase text-[8.5px] pb-1 pl-1 text-right">Tot</th></tr>';

      var corpo = linhas.map(function (l) {
        var celulas = l.valores.map(function (v, i) {
          var dica = escaparHtml(l.area) + ' — ' + CRUZ_MESES[i] + ': ' + v;
          if (!v) {
            return '<td class="px-px py-0.5"><div class="h-5 rounded-sm bg-slate-50" title="' + dica + '"></div></td>';
          }
          var t = maximo ? v / maximo : 0;
          var fundo = corSequencial_(rampa, 0.2 + t * 0.8);
          var fundoCss = 'rgb(' + fundo.r + ',' + fundo.g + ',' + fundo.b + ')';
          return '<td class="px-px py-0.5"><div class="h-5 rounded-sm flex items-center justify-center text-[9px] font-bold" ' +
            'style="background:' + fundoCss + ';color:' + corTextoSobre_(fundo) + '" title="' + dica + '">' + v + '</div></td>';
        }).join('');

        return '<tr><td class="text-[9.5px] text-slate-600 pr-1.5 truncate" title="' + escaparHtml(l.area) + '">' + escaparHtml(l.area) + '</td>' +
          celulas +
          '<td class="text-[9.5px] font-bold text-brand-primary pl-1 text-right">' + l.total + '</td></tr>';
      }).join('');

      container.innerHTML = '<table class="w-full table-fixed border-collapse">' + colgroup +
        '<thead>' + cabecalho + '</thead><tbody>' + corpo + '</tbody></table>';
    }

    // Pirâmide tem seletor próprio de Departamento (coluna I), independente do
    // filtro de Área (coluna J) da Cruz/Pareto — respeita Mês em comum com eles.
    // Pirâmide é ESTÁTICA — sem filtro de Área/Departamento, sempre o total geral do mês.
    // Filtro próprio da Pirâmide: "todos" soma os 12 meses do Ano corrente.
    var PIRAMIDE_CAMPOS_SOMA_ = ['vermelho', 'laranja', 'amarelo', 'azul', 'azulA', 'azulB', 'azulC', 'cinza', 'verde', 'total'];

    function somarTotaisTodosMeses_(totaisPorMes) {
      var soma = { vermelho: 0, laranja: 0, amarelo: 0, azul: 0, azulA: 0, azulB: 0, azulC: 0, cinza: 0, verde: 0, total: 0 };
      for (var mes = 1; mes <= 12; mes++) {
        var doMes = totaisPorMes[mes];
        if (!doMes) continue;
        PIRAMIDE_CAMPOS_SOMA_.forEach(function (campo) { soma[campo] += doMes[campo] || 0; });
      }
      return soma;
    }

    function somarTagSafTodosMeses_(tagSafPorMes) {
      var soma = { condicaoInsegura: 0, comportamentoInseguro: 0 };
      for (var mes = 1; mes <= 12; mes++) {
        var doMes = tagSafPorMes[mes];
        if (!doMes) continue;
        soma.condicaoInsegura += doMes.condicaoInsegura || 0;
        soma.comportamentoInseguro += doMes.comportamentoInseguro || 0;
      }
      return soma;
    }

    function renderizarPiramideLocal() {
      var area = document.getElementById('piramide-select-area').value;
      var periodoBruto = document.getElementById('piramide-select-periodo').value;
      var periodo = periodoBruto === 'todos' ? 'todos' : Number(periodoBruto);
      renderizarPiramideSeguranca(area, periodo);
    }

    /**
     * @param {string} [prefixo] prefixo dos ids do SVG alvo. A pirâmide da home é
     *   um clone do mesmo SVG com todos os ids prefixados ('home-'), então o
     *   mesmo renderizador serve as duas — não há uma segunda cópia da lógica.
     */
    function renderizarPiramideSeguranca(area, periodo, prefixo) {
      prefixo = prefixo || '';
      var totaisPorMes = (cruzDadosAno && cruzDadosAno.totaisPorDepartamentoMes && cruzDadosAno.totaisPorDepartamentoMes[area]) || {};
      var somaAno = periodo === 'todos'
        ? somarTotaisTodosMeses_(totaisPorMes)
        : (totaisPorMes[periodo] || { vermelho: 0, laranja: 0, amarelo: 0, azulA: 0, azulB: 0, azulC: 0, cinza: 0, total: 0 });

      var tagSafPorMes = (cruzDadosAno && cruzDadosAno.totaisTagSaf && cruzDadosAno.totaisTagSaf[area]) || {};
      var tagSaf = periodo === 'todos'
        ? somarTagSafTodosMeses_(tagSafPorMes)
        : (tagSafPorMes[periodo] || { condicaoInsegura: 0, comportamentoInseguro: 0 });

      animarNumeroSvg(prefixo + 'piramide-condicao-insegura-svg', tagSaf.condicaoInsegura);
      animarNumeroSvg(prefixo + 'piramide-comportamento-inseguro-svg', tagSaf.comportamentoInseguro);
      atualizarTituloFatia(prefixo + 'piramide-titulo-condicao-insegura', 'Condição Insegura', tagSaf.condicaoInsegura);
      atualizarTituloFatia(prefixo + 'piramide-titulo-comportamento-inseguro', 'Comportamento Inseguro', tagSaf.comportamentoInseguro);

      animarNumeroSvg(prefixo + 'piramide-fatalidade-svg', 0);
      animarNumeroSvg(prefixo + 'piramide-debilitacao-svg', 0);
      animarNumeroSvg(prefixo + 'piramide-com-afastamento-svg', somaAno.vermelho);
      animarNumeroSvg(prefixo + 'piramide-sem-afastamento-svg', somaAno.laranja);
      animarNumeroSvg(prefixo + 'piramide-primeiros-socorros-svg', somaAno.amarelo);
      animarNumeroSvg(prefixo + 'piramide-quase-a-svg', somaAno.azulA);
      animarNumeroSvg(prefixo + 'piramide-quase-b-svg', somaAno.azulB);
      animarNumeroSvg(prefixo + 'piramide-quase-c-svg', somaAno.azulC);
      animarNumeroSvg(prefixo + 'piramide-total-geral', somaAno.total);
      animarNumeroSvg(prefixo + 'piramide-incendio', somaAno.cinza);

      // 'todos' cobre o ano carregado inteiro — vale tanto pro painel quanto pra home,
      // que sempre chama com 'todos'.
      var rotuloTotal = document.getElementById(prefixo + 'piramide-total-rotulo');
      if (rotuloTotal) {
        rotuloTotal.textContent = periodo === 'todos'
          ? 'Total de ocorrências no ano:'
          : ('Total de ocorrências em ' + CRUZ_MESES[periodo - 1] + ':');
      }

      atualizarTituloFatia(prefixo + 'piramide-titulo-fatalidade', 'Fatalidade', 0);
      atualizarTituloFatia(prefixo + 'piramide-titulo-debilitacao', 'Debilitação', 0);
      atualizarTituloFatia(prefixo + 'piramide-titulo-com-afastamento', 'Acidente com afastamento', somaAno.vermelho);
      atualizarTituloFatia(prefixo + 'piramide-titulo-sem-afastamento', 'Acidente sem afastamento', somaAno.laranja);
      atualizarTituloFatia(prefixo + 'piramide-titulo-primeiros-socorros', 'Primeiros Socorros', somaAno.amarelo);
      atualizarTituloFatia(prefixo + 'piramide-titulo-quase-a', 'Quase Acidente A', somaAno.azulA);
      atualizarTituloFatia(prefixo + 'piramide-titulo-quase-b', 'Quase Acidente B', somaAno.azulB);
      atualizarTituloFatia(prefixo + 'piramide-titulo-quase-c', 'Quase Acidente C', somaAno.azulC);
    }

    function atualizarTituloFatia(id, rotulo, valor) {
      var el = document.getElementById(id);
      if (el) el.textContent = rotulo + ': ' + valor;
    }

    // Anima o número de 0 (ou do valor anterior) até o valor final, em vez de trocar de golpe.
    /** Separador de milhar pt-BR. Os dois níveis de baixo da pirâmide vêm da
     *  base TAG-SAF e chegam na casa dos 28 mil — sem separador não se lê. */
    function formatarNumeroSvg_(valor) {
      return (Number(valor) || 0).toLocaleString('pt-BR');
    }

    function animarNumeroSvg(id, valorFinal) {
      var el = document.getElementById(id);
      if (!el) return;

      // ATENÇÃO: o valor de partida vem de data-valor, NÃO do textContent.
      // Desde que os números passaram a ser exibidos formatados, o textContent
      // é "28.084" e Number() nele daria 28,084.
      //
      // data-valor acompanha o número EXIBIDO a cada quadro, não o alvo. Se
      // guardasse o alvo já na largada, trocar de filtro antes dos 650ms faria
      // a próxima animação partir do alvo anterior em vez do número que está
      // na tela, e o contador daria um salto visível.
      var valorInicial = Number(el.getAttribute('data-valor')) || 0;
      valorFinal = Number(valorFinal) || 0;

      if (valorInicial === valorFinal) {
        el.setAttribute('data-valor', valorFinal);
        el.textContent = formatarNumeroSvg_(valorFinal);
        return;
      }

      var inicio = null;
      var duracao = 650;

      function passo(timestamp) {
        if (!inicio) inicio = timestamp;
        var progresso = Math.min((timestamp - inicio) / duracao, 1);
        var suavizado = 1 - Math.pow(1 - progresso, 3); // ease-out cúbico
        var atual = Math.round(valorInicial + (valorFinal - valorInicial) * suavizado);
        el.setAttribute('data-valor', atual);
        el.textContent = formatarNumeroSvg_(atual);
        if (progresso < 1) requestAnimationFrame(passo);
      }

      requestAnimationFrame(passo);
    }

    // Os três modos do feed (dia da Cruz, região do boneco, responsável do ATS)
    // são MUTUAMENTE EXCLUSIVOS: entrar num sai dos outros, senão o feed
    // mostraria um conteúdo com o subtítulo de outro.
    function filtrarFeedPorDia(dia) {
      bonecoFeedAtivo_ = false;
      atsFeedAtivo_ = false;
      cruzDiaFiltrado = dia;
      renderizarFeedOcorrencias();
    }

    function limparFiltroDiaCruz() {
      bonecoFeedAtivo_ = false; // o mesmo botão fecha os três modos
      atsFeedAtivo_ = false;
      cruzDiaFiltrado = null;
      renderizarFeedOcorrencias();
    }

    function renderizarFeedOcorrencias() {
      if (bonecoFeedAtivo_) { renderizarFeedBoneco_(); return; }
      if (atsFeedAtivo_) { renderizarFeedAts_(); return; }

      var lista = document.getElementById('cruz-feed-lista');
      var vazio = document.getElementById('cruz-feed-vazio');
      var subtitulo = document.getElementById('cruz-feed-subtitulo');
      var botaoLimpar = document.getElementById('cruz-feed-limpar-filtro');
      var mesNome = CRUZ_MESES[Number(document.getElementById('cruz-select-mes').value) - 1];
      
      var itens = cruzDiaFiltrado
        ? cruzOcorrenciasMes.filter(function (o) { return o.dia === cruzDiaFiltrado; })
        : cruzOcorrenciasMes;

      subtitulo.textContent = cruzDiaFiltrado
        ? ('Dia ' + cruzDiaFiltrado + ' de ' + mesNome)
        : ('Mês inteiro — ' + mesNome);

      botaoLimpar.classList.toggle('hidden', !cruzDiaFiltrado);
      botaoLimpar.classList.toggle('flex', !!cruzDiaFiltrado);
      lista.innerHTML = '';

      if (!itens.length) {
        vazio.classList.remove('hidden');
        return;
      }
      vazio.classList.add('hidden');

      itens.forEach(function (ocorrencia) {
        var card = document.createElement('div');
        card.className = 'flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-brand-secondary/30 hover:shadow-sm transition-all duration-200';

        var bolinha = document.createElement('span');
        bolinha.className = 'w-2.5 h-2.5 rounded-full mt-1 shrink-0';
        bolinha.style.backgroundColor = CRUZ_CORES_HEX[ocorrencia.cor] || CRUZ_CORES_HEX.verde;

        var corpo = document.createElement('div');
        corpo.className = 'flex-1 min-w-0';

        var cabecalho = document.createElement('div');
        cabecalho.className = 'flex items-center justify-between gap-2';

        var diaLabel = document.createElement('span');
        diaLabel.className = 'text-xs font-bold text-brand-primary';
        diaLabel.textContent = 'Dia ' + ocorrencia.dia;

        var depLabel = document.createElement('span');
        depLabel.className = 'text-[10px] font-bold uppercase text-slate-400 truncate ml-2';
        depLabel.textContent = ocorrencia.departamento || '';

        cabecalho.appendChild(diaLabel);
        cabecalho.appendChild(depLabel);

        var descricao = document.createElement('p');
        descricao.className = 'text-xs text-slate-500 mt-1 leading-snug';
        descricao.textContent = ocorrencia.descricao;

        corpo.appendChild(cabecalho);
        corpo.appendChild(descricao);

        card.appendChild(bolinha);
        card.appendChild(corpo);
        lista.appendChild(card);
      });
    }

    function calcularLayoutCruz(diasNoMes) {
      var RECUO_LATERAL = 2;
      var celulas = [];

      function celulaDia(dia) {
        return (dia <= diasNoMes) ? { dia: dia } : { vazio: true };
      }
      function preencherEspacamento(qtd) {
        for (var i = 0; i < qtd; i++) celulas.push({ vazioEstrutural: true });
      }

      preencherEspacamento(RECUO_LATERAL);
      celulas.push(celulaDia(1), celulaDia(2), celulaDia(3));
      preencherEspacamento(RECUO_LATERAL);

      preencherEspacamento(RECUO_LATERAL);
      celulas.push(celulaDia(4), celulaDia(5), celulaDia(6));
      preencherEspacamento(RECUO_LATERAL);

      for (var dia = 7; dia <= 27; dia++) {
        celulas.push(celulaDia(dia));
      }

      preencherEspacamento(RECUO_LATERAL);
      celulas.push(celulaDia(28), celulaDia(29), celulaDia(30));
      preencherEspacamento(RECUO_LATERAL);

      preencherEspacamento(RECUO_LATERAL);
      celulas.push(celulaDia(31), { vazio: true }, { vazio: true });
      preencherEspacamento(RECUO_LATERAL);

      return celulas;
    }

    function renderizarEsqueletoCruz() {
      var grid = document.getElementById('cruz-grid');
      grid.innerHTML = '';
      var celulas = calcularLayoutCruz(31);

      celulas.forEach(function (info, indice) {
        var celula = document.createElement('div');
        if (info.vazioEstrutural) {
          celula.className = 'aspect-square w-full';
        } else {
          celula.className = 'aspect-square rounded-2xl cruz-celula-esqueleto w-full';
          celula.style.animationDelay = (indice * 0.025) + 's';
        }
        grid.appendChild(celula);
      });
    }

    function renderizarCruz(ano, mes, dias) {
      renderizarCruzEm('cruz-grid', ano, mes, dias, true);
      ocultarCarregamentoCruz();
    }

    var CRUZ_ROTULO_COR = {
      vermelho: 'Acidente com afastamento',
      laranja: 'Acidente sem afastamento',
      amarelo: 'Primeiros Socorros',
      azul: 'Quase acidente',
      cinza: 'Princípio de Incêndio',
      verde: 'Sem ocorrência'
    };

    /**
     * Desenha a Cruz num grid qualquer. `interativo` liga o clique que filtra o
     * feed de ocorrências — só o painel METRICS SAF usa isso; a Cruz da home é
     * de leitura, e nela o title passa a explicar a cor do dia em vez de
     * prometer um clique que não existe.
     */
    function renderizarCruzEm(idGrid, ano, mes, dias, interativo) {
      var grid = document.getElementById(idGrid);
      if (!grid) return;
      grid.classList.remove('opacity-40');
      grid.innerHTML = '';

      var diasNoMes = new Date(ano, mes, 0).getDate();
      var celulas = calcularLayoutCruz(diasNoMes);

      celulas.forEach(function (info) {
        var celula = document.createElement('div');

        if (info.vazioEstrutural) {
          celula.className = 'aspect-square w-full';
          grid.appendChild(celula);
          return;
        }

        if (info.vazio) {
          celula.className = 'aspect-square rounded-2xl border-2 border-slate-800 bg-white w-full';
          grid.appendChild(celula);
          return;
        }

        var cor = (dias && dias[info.dia]) || 'verde';

        celula.className = 'aspect-square rounded-2xl flex items-center justify-center font-extrabold text-lg sm:text-xl lg:text-2xl shadow-sm w-full' +
          (interativo ? ' cursor-pointer transition-transform duration-150 hover:scale-105 hover:ring-2 hover:ring-brand-secondary hover:ring-offset-1' : '');
        celula.style.backgroundColor = CRUZ_CORES_HEX[cor] || CRUZ_CORES_HEX.verde;
        celula.style.color = (cor === 'amarelo') ? '#334155' : '#ffffff';
        celula.textContent = info.dia;

        if (interativo) {
          celula.title = 'Ver ocorrências do dia ' + info.dia;
          celula.addEventListener('click', (function (dia) {
            return function () { filtrarFeedPorDia(dia); };
          })(info.dia));
        } else {
          celula.title = 'Dia ' + info.dia + ' — ' + (CRUZ_ROTULO_COR[cor] || 'Sem ocorrência');
        }

        grid.appendChild(celula);
      });
    }

    function onErroCruz(erro) {
      console.error(erro);
      document.getElementById('cruz-carregando-spinner').classList.add('hidden');
      var texto = document.getElementById('cruz-carregando-texto');
      texto.textContent = 'Não foi possível carregar os dados da Cruz Verde.';
      texto.classList.remove('text-brand-primary');
      texto.classList.add('text-red-500');
      document.getElementById('cruz-carregando').classList.remove('cruz-carregando-oculto');
    }

    // ==========================================================================
    // BONECO — PARTES DO CORPO
    // Duas instâncias independentes, mesmo desenho/paleta:
    //   1) feed-boneco-*    — Meu Feed, ESTÁTICA, só mês atual (getPartesDoCorpoMesAtual)
    //   2) boneco-*         — METRICS SAF, DINÂMICA, filtro Ano/Mês/Área
    //      (getPartesDoCorpoAnoCompleto — ano inteiro numa chamada só, Mês/Área
    //      filtram localmente sem nova ida ao servidor, mesmo padrão da Cruz).
    // ==========================================================================

    var CORPO_REGIOES_ELEMENTOS_ = [
      'cabeca', 'pescoco', 'ombro', 'braco', 'cotovelo', 'antebraco', 'punho', 'mao',
      'torax', 'abdomen', 'quadril', 'coxa', 'joelho', 'perna', 'tornozelo', 'pe'
    ];

    var CORPO_REGIAO_ROTULO_ = {
      cabeca: 'Cabeça', pescoco: 'Pescoço', ombro: 'Ombro', braco: 'Braço',
      cotovelo: 'Cotovelo', antebraco: 'Antebraço', punho: 'Punho', mao: 'Mão',
      torax: 'Tórax', abdomen: 'Abdômen', quadril: 'Quadril', coxa: 'Coxa',
      joelho: 'Joelho', perna: 'Perna', tornozelo: 'Tornozelo', pe: 'Pé'
    };

    // Rampas ancoradas nas cores CANÔNICAS de gravidade do projeto, as mesmas
    // da Cruz Verde (CRUZ_SEGURANCA_CORES no Code.js): com afastamento
    // VERMELHO, sem afastamento LARANJA, primeiros socorros AMARELO.
    //
    // NÃO reusar FAI_RAMPA_/REC_RAMPA_ aqui, como era antes: elas terminam em
    // #7c4a03 e #9a3412, que são MARRONS. Aquilo é proposital nos heatmaps
    // área×mês, onde o extremo escuro é o que transmite intensidade — mas no
    // boneco fazia a categoria inteira (bolinha do filtro, região pintada e
    // ponto do feed) ler marrom em vez de laranja/amarelo, quebrando a
    // convenção de cor que o resto do portal usa pra gravidade.
    var CORPO_CATEGORIA_RAMPA_ = {
      // 'todas' usa o azul da marca, um matiz NEUTRO de propósito: pintar a
      // soma com a cor de uma das categorias sugeriria que o card está
      // mostrando aquela categoria. Mesma rampa que o card do Meu Feed já usa
      // pra somar as três.
      todas: ['#e6f3fb', '#0d436b'],
      comAfastamento: ['#fde8e8', '#e53935'],
      semAfastamento: ['#ffedd7', '#fb8c00'],
      primeirosSocorros: ['#fffbe0', '#fdd835']
    };

    var CORPO_CATEGORIA_ROTULO_ = {
      todas: 'Todas as ocorrências',
      comAfastamento: 'Acidente com afastamento',
      semAfastamento: 'Acidente sem afastamento',
      primeirosSocorros: 'Primeiros socorros'
    };

    // As três categorias são MUTUAMENTE EXCLUSIVAS no backend (regra v4:
    // comAfastamento = Recordable E DAFW; semAfastamento = Recordable E NÃO
    // DAFW; primeiros socorros exige não ser nenhuma das duas). Por isso somar
    // as três é a contagem total real, sem risco de contar a mesma ocorrência
    // duas vezes.
    var CORPO_CATEGORIAS_ = ['comAfastamento', 'semAfastamento', 'primeirosSocorros'];

    /** Categorias que o filtro atual abrange — as três quando é 'todas'. */
    function bonecoCategoriasAtivas_() {
      return bonecoCategoriaAtiva_ === 'todas' ? CORPO_CATEGORIAS_ : [bonecoCategoriaAtiva_];
    }

    var CORPO_MESES_ABREV_ = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    /** Pinta um <svg> (raiz por id) e devolve o ranking [{regiao,valor,cor,corTexto}] ordenado. */
    function pintarBonecoSvg_(idSvgRaiz, contagens, rampa) {
      var max = 0;
      CORPO_REGIOES_ELEMENTOS_.forEach(function (r) { max = Math.max(max, contagens[r] || 0); });

      var ranking = [];
      CORPO_REGIOES_ELEMENTOS_.forEach(function (regiao) {
        var valor = contagens[regiao] || 0;
        var t = max > 0 ? valor / max : 0;
        var cor = valor > 0 ? corSequencial_(rampa, 0.25 + t * 0.75) : { r: 226, g: 232, b: 240 };
        var corCss = 'rgb(' + cor.r + ',' + cor.g + ',' + cor.b + ')';

        document.querySelectorAll('#' + idSvgRaiz + ' [data-regiao="' + regiao + '"]').forEach(function (el) {
          el.setAttribute('fill', corCss);
        });

        if (valor > 0) ranking.push({ regiao: regiao, valor: valor, cor: corCss, corTexto: corTextoSobre_(cor) });
      });

      ranking.sort(function (a, b) { return b.valor - a.valor; });
      return ranking;
    }

    function somarRegioes_(contagens) {
      var total = 0;
      Object.keys(contagens || {}).forEach(function (k) { total += contagens[k] || 0; });
      return total;
    }

    // -------------------------------------------------------------------------
    // 1) MEU FEED — versão estática, só mês atual, todas as áreas.
    // -------------------------------------------------------------------------
    function carregarFeedBonecoMesAtual() {
      google.script.run
        .withSuccessHandler(onFeedBonecoMesCarregado)
        .withFailureHandler(function (erro) { console.error('Erro ao carregar boneco (Meu Feed):', erro); })
        .getPartesDoCorpoMesAtual();
    }

    function onFeedBonecoMesCarregado(dados) {
      // Soma as 3 categorias por região (o card do feed é um resumo, sem filtro
      // de categoria — quem quiser quebrar por categoria vê no METRICS SAF).
      var somaPorRegiao = {};
      ['comAfastamento', 'semAfastamento', 'primeirosSocorros'].forEach(function (cat) {
        Object.keys(dados[cat] || {}).forEach(function (regiao) {
          somaPorRegiao[regiao] = (somaPorRegiao[regiao] || 0) + dados[cat][regiao];
        });
      });

      // Ramp neutro (azul da marca) — o card soma categorias, não faz sentido
      // usar uma cor de categoria específica aqui.
      var ranking = pintarBonecoSvg_('feed-boneco-svg', somaPorRegiao, ['#e6f3fb', '#0d436b']);

      var total = somarRegioes_(somaPorRegiao);
      var rotuloEl = document.getElementById('feed-boneco-mes-rotulo');
      if (rotuloEl) rotuloEl.textContent = CORPO_MESES_ABREV_[dados.mes - 1] + '/' + dados.ano + ' · ' + total;

      var alvoRanking = document.getElementById('feed-boneco-ranking');
      if (alvoRanking) {
        var top3 = ranking.slice(0, 3);
        alvoRanking.innerHTML = top3.length ? top3.map(function (item) {
          return '<div class="flex items-center justify-between gap-2">' +
            '<span>' + CORPO_REGIAO_ROTULO_[item.regiao] + '</span>' +
            '<span class="font-bold text-brand-primary">' + item.valor + '</span>' +
          '</div>';
        }).join('') : '<p class="text-slate-400">Sem ocorrências registradas neste mês.</p>';
      }

      document.getElementById('feed-boneco-mes').classList.remove('hidden');
    }

    // -------------------------------------------------------------------------
    // 2) METRICS SAF — versão dinâmica, filtro Ano/Mês/Área.
    // -------------------------------------------------------------------------
    // Padrão é 'todas': o card abre mostrando TODAS as ocorrências, sem filtro
    // de categoria. Antes nascia em 'comAfastamento', que é justamente a
    // categoria de menor volume — o boneco abria quase apagado.
    var bonecoCategoriaAtiva_ = 'todas';
    var bonecoMetricsAbertoUmaVez = false;
    var bonecoDadosAno_ = null; // pacote inteiro do ano corrente (porAreaMes), trocar Mês/Área não pede o servidor de novo

    function carregarBonecoMetrics_(ano) {
      google.script.run
        .withSuccessHandler(onBonecoMetricsCarregado_)
        .withFailureHandler(function (erro) { console.error('Erro ao carregar boneco (METRICS SAF):', erro); })
        .getPartesDoCorpoAnoCompleto(ano || null, false);
    }

    function onBonecoMetricsCarregado_(dados) {
      bonecoDadosAno_ = dados;
      preencherSelectAnoBoneco_(dados.anosDisponiveis, dados.ano);
      preencherSelectAreaBoneco_(dados.areas);
      renderizarBonecoPartesDoCorpo();
    }

    function preencherSelectAnoBoneco_(anos, atual) {
      var select = document.getElementById('boneco-select-ano');
      if (!select) return;
      select.innerHTML = (anos && anos.length ? anos : [atual]).map(function (a) {
        return '<option value="' + a + '"' + (a === atual ? ' selected' : '') + '>' + a + '</option>';
      }).join('');
    }

    function preencherSelectAreaBoneco_(areas) {
      var select = document.getElementById('boneco-select-area');
      if (!select) return;
      var valorAtual = select.value || 'Todas';
      select.innerHTML = '<option value="Todas">Todas as áreas</option>' + (areas || []).map(function (area) {
        return '<option value="' + area + '">' + area + '</option>';
      }).join('');
      if (valorAtual === 'Todas' || (areas || []).indexOf(valorAtual) !== -1) select.value = valorAtual;
    }

    function onBonecoAnoAlterado() {
      var select = document.getElementById('boneco-select-ano');
      carregarBonecoMetrics_(select ? Number(select.value) : null);
    }

    function onBonecoCategoriaAlterada(categoria) {
      bonecoCategoriaAtiva_ = categoria;
      document.querySelectorAll('#painel-cruz .boneco-filtro-btn').forEach(function (btn) {
        btn.classList.toggle('boneco-filtro-ativo', btn.dataset.categoria === categoria);
      });
      renderizarBonecoPartesDoCorpo();
    }

    function renderizarBonecoPartesDoCorpo() {
      if (!bonecoDadosAno_) return;

      var area = (document.getElementById('boneco-select-area') || {}).value || 'Todas';
      var mesFiltro = (document.getElementById('boneco-select-mes') || {}).value || 'todos';

      var porMes = bonecoDadosAno_.porAreaMes[area] || {};
      var contagens;

      var categorias = bonecoCategoriasAtivas_();
      contagens = criarRegioesVaziasCliente_();

      // Meses a somar: os 12 da área, ou só o selecionado.
      var meses = mesFiltro === 'todos' ? Object.keys(porMes) : [mesFiltro];
      meses.forEach(function (mes) {
        var balde = porMes[mes];
        if (!balde) return;
        categorias.forEach(function (cat) {
          var doMes = balde[cat] || {};
          Object.keys(doMes).forEach(function (regiao) {
            contagens[regiao] = (contagens[regiao] || 0) + doMes[regiao];
          });
        });
      });

      var ranking = pintarBonecoSvg_('boneco-svg', contagens, CORPO_CATEGORIA_RAMPA_[bonecoCategoriaAtiva_]);
      var totalGeral = somarRegioes_(contagens);

      var alvoRanking = document.getElementById('boneco-ranking');
      if (alvoRanking) {
        var max = ranking.length ? ranking[0].valor : 0;
        alvoRanking.innerHTML = ranking.length ? ranking.map(function (item) {
          var largura = max > 0 ? Math.max(8, Math.round((item.valor / max) * 100)) : 0;
          return '' +
            '<div class="flex items-center gap-2 text-xs cursor-pointer hover:opacity-80" onclick="onBonecoRegiaoClicada_(\'' + item.regiao + '\')">' +
              '<span class="w-20 shrink-0 text-slate-600 font-semibold">' + CORPO_REGIAO_ROTULO_[item.regiao] + '</span>' +
              '<div class="flex-1 h-4 bg-slate-100 rounded overflow-hidden">' +
                '<div class="h-full flex items-center justify-end pr-1.5 rounded" style="width:' + largura + '%;background:' + item.cor + '">' +
                  '<span class="text-[10px] font-bold" style="color:' + item.corTexto + '">' + item.valor + '</span>' +
                '</div>' +
              '</div>' +
            '</div>';
        }).join('') : '<p class="text-xs text-slate-400">Sem ocorrências nessa categoria para o filtro selecionado.</p>';
      }

      // 'contagens' já traz TODAS as chaves de região, inclusive costas e outro
      // (que não têm forma no desenho e por isso aparecem como número solto).
      // A soma separada que existia aqui refazia exatamente o mesmo laço acima.
      var costasEl = document.getElementById('boneco-costas-valor');
      var outroEl = document.getElementById('boneco-outro-valor');
      if (costasEl) costasEl.textContent = contagens.costas || 0;
      if (outroEl) outroEl.textContent = contagens.outro || 0;

      var tituloEl = document.getElementById('boneco-categoria-titulo');
      if (tituloEl) tituloEl.textContent = CORPO_CATEGORIA_ROTULO_[bonecoCategoriaAtiva_] + ' — Total: ' + totalGeral;
    }

    function criarRegioesVaziasCliente_() { return {}; }

    // -------------------------------------------------------------------------
    // 3) CLIQUE NO BONECO -> feed do Tracker Overview (mesmo painel lateral que
    //    a Cruz já usa). Só a instância dinâmica (METRICS SAF) é clicável — o
    //    card do Meu Feed é um resumo estático, sem interação.
    //
    //    Respeita os filtros ATIVOS do boneco (Ano já embutido em
    //    bonecoDadosAno_, mais Mês/Área/Categoria selecionados) — decisão do
    //    usuário em 2026-08-07: clique não "ignora" o que está filtrado.
    // -------------------------------------------------------------------------
    var bonecoFeedAtivo_ = false;
    var bonecoFeedRegiao_ = null;
    var bonecoFeedItens_ = [];

    function onBonecoSvgClick_(evento) {
      var el = evento.target.closest ? evento.target.closest('[data-regiao]') : null;
      if (!el) return;
      onBonecoRegiaoClicada_(el.getAttribute('data-regiao'));
    }

    function coletarRegistrosBoneco_(regiao) {
      if (!bonecoDadosAno_) return [];
      var area = (document.getElementById('boneco-select-area') || {}).value || 'Todas';
      var mesFiltro = (document.getElementById('boneco-select-mes') || {}).value || 'todos';
      var porMes = bonecoDadosAno_.porAreaMes[area] || {};

      var categorias = bonecoCategoriasAtivas_();
      var meses = mesFiltro === 'todos' ? Object.keys(porMes) : [mesFiltro];

      var itens = [];
      meses.forEach(function (mes) {
        var balde = porMes[mes];
        if (!balde || !balde.registros) return;
        categorias.forEach(function (cat) {
          itens = itens.concat((balde.registros[cat] || {})[regiao] || []);
        });
      });
      return itens;
    }

    function onBonecoRegiaoClicada_(regiao) {
      if (!bonecoDadosAno_) return;
      atsFeedAtivo_ = false;   // sai do modo ATS do feed
      bonecoFeedRegiao_ = regiao;
      bonecoFeedItens_ = coletarRegistrosBoneco_(regiao);
      bonecoFeedAtivo_ = true;
      renderizarFeedOcorrencias();
    }

    function renderizarFeedBoneco_() {
      var lista = document.getElementById('cruz-feed-lista');
      var vazio = document.getElementById('cruz-feed-vazio');
      var subtitulo = document.getElementById('cruz-feed-subtitulo');
      var botaoLimpar = document.getElementById('cruz-feed-limpar-filtro');

      var area = (document.getElementById('boneco-select-area') || {}).value || 'Todas';
      var mesFiltro = (document.getElementById('boneco-select-mes') || {}).value || 'todos';
      var mesRotulo = mesFiltro === 'todos' ? 'todo o período' : CRUZ_MESES[Number(mesFiltro) - 1];
      var areaRotulo = area === 'Todas' ? 'todas as áreas' : area;

      subtitulo.textContent = CORPO_REGIAO_ROTULO_[bonecoFeedRegiao_] + ' — ' +
        CORPO_CATEGORIA_ROTULO_[bonecoCategoriaAtiva_] + ' · ' + mesRotulo + ' · ' + areaRotulo;

      botaoLimpar.classList.remove('hidden');
      botaoLimpar.classList.add('flex');
      lista.innerHTML = '';

      if (!bonecoFeedItens_.length) {
        vazio.classList.remove('hidden');
        vazio.textContent = 'Nenhuma ocorrência dessa região no filtro selecionado.';
        return;
      }
      vazio.classList.add('hidden');

      var corDot = CORPO_CATEGORIA_RAMPA_[bonecoCategoriaAtiva_][1]; // tom mais forte da rampa da categoria

      bonecoFeedItens_.forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-brand-secondary/30 hover:shadow-sm transition-all duration-200';

        var bolinha = document.createElement('span');
        bolinha.className = 'w-2.5 h-2.5 rounded-full mt-1 shrink-0';
        bolinha.style.backgroundColor = corDot;

        var corpo = document.createElement('div');
        corpo.className = 'flex-1 min-w-0';

        var cabecalho = document.createElement('div');
        cabecalho.className = 'flex items-center justify-between gap-2';

        var btLabel = document.createElement('span');
        btLabel.className = 'text-xs font-bold text-brand-primary';
        btLabel.textContent = item.diagnostico + (item.data ? ' — ' + item.data : '');

        var areaLabel = document.createElement('span');
        areaLabel.className = 'text-[10px] font-bold uppercase text-slate-400 truncate ml-2';
        areaLabel.textContent = item.area || '';

        cabecalho.appendChild(btLabel);
        cabecalho.appendChild(areaLabel);

        corpo.appendChild(cabecalho);

        if (item.descricao) {
          var descricao = document.createElement('p');
          descricao.className = 'text-xs text-slate-500 mt-1 leading-snug';
          descricao.textContent = item.descricao;
          corpo.appendChild(descricao);
        }

        card.appendChild(bolinha);
        card.appendChild(corpo);
        lista.appendChild(card);
      });
    }
