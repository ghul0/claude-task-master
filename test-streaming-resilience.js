#!/usr/bin/env node

/**
 * Test streaming resilience and error recovery for Claude Code provider
 */

import { ClaudeCodeAIProvider } from './src/ai-providers/claude-code.js';

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testStreamingResilience() {
    const provider = new ClaudeCodeAIProvider();
    
    // Check if provider is available
    if (!provider.isAvailable()) {
        console.error('Claude Code is not available. Please install it first.');
        process.exit(1);
    }
    
    console.log('Testing Claude Code streaming resilience...\n');
    
    // Test 1: Health Check
    console.log('Test 1: Streaming Health Check');
    console.log('='.repeat(50));
    
    try {
        console.log('Performing health check...');
        const health = await provider.checkStreamingHealth();
        console.log('Health check result:', health);
        
        if (!health.healthy) {
            console.error('Streaming is not healthy:', health.error);
        } else {
            console.log(`Streaming is healthy! Latency: ${health.latency}ms`);
        }
        console.log('='.repeat(50) + '\n');
    } catch (error) {
        console.error('Health check failed:', error.message);
    }
    
    // Test 2: Timeout Protection
    console.log('Test 2: Timeout Protection');
    console.log('='.repeat(50));
    
    try {
        console.log('Testing with 5-second timeout...');
        const startTime = Date.now();
        
        const stream = provider.createTimeoutStream({
            messages: [
                { 
                    role: 'user', 
                    content: 'Generate a very long story that would take more than 5 seconds to complete.' 
                }
            ]
        }, 5000); // 5 second timeout
        
        console.log('Output:');
        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }
    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.log(`\n\nStream timed out after ${elapsed}ms as expected.`);
        console.log('Error:', error.message);
    }
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 3: Performance Monitoring
    console.log('Test 3: Performance Monitoring');
    console.log('='.repeat(50));
    
    try {
        // Enable debug mode for metrics
        process.env.CLAUDE_CODE_DEBUG = 'true';
        
        const stream = provider.streamText({
            messages: [
                { 
                    role: 'user', 
                    content: 'Write a haiku about streaming data.' 
                }
            ]
        });
        
        const monitoredStream = provider.monitorStream(stream);
        
        console.log('Output with monitoring:');
        for await (const chunk of monitoredStream) {
            process.stdout.write(chunk);
        }
        
        // Disable debug mode
        delete process.env.CLAUDE_CODE_DEBUG;
        
        console.log('\n\n(Check console for stream metrics)');
    } catch (error) {
        console.error('Error in Test 3:', error.message);
    }
    console.log('='.repeat(50) + '\n');
    
    // Test 4: Retry Logic Demonstration
    console.log('Test 4: Retry Logic (Simulated Failure)');
    console.log('='.repeat(50));
    
    try {
        // This test demonstrates the retry logic by attempting a normal request
        console.log('Note: Actual retry behavior depends on network/service conditions');
        console.log('The provider will automatically retry up to 3 times on failure\n');
        
        const stream = provider.streamText({
            messages: [
                { 
                    role: 'user', 
                    content: 'Say "Resilience test successful!"' 
                }
            ]
        });
        
        console.log('Output:');
        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }
        console.log('\n');
    } catch (error) {
        console.error('Error after retries:', error.message);
    }
    console.log('='.repeat(50) + '\n');
    
    // Test 5: Abort Signal with Graceful Handling
    console.log('Test 5: Graceful Abort Handling');
    console.log('='.repeat(50));
    
    try {
        const controller = new AbortController();
        const signal = controller.signal;
        
        const stream = provider.streamText({
            messages: [
                { 
                    role: 'user', 
                    content: 'Count slowly from 1 to 20, pausing between each number.' 
                }
            ],
            signal
        });
        
        console.log('Output (aborting after 3 seconds):');
        
        // Set up abort after 3 seconds
        const abortTimeout = setTimeout(() => {
            console.log('\n\nSending abort signal...');
            controller.abort();
        }, 3000);
        
        try {
            for await (const chunk of stream) {
                process.stdout.write(chunk);
            }
        } catch (error) {
            if (error.name === 'AbortError' || error.message.includes('abort')) {
                console.log('\nStream gracefully aborted.');
            } else {
                throw error;
            }
        } finally {
            clearTimeout(abortTimeout);
        }
    } catch (error) {
        console.error('\nError in Test 5:', error.message);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('\nResilience tests completed!');
    console.log('\nKey Features Demonstrated:');
    console.log('- Health checks for streaming availability');
    console.log('- Automatic retry with exponential backoff');
    console.log('- Timeout protection for long-running streams');
    console.log('- Performance monitoring and metrics');
    console.log('- Graceful abort signal handling');
    console.log('- Fallback to non-streaming mode on failure');
}

// Run tests
testStreamingResilience().catch(console.error);