const jwt = require('jsonwebtoken');

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production' && !secret) {
        throw new Error('JWT_SECRET must be set in production');
    }
    return secret || 'dev-secret';
}

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>

    try {
        const secret = getJwtSecret();
        const decoded = jwt.verify(token, secret);
        req.user = decoded; // { userId, email, role, approvalStatus }
        next();
    } catch (error) {
        if (error.message && error.message.includes('JWT_SECRET')) {
            console.error('Auth configuration error:', error.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};
