const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create order
const createOrder = async (amount, currency = 'INR', receipt = null) => {
  try {
    const options = {
      amount: amount * 100, // Razorpay expects amount in paise
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
      payment_capture: 1 // Auto capture payment
    };
    
    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    throw error;
  }
};

// Verify payment signature
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    return expectedSignature === signature;
  } catch (error) {
    console.error('Payment signature verification error:', error);
    return false;
  }
};

// Get payment details
const getPaymentDetails = async (paymentId) => {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    console.error('Error fetching payment details:', error);
    throw error;
  }
};

// Refund payment
const refundPayment = async (paymentId, amount = null, notes = {}) => {
  try {
    const refundData = {
      notes
    };
    
    if (amount) {
      refundData.amount = amount * 100; // Convert to paise
    }
    
    const refund = await razorpay.payments.refund(paymentId, refundData);
    return refund;
  } catch (error) {
    console.error('Razorpay refund error:', error);
    throw error;
  }
};

// Get refund details
const getRefundDetails = async (paymentId, refundId) => {
  try {
    const refund = await razorpay.payments.fetchRefund(paymentId, refundId);
    return refund;
  } catch (error) {
    console.error('Error fetching refund details:', error);
    throw error;
  }
};

// Create customer
const createCustomer = async (name, email, contact = null) => {
  try {
    const customerData = {
      name,
      email
    };
    
    if (contact) {
      customerData.contact = contact;
    }
    
    const customer = await razorpay.customers.create(customerData);
    return customer;
  } catch (error) {
    console.error('Razorpay customer creation error:', error);
    throw error;
  }
};

// Get order details
const getOrderDetails = async (orderId) => {
  try {
    const order = await razorpay.orders.fetch(orderId);
    return order;
  } catch (error) {
    console.error('Error fetching order details:', error);
    throw error;
  }
};

// Webhook signature verification
const verifyWebhookSignature = (body, signature, secret) => {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    
    return expectedSignature === signature;
  } catch (error) {
    console.error('Webhook signature verification error:', error);
    return false;
  }
};

// Generate payment link
const createPaymentLink = async (amount, description, customer, currency = 'INR') => {
  try {
    const options = {
      amount: amount * 100,
      currency,
      accept_partial: false,
      description,
      customer: {
        name: customer.name,
        email: customer.email,
        contact: customer.contact || ''
      },
      notify: {
        sms: true,
        email: true
      },
      reminder_enable: true,
      callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
      callback_method: 'get'
    };
    
    const paymentLink = await razorpay.paymentLink.create(options);
    return paymentLink;
  } catch (error) {
    console.error('Payment link creation error:', error);
    throw error;
  }
};

module.exports = {
  razorpay,
  createOrder,
  verifyPaymentSignature,
  getPaymentDetails,
  refundPayment,
  getRefundDetails,
  createCustomer,
  getOrderDetails,
  verifyWebhookSignature,
  createPaymentLink
};