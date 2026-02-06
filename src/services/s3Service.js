const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require('uuid');

const s3Client = new S3Client({ region: process.env.REGION });

const s3Service = {
    async uploadFile(fileBuffer, originalName, contentType) {
        const fileExtension = originalName.split('.').pop();
        const fileName = `${uuidv4()}.${fileExtension}`;
        const bucketName = process.env.UPLOADS_BUCKET;

        const params = {
            Bucket: bucketName,
            Key: fileName,
            Body: fileBuffer,
            ContentType: contentType,
            ACL: 'public-read' // Assumes bucket allows ACLs, or we rely on bucket policy
        };

        try {
            await s3Client.send(new PutObjectCommand(params));

            // Construct the public URL
            // Format: https://bucket-name.s3.region.amazonaws.com/file-name
            const publicUrl = `https://${bucketName}.s3.${process.env.REGION}.amazonaws.com/${fileName}`;

            return {
                fileName,
                publicUrl
            };
        } catch (error) {
            console.error('S3 Upload Error:', error);
            throw new Error('Failed to upload file to S3');
        }
    }
};

module.exports = s3Service;
