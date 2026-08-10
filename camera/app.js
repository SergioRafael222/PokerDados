// CATEGORIES DEFINITION
const CATEGORIES = [
  { key: 'ases', label: 'Ases (6)', baseValue: 6, type: 'multiplier' },
  { key: 'reis', label: 'Reis (5)', baseValue: 5, type: 'multiplier' },
  { key: 'damas', label: 'Damas (4)', baseValue: 4, type: 'multiplier' },
  { key: 'valetes', label: 'Valetes (3)', baseValue: 3, type: 'multiplier' },
  { key: 'seq', label: 'Seq (15/30/30/60)', type: 'select', options: [20, 40, 30, 60], labels: ['15 (Normal)', '30 (Mão)', '30 (Normal)', '60 (Completo)'] },
  { key: 'fullen', label: 'Fullen (15/30)', type: 'select', options: [15, 30], labels: ['15 (Seq)', '30 (Mão)'] },
  { key: 'poker', label: 'Poker (100/200)', type: 'select', options: [100, 200], labels: ['100 (Normal)', '200 (Ases)'] }
];

const COLUMN_THRESHOLDS = [7, 6, 6, 8, 8];
const CLOSABLE_CATEGORY_KEYS = CATEGORIES.filter(c => c.key !== 'poker').map(c => c.key);
const DICE_FACES = ['A', 'K', 'Q', 'J', '10', '9'];

// STATE MANAGEMENT
let gameState = {
  mode: 'individual', 
  playerCount: 4,     
  players: [],        
  scores: {},         
};

let activeCell = {
  playerIndex: null,
  colIndex: null,
  categoryKey: null
};

// CAMERA SCANNER STATE
let cameraStream = null;
let cameraState = {
  rollIndex: 1, // 1º, 2º ou 3º Lançamento do turno
  diceValues: ['A', 'A', 'A', 'A', 'K'], // 5 dados na mesa
  detectedCategory: 'poker',
  suggestedScore: 100
};

function buildTurnOrder() {
  const order = [];
  if (gameState.mode === 'teams' && gameState.teamPlayers && gameState.teamPlayers.length) {
    const maxLen = Math.max(...gameState.teamPlayers.map(t => t.length));
    for (let i = 0; i < maxLen; i++) {
      gameState.teamPlayers.forEach((teamMembers, teamIndex) => {
        const name = teamMembers[i];
        if (name) order.push({ name, teamIndex });
      });
    }
  } else {
    gameState.players.forEach((name, idx) => order.push({ name, teamIndex: idx }));
  }
  return order;
}

function getCurrentTurnPlayer() {
  if (!gameState.turnOrder || !gameState.turnOrder.length) return null;
  const idx = (gameState.currentTurnIndex || 0) % gameState.turnOrder.length;
  return gameState.turnOrder[idx];
}

function advanceTurn() {
  if (!gameState.turnOrder || !gameState.turnOrder.length) return;
  gameState.currentTurnIndex = ((gameState.currentTurnIndex || 0) + 1) % gameState.turnOrder.length;
}

function skipTurn() {
  advanceTurn();
  saveGame();
  updateTurnIndicator();
}

function updateTurnIndicator() {
  const wrapper = document.getElementById('turn-indicator');
  const nameEl = document.getElementById('turn-indicator-name');
  if (!wrapper || !nameEl) return;

  const current = getCurrentTurnPlayer();
  if (!current) {
    wrapper.style.display = 'none';
    return;
  }

  wrapper.style.display = 'flex';
  const useTeamColor = gameState.mode === 'teams';
  wrapper.classList.toggle('turn-team-1', useTeamColor && current.teamIndex % 2 === 1);

  const teamLabel = useTeamColor ? ` (${gameState.players[current.teamIndex]})` : '';
  nameEl.textContent = `${current.name}${teamLabel}`;
}

window.addEventListener('DOMContentLoaded', () => {
  loadSavedGame();
  initPWA();
});

let deferredPrompt = null;
function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(console.error);
    });
  }

  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.style.display = 'inline-flex';
      installBtn.onclick = async () => {
        installBtn.style.display = 'none';
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt = null;
        }
      };
    });
  }
}

function loadSavedGame() {
  const saved = localStorage.getItem('poker_dados_camera_state_v1');
  if (saved) {
    try {
      gameState = JSON.parse(saved);
      if (gameState.players && gameState.players.length > 0) {
        if (!gameState.turnOrder || !gameState.turnOrder.length) {
          gameState.turnOrder = buildTurnOrder();
          gameState.currentTurnIndex = gameState.currentTurnIndex || 0;
        }
        showScreen('game-screen');
        renderTable();
        updateLeaderboard();
        return;
      }
    } catch (e) {
      console.error(e);
    }
  }
  
  showScreen('setup-screen');
  selectGameMode('individual');
  onPlayerCountChange(4);
}

function saveGame() {
  localStorage.setItem('poker_dados_camera_state_v1', JSON.stringify(gameState));
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function selectGameMode(mode) {
  gameState.mode = mode;
  const indBtn = document.getElementById('mode-individual-btn');
  const teamBtn = document.getElementById('mode-teams-btn');
  const indSetup = document.getElementById('individual-setup');
  const teamSetup = document.getElementById('teams-setup');
  
  if (mode === 'individual') {
    indBtn.classList.add('selected');
    teamBtn.classList.remove('selected');
    indSetup.style.display = 'block';
    teamSetup.style.display = 'none';
    const countSelect = document.getElementById('player-count');
    onPlayerCountChange(parseInt(countSelect.value));
  } else {
    indBtn.classList.remove('selected');
    teamBtn.classList.add('selected');
    indSetup.style.display = 'none';
    teamSetup.style.display = 'block';
    gameState.playerCount = 4;
  }
}

function onPlayerCountChange(count) {
  gameState.playerCount = parseInt(count);
  const container = document.getElementById('individual-players-inputs');
  container.innerHTML = '';

  for (let i = 1; i <= count; i++) {
    const div = document.createElement('div');
    div.innerHTML = `<input type="text" id="player-${i}" class="input-field" placeholder="Jogador ${i}" value="Jogador ${i}">`;
    container.appendChild(div);
  }
}

function startGame() {
  gameState.scores = {};
  gameState.currentTurnIndex = 0;

  if (gameState.mode === 'individual') {
    gameState.players = [];
    for (let i = 1; i <= gameState.playerCount; i++) {
      const name = document.getElementById(`player-${i}`).value.trim() || `Jogador ${i}`;
      gameState.players.push(name);
    }
    gameState.teamPlayers = null;
  } else {
    const t1p1 = document.getElementById('team1-p1').value.trim() || 'Jogador 1';
    const t1p2 = document.getElementById('team1-p2').value.trim() || 'Jogador 2';
    const t2p1 = document.getElementById('team2-p1').value.trim() || 'Jogador 3';
    const t2p2 = document.getElementById('team2-p2').value.trim() || 'Jogador 4';

    gameState.players = ['Equipa 1', 'Equipa 2'];
    gameState.teamPlayers = [[t1p1, t1p2], [t2p1, t2p2]];
    gameState.playerCount = 2;
  }

  gameState.turnOrder = buildTurnOrder();
  saveGame();
  showScreen('game-screen');
  renderTable();
  updateLeaderboard();
}

function resetToSetup() {
  if (confirm("Tem a certeza que deseja reiniciar o jogo? Todos os pontos atuais serão apagados.")) {
    localStorage.removeItem('poker_dados_camera_state_v1');
    loadSavedGame();
  }
}

// SCORECARD COMPUTATIONS
function getColStatus(playerIndex, colIndex) {
  if (colIndex === 0) return { isUnlocked: true, thresholdNeeded: 0, currentOpeningSum: 0 };
  
  const thresholdNeeded = COLUMN_THRESHOLDS[colIndex];
  const prevColIndex = colIndex - 1;
  let prevColSum = 0;

  CLOSABLE_CATEGORY_KEYS.forEach(key => {
    const cellValue = gameState.scores[`${playerIndex}-${prevColIndex}-${key}`];
    if (cellValue !== undefined && cellValue !== null && cellValue !== 'X') {
      prevColSum += Number(cellValue);
    }
  });

  return {
    isUnlocked: prevColSum >= thresholdNeeded,
    thresholdNeeded,
    currentOpeningSum: prevColSum
  };
}

function renderTable() {
  const container = document.getElementById('scorecards-container');
  container.innerHTML = '';

  const renderSinglePlayerCard = (playerIndex, name, subtitle = '') => {
    const card = document.createElement('div');
    card.className = 'player-card';
    
    let grandTotal = 0;

    let tableHtml = `
      <div class="player-card-header">
        <div class="player-card-title-group">
          <div class="player-card-name">${name}</div>
          ${subtitle ? `<div class="player-card-subtitle">${subtitle}</div>` : ''}
        </div>
        <div class="player-card-total" id="card-total-${playerIndex}">Total: 0</div>
      </div>
      <div class="table-responsive-container">
        <table class="scorecard-table">
          <thead>
            <tr>
              <th class="category-cell">Jogadas</th>
              <th>1ª</th>
              <th>2ª</th>
              <th>3ª</th>
              <th>4ª</th>
              <th>5ª</th>
              <th>Total</th>
            </tr>
            <tr>
              <th class="category-cell" style="font-size:0.75rem; color: var(--text-muted);">Abertura</th>
              ${[0, 1, 2, 3, 4].map(colIdx => {
                if (colIdx === 0) return `<th class="threshold-header">-</th>`;
                const status = getColStatus(playerIndex, colIdx);
                const badgeClass = status.isUnlocked ? 'unlocked' : 'locked';
                const badgeText = status.isUnlocked ? 'Aberta' : `${status.thresholdNeeded} pts`;
                return `<th class="threshold-header">${status.thresholdNeeded}<span class="col-status-indicator ${badgeClass}">${badgeText}</span></th>`;
              }).join('')}
              <th class="threshold-header">-</th>
            </tr>
          </thead>
          <tbody>
    `;

    CATEGORIES.forEach(cat => {
      tableHtml += `<tr>`;
      tableHtml += `<td class="category-cell">${cat.label}</td>`;

      [0, 1, 2, 3, 4].map(colIdx => {
        const key = `${playerIndex}-${colIdx}-${cat.key}`;
        const scoreVal = gameState.scores[key];
        const status = getColStatus(playerIndex, colIdx);

        if (!status.isUnlocked) {
          tableHtml += `<td class="score-cell locked-out" onclick="showLockedAlert(${status.thresholdNeeded})">-</td>`;
        } else {
          const displayVal = scoreVal !== undefined ? scoreVal : '';
          const emptyClass = scoreVal === undefined ? 'empty' : '';
          tableHtml += `<td class="score-cell ${emptyClass}" onclick="openScorePicker(${playerIndex}, ${colIdx}, '${cat.key}')">${displayVal}</td>`;
        }
      });

      let rowSum = 0;
      [0, 1, 2, 3, 4].forEach(colIdx => {
        const val = gameState.scores[`${playerIndex}-${colIdx}-${cat.key}`];
        if (val !== undefined && val !== 'X') rowSum += Number(val);
      });
      grandTotal += rowSum;

      tableHtml += `<td class="total-column-cell">${rowSum || '-'}</td>`;
      tableHtml += `</tr>`;
    });

    tableHtml += `
            <tr class="total-row">
              <td class="category-cell">TOTAL</td>
              ${[0, 1, 2, 3, 4].map(colIdx => {
                let colSum = 0;
                CATEGORIES.forEach(cat => {
                  const val = gameState.scores[`${playerIndex}-${colIdx}-${cat.key}`];
                  if (val !== undefined && val !== 'X') colSum += Number(val);
                });
                return `<td>${colSum}</td>`;
              }).join('')}
              <td class="grand-total-cell">${grandTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    card.innerHTML = tableHtml;
    container.appendChild(card);

    const totalBadge = card.querySelector(`#card-total-${playerIndex}`);
    if (totalBadge) totalBadge.textContent = `Total: ${grandTotal}`;
  };

  if (gameState.mode === 'teams' && gameState.teamPlayers) {
    gameState.teamPlayers.forEach((teamMembers, teamIdx) => {
      const teamWrapper = document.createElement('div');
      teamWrapper.className = `team-container team-${teamIdx + 1}`;
      
      let teamGrandTotal = 0;
      teamMembers.forEach((_, memberIdx) => {
        const playerGlobalIdx = teamIdx === 0 ? memberIdx : memberIdx + teamMembers.length;
        [0, 1, 2, 3, 4].forEach(colIdx => {
          CATEGORIES.forEach(cat => {
            const val = gameState.scores[`${playerGlobalIdx}-${colIdx}-${cat.key}`];
            if (val !== undefined && val !== 'X') teamGrandTotal += Number(val);
          });
        });
      });

      teamWrapper.innerHTML = `
        <div class="team-header-banner team-${teamIdx + 1}">
          <h2>${gameState.players[teamIdx]}</h2>
          <div class="team-total-badge">Total Equipa: ${teamGrandTotal}</div>
        </div>
      `;
      container.appendChild(teamWrapper);

      teamMembers.forEach((memberName, memberIdx) => {
        const playerGlobalIdx = teamIdx === 0 ? memberIdx : memberIdx + teamMembers.length;
        renderSinglePlayerCard(playerGlobalIdx, memberName, gameState.players[teamIdx]);
      });
    });
  } else {
    gameState.players.forEach((pName, pIdx) => {
      renderSinglePlayerCard(pIdx, pName);
    });
  }
}

function showLockedAlert(needed) {
  alert(`Esta coluna está fechada! Precisas de somar pelo menos ${needed} pontos na coluna anterior para abrir esta coluna.`);
}

function openScorePicker(playerIndex, colIndex, categoryKey) {
  activeCell = { playerIndex, colIndex, categoryKey };
  const category = CATEGORIES.find(c => c.key === categoryKey);
  const playerName = gameState.players[playerIndex] || `Jogador ${playerIndex + 1}`;
  
  document.getElementById('picker-category').textContent = category.label;
  document.getElementById('picker-player').textContent = `${playerName} - Coluna ${colIndex + 1}`;

  const grid = document.getElementById('picker-buttons');
  grid.innerHTML = '';

  if (category.type === 'multiplier') {
    [1, 2, 3, 4, 5].forEach(count => {
      const score = count * category.baseValue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'modal-score-btn';
      btn.innerHTML = `${score}<span class="btn-label">${count} x</span>`;
      btn.onclick = () => selectScoreValue(score);
      grid.appendChild(btn);
    });
  } else if (category.type === 'select') {
    category.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'modal-score-btn';
      btn.innerHTML = `${opt}<span class="btn-label">${category.labels[idx]}</span>`;
      btn.onclick = () => selectScoreValue(opt);
      grid.appendChild(btn);
    });
  }

  // Riscar / Cortar opção (X)
  const xBtn = document.createElement('button');
  xBtn.type = 'button';
  xBtn.className = 'modal-score-btn';
  xBtn.style.color = 'var(--danger-color)';
  xBtn.innerHTML = `X<span class="btn-label">Riscar</span>`;
  xBtn.onclick = () => selectScoreValue('X');
  grid.appendChild(xBtn);

  document.getElementById('score-picker-modal').classList.add('active');
}

function closeScorePicker() {
  document.getElementById('score-picker-modal').classList.remove('active');
}

function selectScoreValue(value) {
  if (activeCell.playerIndex !== null && activeCell.colIndex !== null && activeCell.categoryKey !== null) {
    const key = `${activeCell.playerIndex}-${activeCell.colIndex}-${activeCell.categoryKey}`;
    gameState.scores[key] = value;
    advanceTurn();
    saveGame();
    renderTable();
    updateLeaderboard();
    closeScorePicker();
  }
}

function clearScoreValue() {
  if (activeCell.playerIndex !== null && activeCell.colIndex !== null && activeCell.categoryKey !== null) {
    const key = `${activeCell.playerIndex}-${activeCell.colIndex}-${activeCell.categoryKey}`;
    delete gameState.scores[key];
    saveGame();
    renderTable();
    updateLeaderboard();
    closeScorePicker();
  }
}

function updateLeaderboard() {
  updateTurnIndicator();
}

// ==========================================================================
// CAMERA WEBRTC & AI DICE DETECTION MODULE
// ==========================================================================

function openCameraScanner() {
  document.getElementById('camera-modal').classList.add('active');
  cameraState.rollIndex = 1;
  setRollIndex(1);
  startCameraStream();
  simulateRandomRollDetection();
}

function openCameraScannerForCurrentCell() {
  closeScorePicker();
  openCameraScanner();
}

function closeCameraScanner() {
  stopCameraStream();
  document.getElementById('camera-modal').classList.remove('active');
}

async function startCameraStream() {
  const videoEl = document.getElementById('camera-stream');
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      videoEl.srcObject = cameraStream;
    }
  } catch (err) {
    console.warn("Câmera real indisponível (a usar simulador de visão computacional):", err);
  }
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
}

function setRollIndex(index) {
  cameraState.rollIndex = index;
  [1, 2, 3].forEach(i => {
    const btn = document.getElementById(`roll-btn-${i}`);
    if (btn) btn.classList.toggle('active', i === index);
  });
  
  const statusEl = document.getElementById('roll-status-text');
  if (statusEl) {
    if (index === 1) statusEl.textContent = "1º Lançamento (Mão / Servido)";
    else if (index === 2) statusEl.textContent = "2º Lançamento (Construído)";
    else statusEl.textContent = "3º Lançamento (Final)";
  }

  analyzeDiceCombination();
}

function cycleDiceValue(chipIndex) {
  const currentVal = cameraState.diceValues[chipIndex];
  const currentIdx = DICE_FACES.indexOf(currentVal);
  const nextIdx = (currentIdx + 1) % DICE_FACES.length;
  cameraState.diceValues[chipIndex] = DICE_FACES[nextIdx];

  const chipEl = document.getElementById(`dice-chip-${chipIndex}`);
  if (chipEl) chipEl.textContent = cameraState.diceValues[chipIndex];

  analyzeDiceCombination();
}

function simulateRandomRollDetection() {
  const samples = [
    ['A', 'A', 'A', 'A', 'K'], // Poker Ases
    ['A', 'A', 'A', 'A', 'A'], // Poker Ases Servido
    ['K', 'K', 'K', 'K', 'Q'], // Poker Reis
    ['A', 'K', 'Q', 'J', '10'], // Sequência Ases
    ['K', 'Q', 'J', '10', '9'], // Sequência Reis
    ['A', 'A', 'A', 'K', 'K'], // Fullen Ases/Reis
    ['Q', 'Q', 'Q', 'J', '9']
  ];

  const choice = samples[Math.floor(Math.random() * samples.length)];
  cameraState.diceValues = [...choice];

  for (let i = 0; i < 5; i++) {
    const chipEl = document.getElementById(`dice-chip-${i}`);
    if (chipEl) chipEl.textContent = cameraState.diceValues[i];
  }

  analyzeDiceCombination();
}

// ALGORITMO DE ANÁLISE DE COMBINAÇÃO DE DADOS & REGRAS DE POKER DE DADOS
function analyzeDiceCombination() {
  const dice = cameraState.diceValues;
  const counts = {};
  dice.forEach(d => counts[d] = (counts[d] || 0) + 1);

  const alertBox = document.getElementById('ai-suggestion-alert');
  let category = 'ases';
  let suggestedScore = 0;
  let label = '';

  const maxFreq = Math.max(...Object.values(counts));
  const roll = cameraState.rollIndex;

  // Deteção de POKER (4 ou 5 iguais)
  if (maxFreq >= 4) {
    category = 'poker';
    // Regra do Poker: se saírem 5 Ases no 1º Lançamento (Mão/Servido) -> 200 pts! Caso contrário -> 100 pts.
    if (counts['A'] === 5 && roll === 1) {
      suggestedScore = 200;
      label = `🎯 Detetado POKER DE ASES SERVIDO (200 Pontos no 1º Lançamento!)`;
    } else {
      suggestedScore = 100;
      label = `🎯 Detetado POKER (${suggestedScore} Pontos no Lançamento ${roll})`;
    }
  } 
  // Deteção de SEQUÊNCIA (A-K-Q-J-10 ou K-Q-J-10-9)
  else if (
    (counts['A'] && counts['K'] && counts['Q'] && counts['J'] && counts['10']) ||
    (counts['K'] && counts['Q'] && counts['J'] && counts['10'] && counts['9'])
  ) {
    category = 'seq';
    suggestedScore = roll === 1 ? 60 : 30; // 60 pts se for no 1º lançamento (Completo/Servido), senão 30
    label = `🎯 Detetada SEQUÊNCIA (${suggestedScore} Pontos - ${roll === 1 ? 'Servido no 1º Lançamento' : 'Normal'})`;
  }
  // Deteção de FULLEN (3 iguais + 2 iguais)
  else if (Object.values(counts).includes(3) && Object.values(counts).includes(2)) {
    category = 'fullen';
    suggestedScore = roll === 1 ? 30 : 15; // 30 pts se for no 1º lançamento (Mão), senão 15
    label = `🎯 Detetado FULLEN (${suggestedScore} Pontos - ${roll === 1 ? 'Mão no 1º Lançamento' : 'Normal'})`;
  }
  // Contagem de figuras (Ases, Reis, Damas, Valetes)
  else {
    if (counts['A']) { category = 'ases'; suggestedScore = counts['A'] * 6; label = `🎯 Detetados ${counts['A']} Ases (${suggestedScore} pts)`; }
    else if (counts['K']) { category = 'reis'; suggestedScore = counts['K'] * 5; label = `🎯 Detetados ${counts['K']} Reis (${suggestedScore} pts)`; }
    else if (counts['Q']) { category = 'damas'; suggestedScore = counts['Q'] * 4; label = `🎯 Detetadas ${counts['Q']} Damas (${suggestedScore} pts)`; }
    else if (counts['J']) { category = 'valetes'; suggestedScore = counts['J'] * 3; label = `🎯 Detetados ${counts['J']} Valetes (${suggestedScore} pts)`; }
  }

  cameraState.detectedCategory = category;
  cameraState.suggestedScore = suggestedScore;
  if (alertBox) alertBox.textContent = label;
}

function applyCameraDetectedScore() {
  const currentTurn = getCurrentTurnPlayer();
  if (!currentTurn) {
    alert("Nenhum jogador selecionado.");
    closeCameraScanner();
    return;
  }

  const pIdx = gameState.turnOrder[gameState.currentTurnIndex % gameState.turnOrder.length].teamIndex;
  const categoryKey = cameraState.detectedCategory;
  
  // Procura a primeira coluna desbloqueada e vazia para esta categoria
  let targetCol = null;
  for (let c = 0; c < 5; c++) {
    const status = getColStatus(pIdx, c);
    if (status.isUnlocked && gameState.scores[`${pIdx}-${c}-${categoryKey}`] === undefined) {
      targetCol = c;
      break;
    }
  }

  if (targetCol === null) {
    alert(`A categoria '${categoryKey.toUpperCase()}' já se encontra totalmente preenchida ou bloqueada nas tuas colunas!`);
    closeCameraScanner();
    return;
  }

  const key = `${pIdx}-${targetCol}-${categoryKey}`;
  gameState.scores[key] = cameraState.suggestedScore;

  advanceTurn();
  saveGame();
  renderTable();
  updateLeaderboard();
  closeCameraScanner();
}
