const notionRepo = require('../repository/notionRepo');

async function test() {
    const personId = '98257844-8a8d-46ef-a2fd-4b7b91144ef4'; // Cassie's ID
    console.log(`Testing Balance for ID: ${personId}`);
    
    try {
        const balance = await notionRepo.getUserTimeBalanceByPersonId(personId);
        console.log('Result:', balance);
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
