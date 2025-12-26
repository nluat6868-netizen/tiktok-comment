const mongoose = require('mongoose');
const User = require('./models/User');

const MONGO_URI = 'mongodb+srv://nluat6868_db_user:F3z4Ejbr8266Vdqy@cluster0.9vuegyb.mongodb.net/?appName=Cluster0';

async function seedAdmin() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const adminUser = {
            username: 'admin',
            password: '123456',
            role: 'admin'
        };

        // Check if admin already exists
        const existingAdmin = await User.findOne({ username: adminUser.username });
        if (existingAdmin) {
            console.log('Admin user already exists. Updating role...');
            existingAdmin.role = 'admin';
            existingAdmin.password = adminUser.password; // Ensure password is correct
            await existingAdmin.save();
            console.log('Admin user updated.');
        } else {
            const newUser = new User(adminUser);
            await newUser.save();
            console.log('Admin user created.');
        }

        mongoose.disconnect();
    } catch (err) {
        console.error('Error seeding admin:', err);
        process.exit(1);
    }
}

seedAdmin();
