/**
 * Claude configuration file loader
 * 
 * Loads and validates Claude Code configuration from various sources:
 * 1. .clauderc.json in current directory
 * 2. .clauderc.json in home directory
 * 3. claude.config.json in current directory
 * 4. Environment variables (highest priority)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_FILE_NAMES = ['.clauderc.json', 'claude.config.json', '.clauderc'];

/**
 * Configuration schema for validation
 */
const CONFIG_SCHEMA = {
  version: { type: 'string', required: false },
  claude: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      model: { type: 'string' },
      environment: { type: 'object' },
      defaultArgs: { type: 'array' },
      profiles: { type: 'object' }
    }
  },
  taskMaster: {
    type: 'object',
    properties: {
      preferredProvider: { type: 'string' },
      fallbackProvider: { type: 'string' }
    }
  }
};

/**
 * Finds configuration file in the given directory
 * 
 * @param {string} dir - Directory to search in
 * @returns {string|null} Path to config file or null
 */
function findConfigFile(dir) {
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = join(dir, fileName);
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Validates configuration object against schema
 * 
 * @param {object} config - Configuration object
 * @returns {{isValid: boolean, errors: string[]}} Validation result
 */
function validateConfig(config) {
  const errors = [];
  
  if (!config || typeof config !== 'object') {
    errors.push('Configuration must be an object');
    return { isValid: false, errors };
  }
  
  // Basic validation - can be enhanced with more sophisticated schema validation
  if (config.claude) {
    if (config.claude.command && typeof config.claude.command !== 'string') {
      errors.push('claude.command must be a string');
    }
    if (config.claude.model && typeof config.claude.model !== 'string') {
      errors.push('claude.model must be a string');
    }
    if (config.claude.defaultArgs && !Array.isArray(config.claude.defaultArgs)) {
      errors.push('claude.defaultArgs must be an array');
    }
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Merges configuration from multiple sources
 * Priority: Environment > Local > Home > Defaults
 * 
 * @param {...object} configs - Configuration objects to merge
 * @returns {object} Merged configuration
 */
function mergeConfigs(...configs) {
  const result = {};
  
  for (const config of configs) {
    if (!config) continue;
    
    // Deep merge
    for (const key in config) {
      if (typeof config[key] === 'object' && !Array.isArray(config[key])) {
        result[key] = mergeConfigs(result[key] || {}, config[key]);
      } else {
        result[key] = config[key];
      }
    }
  }
  
  return result;
}

/**
 * Loads configuration from file
 * 
 * @param {string} filePath - Path to configuration file
 * @returns {object|null} Configuration object or null if error
 */
function loadConfigFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const config = JSON.parse(content);
    
    const validation = validateConfig(config);
    if (!validation.isValid) {
      console.warn(`Invalid configuration in ${filePath}:`, validation.errors);
      return null;
    }
    
    return config;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Error loading config from ${filePath}:`, error.message);
    }
    return null;
  }
}

/**
 * Applies profile-specific configuration
 * 
 * @param {object} config - Base configuration
 * @param {string} profile - Profile name
 * @returns {object} Configuration with profile applied
 */
function applyProfile(config, profile) {
  if (!config.claude?.profiles?.[profile]) {
    return config;
  }
  
  const profileConfig = config.claude.profiles[profile];
  const claudeConfig = { ...config.claude, ...profileConfig };
  delete claudeConfig.profiles; // Remove profiles from final config
  
  return { ...config, claude: claudeConfig };
}

/**
 * Converts configuration to environment variables
 * 
 * @param {object} config - Configuration object
 * @returns {object} Environment variables
 */
function configToEnv(config) {
  const env = {};
  
  if (config.claude) {
    if (config.claude.command) {
      env.CLAUDE_CODE_COMMAND = config.claude.command;
    }
    if (config.claude.model) {
      env.CLAUDE_CODE_MODEL = config.claude.model;
    }
    if (config.claude.environment) {
      Object.assign(env, config.claude.environment);
    }
  }
  
  return env;
}

/**
 * Main function to load Claude configuration
 * 
 * @param {object} options - Loading options
 * @param {string} [options.cwd] - Current working directory
 * @param {string} [options.profile] - Profile to use
 * @param {boolean} [options.ignoreEnv] - Ignore environment variables
 * @returns {object} Loaded configuration
 */
export function loadClaudeConfig(options = {}) {
  const cwd = options.cwd || process.cwd();
  const home = homedir();
  
  // Load configurations from different sources
  const homeConfigPath = findConfigFile(home);
  const localConfigPath = findConfigFile(cwd);
  
  const homeConfig = homeConfigPath ? loadConfigFile(homeConfigPath) : null;
  const localConfig = localConfigPath ? loadConfigFile(localConfigPath) : null;
  
  // Environment configuration (highest priority)
  const envConfig = options.ignoreEnv ? null : {
    claude: {
      command: process.env.CLAUDE_CODE_COMMAND,
      model: process.env.CLAUDE_CODE_MODEL
    }
  };
  
  // Merge configurations
  let config = mergeConfigs(homeConfig, localConfig, envConfig);
  
  // Apply profile if specified
  if (options.profile) {
    config = applyProfile(config, options.profile);
  }
  
  return config;
}

/**
 * Gets Claude command from configuration
 * 
 * @param {object} config - Configuration object
 * @returns {string|null} Claude command with arguments
 */
export function getCommandFromConfig(config) {
  if (!config.claude?.command) {
    return null;
  }
  
  let command = config.claude.command;
  
  // Append default arguments if any
  if (config.claude.defaultArgs && config.claude.defaultArgs.length > 0) {
    const args = config.claude.defaultArgs.join(' ');
    command = `${command} ${args}`;
  }
  
  return command;
}

/**
 * Exports configuration to environment variables
 * 
 * @param {object} config - Configuration object
 * @returns {object} Updated process.env
 */
export function exportConfigToEnv(config) {
  const env = configToEnv(config);
  Object.assign(process.env, env);
  return process.env;
}