/**
 * SMB2 Authentication Test Suite
 *
 * This test suite verifies the NTLM authentication functionality for both
 * NTLMv1 and NTLMv2 protocols, ensuring backward compatibility and proper
 * handling of different Windows Server configurations.
 *
 * Related Issue: https://github.com/drudge/n8n-nodes-smb2/issues/2
 *
 * Test Scenarios:
 * 1. Auto-detection (default) - Should work with both NTLMv1 and NTLMv2 servers
 * 2. Force NTLMv1 - Should work with servers that support NTLMv1
 * 3. Force NTLMv2 - Should work with modern Windows servers (2019+, Server 2025)
 * 4. Authentication failure scenarios - Proper error messages
 *
 * Prerequisites:
 * To run these tests, you need access to SMB servers with:
 * - A server supporting NTLMv1 (older Windows Server or Samba)
 * - A server supporting NTLMv2 (Windows Server 2019+, Server 2025)
 * - Valid credentials for both servers
 *
 * Configuration:
 * Set the following environment variables:
 * - SMB_TEST_HOST_V1: Hostname for NTLMv1 server
 * - SMB_TEST_HOST_V2: Hostname for NTLMv2 server
 * - SMB_TEST_DOMAIN: Domain name
 * - SMB_TEST_USERNAME: Username
 * - SMB_TEST_PASSWORD: Password
 * - SMB_TEST_SHARE: Share name
 */

import { Client } from 'node-smb2';

interface TestConfig {
	host: string;
	domain: string;
	username: string;
	password: string;
	share: string;
	port?: number;
	connectTimeout?: number;
	requestTimeout?: number;
}

// Test configuration from environment variables
const testConfig: TestConfig = {
	host: process.env.SMB_TEST_HOST || '',
	domain: process.env.SMB_TEST_DOMAIN || '',
	username: process.env.SMB_TEST_USERNAME || '',
	password: process.env.SMB_TEST_PASSWORD || '',
	share: process.env.SMB_TEST_SHARE || '',
	port: 445,
	connectTimeout: 15000,
	requestTimeout: 15000,
};

// Check if test configuration is available
const hasTestConfig = testConfig.host && testConfig.username && testConfig.password && testConfig.share;

/**
 * Test helper function to attempt SMB2 authentication
 */
async function testAuthentication(
	config: TestConfig,
	forceNtlmVersion?: 'v1' | 'v2',
): Promise<{ success: boolean; error?: Error; client?: Client; session?: any }> {
	let client: Client | undefined;
	let session: any;

	try {
		client = new Client(config.host, {
			port: config.port,
			connectTimeout: config.connectTimeout,
			requestTimeout: config.requestTimeout,
		});

		const authOptions: any = {
			domain: config.domain,
			username: config.username,
			password: config.password,
		};

		if (forceNtlmVersion) {
			authOptions.forceNtlmVersion = forceNtlmVersion;
		}

		session = await client.authenticate(authOptions);

		return { success: true, client, session };
	} catch (error) {
		return { success: false, error: error as Error, client };
	}
}

/**
 * Test helper to cleanup client connection
 */
async function cleanup(client?: Client) {
	if (client) {
		try {
			await client.close();
		} catch (error) {
			// Ignore cleanup errors
		}
	}
}

describe('SMB2 NTLM Authentication', () => {
	// Skip all tests if test configuration is not available
	const describeOrSkip = hasTestConfig ? describe : describe.skip;

	describeOrSkip('Authentication with Auto-detection (Default)', () => {
		let client: Client | undefined;

		afterEach(async () => {
			await cleanup(client);
		});

		test('should successfully authenticate with auto-detection', async () => {
			const result = await testAuthentication(testConfig);
			client = result.client;

			expect(result.success).toBe(true);
			expect(result.error).toBeUndefined();
			expect(result.session).toBeDefined();
			expect(result.session.authenticated).toBe(true);
		}, 30000);

		test('should be able to connect to share after authentication', async () => {
			const result = await testAuthentication(testConfig);
			client = result.client;

			expect(result.success).toBe(true);

			const tree = await result.session.connectTree(testConfig.share);
			expect(tree).toBeDefined();
		}, 30000);
	});

	describeOrSkip('Authentication with NTLMv1 (Force)', () => {
		let client: Client | undefined;

		afterEach(async () => {
			await cleanup(client);
		});

		test('should successfully authenticate with forced NTLMv1', async () => {
			const result = await testAuthentication(testConfig, 'v1');
			client = result.client;

			if (result.error && result.error.message.includes('NTLMv1 not permitted')) {
				// Server has disabled NTLMv1 - this is expected on modern servers
				console.log('Server has disabled NTLMv1 (expected on Windows Server 2019+)');
				expect(result.success).toBe(false);
			} else {
				// Server supports NTLMv1
				expect(result.success).toBe(true);
				expect(result.error).toBeUndefined();
				expect(result.session).toBeDefined();
				expect(result.session.authenticated).toBe(true);
			}
		}, 30000);
	});

	describeOrSkip('Authentication with NTLMv2 (Force)', () => {
		let client: Client | undefined;

		afterEach(async () => {
			await cleanup(client);
		});

		test('should successfully authenticate with forced NTLMv2', async () => {
			const result = await testAuthentication(testConfig, 'v2');
			client = result.client;

			expect(result.success).toBe(true);
			expect(result.error).toBeUndefined();
			expect(result.session).toBeDefined();
			expect(result.session.authenticated).toBe(true);
		}, 30000);

		test('should be able to connect to share after authentication', async () => {
			const result = await testAuthentication(testConfig, 'v2');
			client = result.client;

			expect(result.success).toBe(true);

			const tree = await result.session.connectTree(testConfig.share);
			expect(tree).toBeDefined();
		}, 30000);
	});

	describeOrSkip('Authentication Failure Scenarios', () => {
		let client: Client | undefined;

		afterEach(async () => {
			await cleanup(client);
		});

		test('should fail with invalid credentials', async () => {
			const invalidConfig = { ...testConfig, password: 'invalid_password' };
			const result = await testAuthentication(invalidConfig);
			client = result.client;

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		}, 30000);

		test('should fail with invalid domain', async () => {
			const invalidConfig = { ...testConfig, domain: 'INVALID_DOMAIN' };
			const result = await testAuthentication(invalidConfig);
			client = result.client;

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		}, 30000);

		test('should fail with invalid host', async () => {
			const invalidConfig = { ...testConfig, host: 'nonexistent.example.com' };
			const result = await testAuthentication(invalidConfig, undefined);
			client = result.client;

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		}, 30000);
	});

	describeOrSkip('Regression Test for Issue #2', () => {
		let client: Client | undefined;

		afterEach(async () => {
			await cleanup(client);
		});

		test('should NOT get "Sharing Violation" error on valid Windows Server connection', async () => {
			const result = await testAuthentication(testConfig);
			client = result.client;

			if (!result.success && result.error) {
				// Make sure we're not getting the sharing violation error (3221225485)
				// that was reported in Issue #2
				const errorStr = result.error.toString();
				expect(errorStr).not.toContain('3221225485');
				expect(errorStr).not.toContain('Sharing Violation');
			} else {
				// Connection should succeed
				expect(result.success).toBe(true);
			}
		}, 30000);

		test('should successfully list files after connection (full workflow test)', async () => {
			const result = await testAuthentication(testConfig);
			client = result.client;

			expect(result.success).toBe(true);

			const tree = await result.session.connectTree(testConfig.share);
			expect(tree).toBeDefined();

			// Try to list the root directory
			const entries = await tree.readDirectory('\\');
			expect(Array.isArray(entries)).toBe(true);

			console.log(`Successfully listed ${entries.length} entries in share root`);
		}, 30000);
	});
});

// Manual test runner for quick verification
if (require.main === module) {
	if (!hasTestConfig) {
		console.error('Test configuration not set. Please set environment variables:');
		console.error('  SMB_TEST_HOST - SMB server hostname');
		console.error('  SMB_TEST_DOMAIN - Domain name');
		console.error('  SMB_TEST_USERNAME - Username');
		console.error('  SMB_TEST_PASSWORD - Password');
		console.error('  SMB_TEST_SHARE - Share name');
		process.exit(1);
	}

	console.log('Running SMB2 authentication tests...');
	console.log(`Host: ${testConfig.host}`);
	console.log(`Domain: ${testConfig.domain}`);
	console.log(`Username: ${testConfig.username}`);
	console.log(`Share: ${testConfig.share}`);
	console.log('');

	(async () => {
		console.log('Testing auto-detection...');
		let result = await testAuthentication(testConfig);
		console.log(`  Auto-detection: ${result.success ? '✓ PASS' : '✗ FAIL'}`);
		if (result.error) console.log(`  Error: ${result.error.message}`);
		await cleanup(result.client);

		console.log('Testing NTLMv1...');
		result = await testAuthentication(testConfig, 'v1');
		console.log(`  NTLMv1: ${result.success ? '✓ PASS' : '✗ FAIL'}`);
		if (result.error) console.log(`  Error: ${result.error.message}`);
		await cleanup(result.client);

		console.log('Testing NTLMv2...');
		result = await testAuthentication(testConfig, 'v2');
		console.log(`  NTLMv2: ${result.success ? '✓ PASS' : '✗ FAIL'}`);
		if (result.error) console.log(`  Error: ${result.error.message}`);
		await cleanup(result.client);
	})();
}
