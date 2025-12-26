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
const connectBtn = document.getElementById('connect-btn');

// Dashboard Elements
const disconnectBtn = document.getElementById('disconnect-btn');
const connectionStatus = document.getElementById('connection-status');
const currentUsername = document.getElementById('current-username');
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
            showConnectScreen();
        } else {
            showError(loginMsg, data.message);
        }
    } catch (err) {
        showError(loginMsg, 'Network error');
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

tiktokUsernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectToLive();
});

function connectToLive() {
    const username = tiktokUsernameInput.value.trim();
    if (!username) return alert('Please enter a TikTok username');

    connectBtn.disabled = true;
    connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';

    socket.emit('connectToLive', username);

    // Save username to localStorage
    localStorage.setItem('tiktokUsername', username);
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
            alert(`Error: ${data.message}`);
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
    totalLikes = data.totalLikeCount;
    likeCount.textContent = formatNumber(totalLikes);
    addLike(data);
});

socket.on('join', (data) => {
    addJoin(data);
});

socket.on('member', (data) => {
    viewerCount.textContent = formatNumber(data.viewerCount);
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
            <span class="username">${data.uniqueId}</span>
        </div>
        <div class="comment">${data.comment}</div>
    `;

    chatFeed.appendChild(div);

    if (chatFeed.children.length > 200) {
        chatFeed.removeChild(chatFeed.firstChild);
    }

    if (isScrolledToBottom) {
        chatFeed.scrollTop = chatFeed.scrollHeight;
    }
}

function addGift(data) {
    const div = document.createElement('div');
    div.className = 'chat-item highlight';

    const avatarUrl = data.profilePictureUrl || 'https://via.placeholder.com/24';

    div.innerHTML = `
        <div class="chat-header">
            <img src="${avatarUrl}" alt="Avatar" class="avatar">
            <span class="username">${data.uniqueId}</span>
        </div>
        <div class="comment">Sent ${data.giftName} x${data.repeatCount} <i class="fas fa-gift"></i></div>
    `;

    chatFeed.appendChild(div);
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

function addLike(data) {
    const div = document.createElement('div');
    div.className = 'chat-item like-event';

    const avatarUrl = data.profilePictureUrl || 'https://via.placeholder.com/24';

    div.innerHTML = `
        <div class="chat-header">
            <img src="${avatarUrl}" alt="Avatar" class="avatar">
            <span class="username">${data.uniqueId}</span>
        </div>
        <div class="comment">Liked the LIVE <i class="fas fa-heart" style="color: #fe2c55;"></i> x${data.likeCount}</div>
    `;

    chatFeed.appendChild(div);

    if (chatFeed.children.length > 200) chatFeed.removeChild(chatFeed.firstChild);
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

function addJoin(data) {
    const div = document.createElement('div');
    div.className = 'chat-item join-event';

    const avatarUrl = data.profilePictureUrl || 'https://via.placeholder.com/24';

    div.innerHTML = `
        <div class="chat-header">
            <img src="${avatarUrl}" alt="Avatar" class="avatar">
            <span class="username">${data.uniqueId}</span>
        </div>
        <div class="comment">Joined the LIVE <i class="fas fa-sign-in-alt" style="color: #25f4ee;"></i></div>
    `;

    chatFeed.appendChild(div);

    if (chatFeed.children.length > 200) chatFeed.removeChild(chatFeed.firstChild);
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

function addSystemMessage(msg) {
    const div = document.createElement('div');
    div.className = 'welcome-message';
    div.style.marginTop = '10px';
    div.style.fontSize = '0.9rem';
    div.innerHTML = `<p>${msg}</p>`;
    chatFeed.appendChild(div);
}

function playSound() {
    if (isSoundEnabled && notificationSound) {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(e => console.log('Audio play failed:', e));
    }
}

function formatNumber(num) {
    return new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(num);
}
