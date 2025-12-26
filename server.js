const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const User = require('./models/User');
const puppeteer = require('puppeteer');

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

        const expiry = new Date();
        expiry.setHours(expiry.getHours() + 24); // 1 Day Trial
        const newUser = new User({ username, password, subscriptionExpiry: expiry }); // In a real app, hash the password!
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
                return res.json({ message: 'Login successful', username, role: 'admin', tiktokUsername: user.tiktokUsername });
            }

            // Check Subscription
            if (user.subscriptionExpiry && new Date(user.subscriptionExpiry) > new Date()) {
                res.json({ message: 'Login successful', username, role: 'user', tiktokUsername: user.tiktokUsername, subscriptionExpiry: user.subscriptionExpiry });
            } else {
                res.status(403).json({ message: 'Gói dịch vụ đã hết hạn. Vui lòng liên hệ admin 0899689293 để gia hạn.' });
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

app.post('/api/user/tiktok-username', async (req, res) => {
    const { username, tiktokUsername } = req.body;
    if (!username || !tiktokUsername) {
        return res.status(400).json({ message: 'Username and TikTok username required' });
    }

    try {
        await User.findOneAndUpdate({ username }, { tiktokUsername });
        res.json({ message: 'TikTok username updated' });
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Admin APIs
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({}, 'username role subscriptionExpiry tiktokUsername');
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching users' });
    }
});

app.post('/api/admin/extend', async (req, res) => {
    const { username, months } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ message: 'User not found' });

        let currentExpiry = user.subscriptionExpiry && new Date(user.subscriptionExpiry) > new Date()
            ? new Date(user.subscriptionExpiry)
            : new Date();

        currentExpiry.setMonth(currentExpiry.getMonth() + parseInt(months));

        user.subscriptionExpiry = currentExpiry;
        await user.save();

        res.json({ message: 'Subscription extended', newExpiry: user.subscriptionExpiry });
    } catch (err) {
        res.status(500).json({ message: 'Error extending subscription' });
    }
});

app.get('/api/get-session-id', async (req, res) => {
    try {
        const browser = await puppeteer.launch({
            headless: false, // Show browser
            defaultViewport: null,
            args: ['--start-maximized']
        });

        const pages = await browser.pages();
        const page = pages[0];

        await page.goto('https://www.tiktok.com/login', { waitUntil: 'networkidle2' });

        // Poll for cookie
        const checkCookie = async () => {
            if (browser.process() === null) return; // Browser closed

            const cookies = await page.cookies();
            const sessionCookie = cookies.find(c => c.name === 'sessionid');

            if (sessionCookie) {
                await browser.close();
                return res.json({ sessionId: sessionCookie.value });
            }

            setTimeout(checkCookie, 1000);
        };

        checkCookie();

        // Timeout after 2 minutes
        setTimeout(async () => {
            if (browser.process() !== null) {
                await browser.close();
                if (!res.headersSent) {
                    res.status(408).json({ message: 'Login timeout' });
                }
            }
        }, 120000);

        // Handle browser close by user
        browser.on('disconnected', () => {
            if (!res.headersSent) {
                res.status(400).json({ message: 'Browser closed by user' });
            }
        });

    } catch (err) {
        console.error('Puppeteer error:', err);
        res.status(500).json({ message: 'Failed to launch browser' });
    }
});

let tiktokConnection = null;

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('connectToLive', (data) => {
        const username = typeof data === 'string' ? data : data.username;
        const sessionId = typeof data === 'object' ? data.sessionId : null;

        if (tiktokConnection) {
            tiktokConnection.disconnect();
        }

        try {
            const options = {
                processInitialData: false,
                enableExtendedGiftInfo: true,
                enableWebsocketUpgrade: false, // Force polling to avoid 200 OK error
                requestPollingIntervalMs: 2000,
                clientParams: {
                    app_language: 'en-US',
                    device_platform: 'web'
                }
            };

            if (sessionId) {
                options.sessionId = sessionId;
                console.log('Using Session ID for connection');
            }

            tiktokConnection = new WebcastPushConnection(username, options);
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

            tiktokConnection.on('roomUser', data => {
                socket.emit('roomUser', data);
            });

            tiktokConnection.on('streamEnd', () => {
                socket.emit('connectionStatus', { status: 'disconnected', message: 'Stream ended' });
            });

            tiktokConnection.on('disconnected', () => {
                socket.emit('connectionStatus', { status: 'disconnected', message: 'Disconnected' });
            });

            tiktokConnection.on('error', (err) => {
                console.error('TikTok connection error:', err);
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
    console.log(`Server running on port ${PORT}`);
});

// Global Error Handlers
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! 💥 Shutting down gracefully...');
    console.error(err.name, err.message);
    console.error(err.stack);
});

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥');
    console.error(err.name, err.message);
});
