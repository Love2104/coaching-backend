# Student Coaching Platform Backend

A comprehensive backend system for a student coaching platform built with Node.js, Express.js, MongoDB, and various modern technologies.

## 🚀 Features

### 🔐 User Management
- **Three Role System**: SuperAdmin, Admin (Teachers), Students
- **Authentication**: JWT-based auth + Google OAuth via Passport.js
- **Registration Logic**:
  - SuperAdmin: First user registered automatically
  - Admin: Requires valid invite code from SuperAdmin
  - Students: Free registration
- **Password Reset**: Email-based password recovery

### 📚 Course Management
- Admins can create, update, delete their own courses
- SuperAdmin can manage all courses
- File uploads for syllabus, materials, thumbnails
- Course categorization and tagging
- Enrollment tracking

### 🧠 AI-Based Mock Test Generator
- Generate dummy MCQ tests (GPT integration ready)
- Customizable question count and difficulty
- Auto-grading system
- Result tracking and analytics

### 💬 Discussion Forum
- Access limited to students who purchased courses
- Post questions with images, tags
- Upvote/downvote system
- Mark questions as resolved
- Admin participation in course-specific discussions

### 💳 Payment System
- **Online**: Razorpay integration
- **Offline**: Manual approval workflow
- Payment history and tracking
- Revenue analytics and CSV export

### 🔔 Notification System
- Role-based notifications
- Email integration
- Scheduled notifications
- Read/unread tracking

### 📊 Admin Dashboard
- Comprehensive statistics
- Revenue analytics
- User management
- Recent activity tracking

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT, Passport.js (Google OAuth)
- **File Upload**: Multer
- **Email**: Nodemailer
- **Payment**: Razorpay SDK
- **Security**: Helmet, CORS, Rate Limiting
- **Validation**: Express Validator

## 📦 Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd coaching-platform-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment Setup**
Create a `.env` file in the root directory:
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/coaching-platform

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRE=7d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Razorpay
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=uploads/

# Admin Invite Code Settings
INVITE_CODE_EXPIRY_DAYS=7

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

4. **Start MongoDB**
Make sure MongoDB is running on your system.

5. **Seed Database (Optional)**
```bash
npm run seed
```

6. **Start the server**
```bash
# Development
npm run dev

# Production
npm start
```

## 🔑 Default Login Credentials (After Seeding)

- **SuperAdmin**: superadmin@example.com / superadmin123
- **Admin**: admin@example.com / admin123
- **Student**: student@example.com / student123

## 📚 API Documentation

### Authentication Routes (`/api/auth`)
- `POST /register` - Student registration
- `POST /register-admin` - Admin registration with invite code
- `POST /login` - User login
- `GET /me` - Get current user
- `PUT /profile` - Update profile
- `PUT /change-password` - Change password
- `POST /forgot-password` - Request password reset
- `PUT /reset-password/:token` - Reset password
- `GET /google` - Google OAuth
- `POST /logout` - Logout

### User Management (`/api/users`)
- `GET /` - Get all users (Admin/SuperAdmin)
- `GET /:id` - Get user by ID
- `PUT /:id` - Update user (SuperAdmin)
- `DELETE /:id` - Delete user (SuperAdmin)
- `POST /:id/avatar` - Upload avatar
- `GET /stats/overview` - User statistics
- `GET /my-students/list` - Get enrolled students (Admin)

### Course Management (`/api/courses`)
- `GET /` - Get all courses
- `GET /:id` - Get single course
- `POST /` - Create course (Admin/SuperAdmin)
- `PUT /:id` - Update course
- `DELETE /:id` - Delete course
- `POST /:id/materials` - Add course material
- `PUT /:id/materials/:materialId` - Update material
- `DELETE /:id/materials/:materialId` - Delete material
- `PUT /:id/publish` - Publish/unpublish course
- `GET /categories/list` - Get categories
- `GET /subjects/list` - Get subjects

### Test Management (`/api/tests`)
- `POST /generate` - Generate AI test (Admin/SuperAdmin)
- `GET /` - Get all tests
- `GET /:id` - Get single test
- `POST /` - Create test (Admin/SuperAdmin)
- `PUT /:id` - Update test
- `DELETE /:id` - Delete test
- `POST /:id/submit` - Submit test answers (Student)
- `GET /:id/results` - Get test results
- `GET /results/:resultId` - Get detailed result

### Forum (`/api/forum`)
- `GET /` - Get all forum posts
- `GET /:id` - Get single post
- `POST /` - Create post (Student)
- `PUT /:id` - Update post
- `DELETE /:id` - Delete post
- `POST /:id/vote` - Vote on post
- `POST /:id/replies` - Add reply
- `PUT /:id/replies/:replyId` - Update reply
- `DELETE /:id/replies/:replyId` - Delete reply
- `PUT /:id/resolve` - Mark as resolved
- `PUT /:id/pin` - Pin/unpin post (Admin)
- `GET /stats/overview` - Forum statistics

### Payment System (`/api/payments`)
- `POST /create-order` - Create Razorpay order (Student)
- `POST /verify` - Verify payment (Student)
- `POST /offline` - Request offline payment (Student)
- `GET /history` - Payment history
- `GET /:id` - Get payment details
- `PUT /:id/approve` - Approve offline payment (Admin)
- `PUT /:id/reject` - Reject offline payment (Admin)
- `GET /stats/overview` - Payment statistics
- `GET /export/csv` - Export payments (SuperAdmin)

### Notifications (`/api/notifications`)
- `GET /` - Get user notifications
- `GET /all` - Get all notifications (Admin)
- `POST /` - Create notification (Admin)
- `PUT /:id` - Update notification
- `DELETE /:id` - Delete notification
- `PUT /:id/read` - Mark as read
- `PUT /read-all/mark` - Mark all as read
- `GET /stats/overview` - Notification statistics
- `POST /send-scheduled` - Send scheduled notifications (SuperAdmin)

### Admin Invites (`/api/invites`)
- `POST /admin` - Generate invite code (SuperAdmin)
- `GET /admin` - Get all invites (SuperAdmin)
- `GET /admin/:code` - Get invite details
- `PUT /admin/:id/deactivate` - Deactivate invite (SuperAdmin)
- `POST /admin/:id/resend` - Resend invite email (SuperAdmin)
- `DELETE /admin/:id` - Delete invite (SuperAdmin)
- `GET /admin/stats` - Invite statistics (SuperAdmin)

### Admin Dashboard (`/api/admin`)
- `GET /stats` - Dashboard statistics
- `GET /recent-activity` - Recent activity
- `GET /system-health` - System health (SuperAdmin)

## 🔒 Access Control Summary

| Role | Capabilities |
|------|-------------|
| **SuperAdmin** | Complete system access, generate admin invites, manage all resources |
| **Admin** | Register via invite, manage own courses, approve payments, create tests |
| **Student** | Free registration, purchase courses, access forum after purchase, take tests |

## 🧩 Admin Invite Flow

1. SuperAdmin generates invite: `POST /api/invites/admin`
2. Admin registers with code: `POST /api/auth/register-admin`
3. Code becomes single-use and expires after configured days
4. Admin gains access to create courses and manage students

## 📁 Project Structure

```
├── config/
│   └── passport.js          # Passport configuration
├── middleware/
│   ├── auth.js             # Authentication middleware
│   ├── errorHandler.js     # Error handling
│   ├── notFound.js         # 404 handler
│   └── upload.js           # File upload handling
├── models/
│   ├── User.js             # User model
│   ├── Course.js           # Course model
│   ├── Test.js             # Test model
│   ├── TestResult.js       # Test result model
│   ├── ForumPost.js        # Forum post model
│   ├── Payment.js          # Payment model
│   ├── Notification.js     # Notification model
│   └── AdminInviteCode.js  # Admin invite model
├── routes/
│   ├── auth.js             # Authentication routes
│   ├── users.js            # User management
│   ├── courses.js          # Course management
│   ├── tests.js            # Test management
│   ├── forum.js            # Forum routes
│   ├── payments.js         # Payment routes
│   ├── notifications.js    # Notification routes
│   ├── invites.js          # Invite management
│   └── admin.js            # Admin dashboard
├── utils/
│   ├── jwt.js              # JWT utilities
│   ├── email.js            # Email utilities
│   └── razorpay.js         # Razorpay utilities
├── scripts/
│   └── seed.js             # Database seeding
├── uploads/                # File uploads directory
├── .env.example            # Environment variables template
├── server.js               # Main server file
└── package.json
```

## 🚀 Deployment

1. **Environment Variables**: Set all required environment variables
2. **Database**: Ensure MongoDB is accessible
3. **File Storage**: Configure file upload directory
4. **Email Service**: Set up SMTP credentials
5. **Payment Gateway**: Configure Razorpay keys
6. **Google OAuth**: Set up Google OAuth credentials

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions, please create an issue in the repository or contact the development team.