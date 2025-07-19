import express from 'express';
import { body, validationResult } from 'express-validator';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get user orders
router.get('/my-orders', authenticate, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate('items.product')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single order
router.get('/:id', authenticate, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product')
      .populate('user', 'name email');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user owns this order or is admin
    if (order.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create order
router.post('/', authenticate, [
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.product').isMongoId().withMessage('Valid product ID required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('shippingAddress.street').trim().isLength({ min: 5 }).withMessage('Street address required'),
  body('shippingAddress.city').trim().isLength({ min: 2 }).withMessage('City required'),
  body('shippingAddress.state').trim().isLength({ min: 2 }).withMessage('State required'),
  body('shippingAddress.zipCode').trim().isLength({ min: 5 }).withMessage('ZIP code required'),
  body('shippingAddress.country').trim().isLength({ min: 2 }).withMessage('Country required')
], async (req, res) => {
  try {
    console.log('Creating order for user:', req.user._id);
    console.log('Order data:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { items, shippingAddress } = req.body;

    // Validate products and calculate total
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      console.log('Processing item:', item);
      const product = await Product.findById(item.product);
      if (!product) {
        console.log('Product not found:', item.product);
        return res.status(400).json({ message: `Product not found: ${item.product}` });
      }

      if (product.stock < item.quantity) {
        console.log('Insufficient stock for product:', product.name, 'Available:', product.stock, 'Requested:', item.quantity);
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        price: product.price
      });

      totalAmount += product.price * item.quantity;
    }

    console.log('Order items:', orderItems);
    console.log('Total amount:', totalAmount);

    const order = new Order({
      user: req.user._id,
      items: orderItems,
      totalAmount,
      shippingAddress
    });

    await order.save();
    await order.populate('items.product');

    console.log('Order created successfully:', order._id);
    res.status(201).json(order);
  } catch (error) {
    console.error('Create order error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update order status (admin only)
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.status = status;
    if (status === 'delivered') {
      order.deliveredAt = new Date();
    }

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;