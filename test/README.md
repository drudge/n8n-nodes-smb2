# SMB2 Authentication Test Suite

This test suite provides comprehensive testing for NTLM authentication in the n8n-nodes-smb2 package, specifically addressing [Issue #2](https://github.com/drudge/n8n-nodes-smb2/issues/2).

## Background

### The Problem

When the project switched from `@awo00/smb2` to `node-smb2` library to support NTLMv2 authentication, users experienced authentication failures with Windows Server SMB shares:

- **Error Code 3221225485**: "Sharing Violation - File is in use by another process"
- **Error Code 3221225581**: "Logon Failure"
- **Error**: "An invalid parameter was passed to a service or function" (0xC000000D)

The root cause was that the NTLM version negotiation wasn't working correctly, and there was no way for users to manually specify which NTLM version to use.

### The Solution

We've added a `forceNtlmVersion` option that allows users to:
1. **Auto-detect** (default): Let the library negotiate the NTLM version with the server
2. **Force NTLMv1**: Use NTLMv1 for compatibility with older servers
3. **Force NTLMv2**: Use NTLMv2 for modern Windows servers that require it

This gives users control over the authentication method while maintaining backward compatibility.

## Test Configuration

The tests require access to an SMB server. Set the following environment variables:

```bash
export SMB_TEST_HOST="your-windows-server.example.com"
export SMB_TEST_DOMAIN="WORKGROUP"  # or your domain name
export SMB_TEST_USERNAME="your-username"
export SMB_TEST_PASSWORD="your-password"
export SMB_TEST_SHARE="your-share-name"
```

### Test Servers

Ideally, you should test against:
- **Modern Windows Server** (2019, 2022, 2025) - These typically require NTLMv2
- **Older Windows Server** or **Samba** - May support both NTLMv1 and NTLMv2

## Running the Tests

### With a Test Framework (Jest, Mocha, etc.)

If you have a test framework installed:

```bash
# Install dependencies first
pnpm install

# Run all tests
pnpm test

# Run only authentication tests
pnpm test test/Smb2Auth.test.ts
```

### Manual Test Runner

The test suite includes a manual test runner for quick verification:

```bash
# Build the project first
pnpm build

# Run the manual test
node dist/test/Smb2Auth.test.js
```

## Test Scenarios

### 1. Auto-detection Tests
- ✓ Should successfully authenticate using auto-detection
- ✓ Should connect to share after authentication

### 2. NTLMv1 Tests
- ✓ Should authenticate with forced NTLMv1 (on servers that support it)
- ✓ Should handle servers that disable NTLMv1 gracefully

### 3. NTLMv2 Tests
- ✓ Should authenticate with forced NTLMv2
- ✓ Should connect to share after authentication

### 4. Failure Scenarios
- ✓ Should fail gracefully with invalid credentials
- ✓ Should fail gracefully with invalid domain
- ✓ Should fail gracefully with invalid host

### 5. Regression Tests (Issue #2)
- ✓ Should NOT get "Sharing Violation" error on valid connections
- ✓ Should successfully list files (full workflow test)

## Expected Results

### On Modern Windows Server (2019+, Server 2025)

```
Auto-detection: ✓ PASS  (negotiates to NTLMv2)
NTLMv1: ✗ FAIL  (server disables NTLMv1 for security)
NTLMv2: ✓ PASS
```

### On Older Windows Server or Samba

```
Auto-detection: ✓ PASS  (negotiates to best available)
NTLMv1: ✓ PASS
NTLMv2: ✓ PASS (if supported)
```

## Troubleshooting

### Tests are Skipped

If tests are skipped, it means the test configuration environment variables are not set. Make sure all required variables are exported.

### "NTLMv1 not permitted" Error

This is expected on modern Windows servers. Windows Server 2019 and later disable NTLMv1 by default for security reasons. Users should use auto-detection or force NTLMv2 on these servers.

### Timeout Errors

If you're getting timeout errors, try increasing the timeout values:

```bash
export SMB_TEST_CONNECT_TIMEOUT=30000
export SMB_TEST_REQUEST_TIMEOUT=30000
```

### Connection Refused

Ensure that:
1. SMB service is running on the target server
2. Port 445 is open in the firewall
3. The hostname is correct and reachable

## Integration with n8n

When using this node in n8n:

1. **For modern Windows servers**: Use "Auto-detect" or "NTLMv2"
2. **For older servers**: Try "Auto-detect" first, then "NTLMv1" if needed
3. **For compatibility issues**: Try each option to see what works with your server

## References

- [Issue #2: SMB2 Connection Failure on Windows](https://github.com/drudge/n8n-nodes-smb2/issues/2)
- [Microsoft NTLM Documentation](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-authsod/9a20f8ac-612a-4e0a-baab-30e922e7e1f5)
- [node-smb2 Library](https://github.com/drudge/node-smb2)
