const socket = io();

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const connectScreen = document.getElementById('connect-screen');
const dashboardScreen = document.getElementById('dashboard-screen');

// Auth Elements
const authTabs = document.querySelectorAll('.auth-tab');
const authForms = document.querySelectorAll('.auth-form');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginMsg = document.getElementById('login-msg');
const regMsg = document.getElementById('reg-msg');
const logoutBtn = document.getElementById('logout-btn');

// Connect Elements
const tiktokUsernameInput = document.getElementById('tiktok-username');
const sessionIdInput = document.getElementById('session-id');
const getSessionBtn = document.getElementById('get-session-btn');
const connectBtn = document.getElementById('connect-btn');

// Dashboard Elements
const disconnectBtn = document.getElementById('disconnect-btn');
const connectionStatus = document.getElementById('connection-status');
const currentUsername = document.getElementById('current-username');
const subscriptionExpiryDisplay = document.getElementById('subscription-expiry-display');
const chatFeed = document.getElementById('chat-feed');
const chatContainer = document.getElementById('chat-container');
const likeCount = document.getElementById('like-count');
const viewerCount = document.getElementById('viewer-count');
const notificationSound = document.getElementById('notification-sound');

// Settings & Actions
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const soundToggleCheck = document.getElementById('sound-toggle-check');
const soundSelect = document.getElementById('sound-select');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const refreshBtn = document.getElementById('refresh-btn');
const toastContainer = document.getElementById('toast-container');
const adminBtn = document.getElementById('admin-btn');
const adminModal = document.getElementById('admin-modal');
const closeAdminBtn = document.getElementById('close-admin');
const userListBody = document.getElementById('user-list-body');

// State
let isSoundEnabled = true;
let totalLikes = 0;
let currentUser = null;

// --- Auth Logic ---

// Tab Switching
authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        authTabs.forEach(t => t.classList.remove('active'));
        authForms.forEach(f => f.classList.remove('active'));

        tab.classList.add('active');
        const formId = tab.dataset.tab === 'login' ? 'login-form' : 'register-form';
        document.getElementById(formId).classList.add('active');

        // Clear messages
        loginMsg.textContent = '';
        regMsg.textContent = '';
    });
});

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            currentUser = data.username;
            // Save session and username
            localStorage.setItem('app_session_user', currentUser);
            localStorage.setItem('remembered_login_username', username);

            if (data.role === 'admin') {
                adminBtn.style.display = 'flex';
                // Admin doesn't need to persist tiktokUsername
                localStorage.removeItem('tiktokUsername');
                tiktokUsernameInput.value = '';
            } else {
                adminBtn.style.display = 'none';
                if (data.tiktokUsername) {
                    localStorage.setItem('tiktokUsername', data.tiktokUsername);
                    tiktokUsernameInput.value = data.tiktokUsername;
                }
            }

            if (data.subscriptionExpiry) {
                localStorage.setItem('subscriptionExpiry', data.subscriptionExpiry);
                updateExpiryDisplay(data.subscriptionExpiry);
            } else {
                localStorage.removeItem('subscriptionExpiry');
                updateExpiryDisplay(null);
            }

            showConnectScreen();
        } else {
            showError(loginMsg, data.message);
        }
    } catch (err) {
        console.error('Login fetch error:', err);
        showError(loginMsg, 'Network error: ' + err.message);
    }
});

// Register
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            showSuccess(regMsg, 'Registration successful! Please login.');
            setTimeout(() => {
                authTabs[0].click(); // Switch to login tab
                document.getElementById('login-username').value = username;
            }, 1500);
        } else {
            showError(regMsg, data.message);
        }
    } catch (err) {
        showError(regMsg, 'Network error');
    }
});

logoutBtn.addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('app_session_user');
    localStorage.removeItem('subscriptionExpiry');
    showAuthScreen();
});

function showError(el, msg) {
    el.textContent = msg;
    el.className = 'auth-msg error';
}

function showSuccess(el, msg) {
    el.textContent = msg;
    el.className = 'auth-msg success';
}

// --- Navigation ---

function showAuthScreen() {
    hideAllScreens();
    authScreen.classList.add('active');
}

function showConnectScreen() {
    hideAllScreens();
    connectScreen.classList.add('active');
}

function showDashboard() {
    hideAllScreens();
    dashboardScreen.classList.add('active');
    chatFeed.innerHTML = '';
    totalLikes = 0;
    likeCount.textContent = '0';
}

function hideAllScreens() {
    authScreen.classList.remove('active');
    connectScreen.classList.remove('active');
    dashboardScreen.classList.remove('active');
}

// --- Connect Logic ---

connectBtn.addEventListener('click', connectToLive);
disconnectBtn.addEventListener('click', disconnectFromLive);

getSessionBtn.addEventListener('click', async () => {
    getSessionBtn.disabled = true;
    getSessionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening...';

    try {
        const res = await fetch('/api/get-session-id');
        const data = await res.json();

        if (res.ok) {
            sessionIdInput.value = data.sessionId;
            localStorage.setItem('sessionId', data.sessionId);
            showToast('Session ID retrieved successfully!', 'success');
        } else {
            showToast('Error: ' + data.message, 'error');
        }
    } catch (err) {
        console.error('Get Session ID error:', err);
        showToast('Failed to get Session ID', 'error');
    } finally {
        getSessionBtn.disabled = false;
        getSessionBtn.innerHTML = '<i class="fas fa-magic"></i> Get';
    }
});

tiktokUsernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectToLive();
});

function connectToLive() {
    const username = tiktokUsernameInput.value.trim();
    const sessionId = sessionIdInput.value.trim();
    if (!username) return showToast('Please enter a TikTok username', 'error');

    connectBtn.disabled = true;
    connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';

    socket.emit('connectToLive', { username, sessionId });

    // Save username to localStorage
    localStorage.setItem('tiktokUsername', username);
    if (sessionId) localStorage.setItem('sessionId', sessionId);

    // Save to DB if logged in and NOT admin
    if (currentUser && currentUser !== 'admin') {
        fetch('/api/user/tiktok-username', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, tiktokUsername: username })
        }).catch(err => console.error('Failed to save tiktok username to DB', err));
    }
}

function disconnectFromLive() {
    socket.emit('disconnectFromLive');
}

// --- Socket Events ---

socket.on('connectionStatus', (data) => {
    if (data.status === 'connected') {
        showDashboard();
        updateStatus('connected');
        currentUsername.textContent = tiktokUsernameInput.value;
        addSystemMessage(`Connected to room: ${data.roomId}`);
    } else if (data.status === 'disconnected') {
        updateStatus('disconnected');
        addSystemMessage(data.message || 'Disconnected');
        setTimeout(() => {
            if (currentUser) showConnectScreen();
            else showAuthScreen();
        }, 1000);

        // Reset connect button
        connectBtn.disabled = false;
        connectBtn.innerHTML = '<span>Connect</span><i class="fas fa-arrow-right"></i>';
    } else if (data.status === 'error') {
        // Only show error if we are not already connected or if it's a critical failure
        if (connectionStatus.classList.contains('connected')) {
            console.error('Background error:', data.message);
            // Optional: show a small toast notification instead of full disconnect
        } else {
            updateStatus('disconnected');
            showToast(`Error: ${data.message}`, 'error');
            connectBtn.disabled = false;
            connectBtn.innerHTML = '<span>Connect</span><i class="fas fa-arrow-right"></i>';
        }
    }
});

socket.on('chat', (data) => {
    addComment(data);
    playSound();
});

socket.on('like', (data) => {
    if (typeof data.totalLikeCount === 'number') {
        totalLikes = data.totalLikeCount;
    } else {
        totalLikes += data.likeCount;
    }
    likeCount.textContent = formatNumber(totalLikes);
    addLike(data);
});

socket.on('join', (data) => {
    addJoin(data);
});

socket.on('roomUser', (data) => {
    const count = typeof data.viewerCount === 'number' ? data.viewerCount : 0;
    viewerCount.textContent = formatNumber(count);
});

socket.on('gift', (data) => {
    addGift(data);
    playSound();
});

// --- UI Helpers ---

// Settings Modal
settingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('active');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('active');
});

settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.remove('active');
    }
});

soundToggleCheck.addEventListener('change', (e) => {
    isSoundEnabled = e.target.checked;
});

soundSelect.addEventListener('change', (e) => {
    const selectedSound = e.target.value;
    notificationSound.src = `assets/sounds/${selectedSound}`;
    playSound(); // Preview sound
});

refreshBtn.addEventListener('click', () => {
    refreshBtn.disabled = true;
    const originalIcon = refreshBtn.innerHTML;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    disconnectFromLive();

    setTimeout(() => {
        connectToLive();
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = originalIcon;
    }, 1000);
});

// Load Sounds
async function loadSounds() {
    try {
        const res = await fetch('/api/sounds');
        const sounds = await res.json();

        soundSelect.innerHTML = '';
        sounds.forEach(sound => {
            const option = document.createElement('option');
            option.value = sound;
            option.textContent = sound;
            if (sound === 'notification.mp3') option.selected = true;
            soundSelect.appendChild(option);
        });
    } catch (err) {
        console.error('Failed to load sounds', err);
    }
}

// Initial Load
loadSounds();

// Load saved username
const savedUsername = localStorage.getItem('tiktokUsername');
if (savedUsername) {
    tiktokUsernameInput.value = savedUsername;
}

const savedSessionId = localStorage.getItem('sessionId');
if (savedSessionId && sessionIdInput) {
    sessionIdInput.value = savedSessionId;
}

// Load saved login username
const savedLoginUsername = localStorage.getItem('remembered_login_username');
if (savedLoginUsername) {
    document.getElementById('login-username').value = savedLoginUsername;
}

// Check for active session
const sessionUser = localStorage.getItem('app_session_user');
if (sessionUser) {
    console.log('Restoring session for user:', sessionUser);
    currentUser = sessionUser;

    const savedExpiry = localStorage.getItem('subscriptionExpiry');
    if (savedExpiry) {
        updateExpiryDisplay(savedExpiry);
    }

    showConnectScreen();
} else {
    console.log('No active session found');
}

// Fullscreen
fullscreenBtn.addEventListener('click', () => {
    chatContainer.classList.toggle('fullscreen');
    const icon = fullscreenBtn.querySelector('i');
    if (chatContainer.classList.contains('fullscreen')) {
        icon.className = 'fas fa-compress';
    } else {
        icon.className = 'fas fa-expand';
    }
});

function updateStatus(status) {
    connectionStatus.className = `status-indicator ${status}`;
}

function addComment(data) {
    const isScrolledToBottom = chatFeed.scrollHeight - chatFeed.scrollTop <= chatFeed.clientHeight + 100;

    const div = document.createElement('div');
    div.className = 'chat-item';

    const avatarUrl = data.profilePictureUrl || 'https://p16-tiktokcdn-com.akamaized.net/obj/v0201/7d9098dbf9b346499379433695881951';

    div.innerHTML = `
        <div class="chat-header">
            <img src="${avatarUrl}" alt="Avatar" class="avatar" onerror="this.src='https://via.placeholder.com/24'">
            <span class="username">${data.nickname || data.uniqueId}</span>
        </div>
        <div class="comment">${data.comment}</div>
    `;

    chatFeed.appendChild(div);

    if (chatFeed.children.length > 200) {
        chatFeed.removeChild(chatFeed.firstChild);
    }

    // Always scroll to bottom as requested
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addGift(data) {
    const div = document.createElement('div');
    div.className = 'chat-item highlight';

    const avatarUrl = data.profilePictureUrl || 'https://via.placeholder.com/24';

    div.innerHTML = `
        <div class="chat-header">
            <img src="${avatarUrl}" alt="Avatar" class="avatar">
            <span class="username">${data.nickname || data.uniqueId}</span>
        </div>
        <div class="comment">Sent ${data.giftName} x${data.repeatCount} <i class="fas fa-gift"></i></div>
    `;

    chatFeed.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addLike(data) {
    const div = document.createElement('div');
    div.className = 'chat-item like-event';

    const avatarUrl = data.profilePictureUrl || 'https://via.placeholder.com/24';

    div.innerHTML = `
        <div class="chat-header">
            <img src="${avatarUrl}" alt="Avatar" class="avatar">
            <span class="username">${data.nickname || data.uniqueId}</span>
        </div>
        <div class="comment">Liked the LIVE <i class="fas fa-heart" style="color: #fe2c55;"></i> x${data.likeCount}</div>
    `;

    chatFeed.appendChild(div);

    if (chatFeed.children.length > 200) chatFeed.removeChild(chatFeed.firstChild);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Remove after 3 seconds
    setTimeout(() => {
        if (div.parentNode) {
            div.parentNode.removeChild(div);
        }
    }, 3000);
}

function addJoin(data) {
    const div = document.createElement('div');
    div.className = 'chat-item join-event';

    const avatarUrl = data.profilePictureUrl || 'https://via.placeholder.com/24';

    div.innerHTML = `
        <div class="chat-header">
            <img src="${avatarUrl}" alt="Avatar" class="avatar">
            <span class="username">${data.nickname || data.uniqueId}</span>
        </div>
        <div class="comment">Joined the LIVE <i class="fas fa-sign-in-alt" style="color: #25f4ee;"></i></div>
    `;

    chatFeed.appendChild(div);

    if (chatFeed.children.length > 200) chatFeed.removeChild(chatFeed.firstChild);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addSystemMessage(msg) {
    const div = document.createElement('div');
    div.className = 'welcome-message';
    div.style.marginTop = '10px';
    div.style.fontSize = '0.9rem';
    div.innerHTML = `<p>${msg}</p>`;
    chatFeed.appendChild(div);
}

function updateExpiryDisplay(expiryDate) {
    if (!subscriptionExpiryDisplay) return;

    // Let's rely on the passed expiryDate. If it's null/undefined, it might be admin.

    if (!expiryDate) {
        // Check if we are admin
        if (adminBtn && adminBtn.style.display === 'flex') {
            subscriptionExpiryDisplay.textContent = 'Unlimited';
            subscriptionExpiryDisplay.style.color = '#4caf50'; // Green
        } else {
            subscriptionExpiryDisplay.textContent = '';
        }
        return;
    }

    const date = new Date(expiryDate);
    const now = new Date();
    const isExpired = date < now;
    const formattedDate = date.toLocaleDateString('en-GB'); // DD/MM/YYYY

    subscriptionExpiryDisplay.textContent = `Expires: ${formattedDate}`;
    subscriptionExpiryDisplay.style.color = isExpired ? '#ff4d4d' : 'var(--text-secondary)';
}

function playSound() {
    if (isSoundEnabled && notificationSound) {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(e => console.log('Audio play failed:', e));
    }
}

function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
}

// Toast Notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type} `;

    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';

    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <div class="toast-content">
            <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    if (toastContainer) {
        toastContainer.appendChild(toast);
        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
}

// --- Admin Logic ---
if (adminBtn) {
    adminBtn.addEventListener('click', () => {
        fetchUsers();
        adminModal.style.display = 'flex';
    });
}

if (closeAdminBtn) {
    closeAdminBtn.addEventListener('click', () => {
        adminModal.style.display = 'none';
    });
}

async function fetchUsers() {
    try {
        const res = await fetch('/api/admin/users');
        const users = await res.json();
        renderUserList(users);
    } catch (err) {
        showToast('Failed to fetch users', 'error');
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB'); // DD/MM/YYYY
}

function renderUserList(users) {
    userListBody.innerHTML = '';
    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';

        const expiryDate = user.subscriptionExpiry ? formatDate(user.subscriptionExpiry) : 'Unlimited';
        const isExpired = user.subscriptionExpiry && new Date(user.subscriptionExpiry) < new Date();
        const expiryColor = isExpired ? '#ff4d4d' : 'var(--text-color)';

        tr.innerHTML = `
            <td style="padding: 10px;">${user.username}</td>
            <td style="padding: 10px;">${user.role}</td>
            <td style="padding: 10px; color: ${expiryColor};">${expiryDate}</td>
            <td style="padding: 10px;">
                <button class="btn secondary small" onclick="extendSubscription('${user.username}', 1)">+1M</button>
                <button class="btn secondary small" onclick="extendSubscription('${user.username}', 3)">+3M</button>
                <button class="btn secondary small" onclick="extendSubscription('${user.username}', 6)">+6M</button>
            </td>
        `;
        userListBody.appendChild(tr);
    });
}

window.extendSubscription = async (username, months) => {
    try {
        const res = await fetch('/api/admin/extend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, months })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`Extended ${username} by ${months} months`, 'success');
            fetchUsers(); // Refresh list
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Error extending subscription', 'error');
    }
};
