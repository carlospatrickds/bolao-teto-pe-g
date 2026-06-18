/**
 * BOLÃO TETO-PE - Script Principal
 * Lógica de processamento de dados e renderização da interface
 */

// URL da Planilha (Aba específica)
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTTqRYCxqqTeJLzCpTWOy9CAN_Dh8pWyQquoWLDeCtT8ThDgt4kqi40F5tEXnbAwEVqnzC01MZbOHqT/pub?gid=1254969741&single=true&output=csv';

let appData = {
    headers: [],
    rows: []
};

let charts = {}; // Gerencia instâncias do Chart.js

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupTabs();
    setupEventListeners();
    fetchData(); // Busca inicial
});

// --- Tema (Claro/Escuro) ---
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

// --- Navegação ---
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
            if(targetId === 'estatisticas') renderCharts();
        });
    });
}

// --- Fetch de Dados com Cache Buster ---
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
        renderPredictions();
        updateGlobalStats();
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
    }
}

// --- Parser, Sanitização e Lógica de Ranking ---
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
    const vitoriasKey = appData.headers.find(h => h.toLowerCase().includes('vitór') || h.toLowerCase().includes('acert') || h.toLowerCase().includes('exato'));
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
        
        // Calcular placares exatos se a coluna existir
        if (vitoriasKey && rowData[vitoriasKey]) {
            rowData['_vitorias'] = parseInt(rowData[vitoriasKey]) || 0;
        } else {
            rowData['_vitorias'] = 0;
        }
        
        return rowData;
    });

    appData.rows = rawRows.filter(row => {
        const nome = row[partKey];
        const pontosRaiz = row[ptsKey];
        if (!nome || nome === '-' || nome.toLowerCase() === 'participante' || nome.trim() === '') return false;
        return !isNaN(parseInt(pontosRaiz));
    });

    // Ordenação com Critérios de Desempate
    appData.rows.sort((a, b) => {
        // 1º Critério: Pontuação Total
        const pA = parseInt(a[ptsKey]) || 0, pB = parseInt(b[ptsKey]) || 0;
        if (pB !== pA) return pB - pA;
        
        // 2º Critério: Vitórias / Placares Exatos
        const vA = a['_vitorias'] || 0, vB = b['_vitorias'] || 0;
        if (vB !== vA) return vB - vA;
        
        // 3º Critério: Número de Participações
        const paA = a['_participacoes'] || 0, paB = b['_participacoes'] || 0;
        if (paB !== paA) return paB - paA;
        
        // 4º Critério: Ordem alfabética
        return a[partKey].localeCompare(b[partKey]);
    });

    // Cálculo do Ranking Denso (empate = mesma posição)
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

// --- Renderização Classificação ---
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
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${displayRank}</td><td class="highlight">${row[partKey]}</td><td><strong>${row[ptsKey]}</strong></td>`;
        tbody.appendChild(tr);
    });
}

// --- Renderização Pódio (Agrupado - mostra todos em caso de empate) ---
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

// --- Renderização Palpites ---
function renderPredictions() {
    const thead = document.querySelector('#table-palpites thead');
    const tbody = document.querySelector('#table-palpites tbody');
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsIndex = appData.headers.findIndex(h => h.toLowerCase().includes('ponto'));
    const games = appData.headers.slice(ptsIndex + 1); 
    
    thead.innerHTML = `<tr><th>Participante</th>${games.map(g => `<th>${g}</th>`).join('')}</tr>`;
    tbody.innerHTML = appData.rows.map(row => `<tr><td><strong>${row[partKey]}</strong></td>${games.map(g => `<td>${row[g] === '-' || !row[g] ? '' : row[g]}</td>`).join('')}</tr>`).join('');
}

// --- Performance e Estatísticas Individuais ---
function searchUserPerformance(name) {
    const resultDiv = document.getElementById('resultado-desempenho');
    if (!name.trim()) { resultDiv.classList.add('hidden'); return; }
    
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const user = appData.rows.find(r => r[partKey].toLowerCase().includes(name.toLowerCase()));

    if (user) {
        resultDiv.classList.remove('hidden');
        const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));
        const ptsIndex = appData.headers.findIndex(h => h.toLowerCase().includes('ponto'));
        const games = appData.headers.slice(ptsIndex + 1);
        
        let disputados = 0;
        let historicoHTML = '';
        
        games.forEach(g => {
            if(user[g] && user[g] !== '-' && user[g].trim() !== '') { 
                disputados++; 
                historicoHTML += `<div class="history-item">
                    <div><strong>${g}</strong></div>
                    <div>Palpite: <span style="color:var(--primary);font-weight:600;">${user[g]}</span> ✅</div>
                </div>`;
            }
        });
        
        document.getElementById('user-historico').innerHTML = historicoHTML || '<p style="text-align:center;padding:20px;color:#999;">Nenhum palpite registrado ainda.</p>';
        document.getElementById('user-total-pontos').innerText = user[ptsKey];
        document.getElementById('user-jogos').innerText = disputados;
        document.getElementById('user-exatos').innerText = user['_vitorias'] || 0;
    } else {
        resultDiv.classList.add('hidden');
    }
}

// --- Estatísticas Gerais ---
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

// --- Gráficos ---
function renderCharts() {
    if (appData.rows.length === 0) return;
    const themeDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const txt = themeDark ? '#FFF' : '#1D1D1B';
    const ptsK = appData.headers.find(h => h.toLowerCase().includes('ponto'));
    const partK = appData.headers.find(h => h.toLowerCase().includes('participante'));

    if(charts.pontos) charts.pontos.destroy();
    if(charts.top10) charts.top10.destroy();

    // Distribuição de Pontos
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
            plugins: { 
                legend: { labels: { color: txt } } 
            }, 
            scales: { 
                x: { ticks: { color: txt } }, 
                y: { ticks: { color: txt }, beginAtZero: true } 
            } 
        }
    });

    // Top 10 Participantes
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
                legend: { 
                    position: 'right', 
                    labels: { color: txt, font: { size: 11 } } 
                } 
            } 
        }
    });
}

// --- Event Listeners ---
function setupEventListeners() {
    document.getElementById('search-classificacao').addEventListener('input', (e) => renderClassification(e.target.value));
    document.getElementById('search-desempenho').addEventListener('input', (e) => searchUserPerformance(e.target.value));
    
    document.getElementById('btn-export').addEventListener('click', () => {
        html2canvas(document.getElementById('tabela-export-area'), { backgroundColor: null }).then(c => {
            const l = document.createElement('a'); 
            l.download = 'classificacao.png'; 
            l.href = c.toDataURL(); 
            l.click();
        });
    });
    
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
