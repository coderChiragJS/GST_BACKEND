const User = require('../models/userModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'dev-admin-secret';

// Validation Schemas
const adminRegisterSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters")
});

const adminLoginSchema = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required")
});

module.exports = {
    // POST /admin/auth/register
    async registerAdmin(req, res) {
        try {
            const validation = adminRegisterSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({ error: validation.error.errors[0].message });
            }

            const { name, email, password } = validation.data;

            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                return res.status(409).json({ error: 'User with this email already exists' });
            }

            const newUser = await User.create({ name, email, password }, { role: 'ADMIN', approvalStatus: 'APPROVED' });

            res.status(201).json({
                message: 'Admin user registered successfully.',
                userId: newUser.userId
            });
        } catch (error) {
            console.error('Admin Register Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // POST /admin/auth/login
    async loginAdmin(req, res) {
        try {
            const validation = adminLoginSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({ error: validation.error.errors[0].message });
            }

            const { email, password } = validation.data;

            const user = await User.findByEmail(email);
            if (!user || user.role !== 'ADMIN') {
                return res.status(401).json({ error: 'Invalid credentials or not an admin' });
            }

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
                message: 'Admin login successful',
                token,
                user: {
                    userId: user.userId,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });
        } catch (error) {
            console.error('Admin Login Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
};
