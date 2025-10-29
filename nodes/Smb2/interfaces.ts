interface Smb2Credentials {
	host: string;
	port: number;
	domain: string;
	username: string;
	password: string;
	share: string;
	connectTimeout: number;
	requestTimeout: number;
	ntlmVersion?: 'auto' | 'v1' | 'v2';
}
