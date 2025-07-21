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

### 🔐 Authentication Required
For protected routes, include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Authentication Routes (`/api/auth`)

#### `POST /api/auth/register` - Student Registration
**Body (JSON):**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+1234567890" // optional
}
```

#### `POST /api/auth/register-admin` - Admin Registration with Invite Code
**Body (JSON):**
```json
{
  "name": "Jane Teacher",
  "email": "jane@example.com",
  "password": "password123",
  "inviteCode": "ABC123DEF456",
  "phone": "+1234567890" // optional
}
```

#### `POST /api/auth/login` - User Login
**Body (JSON):**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

#### `GET /api/auth/me` - Get Current User
**Headers:** `Authorization: Bearer <token>`
**Response:** User object with enrolled courses

#### `PUT /api/auth/profile` - Update Profile
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "name": "Updated Name",
  "phone": "+9876543210"
}
```

#### `PUT /api/auth/change-password` - Change Password
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword123"
}
```

#### `POST /api/auth/forgot-password` - Request Password Reset
**Body (JSON):**
```json
{
  "email": "user@example.com"
}
```

#### `PUT /api/auth/reset-password/:token` - Reset Password
**Body (JSON):**
```json
{
  "password": "newpassword123"
}
```

#### `GET /api/auth/google` - Google OAuth
**Description:** Redirects to Google OAuth consent screen

#### `POST /api/auth/logout` - Logout
**Headers:** `Authorization: Bearer <token>`

### User Management (`/api/users`)

#### `GET /api/users` - Get All Users (Admin/SuperAdmin)
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:**
```
?page=1&limit=10&role=student&search=john&isActive=true
```

#### `GET /api/users/:id` - Get User by ID
**Headers:** `Authorization: Bearer <token>`

#### `PUT /api/users/:id` - Update User (SuperAdmin Only)
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "name": "Updated Name",
  "email": "newemail@example.com",
  "phone": "+1234567890",
  "role": "admin",
  "isActive": true
}
```

#### `DELETE /api/users/:id` - Delete User (SuperAdmin Only)
**Headers:** `Authorization: Bearer <token>`

#### `POST /api/users/:id/avatar` - Upload Avatar
**Headers:** `Authorization: Bearer <token>`
**Body (Form Data):**
```
avatar: <image-file>
```

#### `GET /api/users/stats/overview` - User Statistics
**Headers:** `Authorization: Bearer <token>`

#### `GET /api/users/my-students/list` - Get Enrolled Students (Admin)
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:**
```
?page=1&limit=10&courseId=courseId&search=student
```

### Course Management (`/api/courses`)

#### `GET /api/courses` - Get All Courses
**Query Parameters:**
```
?page=1&limit=10&category=Mathematics&subject=Algebra&level=beginner&search=calculus&sortBy=createdAt&sortOrder=desc&published=true
```

#### `GET /api/courses/:id` - Get Single Course
**Headers:** `Authorization: Bearer <token>` (optional)

#### `POST /api/courses` - Create Course (Admin/SuperAdmin)
**Headers:** `Authorization: Bearer <token>`
**Body (Form Data):**
```
title: Introduction to Mathematics
description: A comprehensive course covering basic mathematical concepts
shortDescription: Learn mathematics from basics
category: Mathematics
subject: Algebra
level: beginner
price: 2999
originalPrice: 3999
duration: 40
tags: mathematics,algebra,beginner
prerequisites: Basic arithmetic,High school math
learningOutcomes: Understand algebra,Solve equations
thumbnail: <image-file>
syllabus: <pdf-file>
```

#### `PUT /api/courses/:id` - Update Course
**Headers:** `Authorization: Bearer <token>`
**Body (Form Data):** Same as create course (all fields optional)

#### `DELETE /api/courses/:id` - Delete Course
**Headers:** `Authorization: Bearer <token>`

#### `POST /api/courses/:id/materials` - Add Course Material
**Headers:** `Authorization: Bearer <token>`
**Body (Form Data):**
```
title: Lesson 1 - Introduction
type: pdf | video | link
description: Introduction to the course
order: 1
url: https://youtube.com/watch?v=xyz (for links)
material: <file> (for pdf/video uploads)
```

#### `PUT /api/courses/:id/materials/:materialId` - Update Material
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "order": 2,
  "url": "https://newlink.com"
}
```

#### `DELETE /api/courses/:id/materials/:materialId` - Delete Material
**Headers:** `Authorization: Bearer <token>`

#### `PUT /api/courses/:id/publish` - Publish/Unpublish Course
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "isPublished": true
}
```

#### `GET /api/courses/categories/list` - Get Categories
**Description:** Returns list of all course categories

#### `GET /api/courses/subjects/list` - Get Subjects
**Query Parameters:**
```
?category=Mathematics
```

### Test Management (`/api/tests`)

#### `POST /api/tests/generate` - Generate AI Test (Admin/SuperAdmin)
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "subject": "Mathematics",
  "topic": "Algebra",
  "numQuestions": 10,
  "difficulty": "medium",
  "courseId": "courseObjectId"
}
```

#### `GET /api/tests` - Get All Tests
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:**
```
?page=1&limit=10&courseId=courseId&subject=Mathematics&published=true
```

#### `GET /api/tests/:id` - Get Single Test
**Headers:** `Authorization: Bearer <token>`

#### `POST /api/tests` - Create Test (Admin/SuperAdmin)
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "title": "Algebra Test 1",
  "description": "Test on basic algebra",
  "courseId": "courseObjectId",
  "subject": "Mathematics",
  "topic": "Algebra",
  "duration": 60,
  "questions": [
    {
      "question": "What is 2 + 2?",
      "options": [
        {"text": "3", "isCorrect": false},
        {"text": "4", "isCorrect": true},
        {"text": "5", "isCorrect": false}
      ],
      "explanation": "2 + 2 equals 4",
      "difficulty": "easy",
      "marks": 1
    }
  ],
  "passingMarks": 6,
  "maxAttempts": 3,
  "shuffleQuestions": false,
  "showResults": true,
  "showCorrectAnswers": true,
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-12-31T23:59:59Z"
}
```

#### `PUT /api/tests/:id` - Update Test
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):** Same as create test (all fields optional)

#### `DELETE /api/tests/:id` - Delete Test
**Headers:** `Authorization: Bearer <token>`

#### `POST /api/tests/:id/submit` - Submit Test Answers (Student)
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "answers": [
    {
      "questionId": "questionObjectId",
      "selectedOption": "optionObjectId",
      "timeTaken": 30
    }
  ],
  "timeTaken": 45
}
```

#### `GET /api/tests/:id/results` - Get Test Results
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:**
```
?page=1&limit=10&studentId=studentId
```

#### `GET /api/tests/results/:resultId` - Get Detailed Result
**Headers:** `Authorization: Bearer <token>`

### Forum (`/api/forum`)

#### `GET /api/forum` - Get All Forum Posts
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:**
```
?page=1&limit=10&courseId=courseId&tags=javascript,react&search=question&resolved=false&sortBy=lastActivity&sortOrder=desc
```

#### `GET /api/forum/:id` - Get Single Post
**Headers:** `Authorization: Bearer <token>`

#### `POST /api/forum` - Create Post (Student)
**Headers:** `Authorization: Bearer <token>`
**Body (Form Data):**
```
title: How to solve this problem?
content: I'm having trouble understanding this concept...
courseId: courseObjectId (optional)
tags: ["javascript", "react"]
image: <image-file> (optional)
```

#### `PUT /api/forum/:id` - Update Post
**Headers:** `Authorization: Bearer <token>`
**Body (Form Data):**
```
title: Updated title
content: Updated content
tags: ["updated", "tags"]
image: <image-file> (optional)
```

#### `DELETE /api/forum/:id` - Delete Post
**Headers:** `Authorization: Bearer <token>`

#### `POST /api/forum/:id/vote` - Vote on Post
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "voteType": "upvote" | "downvote" | "remove"
}
```

#### `POST /api/forum/:id/replies` - Add Reply
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "content": "This is my reply to the post..."
}
```

#### `PUT /api/forum/:id/replies/:replyId` - Update Reply
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "content": "Updated reply content..."
}
```

#### `DELETE /api/forum/:id/replies/:replyId` - Delete Reply
**Headers:** `Authorization: Bearer <token>`

#### `PUT /api/forum/:id/resolve` - Mark as Resolved
**Headers:** `Authorization: Bearer <token>`

#### `PUT /api/forum/:id/pin` - Pin/Unpin Post (Admin)
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "isPinned": true
}
```

#### `GET /api/forum/stats/overview` - Forum Statistics
**Headers:** `Authorization: Bearer <token>`

### Payment System (`/api/payments`)

#### `POST /api/payments/create-order` - Create Razorpay Order (Student)
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "courseId": "courseObjectId"
}
```

#### `POST /api/payments/verify` - Verify Payment (Student)
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "razorpayOrderId": "order_xyz123",
  "razorpayPaymentId": "pay_abc456",
  "razorpaySignature": "signature_hash"
}
```

#### `POST /api/payments/offline` - Request Offline Payment (Student)
**Headers:** `Authorization: Bearer <token>`
**Body (Form Data):**
```
courseId: courseObjectId
bankName: State Bank of India
transactionId: TXN123456789
transactionDate: 2024-01-15T10:30:00Z
notes: Payment made via NEFT
screenshot: <image-file>
```

#### `GET /api/payments/history` - Payment History
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:**
```
?page=1&limit=10&status=completed&paymentMethod=online&courseId=courseId
```

#### `GET /api/payments/:id` - Get Payment Details
**Headers:** `Authorization: Bearer <token>`

#### `PUT /api/payments/:id/approve` - Approve Offline Payment (Admin)
**Headers:** `Authorization: Bearer <token>`

#### `PUT /api/payments/:id/reject` - Reject Offline Payment (Admin)
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "reason": "Invalid transaction details provided"
}
```

#### `GET /api/payments/stats/overview` - Payment Statistics
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:**
```
?startDate=2024-01-01&endDate=2024-12-31
```

#### `GET /api/payments/export/csv` - Export Payments (SuperAdmin)
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:**
```
?startDate=2024-01-01&endDate=2024-12-31&status=completed&paymentMethod=online
```

### Notifications (`/api/notifications`)

#### `GET /api/notifications` - Get User Notifications
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:**
```
?page=1&limit=20&unreadOnly=false&type=info
```

#### `GET /api/notifications/all` - Get All Notifications (Admin)
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:**
```
?page=1&limit=20&targetType=all_students&type=announcement&isSent=true&search=exam
```

#### `POST /api/notifications` - Create Notification (Admin)
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "title": "Exam Schedule Announcement",
  "message": "The final exam is scheduled for next week...",
  "type": "announcement",
  "targetType": "all_students",
  "targetUsers": ["userId1", "userId2"],
  "targetCourse": "courseObjectId",
  "sendEmail": true,
  "scheduledFor": "2024-01-20T09:00:00Z",
  "priority": "high",
  "expiresAt": "2024-01-25T23:59:59Z",
  "actionButton": {
    "text": "View Details",
    "url": "https://example.com/exam-details"
  }
}
```

#### `PUT /api/notifications/:id` - Update Notification
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):** Same as create notification (all fields optional)

#### `DELETE /api/notifications/:id` - Delete Notification
**Headers:** `Authorization: Bearer <token>`

#### `PUT /api/notifications/:id/read` - Mark as Read
**Headers:** `Authorization: Bearer <token>`

#### `PUT /api/notifications/read-all/mark` - Mark All as Read
**Headers:** `Authorization: Bearer <token>`

#### `GET /api/notifications/stats/overview` - Notification Statistics
**Headers:** `Authorization: Bearer <token>`

#### `POST /api/notifications/send-scheduled` - Send Scheduled Notifications (SuperAdmin)
**Headers:** `Authorization: Bearer <token>`

### Admin Invites (`/api/invites`)

#### `POST /api/invites/admin` - Generate Invite Code (SuperAdmin)
**Headers:** `Authorization: Bearer <token>`
**Body (JSON):**
```json
{
  "email": "newadmin@example.com",
  "expiryDays": 7
}
```

#### `GET /api/invites/admin` - Get All Invites (SuperAdmin)
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:**
```
?page=1&limit=10&status=active&search=admin@example.com
```

#### `GET /api/invites/admin/:code` - Get Invite Details
**Description:** Public endpoint for registration validation

#### `PUT /api/invites/admin/:id/deactivate` - Deactivate Invite (SuperAdmin)
**Headers:** `Authorization: Bearer <token>`

#### `POST /api/invites/admin/:id/resend` - Resend Invite Email (SuperAdmin)
**Headers:** `Authorization: Bearer <token>`

#### `DELETE /api/invites/admin/:id` - Delete Invite (SuperAdmin)
**Headers:** `Authorization: Bearer <token>`

#### `GET /api/invites/admin/stats` - Invite Statistics (SuperAdmin)
**Headers:** `Authorization: Bearer <token>`

### Admin Dashboard (`/api/admin`)

#### `GET /api/admin/stats` - Dashboard Statistics
**Headers:** `Authorization: Bearer <token>`
**Response Example:**
```json
{
  "success": true,
  "data": {
    "users": {
      "totalStudents": 150,
      "totalAdmins": 5,
      "totalUsers": 156
    },
    "courses": {
      "totalCourses": 25
    },
    "tests": {
      "totalTests": 50,
      "totalAttempts": 500
    },
    "forum": {
      "totalPosts": 200
    },
    "revenue": {
      "online": {"amount": 50000, "count": 30},
      "offline": {"amount": 25000, "count": 15},
      "total": {"amount": 75000, "count": 45}
    }
  }
}
```

#### `GET /api/admin/recent-activity` - Recent Activity
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:**
```
?limit=10
```

#### `GET /api/admin/system-health` - System Health (SuperAdmin)
**Headers:** `Authorization: Bearer <token>`

## 📋 **Common Response Format**

### Success Response:
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { /* response data */ },
  "pagination": { /* for paginated responses */
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

### Error Response:
```json
{
  "success": false,
  "message": "Error description",
  "errors": [ /* validation errors if any */ ]
}
```

## 🔒 **Role-Based Access Control**

| Endpoint Pattern | SuperAdmin | Admin | Student |
|------------------|------------|-------|---------|
| `/api/auth/*` | ✅ | ✅ | ✅ |
| `/api/users/*` | ✅ | Limited | Own profile only |
| `/api/courses/*` | ✅ | Own courses | Read-only |
| `/api/tests/*` | ✅ | Own course tests | Take tests only |
| `/api/forum/*` | ✅ | Course-specific | Purchased courses |
| `/api/payments/*` | ✅ | Course payments | Own payments |
| `/api/notifications/*` | ✅ | Create/manage | Read-only |
| `/api/invites/*` | ✅ | ❌ | ❌ |
| `/api/admin/*` | ✅ | Limited stats | ❌ |

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