#!/usr/bin/env node

/**
 * Examples of error handling scenarios for Claude Code streaming
 */

import { ClaudeCodeAIProvider } from '../../src/ai-providers/claude-code.js';

// Example 1: Basic streaming with error handling
async function basicStreamingExample() {
    console.log('\n--- Example 1: Basic Streaming with Error Handling ---\n');
    
    const provider = new ClaudeCodeAIProvider();
    
    try {
        const stream = provider.streamText({
            messages: [
                { role: 'user', content: 'Write a short poem about error handling.' }
            ]
        });
        
        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }
        console.log('\n');
    } catch (error) {
        console.error('Streaming failed:', error.message);
        
        // Check error type and provide specific guidance
        if (error.message.includes('not found')) {
            console.log('Solution: Install Claude Code from https://claude.ai/code');
        } else if (error.message.includes('timeout')) {
            console.log('Solution: Check your internet connection or try again later');
        } else if (error.message.includes('abort')) {
            console.log('Info: Stream was cancelled by user');
        }
    }
}

// Example 2: Streaming with timeout and fallback
async function timeoutWithFallbackExample() {
    console.log('\n--- Example 2: Timeout with Fallback ---\n');
    
    const provider = new ClaudeCodeAIProvider();
    
    // Configure shorter timeout for demo
    provider.streamingConfig.streamTimeout = 10000; // 10 seconds
    provider.streamingConfig.fallbackToNonStreaming = true;
    
    try {
        const stream = provider.streamText({
            messages: [
                { role: 'user', content: 'Explain streaming in one sentence.' }
            ]
        });
        
        console.log('Streaming response...');
        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }
        console.log('\n');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Example 3: Monitoring stream performance
async function performanceMonitoringExample() {
    console.log('\n--- Example 3: Performance Monitoring ---\n');
    
    const provider = new ClaudeCodeAIProvider();
    
    try {
        // Enable debug mode to see metrics
        process.env.CLAUDE_CODE_DEBUG = 'true';
        
        const stream = provider.streamText({
            messages: [
                { role: 'user', content: 'List 3 benefits of streaming.' }
            ]
        });
        
        // Monitor the stream
        const monitoredStream = provider.monitorStream(stream);
        
        console.log('Monitoring stream performance...\n');
        for await (const chunk of monitoredStream) {
            process.stdout.write(chunk);
        }
        
        console.log('\n\n(Check above for performance metrics)');
        
        // Clean up
        delete process.env.CLAUDE_CODE_DEBUG;
    } catch (error) {
        console.error('Monitoring failed:', error.message);
    }
}

// Example 4: Graceful cancellation
async function gracefulCancellationExample() {
    console.log('\n--- Example 4: Graceful Cancellation ---\n');
    
    const provider = new ClaudeCodeAIProvider();
    const controller = new AbortController();
    
    try {
        const stream = provider.streamText({
            messages: [
                { role: 'user', content: 'Count from 1 to 10 slowly.' }
            ],
            signal: controller.signal
        });
        
        console.log('Streaming (will cancel after 2 seconds)...\n');
        
        // Cancel after 2 seconds
        setTimeout(() => {
            console.log('\n[Cancelling stream...]');
            controller.abort();
        }, 2000);
        
        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }
    } catch (error) {
        if (error.name === 'AbortError' || error.message.includes('abort')) {
            console.log('\n[Stream cancelled successfully]');
        } else {
            console.error('\nUnexpected error:', error.message);
        }
    }
}

// Example 5: Health check before streaming
async function healthCheckExample() {
    console.log('\n--- Example 5: Health Check Before Streaming ---\n');
    
    const provider = new ClaudeCodeAIProvider();
    
    // Check health first
    console.log('Checking streaming health...');
    const health = await provider.checkStreamingHealth();
    
    if (!health.healthy) {
        console.error('Streaming is not healthy:', health.error);
        console.log('Falling back to non-streaming mode...');
        
        // Use non-streaming as fallback
        try {
            const result = await provider.generateText({
                messages: [
                    { role: 'user', content: 'Say "Hello from fallback mode!"' }
                ]
            });
            console.log(result.text);
        } catch (error) {
            console.error('Fallback also failed:', error.message);
        }
    } else {
        console.log(`Streaming is healthy (latency: ${health.latency}ms)`);
        
        // Proceed with streaming
        try {
            const stream = provider.streamText({
                messages: [
                    { role: 'user', content: 'Say "Hello from streaming mode!"' }
                ]
            });
            
            for await (const chunk of stream) {
                process.stdout.write(chunk);
            }
            console.log('\n');
        } catch (error) {
            console.error('Streaming failed:', error.message);
        }
    }
}

// Example 6: Custom retry configuration
async function customRetryExample() {
    console.log('\n--- Example 6: Custom Retry Configuration ---\n');
    
    const provider = new ClaudeCodeAIProvider();
    
    // Customize retry settings
    provider.streamingConfig.maxRetries = 2;
    provider.streamingConfig.retryDelay = 500;
    provider.streamingConfig.retryBackoff = 1.5;
    
    console.log('Configured with:');
    console.log('- Max retries: 2');
    console.log('- Initial delay: 500ms');
    console.log('- Backoff multiplier: 1.5x\n');
    
    try {
        const stream = provider.streamText({
            messages: [
                { role: 'user', content: 'Test retry logic.' }
            ]
        });
        
        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }
        console.log('\n');
    } catch (error) {
        console.error('Failed after retries:', error.message);
    }
}

// Main function to run all examples
async function runAllExamples() {
    const provider = new ClaudeCodeAIProvider();
    
    if (!provider.isAvailable()) {
        console.error('Claude Code is not available. Please install it first.');
        console.log('\nInstallation options:');
        console.log('1. Download from: https://claude.ai/code');
        console.log('2. Install via npm: npm install -g @anthropic-ai/claude-code');
        process.exit(1);
    }
    
    console.log('Claude Code Streaming Error Handling Examples');
    console.log('='.repeat(50));
    
    // Run examples sequentially
    await basicStreamingExample();
    await timeoutWithFallbackExample();
    await performanceMonitoringExample();
    await gracefulCancellationExample();
    await healthCheckExample();
    await customRetryExample();
    
    console.log('\n' + '='.repeat(50));
    console.log('All examples completed!');
}

// Run the examples
runAllExamples().catch(console.error);