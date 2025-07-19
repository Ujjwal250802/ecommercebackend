import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Product from '../models/Product.js';
import { authenticate } from '../middleware/auth.js';
import { sendPaymentNotification } from '../utils/email.js';

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_uO9KUIRRmFD0rp',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'ZsmuBYvapWYZ4IkpMRWCZWpo',
});

// Create Razorpay order
router.post('/create-order', authenticate, async (req, res) => {
  try {
    console.log('Creating Razorpay order for user:', req.user._id);
    const { orderId } = req.body;
    console.log('Order ID:', orderId);

    const order = await Order.findById(orderId).populate('items.product');
    if (!order) {
      console.log('Order not found:', orderId);
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.user.toString() !== req.user._id.toString()) {
      console.log('Access denied. Order user:', order.user.toString(), 'Request user:', req.user._id.toString());
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if order already has a payment
    if (order.paymentStatus === 'completed') {
      console.log('Order already paid:', orderId);
      return res.status(400).json({ message: 'Order already paid' });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('Razorpay credentials not configured');
      return res.status(500).json({ message: 'Payment system not configured' });
    }

    const options = {
      amount: order.totalAmount * 100, // amount in smallest currency unit
      currency: 'INR',
      receipt: `order_${orderId}`,
      notes: {
        orderId: orderId,
        userId: req.user._id.toString()
      }
    };

    console.log('Creating Razorpay order with options:', options);
    const razorpayOrder = await razorpay.orders.create(options);
    console.log('Razorpay order created:', razorpayOrder.id);
    
    res.json({
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Create Razorpay order error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify payment
router.post('/verify', authenticate, async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body;

    const order = await Order.findById(orderId).populate('items.product').populate('user');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify signature
    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    // Create payment record
    const payment = new Payment({
      orderId: order._id,
      userId: order.user._id,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      amount: order.totalAmount,
      status: 'completed'
    });

    await payment.save();

    // Update order
    order.paymentId = razorpayPaymentId;
    order.paymentStatus = 'completed';
    order.status = 'processing';
    await order.save();

    // Update product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.product._id,
        { $inc: { stock: -item.quantity } }
      );
    }

    // Send notification email to admin
    await sendPaymentNotification(order, order.user);

    res.json({ message: 'Payment verified successfully', order });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;