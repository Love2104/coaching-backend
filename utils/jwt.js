const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Verify JWT token
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

// Generate token and send response
const sendTokenResponse = (user, statusCode, res, message = 'Success') => {
  // Create token
  const token = generateToken({ id: user._id });
  
  // Remove password from output
  const userObj = user.toObject();
  delete userObj.password;
  
  res.status(statusCode).json({
    success: true,
    message,
    token,
    user: userObj
  });
};

module.exports = {
  generateToken,
  verifyToken,
  sendTokenResponse
};