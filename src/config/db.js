const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const isOffline = process.env.IS_OFFLINE;

let clientConfig = {};

// Only use Localhost DynamoDB if explicitly requested
if (process.env.USE_LOCAL_DB === 'true') {
    clientConfig = {
        region: 'localhost',
        endpoint: 'http://localhost:8000',
        credentials: {
            accessKeyId: 'DEFAULT',
            secretAccessKey: 'DEFAULT'
        }
    };
}

const client = new DynamoDBClient(clientConfig);
const dynamoDbClient = DynamoDBDocumentClient.from(client);

module.exports = {
    dynamoDb: dynamoDbClient
};
