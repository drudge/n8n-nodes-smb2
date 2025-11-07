import { Client } from "node-smb2";
import Session from "node-smb2/dist/client/Session";
import File from "node-smb2/dist/client/File";
import Tree from "node-smb2/dist/client/Tree";
import FilePipePrinterAccess_1 from "node-smb2/dist/protocol/smb2/FilePipePrinterAccess";
import { IExecuteFunctions, ITriggerFunctions, NodeApiError } from "n8n-workflow";
import { debuglog } from 'util';

const debug = debuglog('n8n-nodes-smb2');

Tree.prototype.renameFile = async function (path: string, newPath: string) {
	const file = new File(this);
	// @ts-ignore
	this.registerFile(file);
	const desiredAccess =  FilePipePrinterAccess_1.Delete |             // 65536 - Needed to remove old filename
		FilePipePrinterAccess_1.WriteAttributes |    // 256 - Needed to modify file attributes
		FilePipePrinterAccess_1.ReadAttributes |
		FilePipePrinterAccess_1.ReadControl |
		FilePipePrinterAccess_1.Synchronize;
		await file.open(path, { desiredAccess: desiredAccess });
		await file.rename(newPath);
		await file.close();
}

const SMB_ERROR_CODES: { [key: number]: string } = {
	3221225525: 'Access Denied - Check your permissions for this file/folder',
	3221225506: 'File/Path Not Found',
	3221225514: 'Invalid Parameter',
	3221225485: 'Sharing Violation - File is in use by another process',
	3221225524: 'Object Name Invalid',
	3221225534: 'Not Enough Quota',
	3221225581: 'Logon Failure - Check your username, password, and domain',
	3221226036: 'Bad Network Name - The specified share does not exist on the server',
	2147942402: 'Network Name Not Found - Share does not exist',
	2147942405: 'Network Path Not Found',
	5: 'Access Denied',
	32: 'Sharing Violation',
	53: 'Network Path Not Found',
	67: 'Network Name Not Found',
	87: 'Invalid Parameter',
	1314: 'Network Error',
};

export function getReadableError(error: any): string {
	if (!error) return 'Unknown error occurred';

	const errorCode = error.header?.status || error.code || error.errno;
	if (errorCode && SMB_ERROR_CODES[errorCode]) {
		return `${SMB_ERROR_CODES[errorCode]} (Code: ${errorCode})`;
	}

	if (error.code === 'ECONNREFUSED') {
		return 'Could not connect to SMB server - Connection refused';
	}
	if (error.code === 'ETIMEDOUT') {
		return 'Connection to SMB server timed out';
	}
	if (error.code === 'ENOTFOUND') {
		return 'SMB server not found - Check the server address';
	}

	if (!error.message &&error.header?.status) {
		return `SMB server returned an error (Code: ${error.header?.status})`
	}

	return error.message || String(error);
}

export async function connectToSmbServer(this: IExecuteFunctions | ITriggerFunctions): Promise<{ client: Client; session: Session; tree: Tree }> {
	try {
		const credentials = await this.getCredentials('smb2Api') as unknown as Smb2Credentials;
		let client = new Client(credentials.host, {
			port: credentials.port,
			connectTimeout: credentials.connectTimeout,
			requestTimeout: credentials.requestTimeout,
		});
		let session: any;
		let tree: any;

		debug('Connecting to %s on %s as (%s\\%s) [connectTimeout: %s, requestTimeout: %s]', credentials.share, credentials.host, credentials.domain, credentials.username, credentials.connectTimeout, credentials.requestTimeout);
		debug('smb://%s:%s@%s/%s', credentials.username, credentials.password, credentials.host, credentials.share);

		session = await client.authenticate({
			domain: credentials.domain,
			username: credentials.username,
			password: credentials.password,
		});

		tree = await session.connectTree(credentials.share);

		return { client, session, tree };
	} catch (error) {
		debug('Connect error: ', error);
		const readableError = getReadableError(error);
		throw new NodeApiError(this.getNode(), error, { message: `Failed to connect to SMB server: ${readableError}` });
	}
}
