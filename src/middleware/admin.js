module.exports = (req, res, next) => {
    // 1. Check if user exists (set by auth middleware)
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: User not logged in' });
    }

    // 2. Check Role
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access Denied: Admins only' });
    }

    // 3. Allow
    next();
};
