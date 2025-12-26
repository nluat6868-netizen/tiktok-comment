const mongoose = require('mongoose');
const User = require('./models/User');

const MONGO_URI = 'mongodb+srv://nluat6868_db_user:F3z4Ejbr8266Vdqy@cluster0.9vuegyb.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('Connected to MongoDB');

        const username = 'admin';
        const password = 'admin123'; // In real app, hash this!

        try {
            let admin = await User.findOne({ username });
            if (admin) {
                admin.role = 'admin';
                admin.password = password;
                admin.subscriptionExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
                await admin.save();
                console.log('Admin account updated.');
            } else {
                admin = new User({
                    username,
                    password,
                    role: 'admin',
                    subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                });
                await admin.save();
                console.log('Admin account created.');
            }
            console.log('Username: admin');
            console.log('Password: admin123');
        } catch (err) {
            console.error('Error:', err);
        } finally {
            mongoose.disconnect();
        }
    })
    .catch(err => console.error('MongoDB connection error:', err));
