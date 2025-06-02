/**
 * claude-cli-adapter.js
 * Adapter functions to make claude-cli provider work with functions that expect object generation
 */

import { generateTextService } from './ai-services-unified.js';
import { log } from './utils.js';

/**
 * Generates an object using text generation for providers that don't support generateObject
 * Falls back to generateObject for providers that do support it
 */
export async function generateObjectWithFallback(params) {
    const { role, session, projectRoot, schema, objectName, systemPrompt, prompt, commandName, outputType } = params;
    
    try {
        // First, check if we're using claude-cli provider
        const configManager = await import('./config-manager.js');
        
        // Get provider based on role
        let provider;
        if (role === 'main') {
            provider = configManager.getMainProvider(session, projectRoot);
        } else if (role === 'research') {
            provider = configManager.getResearchProvider(session, projectRoot);
        } else if (role === 'fallback') {
            provider = configManager.getFallbackProvider(session, projectRoot);
        } else {
            // Default to main if role not specified
            provider = configManager.getMainProvider(session, projectRoot);
        }
        
        if (provider === 'claude-cli') {
            log('info', '[CLAUDE-CLI-ADAPTER] Using text generation fallback for claude-cli provider');
            
            
            // Create a modified prompt that asks for JSON output
            const jsonPrompt = `${prompt}

IMPORTANT: Your response MUST be valid JSON that matches this schema:
${JSON.stringify(schema, null, 2)}

Respond ONLY with the JSON object, no explanation or markdown formatting.`;

            
            // Use generateTextService instead
            const textResult = await generateTextService({
                role,
                session,
                projectRoot,
                systemPrompt,
                prompt: jsonPrompt,
                commandName,
                outputType
            });
            
            // Check if we got a valid result
            
            // Handle different result structures
            let textContent = '';
            if (typeof textResult?.mainResult === 'string') {
                // generateTextService returns mainResult as the text directly
                textContent = textResult.mainResult;
            } else if (textResult?.mainResult?.text) {
                textContent = textResult.mainResult.text;
            } else if (textResult?.text) {
                textContent = textResult.text;
            } else {
                log('error', '[CLAUDE-CLI-ADAPTER] No text result from Claude CLI');
                log('error', `[CLAUDE-CLI-ADAPTER] textResult: ${JSON.stringify(textResult)}`);
                throw new Error('Claude CLI returned no output. It may still have issues with non-interactive mode.');
            }
            
            log('debug', `[CLAUDE-CLI-ADAPTER] Text result: ${textContent.substring(0, 200)}...`);
            
            // Parse the JSON from the text response
            try {
                // Try to extract JSON from the response (in case there's extra text)
                let jsonText = textContent.trim();
                
                // Remove markdown code blocks if present
                jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
                
                // Find JSON object boundaries
                const firstBrace = jsonText.indexOf('{');
                const lastBrace = jsonText.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    jsonText = jsonText.substring(firstBrace, lastBrace + 1);
                }
                
                const parsedObject = JSON.parse(jsonText);
                
                // Return in the same format as generateObjectService
                return {
                    mainResult: {
                        object: parsedObject,
                        text: textContent,
                        usage: textResult?.mainResult?.usage || textResult?.usage || {}
                    },
                    telemetryData: textResult?.telemetryData
                };
            } catch (parseError) {
                log('error', `[CLAUDE-CLI-ADAPTER] Failed to parse JSON from response: ${parseError.message}`);
                throw new Error(`Failed to parse JSON from Claude CLI response: ${parseError.message}`);
            }
        } else {
            // For other providers, use the normal generateObjectService
            log('info', `[CLAUDE-CLI-ADAPTER] Using native generateObject for ${provider} provider`);
            const { generateObjectService } = await import('./ai-services-unified.js');
            return generateObjectService(params);
        }
    } catch (error) {
        log('error', `[CLAUDE-CLI-ADAPTER] Error in generateObjectWithFallback: ${error.message}`);
        throw error;
    }
}