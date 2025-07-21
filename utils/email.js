const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Send email
const sendEmail = async (options) => {
  const transporter = createTransporter();
  
  const message = {
    from: `${process.env.FROM_NAME || 'Coaching Platform'} <${process.env.EMAIL_USER}>`,
    to: options.email,
    subject: options.subject,
    html: options.html || options.message
  };
  
  try {
    const info = await transporter.sendMail(message);
    console.log('Email sent: ', info.messageId);
    return info;
  } catch (error) {
    console.error('Email error: ', error);
    throw error;
  }
};

// Email templates
const emailTemplates = {
  // Password reset email
  passwordReset: (resetUrl, name) => ({
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hello ${name},</p>
        <p>You have requested a password reset. Please click the link below to reset your password:</p>
        <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0;">Reset Password</a>
        <p>This link will expire in 10 minutes.</p>
        <p>If you did not request this password reset, please ignore this email.</p>
        <p>Best regards,<br>Coaching Platform Team</p>
      </div>
    `
  }),
  
  // Welcome email
  welcome: (name) => ({
    subject: 'Welcome to Coaching Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Coaching Platform!</h2>
        <p>Hello ${name},</p>
        <p>Thank you for joining our coaching platform. We're excited to have you on board!</p>
        <p>You can now:</p>
        <ul>
          <li>Browse and purchase courses</li>
          <li>Take AI-generated mock tests</li>
          <li>Participate in discussion forums</li>
          <li>Track your progress</li>
        </ul>
        <p>Get started by exploring our courses and finding the perfect fit for your learning goals.</p>
        <p>Best regards,<br>Coaching Platform Team</p>
      </div>
    `
  }),
  
  // Admin invite email
  adminInvite: (inviteCode, inviterName) => ({
    subject: 'Admin Invitation - Coaching Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Admin Invitation</h2>
        <p>Hello,</p>
        <p>You have been invited by ${inviterName} to join as an admin on our Coaching Platform.</p>
        <p>Your invite code is: <strong style="font-size: 18px; color: #007bff;">${inviteCode}</strong></p>
        <p>Please use this code during registration to create your admin account.</p>
        <p><strong>Note:</strong> This invite code will expire in ${process.env.INVITE_CODE_EXPIRY_DAYS || 7} days and can only be used once.</p>
        <p>Best regards,<br>Coaching Platform Team</p>
      </div>
    `
  }),
  
  // Course enrollment confirmation
  courseEnrollment: (studentName, courseName, paymentMethod) => ({
    subject: 'Course Enrollment Confirmation',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Course Enrollment Confirmed!</h2>
        <p>Hello ${studentName},</p>
        <p>Congratulations! You have successfully enrolled in:</p>
        <h3 style="color: #007bff;">${courseName}</h3>
        <p>Payment Method: ${paymentMethod === 'online' ? 'Online Payment' : 'Offline Payment'}</p>
        <p>You can now access all course materials, participate in discussions, and take tests.</p>
        <p>Happy learning!</p>
        <p>Best regards,<br>Coaching Platform Team</p>
      </div>
    `
  }),
  
  // Payment approval notification
  paymentApproved: (studentName, courseName, amount) => ({
    subject: 'Payment Approved - Course Access Granted',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Payment Approved!</h2>
        <p>Hello ${studentName},</p>
        <p>Your offline payment of ₹${amount} for the course "${courseName}" has been approved.</p>
        <p>You now have full access to the course materials and can start learning immediately.</p>
        <p>Thank you for your patience!</p>
        <p>Best regards,<br>Coaching Platform Team</p>
      </div>
    `
  }),
  
  // Payment rejection notification
  paymentRejected: (studentName, courseName, reason) => ({
    subject: 'Payment Rejected - Action Required',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Payment Rejected</h2>
        <p>Hello ${studentName},</p>
        <p>Unfortunately, your offline payment for the course "${courseName}" has been rejected.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>Please contact our support team or try making the payment again with correct details.</p>
        <p>Best regards,<br>Coaching Platform Team</p>
      </div>
    `
  })
};

// Send specific email templates
const sendPasswordResetEmail = async (email, resetUrl, name) => {
  const template = emailTemplates.passwordReset(resetUrl, name);
  return await sendEmail({
    email,
    ...template
  });
};

const sendWelcomeEmail = async (email, name) => {
  const template = emailTemplates.welcome(name);
  return await sendEmail({
    email,
    ...template
  });
};

const sendAdminInviteEmail = async (email, inviteCode, inviterName) => {
  const template = emailTemplates.adminInvite(inviteCode, inviterName);
  return await sendEmail({
    email,
    ...template
  });
};

const sendCourseEnrollmentEmail = async (email, studentName, courseName, paymentMethod) => {
  const template = emailTemplates.courseEnrollment(studentName, courseName, paymentMethod);
  return await sendEmail({
    email,
    ...template
  });
};

const sendPaymentApprovedEmail = async (email, studentName, courseName, amount) => {
  const template = emailTemplates.paymentApproved(studentName, courseName, amount);
  return await sendEmail({
    email,
    ...template
  });
};

const sendPaymentRejectedEmail = async (email, studentName, courseName, reason) => {
  const template = emailTemplates.paymentRejected(studentName, courseName, reason);
  return await sendEmail({
    email,
    ...template
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendAdminInviteEmail,
  sendCourseEnrollmentEmail,
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail
};