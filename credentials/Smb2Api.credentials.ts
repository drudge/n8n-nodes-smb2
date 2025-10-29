import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class Smb2Api implements ICredentialType {
	name = 'smb2Api';
	displayName = 'Samba (SMB2) API';
	properties: INodeProperties[] = [
		{
			displayName: 'Server',
			name: 'host',
			type: 'string',
			required: true,
			default: '',
		},
		{
			displayName: 'User Name',
			name: 'username',
			type: 'string',
			required: true,
			default: '',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			noDataExpression: true,
			required: true,
			default: '',
		},
		{
			displayName: 'Domain',
			name: 'domain',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 445,
		},
		{
			displayName: 'Share Name',
			name: 'share',
			type: 'string',
			required: true,
			default: '',
		},
		{
			displayName: 'Connect Timeout',
			name: 'connectTimeout',
			type: 'number',
			description: 'Connection timeout in ms',
			default: 15000,
		},
		{
			displayName: 'Request Timeout',
			name: 'requestTimeout',
			description: 'Request timeout in ms',
			type: 'number',
			default: 15000,
		},
		{
			displayName: 'NTLM Version',
			name: 'ntlmVersion',
			type: 'options',
			description: 'Force a specific NTLM version for authentication. Auto-detect will try to negotiate the best version with the server.',
			default: 'auto',
			options: [
				{
					name: 'Auto-detect (Recommended)',
					value: 'auto',
					description: 'Automatically negotiate NTLM version based on server capabilities',
				},
				{
					name: 'NTLMv1',
					value: 'v1',
					description: 'Force NTLMv1 (less secure but more compatible with older servers)',
				},
				{
					name: 'NTLMv2',
					value: 'v2',
					description: 'Force NTLMv2 (more secure, required by modern Windows servers)',
				},
			],
		},
	];
}
