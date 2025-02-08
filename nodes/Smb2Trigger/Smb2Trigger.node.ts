import { Client } from '@awo00/smb2';
import Session from '@awo00/smb2/dist/client/Session';
import {
	type INodeType,
	type INodeTypeDescription,
	type ITriggerResponse,
	type ITriggerFunctions,
	ApplicationError,
} from 'n8n-workflow';
import { debuglog } from 'util';
import { getReadableError } from '../Smb2/helpers';

const debug = debuglog('n8n-nodes-smb2');

export class Smb2Trigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Samba (SMB2) Trigger',
		name: 'smb2Trigger',
		icon: 'file:smb2.svg',
		group: ['trigger'],
		version: 1,
		description: 'Trigger a workflow on Samba (SMB2) filesystem changes',
		subtitle: '={{$parameter["event"]}}',
		defaults: {
			name: 'Samba (SMB2) Trigger',
		},
		credentials: [
			{
				// nodelinter-ignore-next-line
				name: 'smb2Api',
				required: true,
			},
		],
		inputs: [],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Trigger On',
				name: 'triggerOn',
				type: 'options',
				required: true,
				default: 'specificFolder',
				options: [
					// {
					// 	name: 'Changes to a Specific File',
					// 	value: 'specificFile',
					// },
					{
						name: 'Changes Involving a Specific Folder',
						value: 'specificFolder',
					},
					// {
					// 	name: 'Changes To Any File/Folder',
					// 	value: 'anyFileFolder',
					// },
				],
			},
			{
				displayName: 'Recursive',
				name: 'recursive',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'File',
				name: 'fileToWatch',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				modes: [
					{
						displayName: 'File',
						name: 'list',
						type: 'list',
						placeholder: 'Select a file...',
						typeOptions: {
							searchListMethod: 'fileSearch',
							searchable: true,
						},
					},
					{
						displayName: 'Path',
						name: 'path',
						type: 'string',
						placeholder: '/etc/hosts'
					},
				],
				displayOptions: {
					show: {
						triggerOn: ['specificFile'],
					},
				},
			},
			{
				displayName: 'Watch For',
				name: 'event',
				type: 'options',
				displayOptions: {
					show: {
						triggerOn: ['specificFile'],
					},
				},
				required: true,
				default: 'fileUpdated',
				options: [
					{
						name: 'File Updated',
						value: 'fileUpdated',
					},
				],
				description: 'When to trigger this node',
			},
			{
				displayName: 'Folder',
				name: 'folderToWatch',
				type: 'resourceLocator',
				default: { mode: 'path', value: '' },
				required: true,
				modes: [
					{
						displayName: 'By Path',
						name: 'path',
						type: 'string',
						placeholder: '/home/user/',
					},
				],
				displayOptions: {
					show: {
						triggerOn: ['specificFolder'],
					},
				},
			},
			{
				displayName: 'Watch For',
				name: 'event',
				type: 'options',
				displayOptions: {
					show: {
						triggerOn: ['specificFolder'],
					},
				},
				required: true,
				default: 'fileCreated',
				options: [
					{
						name: 'File Created',
						value: 'fileCreated',
						description: 'When a file is created in the watched folder',
					},
					{
						name: 'File Deleted',
						value: 'fileDeleted',
						description: 'When a file is deleted in the watched folder',
					},
					{
						name: 'File Updated',
						value: 'fileUpdated',
						description: 'When a file is updated in the watched folder',
					},
					{
						name: 'Folder Created',
						value: 'folderCreated',
						description: 'When a folder is created in the watched folder',
					},
					{
						name: 'Folder Deleted',
						value: 'folderDeleted',
						description: 'When a folder is deleted in the watched folder',
					},
					{
						name: 'Folder Updated',
						value: 'folderUpdated',
						description: 'When a folder is updated in the watched folder',
					},
					{
						name: 'Watch Folder Updated',
						value: 'watchFolderUpdated',
						description: 'When the watched folder itself is modified',
					},
				],
			},
			{
				displayName: "Changes within subfolders won't trigger this node",
				name: 'asas',
				type: 'notice',
				displayOptions: {
					show: {
						triggerOn: ['specificFolder'],
					},
					hide: {
						event: ['watchFolderUpdated'],
					},
				},
				default: '',
			},
			{
				displayName: 'Watch For',
				name: 'event',
				type: 'options',
				displayOptions: {
					show: {
						triggerOn: ['anyFileFolder'],
					},
				},
				required: true,
				default: 'fileCreated',
				options: [
					{
						name: 'File Created',
						value: 'fileCreated',
						description: 'When a file is created in the watched drive',
					},
					{
						name: 'File Updated',
						value: 'fileUpdated',
						description: 'When a file is updated in the watched drive',
					},
					{
						name: 'Folder Created',
						value: 'folderCreated',
						description: 'When a folder is created in the watched drive',
					},
					{
						name: 'Folder Updated',
						value: 'folderUpdated',
						description: 'When a folder is updated in the watched drive',
					},
				],
				description: 'When to trigger this node',
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const triggerOn = this.getNodeParameter('triggerOn') as string;
		const event = this.getNodeParameter('event') as string;
		const recursive = this.getNodeParameter('recursive') as boolean;

		let client: Client;
		let session: Session;
		let tree;
		let closeFunction;
		let path;

		try {
			const credentials = await this.getCredentials('smb2Api') as {
				host: string;
				domain: string;
				username: string;
				password: string;
				share: string;
			};
			client = new Client(credentials.host);

			debug('Connecting to %s on %s as (%s\\%s)', credentials.share, credentials.host, credentials.domain, credentials.username);
			// debug('smb://%s:%s@%s/%s', credentials.username, credentials.password, credentials.host, credentials.share);

			session = await client.authenticate({
				domain: credentials.domain,
				username: credentials.username,
				password: credentials.password,
			});

			tree = await session.connectTree(credentials.share);

			if (triggerOn === 'specificFolder' && event !== 'watchFolderUpdated') {
				path = this.getNodeParameter('folderToWatch', '', { extractValue: true }) as string;
			} else {
				path = this.getNodeParameter('folderToWatch', '', { extractValue: true }) as string;
			}

			const stopFunction = await tree.watchDirectory(
				path,
				(response) => {
					debug('Response: %s', JSON.stringify(response.body));
					const changeType = response.body.changeType; // Extract change type from response

					// Map SMB2 change types to user-selected options
					const eventMap: Record<number, string> = {
						0x01: "fileCreated",
						0x02: "fileDeleted",
						0x03: "fileUpdated",
						0x04: "folderCreated",
						0x05: "folderDeleted",
						0x06: "folderUpdated"
					};

					if (eventMap[changeType] === event) {
						this.emit([this.helpers.returnJsonArray(response.body)]);
					}
				},
				recursive
			);

			closeFunction = async function () {
				await stopFunction();
			};
		} catch (error) {
			debug('Connect error: ', error);
			const errorMessage = getReadableError(error);
			throw new ApplicationError(`Failed to connect to SMB server: ${errorMessage}`, { extra: {...error, message:error.body?.toString('utf8') } , level: 'error', tags: ['smb2'] });
		}

		return {
			closeFunction,
		};
	}
}
