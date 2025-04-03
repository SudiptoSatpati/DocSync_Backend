// src/utils/email.ts
import nodemailer from 'nodemailer';

interface EmailOptions {
  email: string;
  subject: string;
  text?: string;
  html?: string;
}

// Custom error class for email errors
export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailError';
  }
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST as string,
      port: parseInt(process.env.EMAIL_PORT as string),
      auth: {
        user: process.env.EMAIL_USERNAME as string,
        pass: process.env.EMAIL_PASSWORD as string
      }
    });

    // Email options
    const mailOptions = {
      from: process.env.EMAIL_FROM as string,
      to: options.email,
      subject: options.subject,
      text: options.text,
      html: options.html
    };

    // Send the email
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Email sending error:', error);
    throw new EmailError('Failed to send email');
  }
};

// src/types/environment.d.ts
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      PORT: string;
      MONGODB_URI: string;
      JWT_SECRET: string;
      JWT_EXPIRES_IN: string;
      EMAIL_HOST: string;
      EMAIL_PORT: string;
      EMAIL_USERNAME: string;
      EMAIL_PASSWORD: string;
      EMAIL_FROM: string;
      FRONTEND_URL: string;
    }
  }
}

export {};