import { db, migrateFromLocalStorage, calculateMonthlyBilan } from './src/db.js';

const dopamineMessages = [
    "You're crushing it! 🔥",
    "Dopamine hit secured! 🎯",
    "One step closer to greatness. 🚀",
    "Unstoppable momentum! ⚡",
    "Excellent execution! 💎",
    "Keep that streak alive! ✨",
    "Another win for the books! 📖"
];

let taskToastTimeout = null;
let taskToastUndoHandler = null;

// Sound Assets
const notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
const successSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3');
const tapSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
const deleteSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2561/2561-preview.mp3');

// Haptic & Sound Utility
function feedback(type = 'soft') {
    if ("vibrate" in navigator) {
        if (type === 'success') navigator.vibrate([50, 30, 50]);
        else if (type === 'error') navigator.vibrate([100, 50, 100]);
        else navigator.vibrate(20);
    }
    if (type === 'success') successSound.play().catch(() => { });
    else if (type === 'click') tapSound.play().catch(() => { });
    else if (type === 'delete') deleteSound.play().catch(() => { });
}

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // 0. Migrate if needed
    await migrateFromLocalStorage();

    // 1. Initialize Date and check for daily reset
    displayCurrentDate();
    await checkDailyReset();

    // 2. Render tasks from storage
    renderTasks();
    renderDashboard();

    // 3. Set up event listeners
    const taskForm = document.getElementById('taskForm');
    if (taskForm) {
        taskForm.addEventListener('submit', handleAddTask);
    }

    // --- Note Events ---
    const addNoteBtn = document.getElementById('addNoteBtn');
    if (addNoteBtn) addNoteBtn.addEventListener('click', toggleNoteEditor);
    
    const cancelNoteBtn = document.getElementById('cancelNoteBtn');
    if (cancelNoteBtn) cancelNoteBtn.addEventListener('click', toggleNoteEditor);

    const saveNoteBtn = document.getElementById('saveNoteBtn');
    if (saveNoteBtn) saveNoteBtn.addEventListener('click', handleSaveNote);

    const testBtn = document.getElementById('testNotificationsBtn');
    if (testBtn) {
        testBtn.addEventListener('click', handleTestNotification);
    }

    const backupBtn = document.getElementById('backupDriveBtn');
    if (backupBtn) {
        backupBtn.addEventListener('click', () => authenticateAndBackup(false));
    }

    const headerSyncBtn = document.getElementById('headerSyncBtn');
    if (headerSyncBtn) {
        headerSyncBtn.addEventListener('click', () => authenticateAndBackup(false));
    }

    const notifBtn = document.getElementById('enableNotificationsBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', requestNotifications);
    }

    const expenseForm = document.getElementById('expenseForm');
    if (expenseForm) {
        expenseForm.addEventListener('submit', handleAddExpense);
    }

    const financeFilter = document.getElementById('financeMonthFilter');
    if (financeFilter) {
        financeFilter.value = new Date().toISOString().substring(0, 7);
        financeFilter.addEventListener('change', renderFinance);
    }

    // Tab Navigation
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', () => {
            feedback('click');
            switchTab(tab.getAttribute('data-tab'));
        });
    });

    // 4. Start Interval Engine
    startIntervalEngine();

    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
            await checkDailyReset();
        }
    });

    // 5. Register Service Worker
    registerServiceWorker();

    // Initial renders
    renderDashboard();
    renderNotes();
    renderFinance();

    // Global View Listeners
    const gDailyBtn = document.getElementById('globalDailyBtn');
    const gWeeklyBtn = document.getElementById('globalWeeklyBtn');
    let currentGlobalView = 'daily';

    if (gDailyBtn && gWeeklyBtn) {
        gDailyBtn.addEventListener('click', () => {
            currentGlobalView = 'daily';
            gDailyBtn.classList.add('active-bg');
            gWeeklyBtn.classList.remove('active-bg');
            refreshAllViews();
        });
        gWeeklyBtn.addEventListener('click', () => {
            currentGlobalView = 'weekly';
            gWeeklyBtn.classList.add('active-bg');
            gDailyBtn.classList.remove('active-bg');
            refreshAllViews();
        });
    }

    function refreshAllViews() {
        const activeTab = document.querySelector('.app-tab-pane.active').id;
        if (activeTab === 'ritualsTab') renderTasks();
        if (activeTab === 'notesTab') renderNotes();
        if (activeTab === 'financeTab') renderFinance();
        if (activeTab === 'analysisTab') {
            if (currentGlobalView === 'weekly') renderWeeklyDashboard();
            else renderDashboard();
        }
    }

    // Export Dashboard Toggles (Legacy Cleanup)
    const oldDaily = document.getElementById('viewDailyBtn');
    if (oldDaily) oldDaily.parentElement.remove();
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

async function renderWeeklyDashboard() {
    const container = document.getElementById('monthlyStatsContainer');
    if (!container) return;

    const history = await db.history.orderBy('date').reverse().limit(60).toArray();

    const weeks = {};
    history.forEach(entry => {
        const date = new Date(entry.date);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(new Date(entry.date).setDate(diff)).toISOString().substring(0, 10);
        if (!weeks[weekStart]) weeks[weekStart] = { completed: 0, total: 0 };
        weeks[weekStart].completed += entry.completedCount || 0;
        weeks[weekStart].total     += entry.totalCount    || 0;
    });

    container.innerHTML = Object.keys(weeks).reverse().slice(0, 4).map(weekKey => {
        const data = weeks[weekKey];
        const perf = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
        return `
            <div class="col-12">
                <div class="stat-card">
                    <div class="stat-label mb-1">Week of ${new Date(weekKey).toLocaleDateString()}</div>
                    <div class="d-flex justify-content-between align-items-end">
                        <div class="stat-value text-accent">${perf}%</div>
                        <div class="text-secondary small mb-1">${data.completed}/${data.total} rituals</div>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${perf}%"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('') || `<div class="col-12 text-center py-5 opacity-50 small">No history yet.</div>`;
}

function switchTab(tabId) {
    // Update Nav
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

    // Update Panes
    document.querySelectorAll('.app-tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    if (tabId === 'analysisTab') renderDashboard();
    if (tabId === 'notesTab') renderNotes();
    if (tabId === 'financeTab') renderFinance();
    if (tabId === 'settingsTab') fetchCloudHistory();
}

// --- Cloud Sync Logic ---

function setSyncProgress(percent) {
    const container = document.getElementById('syncProgressContainer');
    const bar = document.getElementById('syncProgressBar');
    if (!container || !bar) return;

    if (percent === 0) {
        container.style.display = 'block';
        bar.style.width = '0%';
    } else if (percent >= 100) {
        bar.style.width = '100%';
        setTimeout(() => { container.style.display = 'none'; }, 1500);
    } else {
        bar.style.width = percent + '%';
    }
}

function autoSyncCheck() {
    const lastSync = localStorage.getItem('life_reset_last_sync');
    const today = new Date().toISOString().substring(0, 10);

    if (lastSync !== today) {
        console.log("Auto-syncing data for today...");
        authenticateAndBackup(true); // true = silent/auto
    }
}

async function fetchCloudHistory() {
    const container = document.getElementById('cloudHistoryList');
    if (!container) return;

    if (typeof gapi === 'undefined' || !localStorage.getItem('gdrive_token')) {
        container.innerHTML = `<div class="text-center py-3 opacity-50 small">Sync required to view history</div>`;
        return;
    }

    try {
        const token = localStorage.getItem('gdrive_token');
        const folderId = await getOrCreateFolder(token);
        
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,createdTime)&orderBy=createdTime+desc`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.files || data.files.length === 0) {
            container.innerHTML = `<div class="text-center py-3 opacity-50 small">No cloud backups found.</div>`;
            return;
        }

        container.innerHTML = data.files.slice(0, 5).map(file => {
            const date = new Date(file.createdTime).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            return `
                <div class="cloud-history-item p-3 rounded-4 d-flex justify-content-between align-items-center" onclick="loadArchivePreview('${file.id}')">
                    <div>
                        <h6 class="mb-0 fw-bold small">Preview Analysis: ${file.name.replace('.json', '')}</h6>
                        <small class="text-secondary opacity-75">Saved ${date}</small>
                    </div>
                    <i class="bi bi-box-arrow-in-right text-accent fs-5"></i>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("History fetch failed:", err);
        container.innerHTML = `<div class="text-center py-3 text-danger small">Offline or Link Expired</div>`;
    }
}

async function loadArchivePreview(fileId) {
    feedback('click');
    setSyncProgress(20);
    const token = localStorage.getItem('gdrive_token');
    
    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        setSyncProgress(60);
        const archiveData = await response.json();
        
        if (archiveData && archiveData.history) {
            // Generate stats from this specific history chunk
            const stats = processHistoryToStats(archiveData.history);
            renderDashboard(stats); // Pass specific stats
            switchTab('analysisTab');
            setSyncProgress(100);
            feedback('success');
        }
    } catch (err) {
        console.error("Archive load failed:", err);
        setSyncProgress(100);
        alert("Failed to load archive. Please try again.");
    }
}

function processHistoryToStats(historyData) {
    const stats = {};
    historyData.forEach(entry => {
        const monthKey = entry.date.substring(0, 7);
        if (!stats[monthKey]) {
            stats[monthKey] = { completed: 0, total: 0 };
        }
        stats[monthKey].total++;
        if (entry.status === 'completed') {
            stats[monthKey].completed++;
        }
    });

    Object.keys(stats).forEach(monthKey => {
        stats[monthKey].avgPerf = Math.round((stats[monthKey].completed / stats[monthKey].total) * 100);
    });

    return stats;
}

window.loadArchivePreview = loadArchivePreview;

// --- Finance / Expenses Operations ---

async function getFinances() {
    return await db.finances.reverse().toArray();
}

async function saveFinance(expense) {
    await db.finances.add(expense);
    renderFinance();
}

async function handleAddExpense(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const desc = document.getElementById('expenseDesc').value.trim();
    const type = e.submitter ? e.submitter.getAttribute('data-type') : 'expense';

    if (isNaN(amount) || !desc) return;

    const timestamp = new Date();
    await db.finances.add({
        amount: amount,
        description: desc,
        category: type === 'income' ? 'Income' : 'Expense',
        date: timestamp.toISOString().split('T')[0],
        monthYear: timestamp.toISOString().substring(0, 7)
    });

    e.target.reset();
    feedback('success');
    renderFinance();
}

async function renderFinance() {
    const filterMonth = document.getElementById('financeMonthFilter').value; 
    const listContainer = document.getElementById('expenseList');
    if (!listContainer) return;

    // Use Advanced Indexed Bilan
    const bilan = await calculateMonthlyBilan(filterMonth);
    document.getElementById('monthlyTotalDisplay').textContent = formatCurrency(bilan.total);
    document.getElementById('monthlyIncomeDisplay').textContent = '+' + formatCurrency(bilan.income);
    document.getElementById('monthlySpentDisplay').textContent = '-' + formatCurrency(bilan.spent);

    const filtered = await db.finances.where('monthYear').equals(filterMonth).reverse().toArray();
    const isWeekly = document.getElementById('globalWeeklyBtn').classList.contains('active-bg');

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-5 text-muted opacity-50">No transactions.</div>`;
        return;
    }

    if (isWeekly) {
        const groups = {};
        filtered.forEach(ex => {
            const date = new Date(ex.date);
            const week = `Week ${getWeekNumber(date)}`;
            if (!groups[week]) groups[week] = { items: [], balance: 0 };
            groups[week].items.push(ex);
            groups[week].balance += (ex.category === 'Income' ? ex.amount : -ex.amount);
        });

        listContainer.innerHTML = Object.keys(groups).map(week => `
            <div class="mb-4">
                <div class="d-flex justify-content-between align-items-center mb-2 border-bottom border-secondary pb-1">
                    <span class="text-accent small fw-bold" style="opacity: 0.6;">${week}</span>
                    <span class="small fw-bold ${groups[week].balance >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(groups[week].balance)}</span>
                </div>
                <div class="d-flex flex-column gap-2">
                    ${groups[week].items.map(ex => renderExpenseHTML(ex)).join('')}
                </div>
            </div>
        `).join('');
    } else {
        listContainer.innerHTML = filtered.map(ex => renderExpenseHTML(ex)).join('');
    }
}

function renderExpenseHTML(ex) {
    const isIncome = ex.type === 'income';
    return `
        <div class="expense-item p-3 rounded-4 d-flex justify-content-between align-items-center">
            <div>
                <h6 class="mb-0 fw-bold small">${escapeHTML(ex.description)}</h6>
                <small class="text-secondary opacity-75" style="font-size: 0.7rem;">${new Date(ex.timestamp).toLocaleDateString()}</small>
            </div>
            <div class="d-flex align-items-center gap-3">
                <span class="fw-bold small ${isIncome ? 'text-success' : 'text-accent'}">
                    ${isIncome ? '+' : '-'}${formatCurrency(ex.amount)}
                </span>
                <button onclick="deleteExpense(${ex.id})" class="btn text-danger p-0 opacity-50"><i class="bi bi-trash"></i></button>
            </div>
        </div>
    `;
}

function deleteExpense(id) {
    if (!confirm("Remove this entry?")) return;
    feedback('delete');
    const expenses = getExpenses().filter(ex => ex.id !== id);
    saveExpenses(expenses);
}

function formatCurrency(val) {
    return new Intl.NumberFormat('fr-TN', { style: 'currency', currency: 'TND' })
        .format(val).replace('TND', 'DT');
}

window.deleteExpense = deleteExpense;

// --- Note / Journal Operations ---

let currentNotesPage = 0;
const notesPerPage = 5;

async function getNotes() {
    return await db.notes.reverse().toArray();
}

async function getPaginatedNotes(page, limit) {
    return await db.notes.orderBy('timestamp').reverse().offset(page * limit).limit(limit).toArray();
}

function toggleNoteEditor() {
    feedback('click');
    const editor = document.getElementById('noteEditor');
    editor.classList.toggle('active');
    
    // Clear if opening for new note (optional, depending on flow)
    if (!editor.classList.contains('active')) {
        document.getElementById('noteTitle').value = '';
        document.getElementById('noteRichContent').innerHTML = '';
        editor.removeAttribute('data-editing-id');
    }
}

function formatNote(cmd, value = null) {
    document.execCommand(cmd, false, value);
    // Focus back if needed
    document.getElementById('noteRichContent').focus();
}

async function handleSaveNote() {
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteRichContent').innerHTML;
    const plainText = document.getElementById('noteRichContent').innerText.trim();
    const editingId = document.getElementById('noteEditor').getAttribute('data-editing-id');

    if (!title || !plainText) {
        alert("Please provide both a title and content.");
        return;
    }

    if (editingId) {
        await db.notes.update(parseInt(editingId), { title, content });
    } else {
        await db.notes.add({
            title: title,
            content: content,
            timestamp: new Date().toLocaleString()
        });
    }

    feedback('success');
    toggleNoteEditor();
    renderNotes();
}

async function openNote(id) {
    const note = await db.notes.get(id);
    if (!note) return;

    feedback('click');
    const editor = document.getElementById('noteEditor');
    document.getElementById('noteTitle').value = note.title;
    document.getElementById('noteRichContent').innerHTML = note.content;
    editor.setAttribute('data-editing-id', id);
    editor.classList.add('active');
}

async function renderNotes() {
    const container = document.getElementById('notesList');
    if (!container) return;

    const notes = await getPaginatedNotes(currentNotesPage, notesPerPage);
    const totalNotes = await db.notes.count();

    if (notes.length === 0 && currentNotesPage === 0) {
        container.innerHTML = `<div class="text-center py-5 text-muted opacity-50">No entries yet.</div>`;
        return;
    }

    container.innerHTML = `
        <div class="d-flex flex-column gap-3">
            ${notes.map(note => renderNoteHTML(note)).join('')}
        </div>
        
        <div class="d-flex justify-content-between align-items-center mt-4 p-2">
            <button class="btn btn-outline-secondary sm rounded-pill" ${currentNotesPage === 0 ? 'disabled' : ''} onclick="changeNotePage(-1)">
                <i class="bi bi-chevron-left me-1"></i> Prev
            </button>
            <span class="small opacity-50 fw-bold">Page ${currentNotesPage + 1}</span>
            <button class="btn btn-outline-secondary sm rounded-pill" ${(currentNotesPage + 1) * notesPerPage >= totalNotes ? 'disabled' : ''} onclick="changeNotePage(1)">
                Next <i class="bi bi-chevron-right ms-1"></i>
            </button>
        </div>
    `;
}

window.changeNotePage = async function(dir) {
    currentNotesPage += dir;
    feedback('click');
    renderNotes();
};

function renderNoteHTML(note) {
    return `
        <div class="glass-card-modern p-4 rounded-4 position-relative" onclick="openNote(${note.id})">
            <div class="d-flex justify-content-between align-items-start mb-2">
                <h5 class="fw-bold text-accent mb-0" style="font-family: 'Outfit', sans-serif;">${escapeHTML(note.title)}</h5>
                <button onclick="event.stopPropagation(); deleteNote(${note.id})" class="btn text-danger p-1">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
            <p class="small text-secondary mb-2" style="font-size: 0.75rem;">${note.timestamp}</p>
            <div class="note-body note-preview text-truncate">${escapeHTML(note.content.replace(/<[^>]*>?/gm, ''))}</div>
        </div>
    `;
}

async function deleteNote(id) {
    if (!confirm("Delete this note?")) return;
    feedback('delete');
    await db.notes.delete(id);
    renderNotes();
}

window.deleteNote = deleteNote;

async function renderDashboard() {
    const container = document.getElementById('monthlyStatsContainer');
    if (!container) return;

    const filterMonth = new Date().toISOString().substring(0, 7);

    // 1. Top Bilan Summary
    const bilan = await calculateMonthlyBilan(filterMonth);
    
    // 2. Fetch all for the month
    const tasks = await db.tasks.toArray();
    const finances = await db.finances.where('monthYear').equals(filterMonth).toArray();

    // 3. Group by Day
    const days = {};
    const dateOptions = { weekday: 'long', month: 'short', day: 'numeric' };

    finances.forEach(ex => {
        const d = ex.date;
        if (!days[d]) days[d] = { finances: [], tasks: [], spent: 0, income: 0 };
        days[d].finances.push(ex);
        if (ex.category === 'Income') days[d].income += ex.amount;
        else days[d].spent += ex.amount;
    });

    tasks.forEach(t => {
        // Simple heuristic: rituals are daily
        const d = new Date().toISOString().split('T')[0];
        if (!days[d]) days[d] = { finances: [], tasks: [], spent: 0, income: 0 };
        days[d].tasks.push(t);
    });

    const dayKeys = Object.keys(days).sort().reverse();

    container.innerHTML = `
        <div class="col-12 mb-4">
            <div class="finance-bilan-card p-4 rounded-4 shadow-lg text-white">
                <div class="small opacity-75 mb-1">Monthly Intelligence (${filterMonth})</div>
                <h1 class="display-6 fw-bold mb-3">${formatCurrency(bilan.total)}</h1>
                <div class="d-flex justify-content-between small border-top border-white border-opacity-10 pt-2">
                    <span>Income: <span class="fw-bold">+${formatCurrency(bilan.income)}</span></span>
                    <span>Spent: <span class="fw-bold">-${formatCurrency(bilan.spent)}</span></span>
                </div>
            </div>
        </div>
        
        <div class="col-12">
            <h6 class="fw-bold mb-4 opacity-50 px-2 d-flex align-items-center"><i class="bi bi-activity me-2"></i> Unified Daily Feed</h6>
            <div class="d-flex flex-column gap-3">
                ${dayKeys.map(d => {
                    const dayData = days[d];
                    const dateObj = new Date(d);
                    const formattedDate = dateObj.toLocaleDateString(undefined, dateOptions);
                    const balance = dayData.income - dayData.spent;
                    
                    return `
                        <div class="glass-card-modern p-4 rounded-4">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <div>
                                    <h6 class="fw-bold text-accent mb-0">${formattedDate}</h6>
                                    <small class="text-secondary opacity-75">${d === new Date().toISOString().split('T')[0] ? 'Today' : ''}</small>
                                </div>
                                <div class="text-end">
                                    <div class="small fw-bold ${balance >= 0 ? 'text-success' : 'text-danger'}">
                                        ${balance > 0 ? '+' : ''}${formatCurrency(balance)}
                                    </div>
                                    <small class="text-secondary opacity-50" style="font-size: 0.65rem;">Daily Balance</small>
                                </div>
                            </div>
                            
                            <div class="row g-3 mt-1">
                                <div class="col-6">
                                    <div class="small text-secondary opacity-50 mb-2 fw-bold text-uppercase" style="font-size: 0.6rem; letter-spacing: 0.05rem;">Rituals</div>
                                    <div class="d-flex flex-column gap-1">
                                        ${dayData.tasks.slice(0, 3).map(t => `
                                            <div class="d-flex align-items-center gap-2" style="font-size: 0.75rem;">
                                                <i class="bi ${t.completed ? 'bi-check-circle-fill text-success' : 'bi-circle text-secondary opacity-25'}"></i>
                                                <span class="${t.completed ? 'text-decoration-line-through opacity-50' : 'fw-semibold'}">${escapeHTML(t.todo || t.name)}</span>
                                            </div>
                                        `).join('') || '<div class="opacity-25 small italic">No activity</div>'}
                                        ${dayData.tasks.length > 3 ? `<div class="small text-accent mt-1">+${dayData.tasks.length - 3} more</div>` : ''}
                                    </div>
                                </div>
                                <div class="col-6 border-start border-secondary border-opacity-10">
                                    <div class="small text-secondary opacity-50 mb-2 fw-bold text-uppercase" style="font-size: 0.6rem; letter-spacing: 0.05rem;">Top Spending</div>
                                    <div class="d-flex flex-column gap-1">
                                        ${dayData.finances.slice(0, 3).map(f => `
                                            <div class="d-flex justify-content-between" style="font-size: 0.75rem;">
                                                <span class="text-truncate me-1">${escapeHTML(f.description)}</span>
                                                <span class="${f.category === 'Income' ? 'text-success' : 'fw-bold'}">${f.amount}DT</span>
                                            </div>
                                        `).join('') || '<div class="opacity-25 small italic">No spending</div>'}
                                        ${dayData.finances.length > 3 ? `<div class="small text-accent mt-1">+${dayData.finances.length - 3} more</div>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

async function exportDataAsJSON() {
    const [tasks, notes, finances, stories, history] = await Promise.all([
        db.tasks.toArray(),
        db.notes.toArray(),
        db.finances.toArray(),
        db.stories.toArray(),
        db.history.toArray()
    ]);

    const backup = {
        app: 'CoreLife Export',
        exportedAt: new Date().toISOString(),
        tasks, notes, finances, stories, history
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `CoreLife_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    feedback('success');
}

window.exportDataAsJSON = exportDataAsJSON;

// --- Google Drive API Integration ---
let tokenClient;
let accessToken = null;

function authenticateAndBackup(isSilent = false) {
    if (!isSilent) feedback('click');
    const backupBtn = document.getElementById('backupDriveBtn');
    if (backupBtn) {
        backupBtn.disabled = true;
        backupBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i> Syncing...';
    }

    setSyncProgress(10); // Start

    // GIS Auth Flow
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: '973697498735-gpe0557359lefq0fn95kkv2oikd94u4r.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                accessToken = tokenResponse.access_token;
                localStorage.setItem('gdrive_token', accessToken);
                uploadToDrive(isSilent);
            } else {
                if (backupBtn) backupBtn.disabled = false;
                setSyncProgress(100);
            }
        },
    });

    const storedToken = localStorage.getItem('gdrive_token');
    if (storedToken) {
        accessToken = storedToken;
        uploadToDrive(isSilent);
    } else {
        tokenClient.requestAccessToken({ prompt: isSilent ? 'none' : 'consent' });
    }
}

async function getOrCreateFolder(token) {
    const query = encodeURIComponent("name = 'Life_Reset_App' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const searchData = await searchRes.json();

    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
    }

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: 'Life_Reset_App',
            mimeType: 'application/vnd.google-apps.folder'
        })
    });
    const createData = await createRes.json();
    return createData.id;
}

async function uploadToDrive(isSilent = false) {
    const backupBtn = document.getElementById('backupDriveBtn');
    setSyncProgress(40);

    const [tasks, notes, finances, history] = await Promise.all([
        db.tasks.toArray(),
        db.notes.toArray(),
        db.finances.toArray(),
        db.history.toArray()
    ]);

    const data = {
        app: 'CoreLife',
        email: 'hamzasayari2024@gmail.com',
        timestamp: new Date().toISOString(),
        history, tasks, notes, finances
    };

    const month = new Date().toISOString().substring(0, 7);
    const fileName = `Life_Reset_Backup_${month}.json`;

    try {
        const folderId = await getOrCreateFolder(accessToken);
        setSyncProgress(70);

        const metadata = {
            name: fileName,
            mimeType: 'application/json',
            parents: [folderId]
        };

        const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form
        });

        if (response.ok) {
            setSyncProgress(100);
            localStorage.setItem('life_reset_last_sync', new Date().toISOString().substring(0, 10));
            if (!isSilent) feedback('success');
            
            if (backupBtn) {
                backupBtn.innerHTML = '<i class="bi bi-cloud-check-fill me-2"></i> Synced';
                setTimeout(() => {
                    backupBtn.innerHTML = '<i class="bi bi-cloud-arrow-up-fill me-2"></i> Sync Now';
                    backupBtn.disabled = false;
                }, 3000);
            }
            fetchCloudHistory();
        } else {
            throw new Error('Upload failed');
        }
    } catch (err) {
        console.error(err);
        setSyncProgress(100);
        if (backupBtn) {
            backupBtn.disabled = false;
            backupBtn.innerHTML = '<i class="bi bi-arrow-repeat me-2"></i> Error';
        }
    }
}

function handleTestNotification() {
    feedback('click');
    if (!("Notification" in window) || Notification.permission !== "granted") {
        alert("Please enable alerts first! 🔔");
        return;
    }

    // Send test notification after a tiny delay
    setTimeout(() => {
        sendNotification("Test Successful! 🚀", "Your Life Reset alerts and sounds are working perfectly.");
    }, 500);
}

// --- Data Operations ---

async function getTasks() {
    const tasks = await db.tasks.toArray();
    return tasks.map(normalizeTaskRecord);
}

async function saveTasks(tasks) {
    const resolvedTasks = await Promise.resolve(tasks);
    const normalizedTasks = resolvedTasks.map(normalizeTaskRecord);

    // For bulk updates from older logic, we clear and re-add so the
    // current task order and flags stay in sync with the UI.
    await db.tasks.clear();
    await db.tasks.bulkAdd(normalizedTasks);
    renderTasks();
    updateProgress();
}

function normalizeTaskRecord(task) {
    const completed = task.completed !== undefined ? task.completed : task.isCompleted;
    return {
        ...task,
        todo: task.todo || task.name || 'Unnamed',
        completed: completed ? 1 : 0,
        priority: task.priority || 'medium',
        startTime: task.startTime || '00:00',
        endTime: task.endTime || '23:59',
        missed: Boolean(task.missed),
        lastNotified: task.lastNotified || null
    };
}

function getTaskKey(id) {
    const numericId = Number(id);
    return Number.isNaN(numericId) ? id : numericId;
}

async function checkDailyReset() {
    const lastStoredStr = localStorage.getItem('life_reset_last_date');
    const today = new Date();
    const todayStr = today.toDateString();

    if (lastStoredStr && lastStoredStr !== todayStr) {
        const tasks = await getTasks();
        
        // Snapshot the previous day
        const snapshotDate = new Date(lastStoredStr);
        const dateKey = snapshotDate.toISOString().split('T')[0];
        
        const existing = await db.history.where('date').equals(dateKey).first();
        if (!existing) {
            await db.history.add({
                date: dateKey,
                completedCount: tasks.filter(t => t.completed).length,
                totalCount: tasks.length,
                performance: tasks.length > 0 ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100) : 0
            });
        }

        // Reset for new day
        const resetTasks = tasks.map(task => ({
            ...task,
            completed: 0, // Using user's 'completed' instead of 'isCompleted'
            missed: false,
            lastNotified: null
        }));
        
        await db.tasks.clear();
        await db.tasks.bulkAdd(resetTasks);
        localStorage.setItem('life_reset_last_date', todayStr);
        await updateMissedStatus();
    } else if (!lastStoredStr) {
        localStorage.setItem('life_reset_last_date', todayStr);
    }
}

async function getMonthlyAnalysis() {
    const history = await db.history.orderBy('date').toArray();
    const monthlyStats = {};

    history.forEach(day => {
        const monthKey = day.date.substring(0, 7);
        if (!monthlyStats[monthKey]) {
            monthlyStats[monthKey] = { completed: 0, total: 0, days: 0, avgPerf: 0 };
        }
        monthlyStats[monthKey].completed += day.completedCount || 0;
        monthlyStats[monthKey].total     += day.totalCount     || 0;
        monthlyStats[monthKey].days      += 1;
    });

    Object.keys(monthlyStats).forEach(month => {
        const s = monthlyStats[month];
        s.avgPerf = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
    });

    return monthlyStats;
}

// Update missed status based on current time
async function updateMissedStatus() {
    const tasks = await getTasks();
    const now = new Date();
    const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    let hasChanges = false;

    tasks.forEach(task => {
        if (!task.completed && task.endTime < currentTimeStr) {
            if (!task.missed) {
                task.missed = true;
                hasChanges = true;
            }
        } else if (task.missed && !task.completed && task.endTime >= currentTimeStr) {
            task.missed = false;
            hasChanges = true;
        }
    });

    if (hasChanges) {
        await saveTasks(tasks);
    }
}

// --- UI Operations ---

function displayCurrentDate() {
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    const dateEl = document.getElementById('currentDateDisplay');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString(undefined, options);
    }
}

async function updateProgress() {
    const tasks = await getTasks();
    const progressText = document.getElementById('progressText');

    if (tasks.length === 0) {
        if (progressText) progressText.textContent = '0%';
        return;
    }

    const completedCount = tasks.filter(t => t.completed).length;
    const progress = Math.round((completedCount / tasks.length) * 100);
    if (progressText) progressText.textContent = `${progress}%`;
}

async function renderTasks() {
    const taskList = document.getElementById('taskList');
    const progressText = document.getElementById('progressText');
    if (!taskList) return;

    // Update missed status before rendering
    await updateMissedStatus();
    const freshTasks = await getTasks();

    if (freshTasks.length === 0) {
        taskList.innerHTML = `<div class="empty-state"><i class="bi bi-calendar-check"></i><p class="mb-0">No habits yet.</p></div>`;
        if (progressText) progressText.textContent = '0%';
        return;
    }

    let completedCount = 0;
    freshTasks.sort((a, b) => a.startTime.localeCompare(b.startTime));

    taskList.innerHTML = freshTasks.map(task => {
        if (task.completed) completedCount++;
        const isMissed = !task.completed && task.missed;
        const statusLabel = task.completed ? 'Completed' : (isMissed ? 'Missed' : 'Active');
        return `
            <div class="task-card ${isMissed ? 'missed' : ''} ${task.completed ? 'completed' : ''}" data-id="${task.id}">
                <div class="modern-check ${task.completed ? 'completed' : ''}" data-action="toggle" data-id="${task.id}">
                    ${task.completed ? '<i class="bi bi-check-lg"></i>' : ''}
                </div>
                <div class="task-content">
                    <div class="d-flex justify-content-between align-items-start gap-2">
                        <div class="task-title ${task.completed ? 'completed-text' : ''}">${escapeHTML(task.todo)}</div>
                        <span class="task-status-pill ${task.completed ? 'completed' : isMissed ? 'missed' : ''}">${statusLabel}</span>
                    </div>
                    <div class="task-status-row">
                        <div class="time-badge-modern">
                            <i class="bi bi-clock"></i> ${task.startTime} — ${task.endTime}
                        </div>
                        ${isMissed ? '<span class="task-status-pill missed"><i class="bi bi-exclamation-triangle"></i> Past deadline</span>' : ''}
                    </div>
                </div>
                <button class="delete-task-btn" data-action="delete" data-id="${task.id}"><i class="bi bi-trash3"></i></button>
            </div>
        `;
    }).join('');

    const progress = Math.round((completedCount / freshTasks.length) * 100);
    if (progressText) progressText.textContent = `${progress}%`;

    document.querySelectorAll('[data-action="toggle"]').forEach(el => el.onclick = handleToggle);
    document.querySelectorAll('[data-action="delete"]').forEach(el => el.onclick = handleDeleteTask);
}

// Event handlers for dynamic elements
async function handleToggle(e) {
    e.stopPropagation();
    const id = this.getAttribute('data-id');
    const task = await db.tasks.get(getTaskKey(id));
    if (!task) return;
    
    task.completed = task.completed ? 0 : 1;
    if (task.completed) {
        task.missed = false;
        task.lastNotified = null;
    }
    await db.tasks.put(task);
    
    if (task.completed) {
        feedback('success');
        triggerReward(task.id);
    } else {
        feedback('click');
    }
    renderTasks();
}

async function handleDeleteTask(e) {
    e.stopPropagation();
    if (!confirm("Delete this habit?")) return;
    const id = this.getAttribute('data-id');
    await db.tasks.delete(getTaskKey(id));
    feedback('delete');
    renderTasks();
}

async function handleAddTask(event) {
    event.preventDefault();
    const name = document.getElementById('taskName')?.value.trim();
    const startTime = document.getElementById('taskStartTime')?.value;
    const endTime = document.getElementById('taskEndTime')?.value;

    if (!name || !startTime || !endTime) return;

    if (startTime >= endTime) {
        alert("Start time must be before deadline.");
        return;
    }

    const tasks = await getTasks();
    const newTask = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now(),
        todo: name,
        startTime,
        endTime,
        completed: 0,
        priority: 'medium',
        missed: false,
        lastNotified: null
    };

    tasks.push(newTask);
    await saveTasks(tasks);
    feedback('click');

    // Reset form
    const form = document.getElementById('taskForm');
    if (form) form.reset();

    // Scroll to new task
    setTimeout(() => {
        const newTaskEl = document.querySelector(`.task-card[data-id="${newTask.id}"]`);
        if (newTaskEl) {
            newTaskEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

async function toggleTask(id) {
    const tasks = await getTasks();
    const task = tasks.find(t => String(t.id) === String(id));

    if (task) {
        task.completed = task.completed ? 0 : 1;
        if (task.completed) {
            task.missed = false;
            task.lastNotified = null;
            triggerReward(task.id);
            feedback('success');
        } else {
            feedback('click');
        }
        await saveTasks(tasks);
    }
}

async function deleteTask(id) {
    if (confirm("Are you sure you want to delete this habit?")) {
        let tasks = await getTasks();
        tasks = tasks.filter(t => String(t.id) !== String(id));
        await saveTasks(tasks);
        feedback('delete');
    }
}

function triggerReward(taskId = null) {
    const celebrationMessage = dopamineMessages[Math.floor(Math.random() * dopamineMessages.length)];

    // 1. Confetti Burst
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 180,
            spread: 92,
            startVelocity: 35,
            origin: { y: 0.65 },
            colors: ['#0866FF', '#42b0ff', '#1877F2', '#FFFFFF', '#00DFD8'],
            zIndex: 10001
        });
    }

    // 2. Show Dopamine Modal
    const modal = document.getElementById('dopamineModal');
    const titleEl = document.getElementById('dopamineTitle');
    const msgEl = document.getElementById('dopamineMessage');

    if (modal && msgEl) {
        if (titleEl) titleEl.textContent = 'Excellent Work! 🎉';
        msgEl.textContent = celebrationMessage;
        modal.classList.add('show');

        // Auto hide after 2.5 seconds
        setTimeout(() => {
            modal.classList.remove('show');
        }, 2500);
    }

    showTaskToast('Task completed', celebrationMessage, taskId);
}

function triggerCelebration() {
    triggerReward();
}

async function undoTaskCompletion(taskId) {
    const task = await db.tasks.get(getTaskKey(taskId));
    if (!task) return;

    task.completed = 0;
    task.missed = false;
    task.lastNotified = null;
    await db.tasks.put(task);
    feedback('click');
    renderTasks();
}

function showTaskToast(title, message, taskId = null) {
    const toast = document.getElementById('taskToast');
    const titleEl = document.getElementById('taskToastTitle');
    const msgEl = document.getElementById('taskToastMessage');
    const undoBtn = document.getElementById('taskToastUndo');

    if (!toast || !titleEl || !msgEl || !undoBtn) return;

    titleEl.textContent = title;
    msgEl.textContent = message;
    undoBtn.style.display = taskId ? 'inline-flex' : 'none';
    undoBtn.textContent = taskId ? 'Undo' : '';

    if (taskToastUndoHandler) {
        undoBtn.removeEventListener('click', taskToastUndoHandler);
        taskToastUndoHandler = null;
    }

    if (taskId) {
        taskToastUndoHandler = async () => {
            if (taskToastTimeout) clearTimeout(taskToastTimeout);
            toast.classList.remove('show');
            await undoTaskCompletion(taskId);
        };
        undoBtn.addEventListener('click', taskToastUndoHandler);
    }

    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');

    if (taskToastTimeout) clearTimeout(taskToastTimeout);
    taskToastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        if (taskToastUndoHandler) {
            undoBtn.removeEventListener('click', taskToastUndoHandler);
            taskToastUndoHandler = null;
        }
    }, 2600);
}

// --- The Interval Engine & Notifications ---

async function startIntervalEngine() {
    setInterval(async () => {
        await checkDailyReset();
        await checkRappelsAndDeadlines();
        await updateMissedStatus();
        renderTasks();
    }, 60 * 1000);
    await checkRappelsAndDeadlines();
    await checkDailyReset();
}

async function checkRappelsAndDeadlines() {
    const tasks = await getTasks();
    let hasChanges = false;

    const now = new Date();
    const currentTimeStr = now.toTimeString().substring(0, 5);
    const currentTimeMs = now.getTime();

    tasks.forEach(task => {
        if (task.completed) return;

        if (currentTimeStr > task.endTime) {
            if (task.lastNotified !== 'FAILED') {
                sendNotification("Goal Missed ⏰", `You missed: ${task.todo || task.name}`);
                task.lastNotified = 'FAILED';
                hasChanges = true;
            }
        }
        else if (currentTimeStr >= task.startTime && currentTimeStr <= task.endTime) {
            if (!task.lastNotified || (currentTimeMs - task.lastNotified > 900000)) {
                sendNotification("Time to Focus! 🎯", `Current: ${task.todo || task.name}`);
                task.lastNotified = currentTimeMs;
                hasChanges = true;
            }
        }
    });

    if (hasChanges) {
        await saveTasks(tasks);
    }
}

function requestNotifications() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

    if (!("Notification" in window)) {
        if (isIOS && !isStandalone) {
            alert("To enable notifications on iPhone:\n1. Tap the 'Share' icon below\n2. Select 'Add to Home Screen'\n3. Open the app from your home screen and try again! 🔔");
        } else {
            alert("This browser does not support notifications. Please try a modern browser like Chrome or Safari (added to home screen).");
        }
        return;
    }

    Notification.requestPermission().then(permission => {
        const btn = document.getElementById('enableNotificationsBtn');
        if (permission === "granted") {
            if (btn) {
                btn.innerHTML = '<i class="bi bi-bell-fill"></i> <span class="d-none d-sm-inline">Enabled</span>';
                btn.classList.add('btn-accent-modern');
                btn.classList.remove('alert-btn-modern');
            }
            // Play sound once to "unlock" audio for Safari/Mobile
            notificationSound.play().catch(() => { });
            sendNotification("Notifications Enabled 🔔", "You will now receive alerts and sounds.");
        } else {
            if (btn) {
                btn.innerHTML = '<i class="bi bi-bell-slash-fill"></i> <span class="d-none d-sm-inline">Blocked</span>';
            }
            alert("Please allow notifications in your browser settings to receive alerts.");
        }
    });
}

function sendNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        // Play sound (always try)
        notificationSound.play().catch(e => console.warn("Audio play blocked/failed:", e));

        const options = {
            body: body,
            icon: 'icons/icon-192x192.png',
            badge: 'icons/icon-192x192.png',
            vibrate: [200, 100, 200],
            silent: false
        };

        // If PWA / Standalone mode, SW notifications are more robust
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, options);
            }).catch(err => {
                console.error("SW notification failed, falling back:", err);
                new Notification(title, options);
            });
        } else {
            // Standard browser fallback
            new Notification(title, options);
        }
    }
}

// --- Utilities ---

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// --- Service Worker ---

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(registration => {
                    console.log('SW registered: ', registration);
                })
                .catch(registrationError => {
                    console.log('SW registration failed: ', registrationError);
                });
        });
    }
}

// Export for global access
window.handleToggle = handleToggle;
window.handleDeleteTask = handleDeleteTask;
window.deleteNote = deleteNote;
window.formatNote = formatNote;
window.openNote = openNote;
window.renderDashboard = renderDashboard;
