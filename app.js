const EXPENSE_CATS = ["Продукты","Еда вне дома","Машина","Бытовуха и ЖКХ","Здоровье и красота","Одежда и аксессуары","Подарки","Связь","Развлечения и подписки","Долги","Инвестиции","Сбережения","Прочее"];
const INCOME_CATS = ["Зарплата","Аванс","ГПХ","Премия","Отпускные","Страховая выплата","Прочее"];
const COLORS = ['#6c5ce7','#00b894','#ff7675','#fdcb6e','#74b9ff','#a29bfe','#55efc4','#fab1a0'];

let appData = { assets: [], liabilities: [], transactions: [] };
let mainChart = null, detailChart = null, categoryChart = null, currentDetail = '';
let currentTheme = localStorage.getItem('theme') || 'dark';

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('ru-RU', { style:'currency', currency:'RUB', maximumFractionDigits:0 }).format(n);

/* ===== ОПТИМИЗАЦИЯ: Дебанс и ленивое сохранение ===== */
let saveTimeout = null;
const save = () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    localStorage.setItem('financeData', JSON.stringify(appData));
  }, 1500); // Сохраняем через 1.5 сек после последнего действия
};

const debounce = (fn, delay = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};

/* ===== UI ===== */
function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', currentTheme);
  $('themeBtn').textContent = currentTheme === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('theme', currentTheme);
  updateChartColors();
}

function showToast(msg, type = 'success') {
  // Упрощенный toast для iOS (без сложной анимации, чтобы не нагружать CPU)
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  toast.style.position = 'fixed'; toast.style.top = '20px'; toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)'; toast.style.zIndex = '9999';
  toast.style.background = var(--card); toast.style.color = var(--text);
  toast.style.padding = '12px 20px'; toast.style.borderRadius = '12px';
  toast.style.borderLeft = `4px solid ${type === 'error' ? 'var(--red)' : 'var(--accent)'}`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 2000);
}

/* ===== МОДАЛКИ ===== */
function openModal(id) {
  if (id === 'addTxModal') {
    $('txDate').value = new Date().toISOString().split('T')[0];
    handleTypeChange();
    updateSourceOptions('txSource');
  }
  $(id).classList.add('active');
}
function closeModal(id) { $(id).classList.remove('active'); }
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); });
});

/* ===== ИНИЦИАЛИЗАЦИЯ ===== */
function init() {
  document.body.setAttribute('data-theme', currentTheme);
  $('themeBtn').textContent = currentTheme === 'dark' ? '🌙' : '☀️';
  
  const stored = localStorage.getItem('financeData');
  if (stored) {
    try {
      appData = JSON.parse(stored);
      if(!appData.goals) appData.goals = []; // На всякий случай, хотя UI удален
    } catch(e) { appData = { assets: [], liabilities: [], transactions: [] }; }
  }
  
  render();
  
  // Дебанс для поиска
  $('searchInput').addEventListener('input', debounce(() => renderTransactions()));
}

/* ===== РЕНДЕР ===== */
function render() {
  updateBalanceCards();
  updateTxList();
  updateCharts();
  updateInsights();
  save();
}

function updateBalanceCards() {
  const aSum = appData.assets.reduce((s,i) => s + Number(i.amount), 0);
  const lSum = appData.liabilities.reduce((s,i) => s + Number(i.amount), 0);
  const net = aSum - lSum;

  $('totalAssets').textContent = money(aSum);
  $('totalLiabilities').textContent = money(lSum);
  $('netWorth').textContent = money(net);
  $('netWorth').className = 'card-value ' + (net >= 0 ? 'green' : 'red');
}

function updateTxList() {
  const list = $('txList');
  const query = ($('searchInput')?.value || '').toLowerCase();
  
  let filtered = appData.transactions;
  if (query) {
    filtered = filtered.filter(tx => 
      (tx.description || '').toLowerCase().includes(query) || 
      (tx.category || '').toLowerCase().includes(query)
    );
  }

  $('txCount').textContent = `(${filtered.length})`;
  const sorted = [...filtered].sort((a,b) => new Date(b.date) - new Date(a.date));

  // Оптимизация: не пересоздаем весь innerHTML, если данных нет
  if (sorted.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:var(--muted);padding:20px;">Ничего не найдено</p>';
    return;
  }

  // Оптимизация: собираем HTML в строку (меньше рефлоу, чем appendChild в цикле)
  let html = '';
  sorted.forEach((tx, i) => {
    const isInc = tx.type === 'income';
    const dateStr = new Date(tx.date).toLocaleDateString('ru-RU');
    const idx = appData.transactions.indexOf(tx);
    html += `
      <div class="tx-item" style="animation-delay: ${i * 0.02}s;">
        <div class="tx-info">
          <span class="tx-desc">${tx.description || tx.category}</span>
          <span class="tx-date">${dateStr} · ${tx.category} ${tx.source ? '· ' + tx.source : ''}</span>
        </div>
        <div class="tx-right">
          <div class="tx-amount ${isInc ? 'green' : 'red'}">${isInc ? '+' : '-'}${money(tx.amount)}</div>
          <button class="act-btn" onclick="duplicateTx(${idx})" title="Дублировать">📋</button>
          <button class="act-btn del-btn" onclick="deleteTx(${idx})" title="Удалить">🗑️</button>
        </div>
      </div>`;
  });
  list.innerHTML = html;
}

/* ===== ГРАФИКИ ===== */
function updateChartColors() {
  const gridColor = currentTheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const tickColor = currentTheme === 'dark' ? '#8a8a9a' : '#718096';
  
  if (mainChart) {
    mainChart.options.scales.y.grid.color = gridColor;
    mainChart.options.scales.x.grid.color = gridColor;
    mainChart.options.scales.y.ticks.color = tickColor;
    mainChart.options.scales.x.ticks.color = tickColor;
    mainChart.update('none');
  }
  if (categoryChart) {
    categoryChart.options.plugins.legend.labels.color = tickColor;
    categoryChart.update('none');
  }
}

function updateCharts() {
  // 1. Bar Chart (Расходы по месяцам)
  const ctxExp = $('expenseChart').getContext('2d');
  const monthly = {};
  appData.transactions.forEach(t => {
    if (t.type === 'expense') {
      const key = t.date.substring(0, 7);
      monthly[key] = (monthly[key] || 0) + Number(t.amount);
    }
  });
  const months = Object.keys(monthly).sort();
  const data = months.map(m => monthly[m]);

  if (mainChart) {
    mainChart.data.labels = months;
    mainChart.data.datasets[0].data = data;
    mainChart.update('none');
  } else {
    mainChart = new Chart(ctxExp, {
      type: 'bar', data: { labels: months, datasets: [{ data, backgroundColor:'rgba(108,92,231,0.7)' }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
    });
  }

  // 2. Doughnut Chart (Категории)
  const ctxCat = $('categoryChart').getContext('2d');
  const cats = {};
  appData.transactions.forEach(t => { if(t.type === 'expense') cats[t.category] = (cats[t.category] || 0) + Number(t.amount); });
  const labels = Object.keys(cats); const dataCat = Object.values(cats);

  if (categoryChart) {
    categoryChart.data.labels = labels;
    categoryChart.data.datasets[0].data = dataCat;
    categoryChart.update('none');
  } else if(labels.length > 0) {
    categoryChart = new Chart(ctxCat, {
      type: 'doughnut', data: { labels, datasets: [{ data: dataCat, backgroundColor: COLORS }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'right'}} }
    });
  }
}

/* ===== АНАЛИТИКА ===== */
function updateInsights() {
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const prevMonthStr = `${now.getFullYear()}-${String(now.getMonth()).padStart(2,'0')}`;

  let curExpense = 0, prevExpense = 0;
  appData.transactions.forEach(t => {
    if(t.type === 'expense') {
      if(t.date.startsWith(currentMonthStr)) curExpense += Number(t.amount);
      if(t.date.startsWith(prevMonthStr)) prevExpense += Number(t.amount);
    }
  });

  let text = "";
  if (curExpense === 0) {
    text = "В этом месяце пока нет трат.";
  } else {
    text = `Потрачено: <b>${money(curExpense)}</b>.`;
    if (prevExpense > 0) {
      const diff = curExpense - prevExpense;
      if (diff > 0) text += ` На <span style="color:var(--red)">${money(diff)} больше</span> прошлого месяца.`;
      else if (diff < 0) text += ` На <span style="color:var(--green)">${money(Math.abs(diff))} меньше</span> прошлого месяца.`;
    }
  }
  $('insightsText').innerHTML = text;
}

/* ===== РАБОТА С ДАННЫМИ ===== */
function updateSourceOptions(selectId) {
  const select = $(selectId); if(!select) return;
  select.innerHTML = '';
  appData.assets.forEach(a => {
    const opt = document.createElement('option');
    opt.value = `asset_${a.name}`; opt.textContent = `${a.name} (${money(a.amount)})`;
    select.appendChild(opt);
  });
  appData.liabilities.forEach(l => {
    const opt = document.createElement('option');
    opt.value = `liab_${l.name}`; opt.textContent = `${l.name} (${money(l.amount)})`;
    select.appendChild(opt);
  });
}

function handleTypeChange() {
  const type = $('txType').value;
  const catSelect = $('txCategory'); catSelect.innerHTML = '';
  const cats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS;
  cats.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = c; catSelect.appendChild(opt); });
}

function handleSourceChange() {
  const val = $('txSource').value;
  $('actionGroup').style.display = (val && val.startsWith('liab_')) ? 'block' : 'none';
}

function addTransaction() {
  const date = $('txDate').value; const type = $('txType').value;
  const sourceVal = $('txSource').value; const action = $('txAction').value;
  const cat = $('txCategory').value; const desc = $('txDesc').value;
  const amt = parseFloat($('txAmount').value);
  
  if (!date || !cat || isNaN(amt) || amt <= 0) { showToast('Заполни все поля!', 'error'); return; }

  if (sourceVal) {
    const [srcType, srcName] = sourceVal.split('_');
    if (srcType === 'asset') {
      const asset = appData.assets.find(a => a.name === srcName); if (asset) asset.amount += (type === 'income' ? amt : -amt);
    } else if (srcType === 'liab') {
      const liab = appData.liabilities.find(l => l.name === srcName); if (liab) liab.amount += (action === 'increase' ? amt : -amt);
    }
  }

  appData.transactions.push({ date, type, category: cat, description: desc || cat, amount: amt, source: sourceVal ? sourceVal.split('_')[1] : '' });
  render(); closeModal('addTxModal');
  showToast('Добавлено');
}

function duplicateTx(idx) {
  const tx = appData.transactions[idx];
  const today = new Date().toISOString().split('T')[0];
  appData.transactions.push({ ...tx, date: today });
  render(); showToast('Скопировано');
}

function deleteTx(idx) {
  const tx = appData.transactions[idx];
  // Откатываем баланс счета при удалении
  if (tx.source) {
    const [srcType, srcName] = tx.source.split ? tx.source.split('_') : []; // Защита
    if (srcType && srcName) {
      if (srcType === 'asset') {
        const asset = appData.assets.find(a => a.name === srcName); if (asset) asset.amount -= (tx.type === 'income' ? -tx.amount : tx.amount);
      } else if (srcType === 'liab') {
        const liab = appData.liabilities.find(l => l.name === srcName); if (liab) liab.amount -= (tx.type === 'expense' ? -tx.amount : tx.amount);
      }
    }
  }
  
  appData.transactions.splice(idx, 1);
  render(); showToast('Удалено', 'error');
}

function addAssetOrLiability() {
  const name = $('assetName').value; const amt = parseFloat($('assetAmount').value);
  if (!name || isNaN(amt)) { showToast('Введите данные', 'error'); return; }
  if (currentDetail === 'assets') appData.assets.push({ name, amount:amt });
  else appData.liabilities.push({ name, amount:amt });
  render(); showDetails(currentDetail);
  showToast('Добавлено');
}

/* ===== ДЕТАЛИЗАЦИЯ ===== */
function showDetails(type) {
  currentDetail = type;
  const modal = $('detailsModal'); const list = $('detailList'); const addForm = $('addAssetForm');
  let items = [], total = 0, canAdd = false;

  if (type === 'assets') { items = appData.assets; total = items.reduce((s,i) => s + Number(i.amount), 0); canAdd = true; $('detailTitle').textContent = 'Активы'; }
  else if (type === 'liabilities') { items = appData.liabilities; total = items.reduce((s,i) => s + Number(i.amount), 0); canAdd = true; $('detailTitle').textContent = 'Пассивы'; }
  else { 
    $('detailTitle').textContent = 'Чистый капитал'; 
    const a = appData.assets.reduce((s,i) => s + Number(i.amount), 0);
    const l = appData.liabilities.reduce((s,i) => s + Number(i.amount), 0);
    items = [{ name:'Активы', amount:a, color:COLORS[1] }, { name:'Долги', amount:l, color:COLORS[2] }];
    total = a + l;
  }

  addForm.style.display = canAdd ? 'block' : 'none';
  list.innerHTML = '';
  if (items.length === 0) { list.innerHTML = '<p style="text-align:center;color:var(--muted);">Пусто</p>'; }
  else {
    [...items].sort((a,b) => b.amount - a.amount).forEach((item, i) => {
      const pct = total > 0 ? ((item.amount / total) * 100).toFixed(1) : 0;
      const color = item.color || COLORS[i % COLORS.length];
      const idx = items.indexOf(item);
      const delBtn = (type === 'assets' || type === 'liabilities') ? `<button class="act-btn del-btn" onclick="deleteAsset('${type}',${idx})">🗑️</button>` : '';
      list.innerHTML += `<div class="detail-item"><div style="display:flex;align-items:center;gap:8px;"><span class="dot" style="background:${color}"></span>${item.name}</div><div style="display:flex;align-items:center;gap:5px;"><span style="font-weight:bold;">${money(item.amount)}</span><span style="color:var(--muted);font-size:11px;">${pct}%</span>${delBtn}</div></div>`;
    });
  }

  const ctx = $('detailChart').getContext('2d');
  if (detailChart) detailChart.destroy();
  const sorted = [...items].sort((a,b) => b.amount - a.amount);
  detailChart = new Chart(ctx, {
    type: type === 'networth' ? 'doughnut' : 'pie',
    data: { labels: sorted.map(i => i.name), datasets: [{ data: sorted.map(i => i.amount), backgroundColor: sorted.map((i,idx) => i.color || COLORS[idx % COLORS.length]) }] },
    options: { responsive:true, maintainAspectRatio:false }
  });
  modal.classList.add('active');
}

function deleteAsset(type, idx) {
  if (!confirm('Удалить?')) return;
  if (type === 'assets') appData.assets.splice(idx, 1);
  else appData.liabilities.splice(idx, 1);
  render(); showDetails(type);
}

/* ===== ИМПОРТ/ЭКСПОРТ ===== */
function exportData() {
  const json = JSON.stringify(appData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `finance_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Файл сформирован');
}

function importFromFile(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try { 
      const parsed = JSON.parse(e.target.result); 
      if (!parsed.transactions) { showToast('Неверный формат', 'error'); return; }
      appData = parsed; 
      render(); 
      showToast('Данные загружены!'); 
    } catch { showToast('Ошибка чтения', 'error'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

/* ===== ЗАПУСК ===== */
init();
