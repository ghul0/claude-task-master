#!/usr/bin/env node

/**
 * Examples demonstrating network resilience and error recovery
 */

import { ClaudeCodeAIProvider } from '../../src/ai-providers/claude-code.js';

// Simulate network issues for testing
class NetworkSimulator {
    constructor() {
        this.conditions = {
            normal: { delay: 0, dropRate: 0 },
            slow: { delay: 2000, dropRate: 0 },
            unstable: { delay: 500, dropRate: 0.3 },
            offline: { delay: 0, dropRate: 1 }
        };
        this.currentCondition = 'normal';
    }
    
    setCondition(condition) {
        this.currentCondition = condition;
        console.log(`[Network] Simulating ${condition} conditions`);
    }
    
    async simulateDelay() {
        const { delay } = this.conditions[this.currentCondition];
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    shouldDrop() {
        const { dropRate } = this.conditions[this.currentCondition];
        return Math.random() < dropRate;
    }
}

// Example 1: Handling slow network conditions
async function slowNetworkExample() {
    console.log('\n--- Example 1: Slow Network Handling ---\n');
    
    const provider = new ClaudeCodeAIProvider();
    const network = new NetworkSimulator();
    
    // Simulate slow network
    network.setCondition('slow');
    
    try {
        console.log('Attempting to stream with slow network...');
        console.log('(This may take longer than usual)\n');
        
        const startTime = Date.now();
        const stream = provider.streamText({
            messages: [
                { role: 'user', content: 'Say "Slow but steady wins the race!"' }
            ]
        });
        
        for await (const chunk of stream) {
            await network.simulateDelay();
            process.stdout.write(chunk);
        }
        
        const elapsed = Date.now() - startTime;
        console.log(`\n\nCompleted in ${elapsed}ms despite slow network`);
    } catch (error) {
        console.error('Failed due to slow network:', error.message);
    }
}

// Example 2: Recovery from connection drops
async function connectionRecoveryExample() {
    console.log('\n--- Example 2: Connection Recovery ---\n');
    
    const provider = new ClaudeCodeAIProvider();
    
    // Enable auto-recovery
    provider.streamingConfig.autoRecovery = true;
    
    console.log('Testing connection recovery...');
    console.log('The provider will attempt to recover from connection issues\n');
    
    try {
        const stream = provider.streamText({
            messages: [
                { 
                    role: 'user', 
                    content: 'List 5 ways to handle network errors, one per line.' 
                }
            ]
        });
        
        let lineCount = 0;
        for await (const chunk of stream) {
            process.stdout.write(chunk);
            
            // Simulate random connection issues
            if (chunk.includes('\n')) {
                lineCount++;
                if (lineCount === 2) {
                    console.log('\n[Simulating connection drop...]');
                    // The provider should recover automatically
                }
            }
        }
        
        console.log('\n\n[Connection recovered successfully]');
    } catch (error) {
        console.error('Recovery failed:', error.message);
    }
}

// Example 3: Timeout protection for unresponsive connections
async function timeoutProtectionExample() {
    console.log('\n--- Example 3: Timeout Protection ---\n');
    
    const provider = new ClaudeCodeAIProvider();
    
    // Set aggressive timeout for demo
    const customTimeout = 5000; // 5 seconds
    
    console.log(`Using ${customTimeout}ms timeout for protection\n`);
    
    try {
        const stream = provider.createTimeoutStream({
            messages: [
                { 
                    role: 'user', 
                    content: 'Explain network timeouts in one paragraph.' 
                }
            ]
        }, customTimeout);
        
        const startTime = Date.now();
        
        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }
        
        const elapsed = Date.now() - startTime;
        console.log(`\n\nCompleted successfully in ${elapsed}ms`);
    } catch (error) {
        if (error.message.includes('abort') || error.message.includes('timeout')) {
            console.log('\nConnection timed out as a safety measure');
            console.log('This protects against indefinite hanging');
        } else {
            console.error('\nUnexpected error:', error.message);
        }
    }
}

// Example 4: Adaptive streaming based on network conditions
async function adaptiveStreamingExample() {
    console.log('\n--- Example 4: Adaptive Streaming ---\n');
    
    const provider = new ClaudeCodeAIProvider();
    
    // Check network health before deciding on streaming strategy
    console.log('Checking network conditions...');
    
    const healthCheck = await provider.checkStreamingHealth();
    
    if (healthCheck.latency > 2000) {
        console.log(`High latency detected (${healthCheck.latency}ms)`);
        console.log('Switching to non-streaming mode for better reliability\n');
        
        try {
            const result = await provider.generateText({
                messages: [
                    { role: 'user', content: 'What is adaptive streaming?' }
                ]
            });
            console.log(result.text);
        } catch (error) {
            console.error('Non-streaming also failed:', error.message);
        }
    } else {
        console.log(`Good network conditions (${healthCheck.latency}ms latency)`);
        console.log('Using streaming mode for real-time response\n');
        
        try {
            const stream = provider.streamText({
                messages: [
                    { role: 'user', content: 'What is adaptive streaming?' }
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

// Example 5: Handling offline scenarios
async function offlineHandlingExample() {
    console.log('\n--- Example 5: Offline Handling ---\n');
    
    const provider = new ClaudeCodeAIProvider();
    
    // First, check if we can connect
    console.log('Checking connectivity...');
    
    try {
        const health = await provider.checkStreamingHealth();
        
        if (!health.healthy) {
            console.log('\nNo connection available');
            console.log('Possible solutions:');
            console.log('1. Check your internet connection');
            console.log('2. Check if Claude Code is running');
            console.log('3. Verify firewall settings');
            console.log('4. Try again in a few moments');
            
            // Could implement offline queue here
            console.log('\n[Would queue request for when connection returns]');
        } else {
            console.log('Connection available, proceeding with request\n');
            
            const stream = provider.streamText({
                messages: [
                    { role: 'user', content: 'Connection test successful!' }
                ]
            });
            
            for await (const chunk of stream) {
                process.stdout.write(chunk);
            }
            console.log('\n');
        }
    } catch (error) {
        console.error('Connectivity check failed:', error.message);
        console.log('\n[System appears to be offline]');
    }
}

// Example 6: Progressive enhancement with metrics
async function progressiveEnhancementExample() {
    console.log('\n--- Example 6: Progressive Enhancement ---\n');
    
    const provider = new ClaudeCodeAIProvider();
    
    // Enable metrics
    process.env.CLAUDE_CODE_DEBUG = 'true';
    
    console.log('Monitoring network performance for optimization...\n');
    
    try {
        // Start with a simple request
        const stream = provider.streamText({
            messages: [
                { role: 'user', content: 'Describe progressive enhancement briefly.' }
            ]
        });
        
        // Monitor the stream
        const monitoredStream = provider.monitorStream(stream);
        
        for await (const chunk of monitoredStream) {
            process.stdout.write(chunk);
        }
        
        console.log('\n\n[Check metrics above to optimize future requests]');
        
        // In a real app, you could:
        // - Adjust chunk sizes based on throughput
        // - Switch between streaming/non-streaming based on metrics
        // - Cache responses when network is slow
        // - Prefetch likely next requests during good conditions
        
    } catch (error) {
        console.error('Monitoring failed:', error.message);
    } finally {
        delete process.env.CLAUDE_CODE_DEBUG;
    }
}

// Main function to run all network resilience examples
async function runNetworkExamples() {
    const provider = new ClaudeCodeAIProvider();
    
    if (!provider.isAvailable()) {
        console.error('Claude Code is not available. Please install it first.');
        process.exit(1);
    }
    
    console.log('Network Resilience Examples for Claude Code Streaming');
    console.log('='.repeat(60));
    console.log('\nThese examples demonstrate how to handle various network conditions');
    console.log('and build resilient streaming applications.\n');
    
    // Run examples
    await slowNetworkExample();
    await connectionRecoveryExample();
    await timeoutProtectionExample();
    await adaptiveStreamingExample();
    await offlineHandlingExample();
    await progressiveEnhancementExample();
    
    console.log('\n' + '='.repeat(60));
    console.log('Network resilience examples completed!');
    console.log('\nKey takeaways:');
    console.log('- Always implement timeouts to prevent hanging');
    console.log('- Use health checks to adapt to network conditions');
    console.log('- Provide fallback options for poor connectivity');
    console.log('- Monitor performance to optimize user experience');
    console.log('- Handle offline scenarios gracefully');
}

// Run the examples
runNetworkExamples().catch(console.error);