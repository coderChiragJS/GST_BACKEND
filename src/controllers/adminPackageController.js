const Package = require('../models/packageModel');
const { z } = require('zod');

const createPackageSchema = z.object({
    name: z.string().min(1, 'Package name is required'),
    price: z.number().nonnegative(),
    invoiceLimit: z.number().int().nonnegative(),
    quotationLimit: z.number().int().nonnegative(),
    // validityDays is optional and deprecated - packages have no time-based validity
    // Subscriptions only expire when usage limits (invoices/quotations) are exhausted
    validityDays: z.number().int().nonnegative().nullable().optional(),
    isActive: z.boolean().optional().default(true)
});

const updatePackageSchema = z.object({
    name: z.string().min(1).optional(),
    price: z.number().nonnegative().optional(),
    invoiceLimit: z.number().int().nonnegative().optional(),
    quotationLimit: z.number().int().nonnegative().optional(),
    validityDays: z.number().int().nonnegative().nullable().optional(),
    isActive: z.boolean().optional()
});

module.exports = {
    async listPackages(req, res) {
        try {
            const packages = await Package.listAll();
            return res.json({ packages });
        } catch (error) {
            console.error('Admin List Packages Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    async getPackage(req, res) {
        try {
            const { packageId } = req.params;
            const pkg = await Package.getById(packageId);
            if (!pkg) {
                return res.status(404).json({ error: 'Package not found' });
            }
            return res.json({ package: pkg });
        } catch (error) {
            console.error('Admin Get Package Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    async createPackage(req, res) {
        try {
            const body = req.body || {};
            const parsed = createPackageSchema.safeParse({
                ...body,
                price: body.price != null ? Number(body.price) : 0,
                invoiceLimit: body.invoiceLimit != null ? Number(body.invoiceLimit) : 0,
                quotationLimit: body.quotationLimit != null ? Number(body.quotationLimit) : 0,
                validityDays: body.validityDays != null ? Number(body.validityDays) : null
            });

            if (!parsed.success) {
                return res.status(400).json({
                    code: 'VALIDATION_FAILED',
                    error: parsed.error.errors[0].message,
                    details: parsed.error.errors
                });
            }

            const pkg = await Package.create(parsed.data);
            return res.status(201).json({ package: pkg });
        } catch (error) {
            console.error('Admin Create Package Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    async updatePackage(req, res) {
        try {
            const { packageId } = req.params;
            const updateSchema = updatePackageSchema.safeParse(req.body || {});

            if (!updateSchema.success) {
                return res.status(400).json({
                    code: 'VALIDATION_FAILED',
                    error: updateSchema.error.errors[0].message,
                    details: updateSchema.error.errors
                });
            }

            const existing = await Package.getById(packageId);
            if (!existing) {
                return res.status(404).json({ error: 'Package not found' });
            }

            const data = updateSchema.data;
            if (data.price !== undefined) data.price = Number(data.price);
            if (data.invoiceLimit !== undefined) data.invoiceLimit = Number(data.invoiceLimit);
            if (data.quotationLimit !== undefined) data.quotationLimit = Number(data.quotationLimit);
            if (data.validityDays !== undefined) data.validityDays = data.validityDays == null ? null : Number(data.validityDays);

            const pkg = await Package.update(packageId, data);
            return res.json({ package: pkg });
        } catch (error) {
            console.error('Admin Update Package Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    async deletePackage(req, res) {
        try {
            const { packageId } = req.params;
            const existing = await Package.getById(packageId);
            if (!existing) {
                return res.status(404).json({ error: 'Package not found' });
            }
            await Package.delete(packageId);
            return res.json({ message: 'Package deleted successfully', packageId });
        } catch (error) {
            console.error('Admin Delete Package Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    }
};
