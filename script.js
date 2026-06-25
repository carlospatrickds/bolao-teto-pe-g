/**
 * BOLÃO TETO-PE - Script Principal
 * Versão com geração de PDF (Classificação + Palpites individuais)
 */

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTTqRYCxqqTeJLzCpTWOy9CAN_Dh8pWyQquoWLDeCtT8ThDgt4kqi40F5tEXnbAwEVqnzC01MZbOHqT/pub?gid=1254969741&single=true&output=csv';

let appData = {
    headers: [],
    rows: []
};

let charts = {};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function extrairResultadoReal(nomeColuna) {
    const regex = /(\d+x\d+)/;
    const match = nomeColuna.match(regex);
    return match ? match[1] : null;
}

function normalizarPalpite(palpite) {
    if (!palpite || palpite === '-') return null;
    const regex = /(\d+x\d+)/;
    const match = palpite.match(regex);
    return match ? match[1] : null;
}

// ✅ Calcula se o palpite foi exato (compara com cabeçalho)
function calcularPlacaresExatos(usuario) {
    const ptsIndex = appData.headers.findIndex(h => h.toLowerCase().includes('ponto'));
    const gamesHeaders = appData.headers.slice(ptsIndex + 1);
    let exatos = 0;
    
    gamesHeaders.forEach(header => {
        const resultadoReal = extrairResultadoReal(header);
        const palpiteUsuario = normalizarPalpite(usuario[header]);
        
        if (resultadoReal && palpiteUsuario && resultadoReal === palpiteUsuario) {
            exatos++;
        }
    });
    
    return exatos;
}

// ✅ Calcula a pontuação de UM palpite individual (NÃO altera pontos totais)
// Retorna {pontos, tipo} onde tipo pode ser 'exato', 'vencedor' ou 'erro'
function calcularPontuacaoPalpite(palpite, resultadoReal) {
    const palpiteNorm = normalizarPalpite(palpite);
    
    if (!palpiteNorm || !resultadoReal) {
        return { pontos: 0, tipo: 'sem_resultado' };
    }
    
    // Placar exato = 3 pontos
    if (palpiteNorm === resultadoReal) {
        return { pontos: 3, tipo: 'exato' };
    }
    
    // Verifica se acertou o resultado (casa/empate/fora) = 1 ponto
    const [golsPalpiteA, golsPalpiteB] = palpiteNorm.split('x').map(Number);
    const [golsRealA, golsRealB] = resultadoReal.split('x').map(Number);
    
    const resultadoPalpite = determinarResultado(golsPalpiteA, golsPalpiteB);
    const resultadoRealFinal = determinarResultado(golsRealA, golsRealB);
    
    if (resultadoPalpite === resultadoRealFinal) {
        return { pontos: 1, tipo: 'vencedor' };
    }
    
    return { pontos: 0, tipo: 'erro' };
}

// ✅ Verifica se acertou o vencedor (para mostrar no histórico)
function verificarAcertoVencedor(palpite, resultadoReal) {
    const palpiteParse = parsePalpite(palpite);
    const realParse = parsePalpite(resultadoReal);
    
    if (!palpiteParse || !realParse) return { acertou: false, tipo: 'erro' };
    
    // Placar exato
    if (palpiteParse.golsCasa === realParse.golsCasa && 
        palpiteParse.golsFora === realParse.golsFora) {
        return { acertou: true, tipo: 'exato', pontos: 3 };
    }
    
    // Acertou o resultado (casa/empate/fora)
    const resultadoPalpite = determinarResultado(palpiteParse.golsCasa, palpiteParse.golsFora);
    const resultadoRealFinal = determinarResultado(realParse.golsCasa, realParse.golsFora);
    
    if (resultadoPalpite === resultadoRealFinal) {
        return { acertou: true, tipo: 'vencedor', pontos: 1 };
    }
    
    return { acertou: false, tipo: 'erro', pontos: 0 };
}

function parsePalpite(palpite) {
    if (!palpite || palpite === '-') return null;
    const regex = /(.+?)\s+(\d+)x(\d+)\s+(.+)/i;
    const match = palpite.match(regex);
    
    if (match) {
        return {
            timeCasa: match[1].trim(),
            golsCasa: parseInt(match[2]),
            golsFora: parseInt(match[3]),
            timeFora: match[4].trim()
        };
    }
    return null;
}

function determinarResultado(golsCasa, golsFora) {
    if (golsCasa > golsFora) return 'casa';
    if (golsCasa < golsFora) return 'fora';
    return 'empate';
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupTabs();
    setupEventListeners();
    fetchData();
});

function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    const icon = toggleBtn.querySelector('i');
    toggleBtn.addEventListener('click', () => {
        const body = document.documentElement;
        if (body.getAttribute('data-theme') === 'light') {
            body.setAttribute('data-theme', 'dark');
            icon.classList.replace('fa-moon', 'fa-sun');
        } else {
            body.setAttribute('data-theme', 'light');
            icon.classList.replace('fa-sun', 'fa-moon');
        }
        renderCharts(); 
    });
}

function setupTabs() {
    const btns = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
            if (targetId === 'estatisticas') renderCharts();
        });
    });
}

async function fetchData() {
    try {
        const separator = SHEET_URL.includes('?') ? '&' : '?';
        const finalUrl = `${SHEET_URL}${separator}nocache=${new Date().getTime()}`;
        const response = await fetch(finalUrl);
        
        if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);

        const csvText = await response.text();
        parseCSV(csvText);
        
        renderClassification();
        renderTop3();
        renderDesempateDetalhes();
        renderPredictions();
        updateGlobalStats();
        popularSelectParticipantes();
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
    }
}

function parseCSV(csv) {
    const lines = csv.split('\n').map(line => line.trim()).filter(line => line !== '');
    if (lines.length === 0) return;

    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('participante')) {
            headerIndex = i;
            break;
        }
    }
    if (headerIndex === -1) headerIndex = 0;

    appData.headers = lines[headerIndex].split(',').map(h => h.replace(/\r|"/g, '').trim());
    
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante')) || appData.headers[1];
    const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto')) || appData.headers[2];
    const ptsIndex = appData.headers.findIndex(h => h.toLowerCase().includes('ponto'));
    const gamesHeaders = appData.headers.slice(ptsIndex + 1);

    let rawRows = lines.slice(headerIndex + 1).map(line => {
        const values = line.split(',').map(v => v.replace(/\r|"/g, '').trim());
        let rowData = {};
        appData.headers.forEach((header, index) => { rowData[header] = values[index] || '-'; });
        
        let participacoes = 0;
        gamesHeaders.forEach(game => {
            if (rowData[game] && rowData[game] !== '-' && rowData[game].trim() !== '') participacoes++;
        });
        rowData['_participacoes'] = participacoes;
        
        // ✅ CALCULA APENAS OS EXATOS (para critério de desempate)
        rowData['_vitorias'] = calcularPlacaresExatos(rowData);
        
        return rowData;
    });

    appData.rows = rawRows.filter(row => {
        const nome = row[partKey];
        const pontosRaiz = row[ptsKey];
        if (!nome || nome === '-' || nome.toLowerCase() === 'participante' || nome.trim() === '') return false;
        return !isNaN(parseInt(pontosRaiz));
    });

    // ✅ ORDENA USANDO OS PONTOS DA PLANILHA
    appData.rows.sort((a, b) => {
        const pA = parseInt(a[ptsKey]) || 0, pB = parseInt(b[ptsKey]) || 0;
        if (pB !== pA) return pB - pA;
        
        const vA = a['_vitorias'] || 0, vB = b['_vitorias'] || 0;
        if (vB !== vA) return vB - vA;
        
        const paA = a['_participacoes'] || 0, paB = b['_participacoes'] || 0;
        if (paB !== paA) return paB - paA;
        
        return a[partKey].localeCompare(b[partKey]);
    });

    // Ranking denso
    if (appData.rows.length > 0) {
        let currentRank = 1;
        appData.rows[0]._rank = 1;
        for (let i = 1; i < appData.rows.length; i++) {
            const prev = appData.rows[i - 1], curr = appData.rows[i];
            const samePts = parseInt(prev[ptsKey]) === parseInt(curr[ptsKey]);
            const sameVit = (prev['_vitorias'] || 0) === (curr['_vitorias'] || 0);
            const samePart = prev['_participacoes'] === curr['_participacoes'];
            
            if (samePts && sameVit && samePart) curr._rank = currentRank;
            else { currentRank++; curr._rank = currentRank; }
        }
    }
}

function renderClassification(filterText = '') {
    const tbody = document.querySelector('#table-classificacao tbody');
    tbody.innerHTML = '';
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));

    appData.rows.filter(r => r[partKey].toLowerCase().includes(filterText.toLowerCase())).forEach(row => {
        let displayRank = row._rank;
        if (row._rank === 1) displayRank = '🥇';
        else if (row._rank === 2) displayRank = '🥈';
        else if (row._rank === 3) displayRank = '🥉';
        
        // ✅ USA PONTOS DA PLANILHA
        const pontos = row[ptsKey];
        
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${displayRank}</td><td class="highlight">${row[partKey]}</td><td><strong>${pontos}</strong></td>`;
        tbody.appendChild(tr);
    });
}

function renderTop3() {
    const container = document.getElementById('top3-cards');
    container.innerHTML = '';
    if (appData.rows.length === 0) return;
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));

    const rank1 = appData.rows.filter(r => r._rank === 1);
    const rank2 = appData.rows.filter(r => r._rank === 2);
    const rank3 = appData.rows.filter(r => r._rank === 3);
    
    const format = (arr) => arr.map(r => r[partKey]).join('<br>');
    const getPts = (arr) => arr.length > 0 ? arr[0][ptsKey] : '-';
    const getVit = (arr) => arr.length > 0 ? (arr[0]['_vitorias'] || 0) : 0;

    if (rank2.length > 0) container.innerHTML += `<div class="card-top pos-2"><div class="medal">🥈</div><div class="top-name">${format(rank2)}</div><div class="top-pts">${getPts(rank2)} pts</div><div class="top-vit" style="font-size:0.8rem;color:#666;">${getVit(rank2)} exatos</div></div>`;
    if (rank1.length > 0) container.innerHTML += `<div class="card-top pos-1"><div class="medal">🥇</div><div class="top-name">${format(rank1)}</div><div class="top-pts">${getPts(rank1)} pts</div><div class="top-vit" style="font-size:0.8rem;color:#666;">${getVit(rank1)} exatos</div></div>`;
    if (rank3.length > 0) container.innerHTML += `<div class="card-top pos-3"><div class="medal">🥉</div><div class="top-name">${format(rank3)}</div><div class="top-pts">${getPts(rank3)} pts</div><div class="top-vit" style="font-size:0.8rem;color:#666;">${getVit(rank3)} exatos</div></div>`;
}

function renderDesempateDetalhes() {
    const container = document.getElementById('desempate-detalhes');
    if (!container) return;
    container.innerHTML = '';
    if (appData.rows.length === 0) return;
    
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));
    
    const ranks = [1, 2, 3];
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const labels = { 1: '1º Lugar', 2: '2º Lugar', 3: '3º Lugar' };
    const colors = { 1: 'var(--yellow)', 2: 'var(--gray)', 3: '#CD7F32' };
    
    let html = `
        <div class="desempate-header">
            <h3><i class="fa-solid fa-scale-balanced"></i> Como o Desempate Foi Definido</h3>
            <p class="desempate-subtitle">Análise dos critérios aplicados para cada posição do pódio</p>
        </div>
        <div class="desempate-grid">
    `;
    
    ranks.forEach(rank => {
        const grupo = appData.rows.filter(r => r._rank === rank);
        if (grupo.length === 0) return;
        
        const nomes = grupo.map(r => r[partKey]).join(', ');
        const pontos = grupo[0][ptsKey];
        const exatos = grupo[0]['_vitorias'] || 0;
        const participacoes = grupo[0]['_participacoes'] || 0;
        const empatou = grupo.length > 1;
        
        let criterioDefinidor = '';
        let statusBadge = '';
        
        if (empatou) {
            statusBadge = `<span class="badge empate">🤝 EMPATE TOTAL — Dividem a posição</span>`;
            criterioDefinidor = 'Todos os critérios aplicados resultaram em igualdade';
        } else {
            const proximo = appData.rows.find(r => r._rank === rank + 1);
            if (proximo) {
                const ptsProx = parseInt(proximo[ptsKey]);
                const exatosProx = proximo['_vitorias'] || 0;
                const partProx = proximo['_participacoes'] || 0;
                
                if (parseInt(pontos) > ptsProx) {
                    criterioDefinidor = '✅ Definido pelo <strong>1º critério (Pontuação)</strong>';
                    statusBadge = `<span class="badge definido">🏆 Posição definida</span>`;
                } else if (exatos > exatosProx) {
                    criterioDefinidor = '✅ Definido pelo <strong>2º critério (Placares Exatos)</strong>';
                    statusBadge = `<span class="badge critico2">⭐ Desempate nos exatos</span>`;
                } else if (participacoes > partProx) {
                    criterioDefinidor = '✅ Definido pelo <strong>3º critério (Participações)</strong>';
                    statusBadge = `<span class="badge critico3">🎯 Desempate nas participações</span>`;
                } else {
                    criterioDefinidor = '✅ Definido por ordem alfabética';
                    statusBadge = `<span class="badge definido">🏆 Posição definida</span>`;
                }
            } else {
                criterioDefinidor = '✅ Único nesta posição';
                statusBadge = `<span class="badge definido">🏆 Posição definida</span>`;
            }
        }
        
        html += `
            <div class="desempate-card" style="border-top: 5px solid ${colors[rank]};">
                <div class="desempate-card-header">
                    <span class="desempate-medal">${medals[rank]}</span>
                    <div>
                        <h4>${labels[rank]}</h4>
                        ${statusBadge}
                    </div>
                </div>
                <div class="desempate-nomes">${nomes}</div>
                <div class="desempate-stats">
                    <div class="desempate-stat">
                        <i class="fa-solid fa-trophy"></i>
                        <div>
                            <span class="stat-label">Pontos</span>
                            <span class="stat-num">${pontos}</span>
                        </div>
                    </div>
                    <div class="desempate-stat">
                        <i class="fa-solid fa-bullseye"></i>
                        <div>
                            <span class="stat-label">Exatos</span>
                            <span class="stat-num">${exatos}</span>
                        </div>
                    </div>
                    <div class="desempate-stat">
                        <i class="fa-solid fa-keyboard"></i>
                        <div>
                            <span class="stat-label">Palpites</span>
                            <span class="stat-num">${participacoes}</span>
                        </div>
                    </div>
                </div>
                <div class="desempate-criterio">${criterioDefinidor}</div>
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
}

// ✅ RENDERIZA PALPITES COM PONTUAÇÃO INDIVIDUAL E ESTRELAS
function renderPredictions() {
    const thead = document.querySelector('#table-palpites thead');
    const tbody = document.querySelector('#table-palpites tbody');
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsIndex = appData.headers.findIndex(h => h.toLowerCase().includes('ponto'));
    const games = appData.headers.slice(ptsIndex + 1); 
    
    // Cabeçalho
    thead.innerHTML = `<tr><th>Participante</th>${games.map(g => `<th>${g}</th>`).join('')}</tr>`;
    
    // Corpo da tabela com pontuação em cada célula
    tbody.innerHTML = appData.rows.map(row => {
        const cells = games.map(gameHeader => {
            const palpite = row[gameHeader];
            if (!palpite || palpite === '-' || palpite.trim() === '') {
                return `<td></td>`;
            }
            
            const resultadoReal = extrairResultadoReal(gameHeader);
            const pontuacao = calcularPontuacaoPalpite(palpite, resultadoReal);
            
            let classePontuacao = '';
            let icone = '';
            let textoPontos = '';
            
            if (pontuacao.tipo === 'exato') {
                classePontuacao = 'palpite-exato';
                icone = '⭐';
                textoPontos = `${pontuacao.pontos} pts`;
            } else if (pontuacao.tipo === 'vencedor') {
                classePontuacao = 'palpite-vencedor';
                icone = '✅';
                textoPontos = `${pontuacao.pontos} pt`;
            } else {
                classePontuacao = 'palpite-erro';
                icone = '❌';
                textoPontos = `${pontuacao.pontos} pt`;
            }
            
            return `<td>
                <div class="cell-palpite">
                    <span class="palpite-texto">${palpite}</span>
                    <span class="palpite-info ${classePontuacao}">
                        ${icone} ${textoPontos}
                    </span>
                </div>
            </td>`;
        }).join('');
        
        return `<tr><td><strong>${row[partKey]}</strong></td>${cells}</tr>`;
    }).join('');
}

// ✅ MOSTRA VISUALMENTE OS ACERTOS/ERROS (sem alterar pontos)
function searchUserPerformance(name) {
    const resultDiv = document.getElementById('resultado-desempenho');
    if (!name.trim()) { resultDiv.classList.add('hidden'); return; }
    
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));
    const user = appData.rows.find(r => r[partKey].toLowerCase().includes(name.toLowerCase()));

    if (user) {
        resultDiv.classList.remove('hidden');
        
        const select = document.getElementById('select-participante');
        if (select) select.value = user[partKey];
        
        const ptsIndex = appData.headers.findIndex(h => h.toLowerCase().includes('ponto'));
        const gamesHeaders = appData.headers.slice(ptsIndex + 1);
        
        let disputados = 0;
        let exatos = user['_vitorias'] || 0;
        let historicoHTML = '';
        
        gamesHeaders.forEach(header => {
            const palpite = user[header];
            if (palpite && palpite !== '-' && palpite.trim() !== '') { 
                disputados++; 
                
                const resultadoReal = extrairResultadoReal(header);
                const palpiteNormalizado = normalizarPalpite(palpite);
                const ehExato = resultadoReal && palpiteNormalizado === resultadoReal;
                
                // ✅ Verifica se acertou o vencedor (para visualização)
                const acertoVencedor = verificarAcertoVencedor(palpite, header);
                
                let icone, corPalpite, bgStyle, textoExplicacao;
                
                if (ehExato) {
                    icone = '<span style="color:var(--yellow); font-weight:bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">🎯 EXATO!</span>';
                    corPalpite = 'var(--green)';
                    bgStyle = 'background: rgba(47, 172, 102, 0.15); border-left: 4px solid var(--green);';
                    textoExplicacao = 'Placar exato!';
                } else if (acertoVencedor.acertou && acertoVencedor.tipo === 'vencedor') {
                    icone = '<span style="color:var(--green); font-weight:bold;">✅</span>';
                    corPalpite = 'var(--primary)';
                    bgStyle = 'background: rgba(0, 146, 221, 0.05); border-left: 4px solid var(--primary);';
                    textoExplicacao = 'Acertou o vencedor';
                } else {
                    icone = '<span style="color: #E94362; font-weight:bold; font-size: 1.2rem;">❌</span>';
                    corPalpite = 'var(--text-color)';
                    bgStyle = 'background: rgba(233, 67, 98, 0.05); border-left: 4px solid var(--border-color);';
                    textoExplicacao = 'Errou o resultado';
                }
                
                historicoHTML += `<div class="history-item" style="${bgStyle}">
                    <div>
                        <div style="margin-bottom:5px;"><strong>${header}</strong></div>
                        <div style="font-size:0.85rem; color:var(--gray);">${textoExplicacao}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="margin-bottom:5px;">
                            <span style="color:${corPalpite}; font-weight:600;">${palpite}</span> 
                            ${icone}
                        </div>
                    </div>
                </div>`;
            }
        });
        
        document.getElementById('user-historico').innerHTML = historicoHTML || '<p style="text-align:center;padding:20px;color:#999;">Nenhum palpite registrado ainda.</p>';
        document.getElementById('user-total-pontos').innerText = user[ptsKey];
        document.getElementById('user-jogos').innerText = disputados;
        document.getElementById('user-exatos').innerText = exatos;
    } else {
        resultDiv.classList.add('hidden');
    }
}

function popularSelectParticipantes() {
    const select = document.getElementById('select-participante');
    if (!select) return;
    
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));
    
    select.innerHTML = '<option value="">👇 Selecione seu nome na lista</option>';
    
    const participantesOrdenados = [...appData.rows].sort((a, b) => 
        a[partKey].localeCompare(b[partKey])
    );
    
    participantesOrdenados.forEach(row => {
        const nome = row[partKey];
        const pontos = row[ptsKey];
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = `${nome} — ${pontos} pts`;
        select.appendChild(option);
    });
}

function updateGlobalStats() {
    const statsContainer = document.getElementById('geral-stats');
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));
    const ptsIndex = appData.headers.findIndex(h => h.toLowerCase().includes('ponto'));
    
    const total = appData.rows.length;
    const pontuaram = appData.rows.filter(r => parseInt(r[ptsKey]) > 0).length;
    const lider = appData.rows[0] ? appData.rows[0][partKey] : '-';
    const totalExatos = appData.rows.reduce((sum, r) => sum + (r['_vitorias'] || 0), 0);
    const mediaPontos = total > 0 ? (appData.rows.reduce((sum, r) => sum + parseInt(r[ptsKey] || 0), 0) / total).toFixed(1) : 0;
    
    statsContainer.innerHTML = `
        <div class="stat-card">
            <h3><i class="fa-solid fa-users"></i> Participantes</h3>
            <p class="stat-value">${total}</p>
        </div>
        <div class="stat-card">
            <h3><i class="fa-solid fa-star"></i> Já Pontuaram</h3>
            <p class="stat-value">${pontuaram}</p>
        </div>
        <div class="stat-card">
            <h3><i class="fa-solid fa-futbol"></i> Rodadas</h3>
            <p class="stat-value">${appData.headers.slice(ptsIndex + 1).length}</p>
        </div>
        <div class="stat-card">
            <h3><i class="fa-solid fa-crown"></i> Líder Atual</h3>
            <p class="stat-value" style="font-size: 1.2rem;">${lider}</p>
        </div>
        <div class="stat-card">
            <h3><i class="fa-solid fa-bullseye"></i> Total de Exatos</h3>
            <p class="stat-value">${totalExatos}</p>
        </div>
        <div class="stat-card">
            <h3><i class="fa-solid fa-chart-line"></i> Média de Pontos</h3>
            <p class="stat-value">${mediaPontos}</p>
        </div>
    `;
}

function renderCharts() {
    if (appData.rows.length === 0) return;
    const themeDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const txt = themeDark ? '#FFF' : '#1D1D1B';
    const ptsK = appData.headers.find(h => h.toLowerCase().includes('ponto'));
    const partK = appData.headers.find(h => h.toLowerCase().includes('participante'));

    if (charts.pontos) charts.pontos.destroy();
    if (charts.top10) charts.top10.destroy();

    const counts = {};
    appData.rows.forEach(r => { 
        const p = parseInt(r[ptsK]) || 0; 
        counts[p] = (counts[p] || 0) + 1; 
    });

    charts.pontos = new Chart(document.getElementById('pontosChart').getContext('2d'), {
        type: 'bar',
        data: { 
            labels: Object.keys(counts).sort((a,b) => a-b).map(k => `${k} pts`), 
            datasets: [{ 
                label: 'Quantidade de Participantes', 
                data: Object.keys(counts).sort((a,b) => a-b).map(k => counts[k]), 
                backgroundColor: '#0092DD', 
                borderRadius: 5 
            }] 
        },
        options: { 
            responsive: true, 
            plugins: { legend: { labels: { color: txt } } }, 
            scales: { 
                x: { ticks: { color: txt } }, 
                y: { ticks: { color: txt }, beginAtZero: true } 
            } 
        }
    });

    const top10 = appData.rows.slice(0, 10);
    charts.top10 = new Chart(document.getElementById('top10Chart').getContext('2d'), {
        type: 'doughnut',
        data: { 
            labels: top10.map(r => r[partK]), 
            datasets: [{ 
                data: top10.map(r => parseInt(r[ptsK]) || 0), 
                backgroundColor: ['#0092DD', '#FDC533', '#2FAC66', '#E94362', '#005CA9', '#D88BB6', '#954B97', '#C6C6C6', '#1D1D1B', '#333333'] 
            }] 
        },
        options: { 
            responsive: true, 
            plugins: { 
                legend: { position: 'right', labels: { color: txt, font: { size: 11 } } } 
            } 
        }
    });
}

// ============================================
// GERAÇÃO DE PDF — CLASSIFICAÇÃO (RELATÓRIO BONITO)
// ============================================
function showLoading(mensagem = 'Gerando PDF...') {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-spinner"></div>
        <div class="loading-text">${mensagem}</div>
    `;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.remove();
}

function gerarPDFClassificacao() {
    if (appData.rows.length === 0) {
        alert('Não há dados para gerar o PDF.');
        return;
    }
    
    showLoading('Montando relatório...');
    
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));
    
    const rank1 = appData.rows.filter(r => r._rank === 1);
    const rank2 = appData.rows.filter(r => r._rank === 2);
    const rank3 = appData.rows.filter(r => r._rank === 3);
    
    const formatNomes = (arr) => arr.map(r => r[partKey]).join(', ');
    const getPts = (arr) => arr.length > 0 ? arr[0][ptsKey] : '0';
    
    const dataAtual = new Date().toLocaleDateString('pt-BR', { 
        day: '2-digit', month: 'long', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    });
    
    // Monta o conteúdo HTML do PDF
    const container = document.getElementById('pdf-classificacao-container');
    container.innerHTML = `
        <div class="pdf-page">
            <div class="pdf-header">
                <div class="pdf-title-block">
                    <div class="pdf-trophy">🏆</div>
                    <div>
                        <h1 class="pdf-title">BOLÃO TETO-PE</h1>
                        <p class="pdf-subtitle">⚽ Copa do Mundo 2026</p>
                    </div>
                </div>
                <div class="pdf-date">
                    <div><strong>Relatório de Classificação</strong></div>
                    <div>${dataAtual}</div>
                </div>
            </div>
            
            <div class="pdf-section">
                <h2 class="pdf-section-title">🏆 Pódio Atual</h2>
                <div class="pdf-podium">
                    ${rank2.length > 0 ? `
                        <div class="pdf-podium-card pos-2">
                            <div class="pdf-podium-medal">🥈</div>
                            <div class="pdf-podium-name">${formatNomes(rank2)}</div>
                            <div class="pdf-podium-pts">${getPts(rank2)} pts</div>
                        </div>
                    ` : ''}
                    ${rank1.length > 0 ? `
                        <div class="pdf-podium-card pos-1">
                            <div class="pdf-podium-medal">🥇</div>
                            <div class="pdf-podium-name">${formatNomes(rank1)}</div>
                            <div class="pdf-podium-pts">${getPts(rank1)} pts</div>
                        </div>
                    ` : ''}
                    ${rank3.length > 0 ? `
                        <div class="pdf-podium-card pos-3">
                            <div class="pdf-podium-medal">🥉</div>
                            <div class="pdf-podium-name">${formatNomes(rank3)}</div>
                            <div class="pdf-podium-pts">${getPts(rank3)} pts</div>
                        </div>
                    ` : ''}
                </div>
                
                <h2 class="pdf-section-title" style="margin-top: 20px;">📊 Classificação Geral</h2>
                <table class="pdf-table">
                    <thead>
                        <tr>
                            <th style="width: 80px; text-align: center;">Pos.</th>
                            <th>Participante</th>
                            <th style="width: 120px; text-align: center;">Pontos</th>
                            <th style="width: 100px; text-align: center;">Exatos</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${appData.rows.map(row => {
                            let posicao = '';
                            let classeLinha = '';
                            if (row._rank === 1) { posicao = '🥇'; classeLinha = 'top-1'; }
                            else if (row._rank === 2) { posicao = '🥈'; classeLinha = 'top-2'; }
                            else if (row._rank === 3) { posicao = '🥉'; classeLinha = 'top-3'; }
                            else { posicao = `${row._rank}º`; }
                            
                            return `
                                <tr class="${classeLinha}">
                                    <td class="pdf-medal-cell">${posicao}</td>
                                    <td><strong>${row[partKey]}</strong></td>
                                    <td style="text-align: center; font-weight: 700; color: #0092DD;">${row[ptsKey]}</td>
                                    <td style="text-align: center;">${row['_vitorias'] || 0} ⭐</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            
            <div class="pdf-footer">
                Bolão TETO-PE • Copa do Mundo 2026 • Gerado automaticamente em ${dataAtual}
            </div>
        </div>
    `;
    
    // Aguarda renderização e converte para PDF
    setTimeout(async () => {
        try {
            const { jsPDF } = window.jspdf;
            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#FFFFFF',
                logging: false
            });
            
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            // Se a imagem for maior que uma página, ajusta
            let heightLeft = imgHeight;
            let position = 0;
            
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
            
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;
            }
            
            pdf.save(`Bolao_TetoPE_Classificacao_${new Date().toISOString().slice(0,10)}.pdf`);
            hideLoading();
        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            hideLoading();
            alert('Erro ao gerar o PDF. Tente novamente.');
        }
    }, 300);
}

// ============================================
// GERAÇÃO DE PDF — PALPITES (UMA PÁGINA POR PARTICIPANTE)
// ============================================
function gerarPDFPalpites() {
    if (appData.rows.length === 0) {
        alert('Não há dados para gerar o PDF.');
        return;
    }
    
    showLoading('Gerando PDF dos palpites...');
    
    setTimeout(() => {
        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
            const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));
            const ptsIndex = appData.headers.findIndex(h => h.toLowerCase().includes('ponto'));
            const gamesHeaders = appData.headers.slice(ptsIndex + 1);
            
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pageWidth - (margin * 2);
            
            appData.rows.forEach((row, index) => {
                if (index > 0) pdf.addPage();
                
                const nomeParticipante = row[partKey];
                const pontosTotais = row[ptsKey];
                const exatos = row['_vitorias'] || 0;
                
                // === CABEÇALHO DO PARTICIPANTE ===
                // Fundo azul do cabeçalho
                pdf.setFillColor(0, 146, 221);
                pdf.rect(0, 0, pageWidth, 35, 'F');
                
                // Faixa colorida inferior
                pdf.setFillColor(253, 197, 51);
                pdf.rect(0, 35, pageWidth, 2, 'F');
                
                // Nome do participante
                pdf.setTextColor(255, 255, 255);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(18);
                pdf.text(nomeParticipante.toUpperCase(), margin, 15);
                
                // Subtítulo
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');
                pdf.text('Bolão TETO-PE • Copa do Mundo 2026', margin, 23);
                
                // Data
                const dataAtual = new Date().toLocaleDateString('pt-BR');
                pdf.setFontSize(8);
                pdf.text(`Emitido em: ${dataAtual}`, margin, 30);
                
                // Caixa de pontos (canto direito)
                const boxX = pageWidth - margin - 40;
                const boxY = 8;
                pdf.setFillColor(253, 197, 51);
                pdf.roundedRect(boxX, boxY, 40, 22, 3, 3, 'F');
                
                pdf.setTextColor(29, 29, 27);
                pdf.setFontSize(7);
                pdf.setFont('helvetica', 'bold');
                pdf.text('PONTOS', boxX + 20, boxY + 7, { align: 'center' });
                
                pdf.setFontSize(16);
                pdf.text(String(pontosTotais), boxX + 20, boxY + 17, { align: 'center' });
                
                // === CORPO: LISTA DE PALPITES ===
                let yPosition = 45;
                const lineHeight = 16;
                const maxLineHeight = 18;
                
                // Título da seção
                pdf.setTextColor(0, 146, 221);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(12);
                pdf.text('Histórico de Palpites', margin, yPosition);
                yPosition += 8;
                
                // Linha decorativa
                pdf.setDrawColor(253, 197, 51);
                pdf.setLineWidth(0.8);
                pdf.line(margin, yPosition, margin + 60, yPosition);
                yPosition += 6;
                
                // Resumo rápido
                let totalJogos = 0;
                let totalExatosCont = 0;
                let totalVencedorCont = 0;
                let totalErroCont = 0;
                
                gamesHeaders.forEach(header => {
                    const palpite = row[header];
                    if (palpite && palpite !== '-' && palpite.trim() !== '') {
                        totalJogos++;
                        const resultadoReal = extrairResultadoReal(header);
                        const pontuacao = calcularPontuacaoPalpite(palpite, resultadoReal);
                        if (pontuacao.tipo === 'exato') totalExatosCont++;
                        else if (pontuacao.tipo === 'vencedor') totalVencedorCont++;
                        else totalErroCont++;
                    }
                });
                
                // Caixa de resumo
                pdf.setFillColor(245, 245, 245);
                pdf.roundedRect(margin, yPosition, contentWidth, 10, 2, 2, 'F');
                
                pdf.setTextColor(100, 100, 100);
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'normal');
                const resumoTexto = `📊 ${totalJogos} jogos  |  ⭐ ${totalExatosCont} exatos  |  ✅ ${totalVencedorCont} vencedores  |  ❌ ${totalErroCont} erros`;
                pdf.text(resumoTexto, margin + 5, yPosition + 6.5);
                
                yPosition += 15;
                
                // Lista de palpites
                gamesHeaders.forEach(header => {
                    const palpite = row[header];
                    if (!palpite || palpite === '-' || palpite.trim() === '') return;
                    
                    // Verifica se precisa de nova página
                    if (yPosition + maxLineHeight > pageHeight - 20) {
                        pdf.addPage();
                        yPosition = 20;
                        
                        // Mini cabeçalho nas páginas seguintes
                        pdf.setFillColor(0, 146, 221);
                        pdf.rect(0, 0, pageWidth, 10, 'F');
                        pdf.setTextColor(255, 255, 255);
                        pdf.setFontSize(9);
                        pdf.setFont('helvetica', 'bold');
                        pdf.text(`${nomeParticipante.toUpperCase()} (continuação)`, margin, 7);
                        yPosition = 18;
                    }
                    
                    const resultadoReal = extrairResultadoReal(header);
                    const pontuacao = calcularPontuacaoPalpite(palpite, resultadoReal);
                    
                    // Cor de fundo baseada no resultado
                    let fillColor, borderColor;
                    if (pontuacao.tipo === 'exato') {
                        fillColor = [255, 251, 239]; // Amarelo claro
                        borderColor = [253, 197, 51];
                    } else if (pontuacao.tipo === 'vencedor') {
                        fillColor = [240, 255, 245]; // Verde claro
                        borderColor = [47, 172, 102];
                    } else {
                        fillColor = [250, 250, 250]; // Cinza claro
                        borderColor = [200, 200, 200];
                    }
                    
                    // Card do jogo
                    pdf.setFillColor(...fillColor);
                    pdf.roundedRect(margin, yPosition, contentWidth, lineHeight - 2, 2, 2, 'F');
                    
                    // Borda lateral colorida
                    pdf.setFillColor(...borderColor);
                    pdf.rect(margin, yPosition, 2, lineHeight - 2, 'F');
                    
                    // Nome do jogo (cabeçalho original)
                    pdf.setTextColor(29, 29, 27);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(9);
                    const nomeJogo = header.length > 55 ? header.substring(0, 52) + '...' : header;
                    pdf.text(nomeJogo, margin + 5, yPosition + 5);
                    
                    // Resultado real
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(7.5);
                    pdf.setTextColor(120, 120, 120);
                    pdf.text(`Resultado: ${resultadoReal || '—'}`, margin + 5, yPosition + 10.5);
                    
                    // Palpite do usuário (lado direito)
                    pdf.setTextColor(29, 29, 27);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(10);
                    pdf.text(palpite, pageWidth - margin - 45, yPosition + 6, { align: 'right' });
                    
                    // Badge de pontuação
                    let badgeText, badgeColor;
                    if (pontuacao.tipo === 'exato') {
                        badgeText = '⭐ 3 pts';
                        badgeColor = [253, 197, 51];
                        pdf.setTextColor(29, 29, 27);
                    } else if (pontuacao.tipo === 'vencedor') {
                        badgeText = '✅ 1 pt';
                        badgeColor = [47, 172, 102];
                        pdf.setTextColor(255, 255, 255);
                    } else {
                        badgeText = '❌ 0 pt';
                        badgeColor = [200, 200, 200];
                        pdf.setTextColor(120, 120, 120);
                    }
                    
                    // Desenha o badge
                    const badgeWidth = 20;
                    const badgeX = pageWidth - margin - badgeWidth - 2;
                    const badgeY = yPosition + 8;
                    pdf.setFillColor(...badgeColor);
                    pdf.roundedRect(badgeX, badgeY, badgeWidth, 5, 1, 1, 'F');
                    
                    pdf.setFontSize(7);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(badgeText, badgeX + badgeWidth / 2, badgeY + 3.5, { align: 'center' });
                    
                    yPosition += lineHeight;
                });
                
                // === RODAPÉ ===
                pdf.setTextColor(150, 150, 150);
                pdf.setFontSize(7);
                pdf.setFont('helvetica', 'normal');
                pdf.text(
                    `Bolão TETO-PE • Página ${index + 1} de ${appData.rows.length}`,
                    pageWidth / 2, pageHeight - 8,
                    { align: 'center' }
                );
            });
            
            pdf.save(`Bolao_TetoPE_Palpites_Completos_${new Date().toISOString().slice(0,10)}.pdf`);
            hideLoading();
        } catch (error) {
            console.error('Erro ao gerar PDF de palpites:', error);
            hideLoading();
            alert('Erro ao gerar o PDF. Tente novamente.');
        }
    }, 100);
}

function setupEventListeners() {
    document.getElementById('search-classificacao').addEventListener('input', (e) => renderClassification(e.target.value));
    document.getElementById('search-desempenho').addEventListener('input', (e) => searchUserPerformance(e.target.value));
    
    document.getElementById('select-participante').addEventListener('change', (e) => {
        const nomeSelecionado = e.target.value;
        if (nomeSelecionado) {
            searchUserPerformance(nomeSelecionado);
            document.getElementById('search-desempenho').value = nomeSelecionado;
        } else {
            document.getElementById('resultado-desempenho').classList.add('hidden');
            document.getElementById('search-desempenho').value = '';
        }
    });
    
    document.getElementById('btn-export').addEventListener('click', () => {
        html2canvas(document.getElementById('tabela-export-area'), { backgroundColor: null }).then(c => {
            const l = document.createElement('a'); 
            l.download = 'classificacao.png'; 
            l.href = c.toDataURL(); 
            l.click();
        });
    });
    
    // ✅ NOVO: Botão PDF da Classificação
    document.getElementById('btn-export-pdf').addEventListener('click', gerarPDFClassificacao);
    
    // ✅ NOVO: Botão PDF dos Palpites
    document.getElementById('btn-pdf-palpites').addEventListener('click', gerarPDFPalpites);
    
    document.getElementById('btn-share').addEventListener('click', () => {
        if (navigator.share) {
            navigator.share({ 
                title: 'Bolão TETO-PE', 
                text: 'Confira a classificação do nosso bolão!',
                url: window.location.href 
            });
        } else {
            alert('Link: ' + window.location.href);
        }
    });
}
