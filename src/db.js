import Dexie from 'https://unpkg.com/dexie@4/dist/dexie.mjs';

export const db = new Dexie('CoreLifeDB');

db.version(1).stores({
    notes:    '++id, title, content, timestamp',
    tasks:    '++id, todo, completed, priority',
    finances: '++id, amount, description, category, date, monthYear',
    stories:  '++id, entry, mood, timestamp',
    history:  '++id, date'
});

// ─── One-Time Migration from localStorage ───────────────────────────────────
export async function migrateFromLocalStorage() {
    const already = localStorage.getItem('life_dexie_migrated');
    if (already) return;

    let didMigrate = false;

    // --- Notes ---
    const rawNotes = localStorage.getItem('life_reset_notes');
    if (rawNotes) {
        const parsed = JSON.parse(rawNotes) || [];
        if (parsed.length > 0) {
            await db.notes.bulkAdd(parsed.map(n => ({
                title:     n.title,
                content:   n.content,
                timestamp: n.timestamp || new Date().toLocaleString()
            })));
            localStorage.removeItem('life_reset_notes');
            didMigrate = true;
        }
    }

    // --- Tasks ---
    const rawTasks = localStorage.getItem('life_reset_tasks');
    if (rawTasks) {
        const parsed = JSON.parse(rawTasks) || [];
        if (parsed.length > 0) {
            await db.tasks.bulkAdd(parsed.map(t => ({
                todo:          t.name || t.todo || 'Unnamed',
                completed:     t.isCompleted ? 1 : 0,
                priority:      t.priority || 'medium',
                startTime:     t.startTime || '00:00',
                endTime:       t.endTime   || '23:59',
                missed:        t.missed    || false,
                lastNotified:  t.lastNotified || null
            })));
            localStorage.removeItem('life_reset_tasks');
            didMigrate = true;
        }
    }

    // --- Finances / Expenses ---
    const rawExp = localStorage.getItem('life_reset_expenses');
    if (rawExp) {
        const parsed = JSON.parse(rawExp) || [];
        if (parsed.length > 0) {
            await db.finances.bulkAdd(parsed.map(e => ({
                amount:      e.amount,
                description: e.description,
                category:    e.type === 'income' ? 'Income' : 'Expense',
                date:        (e.timestamp || new Date().toISOString()).split('T')[0],
                monthYear:   (e.timestamp || new Date().toISOString()).substring(0, 7)
            })));
            localStorage.removeItem('life_reset_expenses');
            didMigrate = true;
        }
    }

    // --- History ---
    const rawHist = localStorage.getItem('life_reset_history');
    if (rawHist) {
        const parsed = JSON.parse(rawHist) || [];
        if (parsed.length > 0) {
            await db.history.bulkAdd(parsed.map(h => ({
                date:           h.date,
                completedCount: h.completedCount || 0,
                totalCount:     h.totalCount     || 0,
                performance:    h.performance    || 0
            })));
            localStorage.removeItem('life_reset_history');
            didMigrate = true;
        }
    }

    // Mark migration done
    localStorage.setItem('life_dexie_migrated', '1');
    if (didMigrate) console.log('[CoreLifeDB] Migration from localStorage complete ✅');
}

// ─── Monthly Bilan (uses index on monthYear) ─────────────────────────────────
export async function calculateMonthlyBilan(monthYear) {
    try {
        const records = await db.finances
            .where('monthYear')
            .equals(monthYear)
            .toArray();

        return records.reduce((acc, curr) => {
            if (curr.category === 'Income') {
                acc.income += curr.amount;
            } else {
                acc.spent += curr.amount;
            }
            acc.total = acc.income - acc.spent;
            return acc;
        }, { income: 0, spent: 0, total: 0 });

    } catch (err) {
        console.error('[CoreLifeDB] Bilan error:', err);
        return { income: 0, spent: 0, total: 0 };
    }
}

// ─── Paginated Notes ─────────────────────────────────────────────────────────
export async function getPaginatedNotes(page = 0, limit = 5) {
    return db.notes
        .orderBy('timestamp')
        .reverse()
        .offset(page * limit)
        .limit(limit)
        .toArray();
}
