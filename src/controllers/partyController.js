const Party = require('../models/partyModel');
const { z } = require('zod');

// Validation Schemas (address allows optional gst/companyName for Flutter compatibility)
const addressSchema = z.object({
    street: z.string().min(1, "Street address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    pincode: z.string().min(6, "Pincode must be at least 6 digits").max(6, "Pincode must be at most 6 digits"),
    country: z.string().default('India'),
    gst: z.string().optional(),
    companyName: z.string().optional()
}).strict();

const basePartySchema = z.object({
    companyName: z.string().min(2, "Company name must be at least 2 characters"),
    gstNumber: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN format").optional(),
    mobile: z.string().regex(/^[6-9]\d{9}$/, "Invalid mobile number"),
    email: z.string().email("Invalid email format").optional(),
    billingAddress: addressSchema,
    sameAsBilling: z.boolean().default(false),
    shippingAddress: addressSchema.optional().nullable(),
    paymentTerms: z.number().int().min(0).default(0),
    openingBalance: z.number().default(0),
    openingBalanceType: z.enum(['TO_RECEIVE', 'TO_PAY']).default('TO_RECEIVE'),
    partyType: z.enum(['Individual', 'Company']).default('Individual'),
    gstTreatment: z.enum(['Regular', 'Composition', 'Unregistered']).default('Regular'),
    taxPreference: z.enum(['Inclusive', 'Exclusive']).default('Inclusive'),
    tdsApplicable: z.boolean().default(false),
    tcsApplicable: z.boolean().default(false)
});

const createPartySchema = basePartySchema.refine(data => {
    // If sameAsBilling is false, shippingAddress must be provided
    if (!data.sameAsBilling && !data.shippingAddress) {
        return false;
    }
    return true;
}, {
    message: 'Shipping address is required when not same as billing',
    path: ['shippingAddress']
});

const updatePartySchema = basePartySchema.partial();

const partyController = {
    // Create a new party
    async createParty(req, res) {
        try {
            const userId = req.user.userId;
            const validation = createPartySchema.safeParse(req.body);

            if (!validation.success) {
                const errors = validation.error.errors.map(e => ({
                    field: e.path.length ? e.path.join('.') : 'body',
                    message: e.message
                }));
                return res.status(400).json({
                    error: 'Validation failed',
                    code: 'VALIDATION_FAILED',
                    errors
                });
            }

            const partyData = {
                ...validation.data,
                sameAsBilling: validation.data.sameAsBilling || false
            };
            const party = await Party.create(userId, partyData);
            res.status(201).json({
                message: 'Party created successfully',
                data: party
            });

        } catch (error) {
            console.error('Create Party Error:', error);
            res.status(500).json({
                error: 'Failed to create party',
                details: error.message
            });
        }
    },

    // Get all parties for the authenticated user
    async listParties(req, res) {
        try {
            const userId = req.user.userId;
            const parties = await Party.listByUser(userId);

            res.json({
                data: parties,
                count: parties.length
            });

        } catch (error) {
            console.error('List Parties Error:', error);
            res.status(500).json({
                error: 'Failed to fetch parties',
                details: error.message
            });
        }
    },

    // Get party by ID
    async getParty(req, res) {
        try {
            const userId = req.user.userId;
            const { partyId } = req.params;

            const party = await Party.getById(userId, partyId);
            if (!party) {
                return res.status(404).json({ error: 'Party not found' });
            }

            res.json({ data: party });

        } catch (error) {
            console.error('Get Party Error:', error);
            res.status(500).json({
                error: 'Failed to fetch party',
                details: error.message
            });
        }
    },

    // Update party
    async updateParty(req, res) {
        try {
            const userId = req.user.userId;
            const { partyId } = req.params;

            const validation = updatePartySchema.safeParse(req.body);
            if (!validation.success) {
                const errors = validation.error.errors.map(e => ({
                    field: e.path.length ? e.path.join('.') : 'body',
                    message: e.message
                }));
                return res.status(400).json({
                    error: 'Validation failed',
                    code: 'VALIDATION_FAILED',
                    errors
                });
            }

            // Check if party exists
            const existingParty = await Party.getById(userId, partyId);
            if (!existingParty) {
                return res.status(404).json({ error: 'Party not found' });
            }

            const updateData = {
                ...validation.data,
                sameAsBilling: validation.data.sameAsBilling || false
            };
            const updatedParty = await Party.update(userId, partyId, updateData);
            res.json({
                message: 'Party updated successfully',
                data: updatedParty
            });

        } catch (error) {
            console.error('Update Party Error:', error);
            res.status(500).json({
                error: 'Failed to update party',
                details: error.message
            });
        }
    },

    // Delete party (soft delete)
    async deleteParty(req, res) {
        try {
            const userId = req.user.userId;
            const { partyId } = req.params;

            // Check if party exists
            const existingParty = await Party.getById(userId, partyId);
            if (!existingParty) {
                return res.status(404).json({ error: 'Party not found' });
            }

            await Party.delete(userId, partyId);
            res.json({ message: 'Party deleted successfully' });

        } catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                return res.status(404).json({ error: 'Party not found' });
            }
            console.error('Delete Party Error:', error);
            res.status(500).json({
                error: 'Failed to delete party',
                details: error.message
            });
        }
    }
};

module.exports = partyController;
