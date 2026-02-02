const { dynamoDb } = require('../src/config/db');

const USERS_TABLE = 'GST_USERS';

async function makeAdmin(email) {
    console.log(`Promoting ${email} to ADMIN...`);

    // 1. Find User
    const findParams = {
        TableName: USERS_TABLE,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email }
    };

    const result = await dynamoDb.query(findParams).promise();
    if (!result.Items || result.Items.length === 0) {
        console.error('User not found');
        return;
    }

    const userId = result.Items[0].userId;

    // 2. Update Role
    const updateParams = {
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: 'set #role = :admin',
        ExpressionAttributeNames: { '#role': 'role' },
        ExpressionAttributeValues: { ':admin': 'ADMIN' }
    };

    await dynamoDb.update(updateParams).promise();
    console.log('✅ User promoted to ADMIN successfully!');
}

const email = process.argv[2];
if (!email) {
    console.error('Usage: node make_admin.js <email>');
    process.exit(1);
}

makeAdmin(email);
