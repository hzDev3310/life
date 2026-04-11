// app.js - Modern Life Reset Tracker

const dopamineMessages = [
    "You're crushing it! 🔥",
    "Dopamine hit secured! 🎯",
    "One step closer to greatness. 🚀",
    "Unstoppable momentum! ⚡",
    "Excellent execution! 💎",
    "Keep that streak alive! ✨",
    "Another win for the books! 📖"
];

// Sound Assets
const notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
const successSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3');
const tapSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
const deleteSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2561/2561-preview.mp3');

// Haptic & Sound Utility
function feedback(type = 'soft') {
    // Vibrate
    if ("vibrate" in navigator) {
        if (type === 'success') navigator.vibrate([50, 30, 50]);
        else if (type === 'error') navigator.vibrate([100, 50, 100]);
        else navigator.vibrate(20); // soft tap
    }

    // Play Sound
    if (type === 'success') successSound.play().catch(() => { });
    else if (type === 'click') tapSound.play().catch(() => { });
    else if (type === 'delete') deleteSound.play().catch(() => { });
}

// Main App Logic
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // 1. Initialize Date and check for daily reset
    displayCurrentDate();
    checkDailyReset();

    // 2. Render tasks from storage
    renderTasks();

    // 3. Set up event listeners
    const taskForm = document.getElementById('taskForm');
    if (taskForm) {
        taskForm.addEventListener('submit', handleAddTask);
    }

    const testBtn = document.getElementById('testNotificationsBtn');
    if (testBtn) {
        testBtn.addEventListener('click', handleTestNotification);
    }

    const notifBtn = document.getElementById('enableNotificationsBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', requestNotifications);
    }

    // 4. Start Interval Engine
    startIntervalEngine();

    // 5. Register Service Worker
    registerServiceWorker();
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

function getTasks() {
    return JSON.parse(localStorage.getItem('life_reset_tasks')) || [];
}

function saveTasks(tasks) {
    localStorage.setItem('life_reset_tasks', JSON.stringify(tasks));
    renderTasks();
    updateProgress();
}

function checkDailyReset() {
    const lastStoredStr = localStorage.getItem('life_reset_last_date');
    const todayStr = new Date().toDateString();

    if (lastStoredStr !== todayStr) {
        // It's a new day! Reset completion status.
        let tasks = getTasks();
        tasks = tasks.map(task => ({
            ...task,
            isCompleted: false,
            missed: false,
            lastNotified: null
        }));
        localStorage.setItem('life_reset_tasks', JSON.stringify(tasks));
        localStorage.setItem('life_reset_last_date', todayStr);
        updateMissedStatus();
    }
}

// Update missed status based on current time
function updateMissedStatus() {
    const tasks = getTasks();
    const now = new Date();
    const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    let hasChanges = false;

    tasks.forEach(task => {
        if (!task.isCompleted && task.endTime < currentTimeStr) {
            if (!task.missed) {
                task.missed = true;
                hasChanges = true;
            }
        } else if (task.missed && !task.isCompleted && task.endTime >= currentTimeStr) {
            task.missed = false;
            hasChanges = true;
        }
    });

    if (hasChanges) {
        saveTasks(tasks);
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

function updateProgress() {
    const tasks = getTasks();
    const progressText = document.getElementById('progressText');

    if (tasks.length === 0) {
        if (progressText) progressText.textContent = '0%';
        return;
    }

    const completedCount = tasks.filter(t => t.isCompleted).length;
    const progress = Math.round((completedCount / tasks.length) * 100);
    if (progressText) progressText.textContent = `${progress}%`;
}

function renderTasks() {
    const tasks = getTasks();
    const taskList = document.getElementById('taskList');
    const progressText = document.getElementById('progressText');

    if (!taskList) return;

    // Update missed status before rendering
    updateMissedStatus();
    const freshTasks = getTasks();

    if (freshTasks.length === 0) {
        taskList.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-calendar-check"></i>
                <p class="mb-0">No habits yet. Add your first ritual above!</p>
            </div>
        `;
        if (progressText) progressText.textContent = '0%';
        return;
    }

    let completedCount = 0;
    const now = new Date();
    const currentTimeStr = now.toTimeString().substring(0, 5);

    // Sort tasks by start time
    freshTasks.sort((a, b) => a.startTime.localeCompare(b.startTime));

    taskList.innerHTML = freshTasks.map(task => {
        if (task.isCompleted) completedCount++;

        const isMissed = !task.isCompleted && task.missed;
        const completedClass = task.isCompleted ? 'completed' : '';
        const missedClass = isMissed ? 'missed' : '';

        return `
            <div class="task-card ${missedClass} ${completedClass}" data-id="${task.id}">
                <div class="modern-check ${task.isCompleted ? 'completed' : ''}" data-action="toggle" data-id="${task.id}">
                    ${task.isCompleted ? '<i class="bi bi-check-lg"></i>' : ''}
                </div>
                <div class="task-content">
                    <div class="task-title ${task.isCompleted ? 'completed-text' : ''}">${escapeHTML(task.name)}</div>
                    <div class="time-badge-modern">
                        <i class="bi bi-clock"></i>
                        ${task.startTime} — ${task.endTime}
                        ${isMissed ? '<span class="ms-2 text-danger"><i class="bi bi-exclamation-triangle"></i> Missed</span>' : ''}
                    </div>
                </div>
                <button class="delete-task-btn" data-action="delete" data-id="${task.id}" title="Delete habit">
                    <i class="bi bi-trash3"></i>
                </button>
            </div>
        `;
    }).join('');

    // Update progress
    const progress = Math.round((completedCount / freshTasks.length) * 100);
    if (progressText) progressText.textContent = `${progress}%`;

    // Attach event listeners to dynamic elements
    document.querySelectorAll('[data-action="toggle"]').forEach(el => {
        el.removeEventListener('click', handleToggle);
        el.addEventListener('click', handleToggle);
    });

    document.querySelectorAll('[data-action="delete"]').forEach(el => {
        el.removeEventListener('click', handleDelete);
        el.addEventListener('click', handleDelete);
    });
}

// Event handlers for dynamic elements
function handleToggle(e) {
    e.stopPropagation();
    const id = this.getAttribute('data-id');
    toggleTask(id);
}

function handleDelete(e) {
    e.stopPropagation();
    const id = this.getAttribute('data-id');
    deleteTask(id);
}

function handleAddTask(event) {
    event.preventDefault();
    const name = document.getElementById('taskName')?.value.trim();
    const startTime = document.getElementById('taskStartTime')?.value;
    const endTime = document.getElementById('taskEndTime')?.value;

    if (!name || !startTime || !endTime) return;

    if (startTime >= endTime) {
        alert("Start time must be before deadline.");
        return;
    }

    const tasks = getTasks();
    const newTask = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        name,
        startTime,
        endTime,
        isCompleted: false,
        missed: false,
        lastNotified: null
    };

    tasks.push(newTask);
    saveTasks(tasks);
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

function toggleTask(id) {
    const tasks = getTasks();
    const task = tasks.find(t => t.id === id);

    if (task) {
        task.isCompleted = !task.isCompleted;
        if (task.isCompleted) {
            task.missed = false;
            triggerReward();
            feedback('success');
        } else {
            feedback('click');
        }
        saveTasks(tasks);
    }
}

function deleteTask(id) {
    if (confirm("Are you sure you want to delete this habit?")) {
        let tasks = getTasks();
        tasks = tasks.filter(t => t.id !== id);
        saveTasks(tasks);
        feedback('delete');
    }
}

function triggerReward() {
    // 1. Confetti Burst
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 120,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#10B981', '#059669', '#A3E635', '#FFFFFF', '#FBBF24']
        });
    }

    // 2. Show Dopamine Modal
    const modal = document.getElementById('dopamineModal');
    const titleEl = document.getElementById('dopamineTitle');
    const msgEl = document.getElementById('dopamineMessage');

    if (modal && msgEl) {
        if (titleEl) titleEl.textContent = 'Excellent Work! 🎉';
        msgEl.textContent = dopamineMessages[Math.floor(Math.random() * dopamineMessages.length)];
        modal.classList.add('show');

        // Auto hide after 2.5 seconds
        setTimeout(() => {
            modal.classList.remove('show');
        }, 2500);
    }
}

// --- The Interval Engine & Notifications ---

function startIntervalEngine() {
    // Run every 60 seconds
    setInterval(() => {
        checkRappelsAndDeadlines();
        updateMissedStatus();
        renderTasks();
    }, 60 * 1000);
    // Also run immediately on load
    checkRappelsAndDeadlines();
}

function checkRappelsAndDeadlines() {
    const tasks = getTasks();
    let hasChanges = false;

    const now = new Date();
    const currentTimeStr = now.toTimeString().substring(0, 5);
    const currentTimeMs = now.getTime();

    tasks.forEach(task => {
        if (task.isCompleted) return;

        // Condition 1: Failure Alert (Deadline passed)
        if (currentTimeStr > task.endTime) {
            if (task.lastNotified !== 'FAILED') {
                sendNotification("Goal Missed ⏰", `You missed the deadline for: ${task.name}`);
                task.lastNotified = 'FAILED';
                hasChanges = true;
            }
        }
        // Condition 2: Reminder (Task is active in its timeframe)
        else if (currentTimeStr >= task.startTime && currentTimeStr <= task.endTime) {
            if (!task.lastNotified || (currentTimeMs - task.lastNotified > 900000)) {
                sendNotification("Time to Focus! 🎯", `Current task: ${task.name}`);
                task.lastNotified = currentTimeMs;
                hasChanges = true;
            }
        }
    });

    if (hasChanges) {
        saveTasks(tasks);
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
                btn.classList.add('btn-emerald-modern');
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
        // Play sound
        notificationSound.play().catch(e => console.log("Audio play failed:", e));

        // Use Service Worker for notification
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, {
                    body: body,
                    icon: 'icons/icon-192x192.png',
                    badge: 'icons/icon-192x192.png',
                    vibrate: [200, 100, 200],
                    silent: false
                });
            });
        } else if (navigator.serviceWorker) {
            // Wait for service worker
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, {
                    body: body,
                    icon: 'icons/icon-192x192.png',
                    badge: 'icons/icon-192x192.png'
                });
            });
        } else {
            // Fallback to standard notification
            new Notification(title, { body, icon: 'icons/icon-192x192.png' });
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

// Export for global access (for inline event handlers if needed)
window.toggleTask = toggleTask;
window.deleteTask = deleteTask;