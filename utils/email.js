import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export const sendVerificationEmail = async (email, token) => {
  try {
    const verificationUrl = `https://ecommercebackend-2-f367.onrender.com/api/auth/verify/${token}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Email Verification - E-Commerce Store',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">Email Verification</h2>
          <p>Thank you for registering with our e-commerce store!</p>
          <p>Please click the button below to verify your email address:</p>
          <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3B82F6; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">Verify Email</a>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p><a href="${verificationUrl}">${verificationUrl}</a></p>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't create an account, please ignore this email.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Verification email sent successfully');
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
};

export const sendPaymentNotification = async (order, user) => {
  try {
    const itemsList = order.items.map(item => 
      `<li>${item.product.name} - Quantity: ${item.quantity} - Price: ₹${item.price}</li>`
    ).join('');

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Send to admin
      subject: `New Payment Received - Order #${order._id}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10B981;">Payment Received Notification</h2>
          <p>A new payment has been received for the following order:</p>
          
          <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #374151;">Order Details</h3>
            <p><strong>Order ID:</strong> ${order._id}</p>
            <p><strong>Payment ID:</strong> ${order.paymentId}</p>
            <p><strong>Total Amount:</strong> ₹${order.totalAmount}</p>
            <p><strong>Status:</strong> ${order.status}</p>
            <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
          </div>

          <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #374151;">Customer Details</h3>
            <p><strong>Name:</strong> ${user.name}</p>
            <p><strong>Email:</strong> ${user.email}</p>
          </div>

          <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #374151;">Items Purchased</h3>
            <ul>
              ${itemsList}
            </ul>
          </div>

          <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #374151;">Shipping Address</h3>
            <p>${order.shippingAddress.street}</p>
            <p>${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.zipCode}</p>
            <p>${order.shippingAddress.country}</p>
          </div>

          <p style="color: #6B7280; margin-top: 30px;">
            This is an automated notification from your e-commerce store.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Payment notification sent to admin');
  } catch (error) {
    console.error('Error sending payment notification:', error);
    throw error;
  }
};
