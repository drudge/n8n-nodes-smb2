FROM alpine:3.14

RUN mkdir -p /nodes/n8n-nodes-smb2

COPY LICENSE.md README.md index.js package.json /nodes/n8n-nodes-smb2/
COPY dist /nodes/n8n-nodes-smb2/dist/
