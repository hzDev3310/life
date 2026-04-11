// app.js

const dopamineMessages = [
    "You're crushing it! 🔥",
    "Dopamine hit secured! 🎯",
    "One step closer to greatness. 🚀",
    "Unstoppable momentum! ⚡",
    "Excellent execution! 💎"
];

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
    document.getElementById('taskForm').addEventListener('submit', handleAddTask);
    document.getElementById('enableNotificationsBtn').addEventListener('click', requestNotifications);

    // 4. Start Interval Engine
    startIntervalEngine();

    // 5. Register Service Worker
    registerServiceWorker();
}

// --- Data Operations ---

function getTasks() {
    return JSON.parse(localStorage.getItem('life_reset_tasks')) || [];
}

function saveTasks(tasks) {
    localStorage.setItem('life_reset_tasks', JSON.stringify(tasks));
    renderTasks();
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
            lastNotified: null // reset notification timer
        }));
        localStorage.setItem('life_reset_tasks', JSON.stringify(tasks));
        localStorage.setItem('life_reset_last_date', todayStr);
    }
}

// --- UI Operations ---

function displayCurrentDate() {
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    document.getElementById('currentDateDisplay').textContent = new Date().toLocaleDateString(undefined, options);
}

function renderTasks() {
    const tasks = getTasks();
    const taskList = document.getElementById('taskList');
    const progressText = document.getElementById('progressText');
    
    taskList.innerHTML = '';

    if (tasks.length === 0) {
        taskList.innerHTML = '<div class="text-center text-muted p-4 border border-secondary rounded-3 border-dashed">No habits added yet. Start building your routine!</div>';
        progressText.textContent = '0%';
        return;
    }

    let completedCount = 0;
    const now = new Date();
    const currentTimeStr = now.toTimeString().substring(0, 5); // "HH:MM"

    // Sort tasks by start time
    tasks.sort((a, b) => a.startTime.localeCompare(b.startTime));

    tasks.forEach(task => {
        if (task.isCompleted) completedCount++;

        const isWorkday = task.startTime >= "08:00" && task.endTime <= "17:00";
        const isMissed = !task.isCompleted && currentTimeStr > task.endTime;
        
        const taskEl = document.createElement('div');
        taskEl.className = `task-item ${task.isCompleted ? 'completed' : ''} ${isMissed ? 'missed' : ''} ${isWorkday ? 'workday-focus' : ''}`;
        
        taskEl.innerHTML = `
            <div class="task-checkbox-container">
                <input type="checkbox" class="custom-checkbox" onchange="toggleTask('${task.id}')" ${task.isCompleted ? 'checked' : ''}>
            </div>
            <div class="flex-grow-1">
                <div class="task-title">
                    ${escapeHTML(task.name)}
                    ${isWorkday ? '<span class="workday-badge" title="Focus Hour"><i class="bi bi-briefcase-fill"></i></span>' : ''}
                </div>
                <div class="task-time ${isMissed ? 'text-danger' : ''}">
                    <i class="bi bi-clock me-1"></i> ${task.startTime} - ${task.endTime}
                    ${isMissed ? '<span class="ms-2 badge bg-danger">Missed</span>' : ''}
                </div>
            </div>
            <button class="btn-delete" onclick="deleteTask('${task.id}')" title="Delete Task">
                <i class="bi bi-trash3"></i>
            </button>
        `;
        taskList.appendChild(taskEl);
    });

    const progress = Math.round((completedCount / tasks.length) * 100);
    progressText.textContent = `${progress}%`;
} // Closing bracket added here!

function handleAddTask(event) {
    event.preventDefault();
    const name = document.getElementById('taskName').value.trim();
    const startTime = document.getElementById('taskStartTime').value;
    const endTime = document.getElementById('taskEndTime').value;

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
        lastNotified: null
    };

    tasks.push(newTask);
    saveTasks(tasks);
    
    // Reset form
    document.getElementById('taskForm').reset();
}

window.toggleTask = function(id) {
    setTimeout(() => {
        const tasks = getTasks();
        const task = tasks.find(t => t.id === id);
        
        if (task) {
            task.isCompleted = !task.isCompleted;
            saveTasks(tasks);

            if (task.isCompleted) {
                triggerReward();
            }
        }
    }, 200); // Small delay to let the CSS animation play first
};

window.deleteTask = function(id) {
    if(confirm("Are you sure you want to delete this habit?")) {
        let tasks = getTasks();
        tasks = tasks.filter(t => t.id !== id);
        saveTasks(tasks);
    }
};

function triggerReward() {
    // 1. Confetti Burst
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#0F5132', '#198754', '#FFD700', '#FFFFFF']
        });
    }

    // 2. Show Dopamine Modal
    const modal = document.getElementById('dopamineModal');
    const msgEl = document.getElementById('dopamineMessage');
    
    msgEl.textContent = dopamineMessages[Math.floor(Math.random() * dopamineMessages.length)];
    modal.classList.add('show');

    // Auto hide after 2.5 seconds
    setTimeout(() => {
        modal.classList.remove('show');
    }, 2500);
}

// --- The Interval Engine & Notifications ---

function startIntervalEngine() {
    // Run every 60 seconds
    setInterval(checkRappelsAndDeadlines, 60 * 1000);
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
            // It will naturally turn red via CSS when rendered, but let's notify if we haven't already alerted for fail
            if (task.lastNotified !== 'FAILED') {
                sendNotification("Goal Missed", `You missed the deadline for: ${task.name}`);
                task.lastNotified = 'FAILED';
                hasChanges = true;
            }
        } 
        // Condition 2: Rappel (Task is active in its timeframe)
        else if (currentTimeStr >= task.startTime && currentTimeStr <= task.endTime) {
            // Check 15 minute throttle (15 * 60 * 1000 = 900000 ms)
            if (!task.lastNotified || (currentTimeMs - task.lastNotified > 900000)) {
                sendNotification("Time to Work!", `Current task: ${task.name}`);
                task.lastNotified = currentTimeMs;
                hasChanges = true;
            }
        }
    });

    if (hasChanges) {
        saveTasks(tasks); // Save notification updates and trigger a re-render to update colors
    } else {
        // Just re-render occasionally to catch tasks passing deadline gracefully without reload
        // But let's only do it if something actually changed state visually.
        // For simplicity, we just trigger a render if the current time minute changed.
        const currentMinute = now.getMinutes();
        if (window.lastMinuteRender !== currentMinute) {
             renderTasks();
             window.lastMinuteRender = currentMinute;
        }
    }
}

function requestNotifications() {
    if (!("Notification" in window)) {
        alert("This browser does not support desktop notification");
        return;
    }
    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            const btn = document.getElementById('enableNotificationsBtn');
            btn.innerHTML = '<i class="bi bi-bell-fill"></i> <span class="d-none d-sm-inline">Enabled</span>';
            btn.classList.replace('btn-outline-light', 'btn-emerald');
            sendNotification("Notifications Enabled", "You will now receive rappels.");
        }
    });
}

function sendNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            icon: 'logo.png',
            badge: 'logo.png'
        });
    }
}

// --- Utilities ---

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
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
