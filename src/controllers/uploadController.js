const parser = require('lambda-multipart-parser');
const s3Service = require('../services/s3Service');

const uploadController = {
    async uploadImage(req, res) {
        try {
            // We need the raw Lambda event to use lambda-multipart-parser
            // serverless-http attaches the event to the request object
            const event = req.apiGateway ? req.apiGateway.event : null;

            if (!event) {
                // Fallback for local testing if not using serverless-offline with full event simulation
                return res.status(400).json({ error: 'Multipart parsing failed: Lambda event not found' });
            }

            const result = await parser.parse(event);
            const files = result.files;

            if (!files || files.length === 0) {
                return res.status(400).json({ error: 'No image file provided' });
            }

            const file = files[0]; // Take the first image

            // Basic validation
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowedTypes.includes(file.contentType)) {
                return res.status(400).json({ error: 'Only JPG, PNG and WEBP images are allowed' });
            }

            const uploadResult = await s3Service.uploadFile(file.content, file.filename, file.contentType);

            res.status(201).json({
                message: 'Image uploaded successfully',
                url: uploadResult.publicUrl,
                fileName: uploadResult.fileName
            });
        } catch (error) {
            console.error('Upload Controller Error:', error);
            res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    }
};

module.exports = uploadController;
