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
