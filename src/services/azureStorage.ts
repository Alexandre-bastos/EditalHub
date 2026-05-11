import { BlobServiceClient } from '@azure/storage-blob';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'editalhub';

export class AzureStorageService {
  private blobServiceClient: BlobServiceClient;
  private containerClient: any;

  constructor() {
    if (!connectionString) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined');
    }
    this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    this.containerClient = this.blobServiceClient.getContainerClient(containerName);
  }

  async uploadBuffer(buffer: Buffer, blobName: string, contentType: string = 'application/pdf') {
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: contentType }
    });
    return blockBlobClient.url;
  }

  async uploadStream(stream: any, blobName: string, length: number, contentType: string = 'application/pdf') {
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadStream(stream, length, undefined, {
      blobHTTPHeaders: { blobContentType: contentType }
    });
    return blockBlobClient.url;
  }
}

export const azureStorage = new AzureStorageService();
