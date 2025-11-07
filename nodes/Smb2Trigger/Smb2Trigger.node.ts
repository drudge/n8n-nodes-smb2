import { Client } from 'node-smb2';
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
				default: 'updated',
				options: [
					{
						name: 'File Updated',
						value: 'updated',
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
				default: 'created',
				options: [
					{
						name: 'File Created',
						value: 'created',
						description: 'When a file is created in the watched folder',
					},
					{
						name: 'File Deleted',
						value: 'deleted',
						description: 'When a file is deleted in the watched folder',
					},
					{
						name: 'File Updated',
						value: 'updated',
						description: 'When a file is updated in the watched folder',
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
				default: 'created',
				options: [
					{
						name: 'File Created',
						value: 'created',
						description: 'When a file is created in the watched drive',
					},
					{
						name: 'File Updated',
						value: 'updated',
						description: 'When a file is updated in the watched drive',
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
		let tree;
		let closeFunction;
		let path: any;

		try {
			({ client, tree } = await connectToSmbServer.call(this));

			if (triggerOn === 'specificFolder' && event !== 'watchFolderUpdated') {
				path = this.getNodeParameter('folderToWatch', '', { extractValue: true }) as string;
			} else {
				path = this.getNodeParameter('folderToWatch', '', { extractValue: true }) as string;
			}

			const stopFunction = await tree.watchDirectory(
				path,
				(response) => {
					debug('Response: %s', JSON.stringify(response.body));

                    // Process each change in the data array
                    if (response.data && Array.isArray(response.data)) {
                        response.data.forEach(change => {
                            const action = change.action;
                            const actionName = change.actionName;
                            const filename = change.filename;
                            
                            debug('Action: %s | %s | Looking for: %s', action, actionName, event);
                            
                            // Map SMB2 actions to node events
                            const eventMap:any = {
                                1: "created",      // Added
                                2: "deleted",      // Removed
                                3: "updated",      // Modified
                            };
                            
                            if (eventMap[action] === event) {
                                this.emit([this.helpers.returnJsonArray({
                                    event: eventMap[action],
                                    action: actionName,
                                    filename: filename,
                                    path: path,
                                    ...change
                                })]);
                            }
                        });
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
