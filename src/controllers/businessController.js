const Business = require('../models/businessModel');
const { z } = require('zod');

// Validation Schemas
const businessSchema = z.object({
    firmName: z.string().min(2, "Firm Name is required"),
    gstNumber: z.string().optional(),
    pan: z.string().optional(),
    mobile: z.string().regex(/^\d{10}$/, "Mobile must be a 10-digit number"),
    email: z.string().email("Invalid email format").optional(),
    address: z.object({
        street: z.string().optional(),
        city: z.string().min(1, "City is required"),
        state: z.string().min(1, "State is required"),
        pincode: z.string().optional()
    }),
    dispatchAddress: z.object({
        street: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        pincode: z.string().optional()
    }).optional(),
    companyLogoUrl: z.string().url("Invalid URL format").optional(),
    customFields: z.record(z.any()).optional(),

    // Master Settings (Optional)
    bankAccounts: z.array(z.object({
        id: z.string().min(1, "Bank account ID is required"),
        accountName: z.string().min(1, "Account name is required").max(100),
        bankName: z.string().min(1, "Bank name is required").max(100),
        accountNumber: z.string().min(1, "Account number is required").max(50),
        ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code format"),
        branch: z.string().max(100).optional().nullable(),
        upiId: z.string().max(100).optional().nullable(),
        isDefault: z.boolean().default(false)
    })).optional(),

    transporters: z.array(z.object({
        id: z.string().min(1, "Internal ID is required"),
        transporterId: z.string().min(1, "Transporter ID is required").max(50),
        name: z.string().min(1, "Transporter name is required").max(100),
        isDefault: z.boolean().default(false)
    })).optional(),

    termsTemplates: z.array(z.object({
        id: z.string().min(1, "Template ID is required"),
        name: z.string().min(1, "Template name is required").max(100),
        terms: z.array(z.string().max(500)).min(1, "At least one term is required"),
        isDefault: z.boolean().default(false)
    })).optional(),

    defaultSignatureUrl: z.string().url("Invalid signature URL").optional().nullable().or(z.literal('')),
    defaultStampUrl: z.string().url("Invalid stamp URL").optional().nullable().or(z.literal(''))
});

const businessController = {
    async createBusiness(req, res) {
        try {
            const userId = req.user.userId; // From Auth Middleware

            const validation = businessSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({ error: validation.error.errors[0].message });
            }

            const business = await Business.create(userId, validation.data);
            res.status(201).json({ message: 'Business Profile Created', business });
        } catch (error) {
            console.error('Create Business Error:', error);
            res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    async getMyBusinesses(req, res) {
        try {
            const userId = req.user.userId;
            const businesses = await Business.getByUserId(userId);
            res.json(businesses);
        } catch (error) {
            console.error('Get Businesses Error:', error);
            res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    async updateBusiness(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;
            const updateData = req.body;

            if (!businessId) {
                return res.status(400).json({ error: 'Business ID is required' });
            }

            // Validate update data using partial schema
            const updateSchema = businessSchema.partial();
            const validation = updateSchema.safeParse(updateData);
            if (!validation.success) {
                return res.status(400).json({
                    error: validation.error.errors[0].message,
                    details: validation.error.errors
                });
            }

            const updatedBusiness = await Business.update(userId, businessId, validation.data);
            res.json({ message: 'Business Updated', business: updatedBusiness });
        } catch (error) {
            console.error('Update Business Error:', error);
            res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    }
};

module.exports = businessController;
