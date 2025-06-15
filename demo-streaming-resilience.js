#!/usr/bin/env node

/**
 * Quick demonstration of Claude Code streaming with resilience features
 */

import { ClaudeCodeAIProvider } from './src/ai-providers/claude-code.js';

async function runDemo() {
    const provider = new ClaudeCodeAIProvider();
    
    // Check if Claude Code is available
    if (!provider.isAvailable()) {
        console.error('Claude Code is not available. Please install it first.');
        console.log('Visit: https://claude.ai/code');
        process.exit(1);
    }
    
    console.log('Claude Code Streaming Resilience Demo');
    console.log('=====================================\n');
    
    // 1. Health Check
    console.log('1. Checking streaming health...');
    try {
        const health = await provider.checkStreamingHealth();
        console.log(`   ✅ Health: ${health.healthy ? 'Good' : 'Poor'}`);
        console.log(`   ⏱️  Latency: ${health.latency}ms\n`);
    } catch (error) {
        console.log(`   ❌ Health check failed: ${error.message}\n`);
    }
    
    // 2. Basic Streaming with Monitoring
    console.log('2. Streaming with performance monitoring...');
    try {
        // Enable debug for this demo
        process.env.CLAUDE_CODE_DEBUG = 'true';
        
        const stream = provider.streamText({
            messages: [
                { role: 'user', content: 'List 3 benefits of error handling in one sentence each.' }
            ]
        });
        
        const monitoredStream = provider.monitorStream(stream);
        
        console.log('   Response:');
        console.log('   ' + '-'.repeat(50));
        for await (const chunk of monitoredStream) {
            process.stdout.write(chunk);
        }
        console.log('\n   ' + '-'.repeat(50));
        
        delete process.env.CLAUDE_CODE_DEBUG;
    } catch (error) {
        console.log(`\n   ❌ Streaming failed: ${error.message}`);
    }
    
    // 3. Timeout Protection Demo
    console.log('\n3. Testing timeout protection (3 second limit)...');
    try {
        const stream = provider.createTimeoutStream({
            messages: [
                { role: 'user', content: 'Briefly explain timeout protection.' }
            ]
        }, 3000);
        
        console.log('   Response:');
        console.log('   ' + '-'.repeat(50));
        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }
        console.log('\n   ' + '-'.repeat(50));
        console.log('   ✅ Completed within timeout');
    } catch (error) {
        console.log(`\n   ⏰ Timed out as expected: ${error.message}`);
    }
    
    // 4. Configuration Display
    console.log('\n4. Current resilience configuration:');
    console.log('   ' + JSON.stringify(provider.streamingConfig, null, 2).split('\n').join('\n   '));
    
    console.log('\n=====================================');
    console.log('Demo completed! Key features shown:');
    console.log('- Health monitoring for proactive management');
    console.log('- Performance metrics for optimization');
    console.log('- Timeout protection against hanging');
    console.log('- Configurable retry and recovery options');
    console.log('\nSee examples/streaming/ for more detailed demonstrations.');
}

// Run the demo
runDemo().catch(console.error);