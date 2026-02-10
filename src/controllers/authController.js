const User = require('../models/userModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// In-memory OTP store for forgot password (dummy OTP; no real SMS/email service)
// Key: email (lowercase), Value: { otp, expiresAt }
const otpStore = new Map();
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function generateDummyOtp() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

// Validation Schemas
const registerSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters")
});

const loginSchema = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required")
});

const updateProfileSchema = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email("Invalid email format").optional()
}).refine((data) => data.name !== undefined || data.email !== undefined, {
    message: 'At least one of name or email is required for update'
});

const resetPasswordSchema = z.object({
    email: z.string().email("Invalid email format"),
    otp: z.string().length(4, "OTP must be 4 digits"),
    newPassword: z.string().min(6, "Password must be at least 6 characters")
});

module.exports = {
    // POST /auth/register
    async register(req, res) {
        try {
            const validation = registerSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({ error: validation.error.errors[0].message });
            }

            const { name, email, password } = validation.data;

            // Check if user exists
            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                return res.status(409).json({ error: 'User with this email already exists' });
            }

            // Create User
            const newUser = await User.create({ name, email, password });

            res.status(201).json({
                message: 'User registered successfully.',
                userId: newUser.userId
            });
        } catch (error) {
            console.error('Register Error:', error);
            res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    // POST /auth/login
    async login(req, res) {
        try {
            const validation = loginSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({ error: validation.error.errors[0].message });
            }

            const { email, password } = validation.data;

            const user = await User.findByEmail(email);
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Verify Password
            const isValid = await bcrypt.compare(password, user.passwordHash);
            if (!isValid) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }


            const token = jwt.sign(
                {
                    userId: user.userId,
                    email: user.email,
                    role: user.role
                },
                JWT_SECRET,
                { expiresIn: '1d' }
            );

            res.json({
                message: 'Login successful',
                token,
                user: {
                    userId: user.userId,
                    name: user.name,
                    email: user.email,
                    role: user.role || 'USER'
                }
            });
        } catch (error) {
            console.error('Login Error:', error);
            res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    // GET /user/profile – view profile (authenticated user)
    async getProfile(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.json({
                userId: user.userId,
                name: user.name,
                email: user.email,
                role: user.role || 'USER',
                trialStartDate: user.trialStartDate,
                trialEndDate: user.trialEndDate,
                createdAt: user.createdAt
            });
        } catch (error) {
            console.error('Get Profile Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    // PUT /user/profile – update profile (name, email)
    async updateProfile(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const validation = updateProfileSchema.safeParse(req.body || {});
            if (!validation.success) {
                return res.status(400).json({ error: validation.error.errors[0].message });
            }
            const { name, email } = validation.data;

            if (email !== undefined) {
                const existing = await User.findByEmail(email);
                if (existing && existing.userId !== userId) {
                    return res.status(409).json({ error: 'Email already in use by another account' });
                }
            }

            const updated = await User.updateProfile(userId, { name, email });
            return res.json({
                message: 'Profile updated successfully',
                user: {
                    userId: updated.userId,
                    name: updated.name,
                    email: updated.email,
                    role: updated.role || 'USER'
                }
            });
        } catch (error) {
            console.error('Update Profile Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    // POST /auth/forgot-password – request OTP (dummy 4-digit OTP; for testing OTP is returned)
    async forgotPassword(req, res) {
        try {
            const email = (req.body?.email || '').trim().toLowerCase();
            if (!email) {
                return res.status(400).json({ error: 'Email is required' });
            }
            const user = await User.findByEmail(email);
            if (!user) {
                // Do not reveal whether email exists; return same success message
                return res.json({ message: 'If this email is registered, an OTP has been sent.' });
            }

            const otp = generateDummyOtp();
            otpStore.set(email, { otp, expiresAt: Date.now() + OTP_EXPIRY_MS });

            // For development: return OTP so client can verify without real SMS/email
            return res.json({
                message: 'If this email is registered, an OTP has been sent.',
                otpForTesting: otp
            });
        } catch (error) {
            console.error('Forgot Password Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    // POST /auth/reset-password – verify OTP and set new password
    async resetPassword(req, res) {
        try {
            const validation = resetPasswordSchema.safeParse(req.body || {});
            if (!validation.success) {
                return res.status(400).json({ error: validation.error.errors[0].message });
            }
            const { email: rawEmail, otp, newPassword } = validation.data;
            const email = rawEmail.trim().toLowerCase();

            const stored = otpStore.get(email);
            if (!stored) {
                return res.status(400).json({ error: 'Invalid or expired OTP. Please request a new one.' });
            }
            if (Date.now() > stored.expiresAt) {
                otpStore.delete(email);
                return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
            }
            if (stored.otp !== otp) {
                return res.status(400).json({ error: 'Invalid OTP.' });
            }

            const user = await User.findByEmail(email);
            if (!user) {
                return res.status(400).json({ error: 'Invalid or expired OTP. Please request a new one.' });
            }

            const passwordHash = await bcrypt.hash(newPassword, 10);
            await User.updatePassword(user.userId, passwordHash);
            otpStore.delete(email);

            return res.json({ message: 'Password updated successfully.' });
        } catch (error) {
            console.error('Reset Password Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    }
};
