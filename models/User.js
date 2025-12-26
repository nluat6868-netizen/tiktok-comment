const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    tiktokUsername: { type: String },
    subscriptionExpiry: { type: Date }
});

module.exports = mongoose.model('User', userSchema);
