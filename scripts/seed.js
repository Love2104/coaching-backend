const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Course = require('../models/Course');
require('dotenv').config();

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/coaching-platform');
    console.log('Connected to MongoDB');

    // Clear existing data (optional - comment out if you want to keep existing data)
    // await User.deleteMany({});
    // await Course.deleteMany({});
    // console.log('Cleared existing data');

    // Check if SuperAdmin already exists
    const existingSuperAdmin = await User.findOne({ role: 'superadmin' });
    if (existingSuperAdmin) {
      console.log('SuperAdmin already exists:', existingSuperAdmin.email);
    } else {
      // Create SuperAdmin
      const superAdmin = await User.create({
        name: 'Super Admin',
        email: 'superadmin@example.com',
        password: 'superadmin123',
        role: 'superadmin',
        isEmailVerified: true
      });
      console.log('SuperAdmin created:', superAdmin.email);
    }

    // Create sample admin
    const existingAdmin = await User.findOne({ email: 'admin@example.com' });
    if (!existingAdmin) {
      const admin = await User.create({
        name: 'John Teacher',
        email: 'admin@example.com',
        password: 'admin123',
        role: 'admin',
        isEmailVerified: true
      });
      console.log('Sample Admin created:', admin.email);

      // Create sample course
      const course = await Course.create({
        title: 'Introduction to Mathematics',
        description: 'A comprehensive course covering basic mathematical concepts including algebra, geometry, and calculus fundamentals.',
        shortDescription: 'Learn mathematics from basics to advanced concepts',
        instructor: admin._id,
        category: 'Mathematics',
        subject: 'Algebra',
        level: 'beginner',
        price: 2999,
        originalPrice: 3999,
        duration: 40,
        tags: ['mathematics', 'algebra', 'beginner'],
        prerequisites: ['Basic arithmetic'],
        learningOutcomes: [
          'Understand algebraic expressions',
          'Solve linear equations',
          'Work with geometric shapes',
          'Apply mathematical concepts in real life'
        ],
        isPublished: true
      });
      console.log('Sample Course created:', course.title);
    }

    // Create sample students
    const existingStudent = await User.findOne({ email: 'student@example.com' });
    if (!existingStudent) {
      const student1 = await User.create({
        name: 'Alice Student',
        email: 'student@example.com',
        password: 'student123',
        role: 'student',
        isEmailVerified: true
      });

      const student2 = await User.create({
        name: 'Bob Learner',
        email: 'student2@example.com',
        password: 'student123',
        role: 'student',
        isEmailVerified: true
      });

      console.log('Sample Students created');
    }

    console.log('Database seeded successfully!');
    console.log('\nLogin Credentials:');
    console.log('SuperAdmin: superadmin@example.com / superadmin123');
    console.log('Admin: admin@example.com / admin123');
    console.log('Student: student@example.com / student123');
    console.log('Student 2: student2@example.com / student123');

  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

seedDatabase();