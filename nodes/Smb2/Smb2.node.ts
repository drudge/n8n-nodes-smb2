import {
	NodeOperationError,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { basename, join } from 'path';
import * as fs from 'fs';
import { type FileResult, file as tmpFile } from 'tmp-promise';
import type DirectoryEntry from 'node-smb2/dist/protocol/models/DirectoryEntry';
import { pipeline } from 'stream';
import { promisify, debuglog } from 'util';
import { connectToSmbServer, getReadableError } from './helpers';
const pipelineAsync = promisify(pipeline);

const debug = debuglog('n8n-nodes-smb2');

export class Smb2 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Samba (SMB2)',
		name: 'smb2',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Transfer files via Samba (SMB2)',
		icon: 'file:smb2.svg',
		defaults: {
			name: 'SMB2',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'smb2Api',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				options: [
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete a file/folder',
						action: 'Delete a file or folder',
					},
					{
						name: 'Download',
						value: 'download',
						description: 'Download a file',
						action: 'Download a file',
					},
					{
						name: 'List',
						value: 'list',
						description: 'List folder content',
						action: 'List folder content',
					},
					{
						name: 'Rename',
						value: 'rename',
						description: 'Rename/move oldPath to newPath',
						action: 'Rename / move a file or folder',
					},
					{
						name: 'Upload',
						value: 'upload',
						description: 'Upload a file',
						action: 'Upload a file',
					},
				],
				default: 'download',
				noDataExpression: true,
			},

			// ----------------------------------
			//         list
			// ----------------------------------
			{
				displayName: 'Folder',
				displayOptions: {
					show: {
						operation: ['list'],
					},
				},
				name: 'path',
				type: 'string',
				default: '/',
				placeholder: 'e.g. /public/folder',
				description: 'Path of folder to list contents of',
				required: true,
			},
			// {
			// 	displayName: 'Recursive',
			// 	displayOptions: {
			// 		show: {
			// 			operation: ['list'],
			// 		},
			// 	},
			// 	name: 'recursive',
			// 	type: 'boolean',
			// 	default: false,
			// 	description:
			// 		'Whether to return object representing all directories / objects recursively found within SFTP server',
			// 	required: true,
			// },

			// ----------------------------------
			//         download
			// ----------------------------------
			{
				displayName: 'Path',
				displayOptions: {
					show: {
						operation: ['download'],
					},
				},
				name: 'path',
				type: 'string',
				default: '',
				description: 'The file path of the file to download. Has to contain the full path.',
				placeholder: 'e.g. /public/documents/file-to-download.txt',
				required: true,
			},
			{
				displayName: 'Put Output File in Field',
				displayOptions: {
					show: {
						operation: ['download'],
					},
				},
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				hint: 'The name of the output binary field to put the file in',
				required: true,
			},

			// ----------------------------------
			//         upload
			// ----------------------------------
			{
				displayName: 'Path',
				displayOptions: {
					show: {
						operation: ['upload'],
					},
				},
				name: 'path',
				type: 'string',
				default: '',
				description: 'The file path of the file to upload. Has to contain the full path.',
				placeholder: 'e.g. /public/documents/file-to-upload.txt',
				required: true,
			},
			{
				displayName: 'Binary File',
				displayOptions: {
					show: {
						operation: ['upload'],
					},
				},
				name: 'binaryData',
				type: 'boolean',
				default: true,
				// eslint-disable-next-line n8n-nodes-base/node-param-description-boolean-without-whether
				description: 'The text content of the file to upload',
			},
			{
				displayName: 'Input Binary Field',
				displayOptions: {
					show: {
						operation: ['upload'],
						binaryData: [true],
					},
				},
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				hint: 'The name of the input binary field containing the file to be written',
				required: true,
			},
			{
				displayName: 'File Content',
				displayOptions: {
					show: {
						operation: ['upload'],
						binaryData: [false],
					},
				},
				name: 'fileContent',
				type: 'string',
				default: '',
				description: 'The text content of the file to upload',
			},

			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				displayOptions: {
					show: {
						operation: ['upload'],
					},
				},
				default: {},
				options: [
					{
						displayName: 'Overwrite',
						name: 'replace',
						type: 'boolean',
						default: false,
						description: 'Whether to overwrite the file if it already exists',
					},
				],
			},

			// ----------------------------------
			//         delete
			// ----------------------------------
			{
				displayName: 'Path',
				displayOptions: {
					show: {
						operation: ['delete'],
					},
				},
				name: 'path',
				type: 'string',
				default: '',
				description: 'The file path of the file to delete. Has to contain the full path.',
				placeholder: 'e.g. /public/documents/file-to-delete.txt',
				required: true,
			},

			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				displayOptions: {
					show: {
						operation: ['delete'],
					},
				},
				default: {},
				options: [
					{
						displayName: 'Folder',
						name: 'folder',
						type: 'boolean',
						default: false,
						description: 'Whether folders can be deleted',
					},
					// {
					// 	displayName: 'Recursive',
					// 	displayOptions: {
					// 		show: {
					// 			folder: [true],
					// 		},
					// 	},
					// 	name: 'recursive',
					// 	type: 'boolean',
					// 	default: false,
					// 	description: 'Whether to remove all files and directories in target directory',
					// },
				],
			},

			// ----------------------------------
			//         rename
			// ----------------------------------
			{
				displayName: 'Old Path',
				displayOptions: {
					show: {
						operation: ['rename'],
					},
				},
				name: 'oldPath',
				type: 'string',
				default: '',
				placeholder: 'e.g. /public/documents/old-file.txt',
				required: true,
			},
			{
				displayName: 'New Path',
				displayOptions: {
					show: {
						operation: ['rename'],
					},
				},
				name: 'newPath',
				type: 'string',
				default: '',
				placeholder: 'e.g. /public/documents/new-file.txt',
				required: true,
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						operation: ['rename'],
					},
				},
				options: [
					{
						displayName: 'Create Directories',
						name: 'createDirectories',
						type: 'boolean',
						default: false,
						description:
							'Whether to recursively create destination directory when renaming an existing file or folder',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		let returnItems: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		let client;
		let tree;
		let binaryFile: FileResult | null = null;

		try {
			({ client, tree } = await connectToSmbServer.call(this));

			for (let i = 0; i < items.length; i++) {
				if (operation === 'list') {
					const path = this.getNodeParameter('path', i) as string;
					const entries = await tree.readDirectory(path);

					for (const entry of entries) {
						returnItems.push({ json: formatEntry(entry, path) });
					}
				} else if (operation === 'download') {
					const path = this.getNodeParameter('path', i) as string;

					try {
						binaryFile = await tmpFile({ prefix: 'n8n-smb2-' });
						if (!binaryFile || !binaryFile.path) {
							throw new NodeOperationError(this.getNode(), 'Failed to create temporary file');
						}

						const source = await tree.createFileReadStream(path);
						const destination = fs.createWriteStream(binaryFile.path);

						await pipelineAsync(source, destination);

						const dataPropertyNameDownload = this.getNodeParameter('binaryPropertyName', i);
						const currentItem = items[i] || { json: {} };
						const binaryData = currentItem.binary || {};

						binaryData[dataPropertyNameDownload] = await this.nodeHelpers.copyBinaryFile(
								binaryFile.path,
								basename(path),
						);

						items[i] = { ...currentItem, binary: binaryData };

						const executionData = this.helpers.constructExecutionMetaData(
							this.helpers.returnJsonArray(items[i]),
							{ itemData: { item: i } },
						);
						returnItems = returnItems.concat(executionData);
					} catch (error) {
						debug('Download error:', error);
						const readableError = getReadableError(error);
						if (this.continueOnFail()) {
							items[i].json.error = `Failed to download file: ${readableError}`;
							returnItems.push(items[i]);
							continue;
						}
						throw new NodeOperationError(
							this.getNode(),
							`Failed to download file: ${readableError}`,
							{
								description: 'Check your SMB connection settings and file permissions',
								itemIndex: i,
							}
						);
					} finally {
						if (binaryFile?.cleanup) {
							try {
								await binaryFile.cleanup();
							} catch (cleanupError) {
								debug('Error during cleanup:', cleanupError);
							}
						}
					}
				} else if (operation === 'upload') {
					const path = this.getNodeParameter('path', i) as string;
					const binaryData = this.getNodeParameter('binaryData', i) as boolean;

					try {
							let content: string | Buffer;
							if (binaryData) {
								const dataPropertyNameUpload = this.getNodeParameter('binaryPropertyName', i);
								const binaryDataBuffer = await this.helpers.getBinaryDataBuffer(i, dataPropertyNameUpload);
								if (!binaryDataBuffer) {
									if (this.continueOnFail()) {
										items[i].json.error = `Binary data not found for key ${dataPropertyNameUpload}`;
										returnItems.push(items[i]);
										continue;
									}
									throw new NodeOperationError(this.getNode(), `Binary data not found for key ${dataPropertyNameUpload}`);
								}
								content = binaryDataBuffer;
							} else {
								content = this.getNodeParameter('fileContent', i) as string;
									if (!content) {
										if (this.continueOnFail()) {
											items[i].json.error = 'File content not found';
											returnItems.push(items[i]);
											continue;
										}
										throw new NodeOperationError(this.getNode(), 'File content not found');
									}
							}

							const options = this.getNodeParameter('options', i, {}) as { replace?: boolean };
							if (options.replace === true) {
								const exists = await tree.exists(path);
								if (exists) {
									await tree.removeFile(path);
								}
							}

							await tree.createFile(path, content);

							returnItems.push(items[i]);
					} catch (error) {
						debug('Upload error:', error);
						const readableError = getReadableError(error);
						if (this.continueOnFail()) {
							items[i].json.error = `Failed to upload file: ${readableError}`;
							returnItems.push(items[i]);
							continue;
						}
						throw new NodeOperationError(
							this.getNode(),
							`Failed to upload file: ${readableError}`,
							{
								description: 'Check your SMB connection settings and file permissions',
								itemIndex: i,
							}
						);
					}
				} else if (operation === 'delete') {
					const path = this.getNodeParameter('path', i) as string;
					try {
						const options = this.getNodeParameter('options', i) as unknown as {
							folder: boolean;
						};
						if (options.folder) {
							await tree.removeDirectory(path);
							returnItems.push(items[i]);
						} else {
							await tree.removeFile(path);
							returnItems.push(items[i]);
						}
					} catch (error) {
						debug('Delete error:', error);
						const readableError = getReadableError(error);
						if (this.continueOnFail()) {
							items[i].json.error = `Failed to delete file: ${readableError}`;
							returnItems.push(items[i]);
							continue;
						}
						throw new NodeOperationError(
							this.getNode(),
							`Failed to delete file: ${readableError}`,
							{
								description: 'Check your SMB connection settings and file permissions',
								itemIndex: i,
							}
						);
					}
				} else if (operation === 'rename') {
					const oldPath = this.getNodeParameter('oldPath', i) as string;
					const newPath = this.getNodeParameter('newPath', i) as string;
					try {
						await tree.renameFile(oldPath, newPath);
						returnItems.push(items[i]);
					} catch (error) {
						debug('Rename error:', error);
						const readableError = getReadableError(error);
						if (this.continueOnFail()) {
							items[i].json.error = `Failed to rename file: ${readableError}`;
							returnItems.push(items[i]);
							continue;
						}
						throw new NodeOperationError(
							this.getNode(),
							`Failed to rename file: ${readableError}`,
							{
								description: 'Check your SMB connection settings and file permissions',
								itemIndex: i,
							}
						);
					}
				}
			}

			await client.close();
			return [returnItems];
		} catch (error) {
			if (client) {
				await client.close();
			}
			throw error;
		}
	}
}

function formatEntry(entry: DirectoryEntry, path: string) {
	return {
		type: entry.type === 'Directory' ? 'd' : 'l',
		name: basename(entry.filename),
		path: join(path, entry.filename),
		attributes: entry.fileAttributes,
		createTime: entry.creationTime ? new Date(entry.creationTime) : undefined,
		accessTime: entry.lastAccessTime ? new Date(entry.lastAccessTime) : undefined,
		modifyTime: entry.lastWriteTime ? new Date(entry.lastWriteTime) : undefined,
		changeTime: entry.changeTime ? new Date(entry.changeTime) : undefined,
		size: entry.fileSize,
	};
}
