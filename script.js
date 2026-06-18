// Configurações e Estado Global
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTTqRYCxqqTeJLzCpTWOy9CAN_Dh8pWyQquoWLDeCtT8ThDgt4kqi40F5tEXnbAwEVqnzC01MZbOHqT/pub?gid=1254969741&single=true&output=csv';

let appData = {
    headers: [],
    rows: []
};

let charts = {};

// Inicialização
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
            if(targetId === 'estatisticas') renderCharts();
        });
    });
}

// Busca ativa com prevenção total de cache
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
        document.querySelector('#table-classificacao tbody').innerHTML = 
            `<tr><td colspan="3" style="text-align:center; color:red; padding:20px;">Erro ao sincronizar. Verifique as configurações de publicação da planilha.</td></tr>`;
    }
}

// --- Parser e Sanitização com Cálculo de Ranking Denso ---
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
    const vitoriasKey = appData.headers.find(h => h.toLowerCase().includes('vitór') || h.toLowerCase().includes('acert'));
    const ptsIndex = appData.headers.findIndex(h => h.toLowerCase().includes('ponto'));
    const gamesHeaders = appData.headers.slice(ptsIndex + 1);

    let rawRows = lines.slice(headerIndex + 1).map(line => {
        const values = line.split(',').map(v => v.replace(/\r|"/g, '').trim());
        let rowData = {};
        appData.headers.forEach((header, index) => { rowData[header] = values[index] || '-'; });
        
        // Contagem de participações
        let participacoes = 0;
        gamesHeaders.forEach(game => {
            if (rowData[game] && rowData[game] !== '-') participacoes++;
        });
        rowData['_participacoes'] = participacoes;
        return rowData;
    });

    // Filtro de sanitização
    appData.rows = rawRows.filter(row => {
        const nome = row[partKey];
        const pontosRaiz = row[ptsKey];
        if (!nome || nome === '-' || nome.toLowerCase() === 'participante' || nome.trim() === '') return false;
        return !isNaN(parseInt(pontosRaiz));
    });

    // Ordenação inicial
    appData.rows.sort((a, b) => {
        const pontosA = parseInt(a[ptsKey]) || 0;
        const pontosB = parseInt(b[ptsKey]) || 0;
        if (pontosB !== pontosA) return pontosB - pontosA;

        if (vitoriasKey) {
            const vitA = parseInt(a[vitoriasKey]) || 0;
            const vitB = parseInt(b[vitoriasKey]) || 0;
            if (vitB !== vitA) return vitB - vitA;
        }

        const partA = a['_participacoes'] || 0;
        const partB = b['_participacoes'] || 0;
        if (partB !== partA) return partB - partA;

        // Se empatar em TUDO, a ordem no array fica alfabética para ficar organizado
        return a[partKey].localeCompare(b[partKey]);
    });

    // CÁLCULO DE POSIÇÃO (RANKING DENSO) - Agrupa empates na mesma posição
    if (appData.rows.length > 0) {
        let currentRank = 1;
        appData.rows[0]._rank = 1;

        for (let i = 1; i < appData.rows.length; i++) {
            const prev = appData.rows[i - 1];
            const curr = appData.rows[i];

            const samePoints = parseInt(prev[ptsKey]) === parseInt(curr[ptsKey]);
            const sameWins = (vitoriasKey ? parseInt(prev[vitoriasKey]) || 0 : 0) === (vitoriasKey ? parseInt(curr[vitoriasKey]) || 0 : 0);
            const sameParts = prev['_participacoes'] === curr['_participacoes'];

            // Se for exatamente igual nos 3 critérios, recebe a MESMA posição do anterior
            if (samePoints && sameWins && sameParts) {
                curr._rank = currentRank; 
            } else {
                currentRank++; // Se diferir, desce um degrau no ranking
                curr._rank = currentRank;
            }
        }
    }
}

// --- Aba 1: Classificação (Baseada no Rank real) ---
function renderClassification(filterText = '') {
    const tbody = document.querySelector('#table-classificacao tbody');
    tbody.innerHTML = '';
    
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));

    const filteredRows = appData.rows.filter(row => 
        row[partKey].toLowerCase().includes(filterText.toLowerCase())
    );

    filteredRows.forEach(row => {
        // Usa a posição calculada em vez do índice do array
        let displayRank = row._rank; 
        if (row._rank === 1) displayRank = '🥇';
        else if (row._rank === 2) displayRank = '🥈';
        else if (row._rank === 3) displayRank = '🥉';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${displayRank}</td>
            <td class="highlight">${row[partKey]}</td>
            <td><strong>${row[ptsKey]}</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Top 3 Pódio (Suporta múltiplos nomes por degrau) ---
function renderTop3() {
    const container = document.getElementById('top3-cards');
    container.innerHTML = '';
    if (appData.rows.length === 0) return;
    
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));

    // Filtra todos os participantes que estão nas posições 1, 2 e 3
    const rank1 = appData.rows.filter(r => r._rank === 1);
    const rank2 = appData.rows.filter(r => r._rank === 2);
    const rank3 = appData.rows.filter(r => r._rank === 3);

    // Função para juntar nomes empatados com quebra de linha (<br>)
    const formatNames = (arr) => arr.map(r => r[partKey]).join('<br>');
    const getPts = (arr) => arr.length > 0 ? arr[0][ptsKey] : '-';

    const podiumOrder = [];
    if (rank2.length > 0) podiumOrder.push({ names: formatNames(rank2), pts: getPts(rank2), pos: 2, medal: '🥈' });
    if (rank1.length > 0) podiumOrder.push({ names: formatNames(rank1), pts: getPts(rank1), pos: 1, medal: '🥇' });
    if (rank3.length > 0) podiumOrder.push({ names: formatNames(rank3), pts: getPts(rank3), pos: 3, medal: '🥉' });

    podiumOrder.forEach(item => {
        container.innerHTML += `
            <div class="card-top pos-${item.pos}">
                <div class="medal">${item.medal}</div>
                <div class="top-name">${item.names}</div>
                <div class="top-pts">${item.pts} pts</div>
            </div>
        `;
    });
}

    // Monta a ordem visual clássica de pódio: [2º Lugar, 1º Lugar, 3º Lugar]
    const podiumOrder = [];
    if (appData.rows[1]) podiumOrder.push({ data: appData.rows[1], pos: 2, medal: '🥈' });
    if (appData.rows[0]) podiumOrder.push({ data: appData.rows[0], pos: 1, medal: '🥇' });
    if (appData.rows[2]) podiumOrder.push({ data: appData.rows[2], pos: 3, medal: '🥉' });

    podiumOrder.forEach(item => {
        container.innerHTML += `
            <div class="card-top pos-${item.pos}">
                <div class="medal">${item.medal}</div>
                <div class="top-name">${item.data[partKey]}</div>
                <div class="top-pts">${item.data[ptsKey]} pts</div>
            </div>
        `;
    });
}

function renderPredictions() {
    const thead = document.querySelector('#table-palpites thead');
    const tbody = document.querySelector('#table-palpites tbody');
    
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsIndex = appData.headers.findIndex(h => h.toLowerCase().includes('ponto'));
    const gamesHeaders = appData.headers.slice(ptsIndex + 1); 
    
    let theadHTML = `<tr><th>Participante</th>`;
    gamesHeaders.forEach(game => { theadHTML += `<th>${game}</th>`; });
    theadHTML += `</tr>`;
    thead.innerHTML = theadHTML;

    tbody.innerHTML = '';
    appData.rows.forEach(row => {
        let tr = document.createElement('tr');
        let tdHTML = `<td><strong>${row[partKey]}</strong></td>`;
        gamesHeaders.forEach(game => {
            let palpite = row[game] === '-' || !row[game] ? '' : row[game];
            tdHTML += `<td>${palpite}</td>`;
        });
        tr.innerHTML = tdHTML;
        tbody.appendChild(tr);
    });
}

function searchUserPerformance(name) {
    const resultDiv = document.getElementById('resultado-desempenho');
    if (!name.trim()) {
        resultDiv.classList.add('hidden');
        return;
    }
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const user = appData.rows.find(r => r[partKey].toLowerCase().includes(name.toLowerCase()));

    if (user) {
        resultDiv.classList.remove('hidden');
        const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));
        const ptsIndex = appData.headers.findIndex(h => h.toLowerCase().includes('ponto'));
        const gamesHeaders = appData.headers.slice(ptsIndex + 1);
        
        let jogosDisputados = 0;
        const historyList = document.getElementById('user-historico');
        historyList.innerHTML = '';

        gamesHeaders.forEach(game => {
            const palpite = user[game];
            if (palpite && palpite !== '-') {
                jogosDisputados++;
                historyList.innerHTML += `
                    <div class="history-item">
                        <div><strong>${game}</strong></div>
                        <div>Palpite: ${palpite} ✅</div>
                    </div>
                `;
            }
        });
        document.getElementById('user-total-pontos').innerText = user[ptsKey];
        document.getElementById('user-jogos').innerText = jogosDisputados;
        document.getElementById('user-exatos').innerText = "-"; 
    } else {
        resultDiv.classList.add('hidden');
    }
}

function updateGlobalStats() {
    const statsContainer = document.getElementById('geral-stats');
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));
    const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));
    const ptsIndex = appData.headers.findIndex(h => h.toLowerCase().includes('ponto'));
    
    const totalPart = appData.rows.length;
    const partPontuaram = appData.rows.filter(r => parseInt(r[ptsKey]) > 0).length;
    const lider = appData.rows[0] ? appData.rows[0][partKey] : '-';
    const jogosTotais = appData.headers.slice(ptsIndex + 1).length;

    statsContainer.innerHTML = `
        <div class="stat-card"><h3>Total de Participantes</h3><p class="stat-value">${totalPart}</p></div>
        <div class="stat-card"><h3>Já Pontuaram</h3><p class="stat-value">${partPontuaram}</p></div>
        <div class="stat-card"><h3>Rodadas/Jogos</h3><p class="stat-value">${jogosTotais}</p></div>
        <div class="stat-card"><h3>Líder Atual</h3><p class="stat-value" style="font-size: 1.4rem;">${lider}</p></div>
    `;
}

function renderCharts() {
    if (appData.rows.length === 0) return;
    const textColor = document.documentElement.getAttribute('data-theme') === 'dark' ? '#FFF' : '#1D1D1B';
    const ptsKey = appData.headers.find(h => h.toLowerCase().includes('ponto'));
    const partKey = appData.headers.find(h => h.toLowerCase().includes('participante'));

    if(charts.pontos) charts.pontos.destroy();
    if(charts.top10) charts.top10.destroy();

    const pontuacoes = appData.rows.map(r => parseInt(r[ptsKey]) || 0);
    const contagem = {};
    pontuacoes.forEach(p => contagem[p] = (contagem[p] || 0) + 1);

    const ctxPontos = document.getElementById('pontosChart').getContext('2d');
    charts.pontos = new Chart(ctxPontos, {
        type: 'bar',
        data: {
            labels: Object.keys(contagem).map(k => `${k} pts`),
            datasets: [{ label: 'Participantes', data: Object.values(contagem), backgroundColor: '#0092DD', borderRadius: 5 }]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: textColor } } },
            scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor }, beginAtZero: true } }
        }
    });

    const top10Data = appData.rows.slice(0, 10);
    const ctxTop10 = document.getElementById('top10Chart').getContext('2d');
    charts.top10 = new Chart(ctxTop10, {
        type: 'doughnut',
        data: {
            labels: top10Data.map(r => r[partKey]),
            datasets: [{ data: top10Data.map(r => parseInt(r[ptsKey]) || 0), backgroundColor: ['#0092DD', '#FDC533', '#2FAC66', '#E94362', '#005CA9', '#D88BB6', '#954B97', '#C6C6C6', '#1D1D1B', '#333333'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: textColor } } } }
    });
}

function setupEventListeners() {
    document.getElementById('search-classificacao').addEventListener('input', (e) => renderClassification(e.target.value));
    document.getElementById('search-desempenho').addEventListener('input', (e) => searchUserPerformance(e.target.value));
    document.getElementById('btn-export').addEventListener('click', () => {
        const target = document.getElementById('tabela-export-area');
        html2canvas(target, { backgroundColor: null }).then(canvas => {
            const link = document.createElement('a');
            link.download = 'classificacao-bolao.png';
            link.href = canvas.toDataURL();
            link.click();
        });
    });
    document.getElementById('btn-share').addEventListener('click', () => {
        if (navigator.share) {
            navigator.share({ title: 'Bolão TETO', text: 'Confira os resultados!', url: window.location.href }).catch(console.error);
        } else {
            alert('Link da página: ' + window.location.href);
        }
    });
}
