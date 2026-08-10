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

// COLUMN THRESHOLDS FOR OPENING (7, 6, 6, 8, 8) 
const COLUMN_THRESHOLDS = [7, 6, 6, 8, 8];

// Categorias que participam no mecanismo de "fechar categoria" e no fim de jogo.
// O Poker fica de fora: raramente se enche, por isso nunca fecha, nunca risca e nunca duplica.
const CLOSABLE_CATEGORY_KEYS = CATEGORIES.filter(c => c.key !== 'poker').map(c => c.key);

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

// Constrói a ordem de turno: em equipas, intercala os jogadores das duas equipas
// (ex.: T1-Jogador1, T2-Jogador1, T1-Jogador2, T2-Jogador2, repete...).
// Em modo individual, segue a ordem em que os jogadores foram inseridos.
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

// PWA Service Worker & Install Prompt Registration
let deferredPrompt = null;

function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('Service Worker registado com sucesso:', reg.scope))
        .catch((err) => console.error('Falha ao registar Service Worker:', err));
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
          const { outcome } = await deferredPrompt.userChoice;
          console.log(`Instalação da PWA: ${outcome}`);
          deferredPrompt = null;
        }
      };
    });

    window.addEventListener('appinstalled', () => {
      console.log('Poker de Dados instalado com sucesso!');
      installBtn.style.display = 'none';
      deferredPrompt = null;
    });
  }
}

function loadSavedGame() {
  const saved = localStorage.getItem('poker_dados_state_v2');
  if (saved) {
    try {
      gameState = JSON.parse(saved);
      if (gameState.mode === 'teams' && !gameState.teamPlayers && gameState.players && gameState.players.length === 4) {
        gameState.teamPlayers = [
          [gameState.players[0], gameState.players[1]],
          [gameState.players[2], gameState.players[3]]
        ];
        gameState.players = ['Equipa 1', 'Equipa 2'];
        gameState.playerCount = 2;
      }
      if (gameState.players && gameState.players.length > 0) {
        // Compatibilidade com jogos guardados antes da funcionalidade de turnos
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
      console.error("Error loading saved game:", e);
    }
  }
  
  showScreen('setup-screen');
  selectGameMode('individual');
  onPlayerCountChange(4);
}

function saveGame() {
  localStorage.setItem('poker_dados_state_v2', JSON.stringify(gameState));
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
  
  for (let i = 0; i < gameState.playerCount; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-field';
    input.id = `ind-player-${i}`;
    input.placeholder = `Jogador ${i + 1}`;
    input.value = `Jogador ${i + 1}`;
    container.appendChild(input);
  }
}

function startGame() {
  gameState.players = [];
  gameState.scores = {};
  
  if (gameState.mode === 'individual') {
    for (let i = 0; i < gameState.playerCount; i++) {
      const nameVal = document.getElementById(`ind-player-${i}`).value.trim();
      gameState.players.push(nameVal || `Jogador ${i + 1}`);
    }
  } else {
    const t1p1 = document.getElementById('team1-p1').value.trim() || 'Jogador 1';
    const t1p2 = document.getElementById('team1-p2').value.trim() || 'Jogador 2';
    const t2p1 = document.getElementById('team2-p1').value.trim() || 'Jogador 3';
    const t2p2 = document.getElementById('team2-p2').value.trim() || 'Jogador 4';
    
    gameState.teamPlayers = [[t1p1, t1p2], [t2p1, t2p2]];
    gameState.players = ['Equipa 1', 'Equipa 2'];
    gameState.playerCount = 2;
  }
  
  gameState.turnOrder = buildTurnOrder();
  gameState.currentTurnIndex = 0;
  saveGame();
  showScreen('game-screen');
  renderTable();
  updateLeaderboard();
}

function resetToSetup() {
  if (confirm("Tens a certeza que queres iniciar um novo jogo? Todos os pontos atuais serão apagados.")) {
    localStorage.removeItem('poker_dados_state_v2');
    showScreen('setup-screen');
    selectGameMode(gameState.mode);
  }
}

function isColumnOpen(playerIndex, colIndex) {
  const figures = ['ases', 'reis', 'damas', 'valetes'];
  for (let key of figures) {
    const score = gameState.scores[`${playerIndex}-${colIndex}-${key}`];
    if (score !== undefined && score !== null && score >= COLUMN_THRESHOLDS[colIndex]) {
      return true;
    }
  }
  return false;
}

// Verifica se a linha de uma categoria está totalmente preenchida (todas as 5 colunas) para um jogador/equipa
function isCategoryFullyFilled(playerIndex, categoryKey) {
  for (let col = 0; col < COLUMN_THRESHOLDS.length; col++) {
    const key = `${playerIndex}-${col}-${categoryKey}`;
    if (gameState.scores[key] === undefined || gameState.scores[key] === null) return false;
  }
  return true;
}

// Uma categoria fica "fechada" para todos assim que QUALQUER jogador/equipa a completa.
// O Poker nunca fecha: é raro alguém preencher as 5 colunas, por isso fica sempre livre.
function isCategoryClosed(categoryKey) {
  if (categoryKey === 'poker') return false;
  for (let p = 0; p < gameState.players.length; p++) {
    if (isCategoryFullyFilled(p, categoryKey)) return true;
  }
  return false;
}

// Total de pontos que um jogador já tem numa categoria (mesma lógica usada célula a célula no render)
function getCategoryRawTotal(playerIndex, categoryKey) {
  const category = CATEGORIES.find(c => c.key === categoryKey);
  if (!category) return 0;
  const allowsImmediate = category.key === 'seq' || category.key === 'fullen' || category.key === 'poker';
  let total = 0;
  for (let col = 0; col < COLUMN_THRESHOLDS.length; col++) {
    const valRaw = gameState.scores[`${playerIndex}-${col}-${categoryKey}`];
    if (valRaw === undefined || valRaw === null) continue;
    const val = Number(valRaw);
    const colOpen = isColumnOpen(playerIndex, col);
    if (category.type === 'multiplier') {
      if (colOpen) total += val * (category.baseValue || 1);
    } else if (allowsImmediate || colOpen) {
      total += val;
    }
  }
  return total;
}

// Total final de uma categoria, aplicando o bónus de "fechar categoria":
// se este jogador/equipa a completou e todos os outros têm zero nessa categoria, o total duplica.
function getCategoryFinalTotal(playerIndex, categoryKey) {
  const raw = getCategoryRawTotal(playerIndex, categoryKey);
  if (!isCategoryClosed(categoryKey)) return raw;
  if (!isCategoryFullyFilled(playerIndex, categoryKey) || raw <= 0) return raw;

  const others = gameState.players.map((_, idx) => idx).filter(idx => idx !== playerIndex);
  if (others.length === 0) return raw;
  const othersHaveNone = others.every(idx => getCategoryRawTotal(idx, categoryKey) === 0);

  return othersHaveNone ? raw * 2 : raw;
}

function formatScore(val, isSpecial = false, category = null) {
  if (val === undefined || val === null) return '-';
  if (isSpecial) return val;
  if (!category || !category.label) return val.toString();
  const categoryName = category.label.split(' ')[0];
  return `${val} ${categoryName}`;
}

// Quantas categorias (sem contar o Poker) já foram fechadas por alguém
function countClosedCategories() {
  return CLOSABLE_CATEGORY_KEYS.filter(key => isCategoryClosed(key)).length;
}

// O jogo termina quando só falta fechar 1 categoria (sem contar o Poker) - ou seja,
// assim que a penúltima categoria fecha. Não é preciso preencher o Poker.
function isGameFinished() {
  return countClosedCategories() >= CLOSABLE_CATEGORY_KEYS.length - 1;
}

function renderTable() {
  const container = document.getElementById('scorecards-container');
  container.innerHTML = '';
  
  const isTeams = gameState.mode === 'teams';
  const showTotals = isGameFinished();
  
  gameState.players.forEach((playerName, pIndex) => {
    let playerGrandTotal = 0;
    const colTotals = [0, 0, 0, 0, 0];
    
    const card = document.createElement('div');
    card.className = 'player-card';
    
    const cardHeader = document.createElement('div');
    cardHeader.className = 'player-card-header';
    
    const cardTitleGroup = document.createElement('div');
    cardTitleGroup.className = 'player-card-title-group';
    
    const cardName = document.createElement('div');
    cardName.className = 'player-card-name';
    cardName.textContent = playerName;
    cardTitleGroup.appendChild(cardName);
    
    if (isTeams) {
      const teamPlayers = (gameState.teamPlayers && gameState.teamPlayers[pIndex]) || [];
      if (teamPlayers.length) {
        const cardSubtitle = document.createElement('div');
        cardSubtitle.className = 'player-card-subtitle';
        cardSubtitle.textContent = teamPlayers.join(' / ');
        cardTitleGroup.appendChild(cardSubtitle);
      }
    }
    
    cardHeader.appendChild(cardTitleGroup);
    
    // Only display Total badge if game is finished for at least one table
    if (showTotals) {
      const cardTotalBadge = document.createElement('div');
      cardTotalBadge.className = 'player-card-total';
      cardTotalBadge.id = `player-${pIndex}-total-badge`;
      cardTotalBadge.textContent = 'Total: 0 pts';
      cardHeader.appendChild(cardTotalBadge);
    }
    
    card.appendChild(cardHeader);
    
    const tableDiv = document.createElement('div');
    tableDiv.className = 'table-responsive-container';
    
    const table = document.createElement('table');
    table.className = 'scorecard-table';
    
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const thCorner = document.createElement('th');
    thCorner.textContent = 'Categoria';
    thCorner.style.width = '110px';
    headerRow.appendChild(thCorner);
    
    // Render threshold headers without "Fechada/Aberta" labels
    COLUMN_THRESHOLDS.forEach((threshold) => {
      const th = document.createElement('th');
      th.className = 'threshold-header';
      th.textContent = threshold;
      headerRow.appendChild(th);
    });
    
    if (showTotals) {
      const thTotal = document.createElement('th');
      thTotal.textContent = 'Total';
      thTotal.style.width = '75px';
      headerRow.appendChild(thTotal);
    }
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    const tbody = document.createElement('tbody');
    
    CATEGORIES.forEach(cat => {
      const tr = document.createElement('tr');
      const categoryClosed = isCategoryClosed(cat.key);
      if (categoryClosed) tr.classList.add('category-closed-row');

      const tdLabel = document.createElement('td');
      tdLabel.className = 'category-cell';
      if (categoryClosed) {
        const finalTotal = getCategoryFinalTotal(pIndex, cat.key);
        tdLabel.innerHTML = `<span class="category-label-closed">${cat.label}</span><span class="category-final-total">${finalTotal} pts</span>`;
      } else {
        tdLabel.textContent = cat.label;
      }
      tr.appendChild(tdLabel);
      
      let categoryCountSum = 0;
      let categoryPointsSum = 0;

      COLUMN_THRESHOLDS.forEach((threshold, colIdx) => {
        const td = document.createElement('td');
        td.className = 'score-cell';
        if (categoryClosed) td.classList.add('locked-out');

        const scoreKey = `${pIndex}-${colIdx}-${cat.key}`;
        const valRaw = gameState.scores[scoreKey];
        const val = (valRaw === undefined || valRaw === null) ? null : Number(valRaw);

        const isSpec = cat.type === 'select';
        const colOpen = isColumnOpen(pIndex, colIdx);
        const allowsImmediate = cat.key === 'seq' || cat.key === 'fullen' || cat.key === 'poker';

        if (val === null) {
          td.classList.add('empty');
          td.innerHTML = '-';
        } else {
          if (!isSpec) {
            if (colOpen) {
              categoryCountSum += val;
              categoryPointsSum += val * (cat.baseValue || 1);
              colTotals[colIdx] += val;
              td.innerHTML = formatScore(categoryCountSum, false, cat);
            } else {
              td.innerHTML = formatScore(val, false, cat);
              td.classList.add('closed-entry');
            }
          } else {
            td.innerHTML = formatScore(val, true, cat);
            if (allowsImmediate || colOpen) {
              categoryPointsSum += val;
              colTotals[colIdx] += val;
            }
          }
        }

        if (categoryClosed) {
          td.addEventListener('click', () => alert(`A categoria "${cat.label}" já está fechada e não pode ser alterada.`));
        } else {
          td.addEventListener('click', () => openScorePicker(pIndex, colIdx, cat.key));
        }
        tr.appendChild(td);
      });

      // Aplica o bónus de "fechar categoria" (duplicar) ao valor que alimenta o total final
      let finalCategoryTotal = categoryPointsSum;
      if (categoryClosed) {
        finalCategoryTotal = getCategoryFinalTotal(pIndex, cat.key);
        const bonus = finalCategoryTotal - categoryPointsSum;
        if (bonus > 0) {
          colTotals[colTotals.length - 1] += bonus;
        }
      }

      if (showTotals) {
        playerGrandTotal += finalCategoryTotal;
        const tdTotal = document.createElement('td');
        tdTotal.className = 'total-column-cell';
        tdTotal.textContent = finalCategoryTotal;
        tr.appendChild(tdTotal);
      }
      
      tbody.appendChild(tr);
    });
    
    if (showTotals) {
      const trTotals = document.createElement('tr');
      trTotals.className = 'total-row';
      
      const tdTotalsLabel = document.createElement('td');
      tdTotalsLabel.className = 'category-cell';
      tdTotalsLabel.textContent = 'Total';
      trTotals.appendChild(tdTotalsLabel);
      
      colTotals.forEach(total => {
        const td = document.createElement('td');
        td.textContent = total;
        trTotals.appendChild(td);
      });
      
      const tdGrandTotal = document.createElement('td');
      tdGrandTotal.className = 'grand-total-cell';
      tdGrandTotal.textContent = playerGrandTotal;
      trTotals.appendChild(tdGrandTotal);
      
      tbody.appendChild(trTotals);

      const badge = document.getElementById(`player-${pIndex}-total-badge`);
      if (badge) badge.textContent = `Total: ${playerGrandTotal} pts`;
    }
    
    table.appendChild(tbody);
    tableDiv.appendChild(table);
    card.appendChild(tableDiv);
    
    container.appendChild(card);
  });
}

// OPEN SCORE PICKER MODAL
function openScorePicker(playerIndex, colIndex, categoryKey) {
  const category = CATEGORIES.find(c => c.key === categoryKey);

  if (isCategoryClosed(categoryKey)) {
    alert(`A categoria "${category.label}" já está fechada e não pode ser alterada.`);
    return;
  }

  activeCell.playerIndex = playerIndex;
  activeCell.colIndex = colIndex;
  activeCell.categoryKey = categoryKey;
  
  const playerName = gameState.players[playerIndex];
  const colThreshold = COLUMN_THRESHOLDS[colIndex];
  
  // Set Modal Info
  document.getElementById('picker-category').textContent = `${category.label} - Coluna ${colIndex + 1} (${colThreshold})`;
  document.getElementById('picker-player').textContent = `Pontos para ${playerName}`;
  
  // Ocultar alerta de coluna fechada
  const thresholdAlert = document.getElementById('picker-threshold-info');
  if (thresholdAlert) thresholdAlert.style.display = 'none';
  
  const buttonsContainer = document.getElementById('picker-buttons');
  buttonsContainer.innerHTML = '';
  
  // O mínimo para pontuar em qualquer coluna é sempre o threshold dessa coluna (7/6/6/8/8)
  const minRequired = COLUMN_THRESHOLDS[colIndex];

  if (category.type === 'multiplier') {
    const scoreKey = `${activeCell.playerIndex}-${colIndex}-${categoryKey}`;
    const existingValue = gameState.scores[scoreKey];

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'picker-input-wrapper';

    const inputLabel = document.createElement('label');
    inputLabel.textContent = `Insere o valor para ${category.label.replace(/ \(.+$/, '')}:`;
    inputLabel.style.fontWeight = '600';
    inputWrapper.appendChild(inputLabel);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'modal-score-input';
    input.min = minRequired;
    input.step = 1;
    input.placeholder = `${minRequired}`;
    inputWrapper.appendChild(input);

    const hint = document.createElement('div');
    hint.className = 'modal-score-hint';
    hint.textContent = `Mínimo ${minRequired} pontos nesta coluna.`;
      
    if (existingValue !== undefined && existingValue !== null) {
      const currentAmount = document.createElement('div');
      currentAmount.className = 'modal-score-hint';
      currentAmount.style.fontWeight = '700';
      currentAmount.textContent = `Total atual: ${existingValue}`;
      inputWrapper.appendChild(currentAmount);
    }
    inputWrapper.appendChild(hint);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Guardar';
    saveBtn.addEventListener('click', () => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < minRequired) {
        alert(`O valor introduzido deve ser no mínimo ${minRequired}.`);
        return;
      }
      selectScoreValue(value);
    });

    buttonsContainer.appendChild(inputWrapper);
    buttonsContainer.appendChild(saveBtn);
  } else if (category.type === 'select') {
    // TODAS as categorias do tipo 'select' (Seq, Fullen, Poker) funcionam DIRETA e LIVREMENTE
    category.options.forEach((scoreVal, i) => {
      const label = category.labels[i];
      
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'modal-score-btn satisfies-threshold';
      
      btn.innerHTML = `${scoreVal} <span class="btn-label">${label.replace(/^\d+\s*/, '')}</span>`;
      
      // Clique direto sem bloqueio
      btn.addEventListener('click', () => {
        selectScoreValue(scoreVal);
      });
      
      buttonsContainer.appendChild(btn);
    });
  }
  
  // Exibir Modal
  document.getElementById('score-picker-modal').classList.add('active');
}

function closeScorePicker() {
  document.getElementById('score-picker-modal').classList.remove('active');
  activeCell.playerIndex = null;
  activeCell.colIndex = null;
  activeCell.categoryKey = null;
}

function selectScoreValue(value) {
  if (activeCell.playerIndex !== null && activeCell.colIndex !== null && activeCell.categoryKey !== null) {
    const key = `${activeCell.playerIndex}-${activeCell.colIndex}-${activeCell.categoryKey}`;
    const category = CATEGORIES.find(c => c.key === activeCell.categoryKey);
    const existingValue = gameState.scores[key];

    if (category && category.type === 'multiplier' && existingValue !== undefined && existingValue !== null) {
      gameState.scores[key] = Number(existingValue) + Number(value);
    } else {
      gameState.scores[key] = value;
    }
    
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
  const banner = document.getElementById('winner-banner');
  const finished = isGameFinished();
  
  // Banner visibility: only show when at least one table/player finishes all rows
  banner.style.display = finished ? 'block' : 'none';

  updateTurnIndicator();
}