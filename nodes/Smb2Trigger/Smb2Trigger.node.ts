import { Client } from 'node-smb2';
import Tree from 'node-smb2/dist/client/Tree';
import {
	type INodeType,
	type INodeTypeDescription,
	type ITriggerResponse,
	type ITriggerFunctions,
	NodeApiError,
} from 'n8n-workflow';
import { debuglog } from 'util';
import { connectToSmbServer, getReadableError } from '../Smb2/helpers';

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
		let tree: Tree;
		let closeFunction;
		let path: string;

		try {
			({ client, tree } = await connectToSmbServer.call(this));

			if (triggerOn === 'specificFolder' && event !== 'watchFolderUpdated') {
				path = this.getNodeParameter('folderToWatch', '', { extractValue: true }) as string;
			} else {
				path = this.getNodeParameter('folderToWatch', '', { extractValue: true }) as string;
			}

			const stopFunction = await tree.watchDirectory(
				path,
				async (response: any) => {
					debug('Response: %s', JSON.stringify(response));

					// node-smb2 parses the response buffer into response.data array
					// Each entry has: { action: number, actionName: string, filename: string }
					if (!response.data || !Array.isArray(response.data)) {
						debug('No change data in response');
						return;
					}

					// Map FileAction enum values to base event types
					// 1 = Added (FileAction.Added)
					// 2 = Removed (FileAction.Removed)
					// 3 = Modified (FileAction.Modified)
					// 9 = RemovedByDelete (FileAction.RemovedByDelete)
					const actionToEventType: Record<number, 'created' | 'deleted' | 'updated'> = {
						1: 'created',
						2: 'deleted',
						3: 'updated',
						9: 'deleted',
					};

					// Process each change entry
					for (const change of response.data) {
						debug('Change: action=%s, actionName=%s, filename=%s', change.action, change.actionName, change.filename);

						const eventType = actionToEventType[change.action];
						if (!eventType) {
							debug('Unknown action type: %s', change.action);
							continue;
						}

						// Determine if the changed item is a file or folder
						// For delete events, we can't check (item is gone), so we emit for both file and folder delete events
						let isDirectory = false;
						let couldNotDetermine = false;

						if (eventType === 'deleted') {
							// Can't determine type for deleted items, will match both file and folder delete events
							couldNotDetermine = true;
						} else {
							// For create/update events, check the directory listing to determine type
							try {
								const entries = await tree.readDirectory(path);
								const entry = entries.find((e: any) => e.filename === change.filename);
								if (entry && typeof entry.fileAttributes === 'number') {
									// FileAttribute.Directory = 16 (0x10)
									isDirectory = !!(entry.fileAttributes & 16);
									debug('Entry %s is %s (attributes: %s)', change.filename, isDirectory ? 'directory' : 'file', entry.fileAttributes);
								} else {
									debug('Could not find entry %s in directory listing', change.filename);
									couldNotDetermine = true;
								}
							} catch (error) {
								debug('Error reading directory to determine type: %s', error);
								couldNotDetermine = true;
							}
						}

						// Match the event to what the user selected
						let shouldEmit = false;

						if (couldNotDetermine && eventType === 'deleted') {
							// For deletions, we can't determine type, so emit if user selected any delete event
							shouldEmit = ['fileDeleted', 'folderDeleted'].includes(event);
						} else if (couldNotDetermine) {
							// For other events where we couldn't determine, emit for both file and folder events
							shouldEmit = [
								`file${eventType.charAt(0).toUpperCase()}${eventType.slice(1)}`,
								`folder${eventType.charAt(0).toUpperCase()}${eventType.slice(1)}`,
							].includes(event);
						} else {
							// We know the type, so only emit if it matches what the user selected
							const prefix = isDirectory ? 'folder' : 'file';
							const expectedEvent = `${prefix}${eventType.charAt(0).toUpperCase()}${eventType.slice(1)}`;
							shouldEmit = (event === expectedEvent) || (event === 'watchFolderUpdated' && eventType === 'updated');
						}

						if (shouldEmit) {
							this.emit([this.helpers.returnJsonArray({
								event,
								action: change.action,
								actionName: change.actionName,
								filename: change.filename,
								path,
								isDirectory,
							})]);
						}
					}
				},
				recursive
			);

			closeFunction = async function () {
				await stopFunction();
				await client.close();
			};
		} catch (error) {
			debug('Connect error: ', error);
			const errorMessage = getReadableError(error);
			throw new NodeApiError(this.getNode(), error, {message: (`Failed to connect to SMB server: ${errorMessage}`)});
		}

		return {
			closeFunction,
		};
	}
}
