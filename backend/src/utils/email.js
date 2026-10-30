const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('./logger');
const esc = require('./escapeHtml');

let transporter = null;
let emailEnabled = false;

// Initialize transporter only if SMTP config is present
if (config.smtp.host && config.smtp.port && config.smtp.user && config.smtp.pass) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
  emailEnabled = true;
  logger.info('Email service initialized');
} else {
  logger.info('Email service disabled (SMTP env vars missing)');
}

/**
 * Send an email (non-blocking, never throws).
 * @param {object} options
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.html
 */
async function sendMail({ to, subject, html }) {
  if (!emailEnabled) {
    logger.debug(`Email not sent (disabled): ${subject} → ${to}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: config.smtp.from || config.smtp.user,
      to,
      subject,
      html,
    });
    logger.info(`Email sent: ${subject} → ${to}`);
  } catch (err) {
    logger.error(`Email send failed: ${err.message}`);
  }
}

/**
 * Send order confirmation email to the customer.
 * @param {object} order - The order document
 * @param {string} email - Customer email
 */
async function sendOrderConfirmation(order, email) {
  const itemsHtml = order.items
    .map(
      (item) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee">${esc(item.model ? `${item.model} — ${item.name}` : item.name)}</td>
         <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
         <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₹${item.price.toLocaleString('en-IN')}</td></tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#1a365d;border-bottom:2px solid #e2e8f0;padding-bottom:10px">
        Order Confirmed — ${order.orderNumber}
      </h2>
      <p>Hello ${esc(order.shippingAddress.fullName)},</p>
      <p>Thank you for your order! Here's a summary:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead><tr style="background:#f7fafc">
          <th style="padding:8px;text-align:left">Item</th>
          <th style="padding:8px;text-align:center">Qty</th>
          <th style="padding:8px;text-align:right">Price</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div style="margin-top:16px;padding:12px;background:#f7fafc;border-radius:6px">
        <p style="margin:4px 0"><strong>Items Total:</strong> ₹${order.itemsTotal.toLocaleString('en-IN')}</p>
        ${order.discount > 0 ? `<p style="margin:4px 0;color:#38a169"><strong>Discount:</strong> -₹${order.discount.toLocaleString('en-IN')}</p>` : ''}
        ${order.taxAmount > 0 ? `<p style="margin:4px 0"><strong>GST (${order.gstPercent}%):</strong> ₹${order.taxAmount.toLocaleString('en-IN')}</p>` : ''}
        <p style="margin:4px 0"><strong>Delivery:</strong> ${order.deliveryCharge === 0 ? 'FREE' : `₹${order.deliveryCharge.toLocaleString('en-IN')}`}</p>
        <p style="margin:4px 0;font-size:18px"><strong>Total: ₹${order.totalAmount.toLocaleString('en-IN')}</strong></p>
      </div>
      <p style="margin-top:16px;color:#718096;font-size:14px">Payment: ${order.paymentMethod.toUpperCase()}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
      <p style="color:#a0aec0;font-size:12px">Sahajanand Electronics and Refrigeration LLP</p>
    </div>
  `;

  await sendMail({
    to: email,
    subject: `Order Confirmed — ${order.orderNumber}`,
    html,
  });
}

/**
 * Send order status update email to the customer.
 * @param {object} order
 * @param {string} email
 * @param {string} newStatus
 */
async function sendOrderStatusUpdate(order, email, newStatus) {
  const statusMessages = {
    confirmed: 'Your order has been confirmed and is being prepared.',
    shipped: `Your order has been shipped.${order.trackingId ? ` Tracking ID: ${esc(order.trackingId)}` : ''}${order.courierName ? ` (${esc(order.courierName)})` : ''}`,
    delivered: 'Your order has been delivered. Thank you for shopping with us!',
    cancelled: `Your order has been cancelled.${order.cancelReason ? ` Reason: ${esc(order.cancelReason)}` : ''}`,
  };

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#1a365d">Order Update — ${order.orderNumber}</h2>
      <p>Hello ${esc(order.shippingAddress.fullName)},</p>
      <p>${statusMessages[newStatus] || `Your order status is now: ${newStatus}`}</p>
      <p style="margin-top:16px;color:#718096">Order Total: ₹${order.totalAmount.toLocaleString('en-IN')}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
      <p style="color:#a0aec0;font-size:12px">Sahajanand Electronics and Refrigeration LLP</p>
    </div>
  `;

  await sendMail({
    to: email,
    subject: `Order ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)} — ${order.orderNumber}`,
    html,
  });
}

/**
 * Send an alert email to admin.
 * @param {string} subject
 * @param {string} message
 */
async function sendAdminAlert(subject, message) {
  const recipients = config.smtp.adminAlert
    ? [config.smtp.adminAlert]
    : [...new Set([...config.superAdminEmails, ...config.adminEmails])];
  for (const email of recipients) {
    await sendMail({
      to: email,
      subject: `[Admin Alert] ${subject}`,
      html: `<div style="font-family:Arial,sans-serif;padding:20px"><h3>${subject}</h3><p>${message}</p></div>`,
    });
  }
}

module.exports = {
  sendMail,
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendAdminAlert,
};
