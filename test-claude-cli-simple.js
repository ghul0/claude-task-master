#!/usr/bin/env node

/**
 * Simple test script for Claude CLI integration
 * Tests the direct provider functionality
 */

import { ClaudeCliAIProvider } from './src/ai-providers/claude-cli.js';

async function testClaudeCli() {
	console.log('Testing Claude CLI Provider...\n');
	
	// Check if CLAUDE_CLI_COMMAND is set
	const command = process.env.CLAUDE_CLI_COMMAND;
	if (!command) {
		console.error('ERROR: CLAUDE_CLI_COMMAND environment variable is not set');
		console.log('Please set it to your Claude CLI command, e.g.:');
		console.log('export CLAUDE_CLI_COMMAND="claude"');
		process.exit(1);
	}
	
	console.log(`Using Claude CLI command: ${command}`);
	
	const provider = new ClaudeCliAIProvider();
	
	const params = {
		modelId: 'claude-local',
		messages: [
			{
				role: 'system',
				content: 'You are a helpful assistant. Keep your responses brief.'
			},
			{
				role: 'user',
				content: 'What is 2 + 2? Just give me the number.'
			}
		],
		maxTokens: 100,
		temperature: 0.2
	};
	
	try {
		console.log('\nSending test prompt...');
		const result = await provider.generateText(params);
		console.log('\nResponse:', result.text);
		console.log('\nTest completed successfully!');
	} catch (error) {
		console.error('\nERROR:', error.message);
		console.error('\nFull error:', error);
		process.exit(1);
	}
}

// Run the test
testClaudeCli().catch(console.error);