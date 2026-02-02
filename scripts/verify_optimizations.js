const { User } = require('./src/models/userModel');
const { Business } = require('./src/models/businessModel');

async function testGSI() {
    console.log("Testing GSI Query for Pending Users...");
    try {
        const users = await User.listPending('PENDING');
        console.log(`Found ${users.length} pending users using GSI.`);
    } catch (e) {
        console.error("GSI Query Failed:", e);
    }
}

// Note: This requires local DynamoDB or mocking to run.
// For the purpose of this task, I will primarily verify via code inspection 
// and providing a walkthrough to the user.
