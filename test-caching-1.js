#!/usr/bin/env node

const ClaudeCodeAIProvider = require('./src/ai-providers/claude-code');

// Tracking variables
let detectCallCount = 0;
const originalDetectCommand = ClaudeCodeAIProvider.prototype.detectClaudeCommand;

// Override detectClaudeCommand to track calls
ClaudeCodeAIProvider.prototype.detectClaudeCommand = function() {
    detectCallCount++;
    console.log(`detectClaudeCommand called - count: ${detectCallCount}`);
    return originalDetectCommand.call(this);
};

async function testInstanceCaching() {
    console.log('\n=== Testing Instance-Level Caching ===');
    detectCallCount = 0;
    
    const instance = new ClaudeCodeAIProvider();
    
    console.log('\nFirst call to getClaudeCommand():');
    const start1 = Date.now();
    const result1 = await instance.getClaudeCommand();
    const time1 = Date.now() - start1;
    console.log(`Result: ${result1}`);
    console.log(`Time: ${time1}ms`);
    console.log(`Detection calls so far: ${detectCallCount}`);
    
    console.log('\nSecond call to getClaudeCommand() (should use cache):');
    const start2 = Date.now();
    const result2 = await instance.getClaudeCommand();
    const time2 = Date.now() - start2;
    console.log(`Result: ${result2}`);
    console.log(`Time: ${time2}ms`);
    console.log(`Detection calls so far: ${detectCallCount}`);
    
    console.log('\nThird call to getClaudeCommand() (should use cache):');
    const start3 = Date.now();
    const result3 = await instance.getClaudeCommand();
    const time3 = Date.now() - start3;
    console.log(`Result: ${result3}`);
    console.log(`Time: ${time3}ms`);
    console.log(`Detection calls so far: ${detectCallCount}`);
    
    console.log(`\nInstance caching summary:`);
    console.log(`- Total detection calls: ${detectCallCount}`);
    console.log(`- First call time: ${time1}ms`);
    console.log(`- Cached call times: ${time2}ms, ${time3}ms`);
    console.log(`- Speed improvement: ${Math.round((time1 - time2) / time1 * 100)}%`);
}

async function testCrossInstanceBehavior() {
    console.log('\n\n=== Testing Cross-Instance Behavior ===');
    detectCallCount = 0;
    
    console.log('\nCreating first instance:');
    const instance1 = new ClaudeCodeAIProvider();
    const start1 = Date.now();
    const result1 = await instance1.getClaudeCommand();
    const time1 = Date.now() - start1;
    console.log(`Instance 1 result: ${result1}`);
    console.log(`Instance 1 time: ${time1}ms`);
    console.log(`Detection calls: ${detectCallCount}`);
    
    console.log('\nCreating second instance:');
    const instance2 = new ClaudeCodeAIProvider();
    const start2 = Date.now();
    const result2 = await instance2.getClaudeCommand();
    const time2 = Date.now() - start2;
    console.log(`Instance 2 result: ${result2}`);
    console.log(`Instance 2 time: ${time2}ms`);
    console.log(`Detection calls: ${detectCallCount}`);
    
    console.log('\nCreating third instance:');
    const instance3 = new ClaudeCodeAIProvider();
    const start3 = Date.now();
    const result3 = await instance3.getClaudeCommand();
    const time3 = Date.now() - start3;
    console.log(`Instance 3 result: ${result3}`);
    console.log(`Instance 3 time: ${time3}ms`);
    console.log(`Detection calls: ${detectCallCount}`);
    
    console.log(`\nCross-instance summary:`);
    console.log(`- Total instances created: 3`);
    console.log(`- Total detection calls: ${detectCallCount}`);
    console.log(`- Each instance performs its own detection: ${detectCallCount === 3}`);
}

async function testRapidInstanceCreation() {
    console.log('\n\n=== Testing Rapid Instance Creation ===');
    detectCallCount = 0;
    const instances = 10;
    const times = [];
    
    console.log(`Creating ${instances} instances rapidly...`);
    const startTotal = Date.now();
    
    for (let i = 0; i < instances; i++) {
        const instance = new ClaudeCodeAIProvider();
        const start = Date.now();
        await instance.getClaudeCommand();
        times.push(Date.now() - start);
    }
    
    const totalTime = Date.now() - startTotal;
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    
    console.log(`\nRapid creation summary:`);
    console.log(`- Instances created: ${instances}`);
    console.log(`- Total detection calls: ${detectCallCount}`);
    console.log(`- Total time: ${totalTime}ms`);
    console.log(`- Average time per instance: ${avgTime.toFixed(2)}ms`);
    console.log(`- Times: ${times.map(t => t + 'ms').join(', ')}`);
}

async function testCachePersistence() {
    console.log('\n\n=== Testing Cache Persistence Within Instance ===');
    detectCallCount = 0;
    
    const instance = new ClaudeCodeAIProvider();
    const calls = 5;
    const times = [];
    
    console.log(`Making ${calls} consecutive calls on same instance...`);
    
    for (let i = 0; i < calls; i++) {
        const start = Date.now();
        const result = await instance.getClaudeCommand();
        const time = Date.now() - start;
        times.push(time);
        console.log(`Call ${i + 1}: ${time}ms (detection calls: ${detectCallCount})`);
    }
    
    console.log(`\nCache persistence summary:`);
    console.log(`- Total calls made: ${calls}`);
    console.log(`- Total detection calls: ${detectCallCount}`);
    console.log(`- Cache hit rate: ${((calls - detectCallCount) / calls * 100).toFixed(1)}%`);
    console.log(`- First call time: ${times[0]}ms`);
    console.log(`- Subsequent call times: ${times.slice(1).join('ms, ')}ms`);
}

async function runAllTests() {
    console.log('=== Claude Code AI Provider Caching Tests ===');
    console.log('Testing caching behavior and performance...\n');
    
    try {
        await testInstanceCaching();
        await testCrossInstanceBehavior();
        await testRapidInstanceCreation();
        await testCachePersistence();
        
        console.log('\n=== All Tests Complete ===');
    } catch (error) {
        console.error('\nError during testing:', error);
        process.exit(1);
    }
}

// Run the tests
runAllTests();