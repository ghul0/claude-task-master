#!/usr/bin/env node

/**
 * Test streaming functionality for Claude Code provider
 */

import { ClaudeCodeAIProvider } from './src/ai-providers/claude-code.js';

async function testStreaming() {
    const provider = new ClaudeCodeAIProvider();
    
    // Check if provider is available
    if (!provider.isAvailable()) {
        console.error('Claude Code is not available. Please install it first.');
        process.exit(1);
    }
    
    console.log('Testing Claude Code streaming support...\n');
    
    // Test 1: Small input
    console.log('Test 1: Small input streaming');
    console.log('='.repeat(50));
    
    try {
        const stream = provider.streamText({
            messages: [
                { role: 'user', content: 'Count from 1 to 5.' }
            ]
        });
        
        console.log('Output:');
        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }
        console.log('\n' + '='.repeat(50) + '\n');
    } catch (error) {
        console.error('Error in Test 1:', error.message);
    }
    
    // Test 2: Larger input
    console.log('Test 2: Larger input streaming');
    console.log('='.repeat(50));
    
    try {
        const stream = provider.streamText({
            messages: [
                { 
                    role: 'user', 
                    content: 'Write a short story about a robot learning to paint. Include at least 3 paragraphs.' 
                }
            ]
        });
        
        console.log('Output:');
        let charCount = 0;
        for await (const chunk of stream) {
            process.stdout.write(chunk);
            charCount += chunk.length;
        }
        console.log('\n\nTotal characters streamed:', charCount);
        console.log('='.repeat(50) + '\n');
    } catch (error) {
        console.error('Error in Test 2:', error.message);
    }
    
    // Test 3: Error handling
    console.log('Test 3: Error handling with abort signal');
    console.log('='.repeat(50));
    
    try {
        const controller = new AbortController();
        const signal = controller.signal;
        
        const stream = provider.streamText({
            messages: [
                { 
                    role: 'user', 
                    content: 'Generate a very long list of prime numbers starting from 1.' 
                }
            ],
            signal
        });
        
        console.log('Output (aborting after 2 seconds):');
        
        // Abort after 2 seconds
        setTimeout(() => {
            console.log('\n\nAborting stream...');
            controller.abort();
        }, 2000);
        
        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }
    } catch (error) {
        if (error.name === 'AbortError' || error.message.includes('abort')) {
            console.log('\nStream successfully aborted.');
        } else {
            console.error('\nError in Test 3:', error.message);
        }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('\nStreaming tests completed!');
}

// Run tests
testStreaming().catch(console.error);