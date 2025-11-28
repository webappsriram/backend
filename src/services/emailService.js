import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

/**
 * Generate a secure random token for password reset/setup
 * @returns {string} - Secure random token
 */
export const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Create email transporter
 */
const createTransporter = () => {
  // If SMTP is not configured, return null (will use console logging)
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // For Gmail and other services that require OAuth2
    ...(process.env.SMTP_SERVICE && {
      service: process.env.SMTP_SERVICE,
    }),
  });
};

/**
 * Send password setup email
 * @param {string} email - User email
 * @param {string} token - Setup token
 * @param {string} userName - User name
 */
export const sendPasswordSetupEmail = async (email, token, userName) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const setupLink = `${frontendUrl}/set-password?token=${token}`;
  const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@example.com';
  const appName = process.env.APP_NAME || 'Application';

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Set Your Password</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to ${appName}</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hello ${userName},</p>
        <p style="font-size: 14px; margin-bottom: 20px;">
          You have been added to the system. Please set your password by clicking the button below:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${setupLink}" 
             style="display: inline-block; background: #4A90E2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Set Your Password
          </a>
        </div>
        <p style="font-size: 12px; color: #666; margin-top: 30px; margin-bottom: 10px;">
          Or copy and paste this link into your browser:
        </p>
        <p style="font-size: 12px; color: #4A90E2; word-break: break-all; margin: 0;">
          ${setupLink}
        </p>
        <p style="font-size: 12px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
          <strong>Important:</strong> This link will expire in 24 hours. If you didn't request this, please ignore this email.
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
        <p>This is an automated email, please do not reply.</p>
      </div>
    </body>
    </html>
  `;

  const emailText = `
Hello ${userName},

You have been added to the system. Please set your password by clicking the link below:

${setupLink}

This link will expire in 24 hours.

If you didn't request this, please ignore this email.

This is an automated email, please do not reply.
  `;

  const transporter = createTransporter();

  if (transporter) {
    try {
      // Send email via SMTP
      await transporter.sendMail({
        from: `"${appName}" <${emailFrom}>`,
        to: email,
        subject: 'Set Your Password',
        text: emailText,
        html: emailHtml,
      });

      console.log(`✅ Password setup email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email via SMTP:', error);
      // Fall through to console logging
    }
  }

  // Fallback: Log to console if SMTP is not configured or sending failed
  console.log('='.repeat(80));
  console.log('📧 PASSWORD SETUP EMAIL (Development Mode - SMTP not configured)');
  console.log('='.repeat(80));
  console.log(`To: ${email}`);
  console.log(`Subject: Set Your Password`);
  console.log(`\nHello ${userName},\n`);
  console.log('You have been added to the system. Please set your password by clicking the link below:');
  console.log(`\n${setupLink}\n`);
  console.log('This link will expire in 24 hours.');
  console.log('='.repeat(80));
  console.log('\n💡 To enable email sending, configure SMTP settings in your .env file\n');
  
  return true;
};

/**
 * Send password reset email (for forgot password)
 * @param {string} email - User email
 * @param {string} token - Reset token
 * @param {string} userName - User name
 */
export const sendPasswordResetEmail = async (email, token, userName) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;
  const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@example.com';
  const appName = process.env.APP_NAME || 'Application';

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">${appName}</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hello ${userName},</p>
        <p style="font-size: 14px; margin-bottom: 20px;">
          We received a request to reset your password. Click the button below to reset it:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" 
             style="display: inline-block; background: #4A90E2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Reset Your Password
          </a>
        </div>
        <p style="font-size: 12px; color: #666; margin-top: 30px; margin-bottom: 10px;">
          Or copy and paste this link into your browser:
        </p>
        <p style="font-size: 12px; color: #4A90E2; word-break: break-all; margin: 0;">
          ${resetLink}
        </p>
        <p style="font-size: 12px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
          <strong>Important:</strong> This link will expire in 24 hours. If you didn't request this, please ignore this email and your password will remain unchanged.
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
        <p>This is an automated email, please do not reply.</p>
      </div>
    </body>
    </html>
  `;

  const emailText = `
Hello ${userName},

We received a request to reset your password. Click the link below to reset it:

${resetLink}

This link will expire in 24 hours.

If you didn't request this, please ignore this email and your password will remain unchanged.

This is an automated email, please do not reply.
  `;

  const transporter = createTransporter();

  if (transporter) {
    try {
      // Send email via SMTP
      await transporter.sendMail({
        from: `"${appName}" <${emailFrom}>`,
        to: email,
        subject: 'Reset Your Password',
        text: emailText,
        html: emailHtml,
      });

      console.log(`✅ Password reset email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email via SMTP:', error);
      // Fall through to console logging
    }
  }

  // Fallback: Log to console if SMTP is not configured or sending failed
  console.log('='.repeat(80));
  console.log('📧 PASSWORD RESET EMAIL (Development Mode - SMTP not configured)');
  console.log('='.repeat(80));
  console.log(`To: ${email}`);
  console.log(`Subject: Reset Your Password`);
  console.log(`\nHello ${userName},\n`);
  console.log('We received a request to reset your password. Click the link below to reset it:');
  console.log(`\n${resetLink}\n`);
  console.log('This link will expire in 24 hours.');
  console.log('='.repeat(80));
  console.log('\n💡 To enable email sending, configure SMTP settings in your .env file\n');
  
  return true;
};

export default {
  generateToken,
  sendPasswordSetupEmail,
  sendPasswordResetEmail
};

