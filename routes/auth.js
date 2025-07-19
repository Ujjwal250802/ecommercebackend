import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { sendVerificationEmail } from '../utils/email.js';
import passport from 'passport';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Register
router.post('/register', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    const user = new User({
      name,
      email,
      password,
      verificationToken
    });

    await user.save();
    await sendVerificationEmail(user.email, verificationToken);

    res.status(201).json({ 
      message: 'User registered successfully. Please check your email to verify your account.' 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify email
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ message: 'Invalid verification token' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').exists().withMessage('Password required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(400).json({ message: 'Please verify your email first' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin login
router.post('/admin/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').exists().withMessage('Password required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Check if it's the super admin
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      let adminUser = await User.findOne({ email });
      
      if (!adminUser) {
        adminUser = new User({
          name: 'Super Admin',
          email: process.env.ADMIN_EMAIL,
          password: process.env.ADMIN_PASSWORD,
          isAdmin: true,
          isVerified: true
        });
        await adminUser.save();
      } else {
        if (!adminUser.isAdmin) {
          adminUser.isAdmin = true;
          await adminUser.save();
        }
      }

      const token = jwt.sign(
        { userId: adminUser._id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        token,
        user: {
          id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          isAdmin: adminUser.isAdmin,
          avatar: adminUser.avatar
        }
      });
    }

    const user = await User.findOne({ email });
    if (!user || !user.isAdmin) {
      return res.status(400).json({ message: 'Invalid admin credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid admin credentials' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Google OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', 
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    try {
      const token = jwt.sign(
        { userId: req.user._id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`);
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect(`https://ecommercefrontend-ycuh.vercel.app/login?error=auth_failed`);
    }
  }
);

export default router;
