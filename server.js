const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const USERS_FILE = path.join(__dirname, 'users.json');

// Helper to read users
function getUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

// Helper to save users
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Auth Endpoints
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password required' });
    }

    const users = getUsers();
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ message: 'Username already exists' });
    }

    users.push({ username, password }); // In a real app, hash the password!
    saveUsers(users);

    res.json({ message: 'Registration successful' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        res.json({ message: 'Login successful', username });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
});

app.get('/api/sounds', (req, res) => {
    const soundsDir = path.join(__dirname, 'public', 'assets', 'sounds');
    fs.readdir(soundsDir, (err, files) => {
        if (err) {
            return res.status(500).json({ message: 'Unable to scan sounds directory' });
        }
        const soundFiles = files.filter(file => file.endsWith('.mp3') || file.endsWith('.wav'));
        res.json(soundFiles);
    });
});

let tiktokConnection = null;

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('connectToLive', (username) => {
        if (tiktokConnection) {
            tiktokConnection.disconnect();
        }

        try {
            tiktokConnection = new WebcastPushConnection(username);

            tiktokConnection.connect().then(state => {
                console.info(`Connected to roomId ${state.roomId}`);
                socket.emit('connectionStatus', { status: 'connected', roomId: state.roomId });
            }).catch(err => {
                console.error('Failed to connect', err);
                socket.emit('connectionStatus', { status: 'error', message: err.message });
            });

            tiktokConnection.on('chat', data => {
                socket.emit('chat', data);
            });

            tiktokConnection.on('like', data => {
                socket.emit('like', data);
            });

            tiktokConnection.on('join', data => {
                socket.emit('join', data);
            });

            tiktokConnection.on('gift', data => {
                socket.emit('gift', data);
            });

            tiktokConnection.on('member', data => {
                socket.emit('member', data);
            });

            tiktokConnection.on('streamEnd', () => {
                socket.emit('connectionStatus', { status: 'disconnected', message: 'Stream ended' });
            });

            tiktokConnection.on('disconnected', () => {
                socket.emit('connectionStatus', { status: 'disconnected', message: 'Disconnected' });
            });

            tiktokConnection.on('error', (err) => {
                console.error('TikTok connection error:', err);
                // Don't emit 'error' status here as it disconnects the client.
                // Just log it or send a warning toast if needed.
                // socket.emit('connectionStatus', { status: 'error', message: err.message || 'Unknown error' });
            });

        } catch (error) {
            console.error('Error creating connection:', error);
            socket.emit('connectionStatus', { status: 'error', message: error.message });
        }
    });

    socket.on('disconnectFromLive', () => {
        if (tiktokConnection) {
            tiktokConnection.disconnect();
            tiktokConnection = null;
            socket.emit('connectionStatus', { status: 'disconnected' });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        if (tiktokConnection) {
            tiktokConnection.disconnect();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
