const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// MongoDB Connection
const MONGO_URI = 'mongodb+srv://nluat6868_db_user:F3z4Ejbr8266Vdqy@cluster0.9vuegyb.mongodb.net/?appName=Cluster0';
mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Auth Endpoints
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password required' });
    }

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        const newUser = new User({ username, password }); // In a real app, hash the password!
        await newUser.save();

        res.json({ message: 'Registration successful' });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username, password });

        if (user) {
            if (user.role === 'admin') {
                res.json({ message: 'Login successful', username });
            } else {
                res.status(403).json({ message: 'Tài khoản chưa được kích hoạt. Vui lòng liên hệ admin 0899689293' });
            }
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Internal server error' });
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

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
